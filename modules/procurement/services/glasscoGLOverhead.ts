// ============================================================================
// glasscoGLOverhead — production overhead rate + month-end absorption
// Extracted verbatim from glasscoGLService.ts (H6 decomposition, behaviour-
// neutral). Re-exported from glasscoGLService.ts so external import paths are
// unchanged.
// ============================================================================
import { FinanceService } from '@/modules/finance/services/financeService';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { LabourService } from '@/modules/production/services/labourService';
import { Company } from '@/modules/shared/types/core';
import { glassAccounts } from './glasscoGLHelpers';

// ══════════════════════════════════════════════════════════════════
// E. PRODUCTION OVERHEAD RATE — collect actuals, compute PKR/sqft
//
// Sources of Glassco production overhead (IAS 2.13):
//   OWN overhead:    Electricity-Production (51411), Machinery Depreciation (51412),
//                    Machine Repairs (51413, 51414), Consumables (51121, 51122)
//   SHARED overhead: Factory allocation (51415 Electricity, 51416 Depreciation,
//                    51417 Maintenance+Fuel, 51418 Rent)
// ══════════════════════════════════════════════════════════════════

export interface ProductionOverheadRate {
  month:              string;
  company:            Company;
  // Own overhead breakdown
  ownElectricity:     number;
  ownDepreciation:    number;
  ownMachineRepair:   number;
  ownConsumables:     number;
  ownOther:           number;
  // Factory shared (from factoryOverheadAllocationService)
  sharedElectricity:  number;
  sharedDepreciation: number;
  sharedMaintFuel:    number;
  sharedRent:         number;
  // Totals
  totalOwnOverhead:   number;
  totalSharedOverhead:number;
  totalProductionOverhead: number;
  // Sqft basis
  totalSqftProduced:  number;
  overheadRatePerSqft: number;  // PKR/sqft — the absorption rate
  // Status
  isAbsorbed:         boolean;  // has postMonthEndOverheadAbsorption been run?
}

export async function getProductionOverheadRate(
  company: Company,
  month: string,
): Promise<ProductionOverheadRate> {
  const accounts = FinanceService.getAccounts().filter((a: any) => a.company === company);
  const ledger   = FinanceService.getLedger().filter(
    (t: any) => t.company === company &&
                t.status === 'Posted' &&
                (t.docDate || t.date || '').startsWith(month),
  );

  // Build account code → id map
  const codeToId: Record<string, string> = {};
  accounts.forEach((a: any) => { if (a.code) codeToId[a.code] = a.id; });
  const idToCode: Record<string, string> = {};
  accounts.forEach((a: any) => { if (a.code) idToCode[a.id] = a.code; });

  // Sum debit amounts by account code for this month
  const actuals: Record<string, number> = {};
  ledger.forEach((tx: any) => {
    (tx.details || []).forEach((d: any) => {
      const code = idToCode[d.accountId] || '';
      if (!code || (d.debit || 0) <= 0) return;
      actuals[code] = (actuals[code] || 0) + d.debit;
    });
  });

  const get = (...codes: string[]) =>
    codes.reduce((s, c) => s + (actuals[c] || 0), 0);

  const ownElectricity   = get('51411');
  const ownDepreciation  = get('51412');
  const ownMachineRepair = get('51413', '51414');
  const ownConsumables   = get('51121', '51122', '51123');
  const ownOther         = 0; // extend as needed

  const sharedElectricity  = get('51415');
  const sharedDepreciation = get('51416');
  const sharedMaintFuel    = get('51417');
  const sharedRent         = get('51418');

  const totalOwnOverhead    = ownElectricity + ownDepreciation + ownMachineRepair + ownConsumables + ownOther;
  const totalSharedOverhead = sharedElectricity + sharedDepreciation + sharedMaintFuel + sharedRent;
  const totalProductionOverhead = totalOwnOverhead + totalSharedOverhead;

  // Total sqft produced this month
  let totalSqftProduced = 0;
  try {
    const logs = await LabourService.getLogs(company as string);
    totalSqftProduced = logs
      .filter(l => l.logDate.startsWith(month))
      .reduce((s, l) => s + l.sqftProduced, 0);
  } catch { /* offline — sqft stays 0 */ }

  const overheadRatePerSqft = totalSqftProduced > 0
    ? Math.round((totalProductionOverhead / totalSqftProduced) * 100) / 100
    : 0;

  const isAbsorbed = FinanceService.getLedger()
    .some((t: any) => t.id === `GL-OH-ABS-${company}-${month}`);

  return {
    month, company,
    ownElectricity, ownDepreciation, ownMachineRepair, ownConsumables, ownOther,
    sharedElectricity, sharedDepreciation, sharedMaintFuel, sharedRent,
    totalOwnOverhead, totalSharedOverhead, totalProductionOverhead,
    totalSqftProduced, overheadRatePerSqft,
    isAbsorbed,
  };
}

// ══════════════════════════════════════════════════════════════════
// F. MONTH-END OVERHEAD ABSORPTION — Dr COGS-Overhead / Cr Absorbed
//
// IAS 2.13: Fixed production overheads allocated to units based on
// normal capacity. Variable overheads allocated based on actual use.
//
// Approach: absorption costing
//   Step 1: Compute overheadRatePerSqft for the month (function E above)
//   Step 2: Get total sqft DELIVERED (invoiced) in the month
//   Step 3: Absorbed overhead = deliveredSqft × overheadRatePerSqft
//   Step 4: Post  Dr  COGS — Overhead (5141x)  / Cr  Overhead Absorbed (5142)
//   Step 5: Un-absorbed overhead (produced but not delivered) stays in WIP
//           as a period closing balance — reversed or carried to next period
//
// GL layout:
//   Dr 51411  Electricity — Production         (own — stays debit from actual posting)
//   Dr 51412  Depreciation — Machinery         (own)
//   ...
//   Dr 51415  Factory Overhead — Electricity   (shared, from Factory allocation)
//   ...
//   Cr 5142   Production Overhead — Absorbed   (net absorption, reduces gross overhead)
//
// The NET of 5141x Dr (actual) and 5142 Cr (absorbed) = under/over-absorption
// This variance is disclosed in monthly management accounts.
// ══════════════════════════════════════════════════════════════════

export async function postMonthEndOverheadAbsorption(params: {
  company: Company;
  month:   string;
  postedBy?: string;
}): Promise<{ txId: string; absorbedAmount: number; deliveredSqft: number; rate: number; variance: number }> {
  const { company, month, postedBy = 'system' } = params;
  const txId = `GL-OH-ABS-${company}-${month}`;

  // Guard: already posted
  if (FinanceService.getLedger().some((t: any) => t.id === txId)) {
    return { txId, absorbedAmount: 0, deliveredSqft: 0, rate: 0, variance: 0 };
  }

  const accs = glassAccounts(company);
  const rate = await getProductionOverheadRate(company, month);

  if (rate.overheadRatePerSqft <= 0 || rate.totalProductionOverhead <= 0) {
    console.warn(`[OH Absorption] No overhead or sqft data for ${company} ${month}`);
    return { txId, absorbedAmount: 0, deliveredSqft: 0, rate: 0, variance: 0 };
  }

  // Total sqft DELIVERED (invoiced) this month — from production pieces with Delivered status
  const deliveredPieces = ProductionService.getProductionPieces().filter((p: any) => {
    if (p.company !== company && p.orderId && !p.orderId.includes('GLS') && company === 'Glassco') {/* skip */}
    return (p.status === 'Delivered') && (p.lastUpdated || '').startsWith(month);
  });
  const deliveredSqft = deliveredPieces.reduce(
    (s: number, p: any) => s + (p.sqft || 0),
    0,
  );

  // Also count sqft from invoiced orders this month
  const invoicedSqft = SalesService.getInvoices()
    .filter((inv: any) => inv.company === company && (inv.date || '').startsWith(month))
    .reduce((s: number, inv: any) => {
      return s + (inv.items || []).reduce((is: number, item: any) => is + (item.totalSqFt || 0), 0);
    }, 0);

  const effectiveSqft = Math.max(deliveredSqft, invoicedSqft);

  if (effectiveSqft <= 0) {
    console.warn(`[OH Absorption] No delivered sqft for ${company} ${month}`);
    return { txId, absorbedAmount: 0, deliveredSqft: 0, rate: rate.overheadRatePerSqft, variance: 0 };
  }

  const absorbedAmount  = Math.round(effectiveSqft * rate.overheadRatePerSqft);
  const variance        = rate.totalProductionOverhead - absorbedAmount; // + = under, - = over

  // Build GL entry — break down by overhead category for P&L transparency
  const details: any[] = [];
  const total = rate.totalProductionOverhead;
  const proportion = (portion: number) => Math.round(absorbedAmount * (portion / total));

  // Each overhead category gets a proportional absorption credit
  const overheadLines: { accId: string; actual: number; label: string }[] = [
    { accId: accs.ohElec.id,      actual: rate.ownElectricity,    label: 'Electricity — Production' },
    { accId: accs.ohDepr.id,      actual: rate.ownDepreciation,   label: 'Depreciation — Machinery' },
    { accId: accs.ohRepairC.id,   actual: rate.ownMachineRepair,  label: 'Machine Repairs' },
    { accId: accs.consums.id,     actual: rate.ownConsumables,    label: 'Production Consumables' },
    { accId: accs.ohFactElec.id,  actual: rate.sharedElectricity, label: 'Factory OH — Electricity' },
    { accId: accs.ohFactDepr.id,  actual: rate.sharedDepreciation,label: 'Factory OH — Depreciation' },
    { accId: accs.ohFactMaint.id, actual: rate.sharedMaintFuel,   label: 'Factory OH — Maintenance+Fuel' },
    { accId: accs.ohFactRent.id,  actual: rate.sharedRent,        label: 'Factory OH — Rent' },
  ].filter(l => l.actual > 0);

  // Dr each overhead account for its proportional absorbed portion
  let debitTotal = 0;
  overheadLines.forEach((line, i) => {
    const amt = i < overheadLines.length - 1
      ? proportion(line.actual)
      : absorbedAmount - debitTotal; // last line takes remainder to avoid rounding gap
    debitTotal += amt;
    details.push({
      accountId: line.accId,
      debit: amt, credit: 0,
      text: `Overhead absorbed — ${line.label} (${effectiveSqft.toFixed(0)} sqft × PKR ${rate.overheadRatePerSqft}/sqft)`,
    });
  });

  // Cr Overhead Absorbed (clearing/contra) — net reduces total overhead on P&L
  details.push({
    accountId: accs.ohAbsorbed.id,
    debit: 0, credit: absorbedAmount,
    text: `Production Overhead Absorbed — ${month} | ${effectiveSqft.toFixed(0)} sqft × PKR ${rate.overheadRatePerSqft}/sqft | Variance PKR ${variance.toLocaleString()} (${variance >= 0 ? 'under' : 'over'}-absorbed)`,
  });

  const today = new Date().toISOString().split('T')[0];
  FinanceService.recordTransaction({
    id: txId, company, docType: 'JV',
    docDate: today, date: today,
    description: `Production Overhead Absorption — ${company} ${month} | Rate PKR ${rate.overheadRatePerSqft}/sqft | Absorbed PKR ${absorbedAmount.toLocaleString()} on ${effectiveSqft.toFixed(0)} sqft | Variance PKR ${variance.toLocaleString()}`,
    referenceId: month,
    status: 'Posted',
    details,
  } as any);

  return { txId, absorbedAmount, deliveredSqft: effectiveSqft, rate: rate.overheadRatePerSqft, variance };
}
