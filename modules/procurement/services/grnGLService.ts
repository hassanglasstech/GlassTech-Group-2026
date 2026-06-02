/**
 * grnGLService.ts — Phase 9
 *
 * All GL entries for the GRN → Defect → Scrap → Freight workflow.
 *
 * Entries covered:
 * 1. GRN Post          — Dr Inventory / Cr GR/IR Clearing
 * 2. Freight A         — Dr Vendor Payable / Cr Cash (Vendor Included)
 * 3. Freight B         — Dr Freight Expense / Cr Cash/Payable (Own Expense)
 * 4. Defect Adjustment — Dr GR/IR Clearing / Cr Glass Breakage (on vendor confirm)
 * 5. Scrap Disposal    — Dr Scrap Inventory (nominal) / Cr Inventory + Cr Other Income
 * 6. Petty Cash Link   — freight cash payment linked to petty cash entry
 *
 * All entries use FinanceService.recordTransaction() — same as existing ThreeWayMatching.
 */

import { FinanceService } from '@/modules/finance/services/financeService';
import { LedgerTransaction, LedgerDocType } from '@/modules/finance/types/finance';
import { toast } from 'sonner';

// ── Get primary production cost center for a company (category F) ──────────
function getProductionCCId(company: string): string | undefined {
  const ccs = FinanceService.getCostCenters().filter(
    (cc: any) => cc.company === company && cc.category === 'F'
  );
  return ccs.length > 0 ? ccs[0].id : undefined;
}

// ── Account code constants (GlassCo COA) ─────────────────────────────────
const ACC = {
  INVENTORY_GLASS:   '11512',   // Float Glass — Raw Sheets (GlassCo inventory)
  GRIR_MATERIAL:     '21151',   // GR/IR — Glass Material (vendor payable clearing)
  GRIR_FREIGHT:      '21152',   // GR/IR — Freight & Transport
  PAYABLE_GLASS:     '21111',   // Payable — Glass Importers
  PAYABLE_TEMPERING: '21112',   // Payable — Tempering Vendors
  PAYABLE_OTHER:     '21113',   // Payable — Other Vendors
  CASH_IN_HAND:      '11112',   // Cash in Hand
  GLASS_BREAKAGE:    '56113',   // Glass Breakage & Write-off
  FREIGHT_EXPENSE:   '51214',   // Inward Freight Expense
  SCRAP_INVENTORY:   '11519',   // Scrap Inventory (nominal)
  OTHER_INCOME:      '44112',   // Other Income / Miscellaneous
  UNLOADING_CRANE:   '51215',   // Unloading Expense — Crane
  UNLOADING_LABOUR:  '51216',   // Unloading Expense — Labour
};

// ── Account codes — Nippon (trading) COA ─────────────────────────────────
// Added by God Mode audit Phase 1. Nippon's COA structure is different
// from Glassco — it's a trading chain, not a manufacturing chain.
// Per decision B: per-brand inventory accounts (visibility over flat 11514).
// Per decision C: flat AP (21111) — vendor sub-ledger handles per-supplier.
const ACC_NIPPON = {
  INVENTORY_KL:    '11511',   // Kin Long Products — Stock
  INVENTORY_ALUM:  '11512',   // Aluminium Accessories — Stock
  INVENTORY_UPVC:  '11513',   // UPVC Hardware — Stock
  INVENTORY_HW:    '11514',   // General Hardware — Stock (DEFAULT)
  PAYABLE_KL:      '21111',   // Payable — Kin Long Vendors (flat)
  PAYABLE_IMP:     '21112',   // Payable — Hardware Importers
  PAYABLE_OTHER:   '21113',   // Payable — Other
  CASH_IN_HAND:    '11112',   // Cash in Hand
  BANK_MCB:        '11121',   // Bank — MCB Current
  ADVANCE_KL:      '11411',   // Advance — Kin Long / Hardware Vendors
  GRIR_HW:         '21141',   // GR/IR — Hardware Material (Day-1 added)
  INPUT_GST:       '11431',   // Input GST Recoverable (Day-1 added)
};

// Account name map for auto-creation via ensureAccount
const ACC_META: Record<string, { name: string; level: number; type: 'Asset' | 'Liability' | 'Expense' | 'Revenue' | 'Equity'; parentCode: string | null; parentName: string | null }> = {
  '11512': { name: 'Float Glass — Raw Sheets',       level: 5, type: 'Asset',     parentCode: '1151',  parentName: 'RAW MATERIAL INVENTORY' },
  '21151': { name: 'GR/IR — Glass Material',         level: 5, type: 'Liability', parentCode: '2115',  parentName: 'GR/IR CLEARING' },
  '21152': { name: 'GR/IR — Freight & Transport',    level: 5, type: 'Liability', parentCode: '2115',  parentName: 'GR/IR CLEARING' },
  '21111': { name: 'Payable — Glass Importers',      level: 4, type: 'Liability', parentCode: '211',   parentName: 'TRADE PAYABLES' },
  '21112': { name: 'Payable — Tempering Vendors',    level: 4, type: 'Liability', parentCode: '211',   parentName: 'TRADE PAYABLES' },
  '21113': { name: 'Payable — Other Vendors',        level: 4, type: 'Liability', parentCode: '211',   parentName: 'TRADE PAYABLES' },
  '11112': { name: 'Cash in Hand',                   level: 3, type: 'Asset',     parentCode: '111',   parentName: 'CASH & BANK' },
  '56113': { name: 'Glass Breakage & Write-off',     level: 4, type: 'Expense',   parentCode: '561',   parentName: 'PRODUCTION LOSSES' },
  '51214': { name: 'Inward Freight Expense',         level: 4, type: 'Expense',   parentCode: '512',   parentName: 'PROCUREMENT EXPENSES' },
  '11519': { name: 'Scrap Inventory',                level: 5, type: 'Asset',     parentCode: '1151',  parentName: 'RAW MATERIAL INVENTORY' },
  '44112': { name: 'Miscellaneous Income',           level: 4, type: 'Revenue',   parentCode: '441',   parentName: 'OTHER INCOME' },
  '51215': { name: 'Unloading Expense — Crane',      level: 4, type: 'Expense',   parentCode: '512',   parentName: 'PROCUREMENT EXPENSES' },
  '51216': { name: 'Unloading Expense — Labour',     level: 4, type: 'Expense',   parentCode: '512',   parentName: 'PROCUREMENT EXPENSES' },
  '51213': { name: 'Outward Freight Expense',           level: 4, type: 'Expense',   parentCode: '512',   parentName: 'PROCUREMENT EXPENSES' },
  '52291': { name: 'Miscellaneous Operating Expense',   level: 4, type: 'Expense',   parentCode: '522',   parentName: 'OPERATING EXPENSES' },

  // Nippon trading COA metadata (Phase 1)
  '11511': { name: 'Kin Long Products — Stock',         level: 5, type: 'Asset',     parentCode: '1151',  parentName: 'HARDWARE INVENTORY' },
  '11513': { name: 'UPVC Hardware — Stock',             level: 5, type: 'Asset',     parentCode: '1151',  parentName: 'HARDWARE INVENTORY' },
  '11514': { name: 'General Hardware — Stock',          level: 5, type: 'Asset',     parentCode: '1151',  parentName: 'HARDWARE INVENTORY' },
  '11411': { name: 'Advance — Kin Long / Hardware Vendors', level: 5, type: 'Asset', parentCode: '1141',  parentName: 'VENDOR ADVANCES' },
  '11121': { name: 'Bank — MCB Current',                level: 5, type: 'Asset',     parentCode: '1112',  parentName: 'BANK' },
  '11431': { name: 'Input GST Recoverable',             level: 5, type: 'Asset',     parentCode: '1143',  parentName: 'TAX RECEIVABLES' },
  '21141': { name: 'GR/IR — Hardware Material',         level: 5, type: 'Liability', parentCode: '2114',  parentName: 'GR/IR CLEARING' },
};

/**
 * Get or create an account by code.
 * Uses FinanceService.ensureAccount so accounts auto-create if missing from COA.
 */
function getOrCreateAcc(company: string, code: string) {
  const meta = ACC_META[code];
  if (!meta) {
    // Fallback: plain find
    const all = FinanceService.getAccounts().filter((a: any) => a.company === company);
    return all.find((a: any) => a.code === code) || null;
  }

  // Ensure parent first (level - 1)
  let parentId: string | null = null;
  if (meta.parentCode && meta.parentName) {
    const parentMeta = ACC_META[meta.parentCode];
    const parentLevel = meta.level - 1;
    const grandParentId: string | null = null; // keep simple — 2 levels enough
    const parent = FinanceService.ensureAccount(
      company as any,
      meta.parentName,
      parentLevel as 1|2|3|4|5,
      grandParentId,
      meta.type,
      meta.parentCode
    );
    parentId = parent.id;
  }

  return FinanceService.ensureAccount(
    company as any,
    meta.name,
    meta.level as 1|2|3|4|5,
    parentId,
    meta.type,
    code
  );
}

function genTxId(prefix: string): string {
  return `${prefix}-${Date.now().toString().slice(-8)}`;
}

// ══════════════════════════════════════════════════════════════════════════
// 1. GRN POST — Dr Inventory / Cr GR/IR
// Called from GoodsReceiptMIGO on Post
// ══════════════════════════════════════════════════════════════════════════
export function postGRNMaterialGL(params: {
  company: string;
  grnId: string;
  grnDate: string;
  vendorName: string;
  totalOKValue: number;        // OK sheets value at vendor rate
  totalDefectiveValue: number; // Defective usable value at vendor rate
  lineCount: number;
  landedChargesTotal?: number; // IAS 2 — freight+crane+labour+other to capitalize
}): boolean {
  const { company, grnId, grnDate, vendorName } = params;
  const materialValue = params.totalOKValue + params.totalDefectiveValue;
  const landedCharges = params.landedChargesTotal || 0;
  const totalInventoryValue = materialValue + landedCharges;
  if (totalInventoryValue <= 0) return true;

  const invAcc  = getOrCreateAcc(company, ACC.INVENTORY_GLASS);
  const grirAcc = getOrCreateAcc(company, ACC.GRIR_MATERIAL);

  if (!invAcc || !grirAcc) {
    console.warn('[GRN GL] Could not create Inventory or GR/IR accounts for', company);
    return false;
  }

  const details: LedgerTransaction['details'] = [
    {
      accountId: invAcc.id,
      debit: totalInventoryValue,
      credit: 0,
      text: `Inventory in — GRN ${grnId} (Material: ${materialValue.toFixed(0)}${landedCharges > 0 ? ` + Landed: ${landedCharges.toFixed(0)}` : ''})`,
    },
    {
      accountId: grirAcc.id,
      debit: 0,
      credit: materialValue,
      text: `GR/IR Clearing — vendor material (${vendorName})`,
    },
  ];

  // Landed charges credit Cash (they are paid separately but capitalized into inventory)
  if (landedCharges > 0) {
    const cashAcc = getOrCreateAcc(company, ACC.CASH_IN_HAND);
    if (cashAcc) {
      details.push({
        accountId: cashAcc.id,
        debit: 0,
        credit: landedCharges,
        text: `Cash — landed costs capitalized (Freight+Crane+Labour+Other) — GRN ${grnId}`,
      });
    }
  }

  const tx: LedgerTransaction = {
    id: genTxId('WE'),
    company: company as any,
    docType: 'JV' as LedgerDocType,
    docDate: grnDate,
    date: grnDate,
    description: `GRN ${grnId} — Material + Landed Cost Receipt (${vendorName})`,
    referenceId: grnId,
    status: 'Posted',
    details,
  };

  FinanceService.recordTransaction(tx);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// 2a. FREIGHT GL — Vendor Included (Dr Vendor Payable / Cr Cash)
// ══════════════════════════════════════════════════════════════════════════
export function postFreightVendorIncludedGL(params: {
  company: string;
  grnId: string;
  grnDate: string;
  vendorName: string;
  freightAmount: number;
  cashPaymentRef?: string;
  pettyCashEntryId?: string;
}): boolean {
  const { company, grnId, grnDate, freightAmount } = params;
  if (freightAmount <= 0) return true;

  const payableAcc = getOrCreateAcc(company, ACC.PAYABLE_GLASS)
    || getOrCreateAcc(company, ACC.PAYABLE_OTHER);
  const cashAcc = getOrCreateAcc(company, ACC.CASH_IN_HAND);

  if (!payableAcc || !cashAcc) {
    console.warn('[Freight GL] Payable or Cash account not found');
    return false;
  }

  const tx: LedgerTransaction = {
    id: genTxId('PV'),
    company: company as any,
    docType: 'PV' as LedgerDocType,
    docDate: grnDate,
    date: grnDate,
    description: `GRN ${grnId} — Freight paid to transporter on behalf of ${params.vendorName}`,
    referenceId: grnId,
    status: 'Posted',
    details: [
      {
        accountId: payableAcc.id,
        debit: freightAmount,
        credit: 0,
        text: `Freight deducted from vendor payable — ${params.vendorName}${params.cashPaymentRef ? ` (Ref: ${params.cashPaymentRef})` : ''}`,
      },
      {
        accountId: cashAcc.id,
        debit: 0,
        credit: freightAmount,
        text: `Cash paid to transporter — GRN ${grnId}`,
      },
    ],
  };

  FinanceService.recordTransaction(tx);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// 2b. FREIGHT GL — Own Expense (Dr Freight Expense / Cr Cash/Payable)
// ══════════════════════════════════════════════════════════════════════════
export function postFreightOwnExpenseGL(params: {
  company: string;
  grnId: string;
  grnDate: string;
  freightAmount: number;
  paidBy: 'Cash' | 'Payable';
}): boolean {
  const { company, grnId, grnDate, freightAmount, paidBy } = params;
  if (freightAmount <= 0) return true;

  // Try 51214 first (inward freight), fallback to 51213
  const frtAcc = getOrCreateAcc(company, ACC.FREIGHT_EXPENSE)
    || getOrCreateAcc(company, '51213')
    || FinanceService.getAccounts().find(a => a.name?.toLowerCase().includes('freight') && a.type === 'Expense');
  const crAcc = paidBy === 'Cash'
    ? getOrCreateAcc(company, ACC.CASH_IN_HAND)
    : getOrCreateAcc(company, ACC.PAYABLE_OTHER);

  if (!frtAcc || !crAcc) {
    console.warn('[Freight Own GL] Expense or Cash/Payable account not found');
    return false;
  }

  const tx: LedgerTransaction = {
    id: genTxId('PV'),
    company: company as any,
    docType: 'PV' as LedgerDocType,
    docDate: grnDate,
    date: grnDate,
    description: `GRN ${grnId} — Inward freight (own expense)`,
    referenceId: grnId,
    status: 'Posted',
    details: [
      { accountId: frtAcc.id, debit: freightAmount, credit: 0, text: `Inward freight — GRN ${grnId}`, costCenterId: getProductionCCId(company) },
      { accountId: crAcc.id, debit: 0, credit: freightAmount, text: paidBy === 'Cash' ? 'Cash paid' : 'Payable accrued' },
    ],
  };

  FinanceService.recordTransaction(tx);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// 3. DEFECT ADJUSTMENT — Dr GR/IR Clearing / Cr Glass Breakage
// Called when vendor confirms defect claim
// ══════════════════════════════════════════════════════════════════════════
export function postDefectAdjustmentGL(params: {
  company: string;
  grnId: string;
  adjustmentDate: string;
  adjustmentAmount: number;   // Original value − Usable value
  vendorName: string;
  defectReportId: string;
}): boolean {
  const { company, grnId, adjustmentDate, adjustmentAmount } = params;
  if (adjustmentAmount <= 0) return true;

  const grirAcc     = getOrCreateAcc(company, ACC.GRIR_MATERIAL);
  const breakageAcc = getOrCreateAcc(company, ACC.GLASS_BREAKAGE);

  if (!grirAcc || !breakageAcc) {
    console.warn('[Defect GL] GR/IR or Breakage account not found');
    return false;
  }

  const tx: LedgerTransaction = {
    id: genTxId('DR'),
    company: company as any,
    docType: 'DR' as LedgerDocType,
    docDate: adjustmentDate,
    date: adjustmentDate,
    description: `Defect adjustment — GRN ${grnId} (${params.vendorName}) — Report ${params.defectReportId}`,
    referenceId: params.defectReportId,
    status: 'Posted',
    details: [
      {
        accountId: grirAcc.id,
        debit: adjustmentAmount,
        credit: 0,
        text: `Reduce GR/IR — defect confirmed by vendor (${params.vendorName})`,
      },
      {
        accountId: breakageAcc.id,
        debit: 0,
        credit: adjustmentAmount,
        text: `Glass breakage/defect write-off — GRN ${grnId}`,
      },
    ],
  };

  FinanceService.recordTransaction(tx);
  toast.success(`GL posted: Defect adjustment PKR ${adjustmentAmount.toLocaleString()} — GRN ${grnId}`);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// 4. SCRAP DISPOSAL — IFRS treatment
// Dr Cash / Cr Scrap Inventory (nominal) + Cr Other Income (excess)
// ══════════════════════════════════════════════════════════════════════════
export function postScrapDisposalGL(params: {
  company: string;
  disposalId: string;
  disposalDate: string;
  actualAmountReceived: number;
  nominalBookValue: number;    // Scrap Inventory book value (qty × PKR 5/kg nominal)
  notes?: string;
}): boolean {
  const { company, disposalId, disposalDate } = params;
  const { actualAmountReceived, nominalBookValue } = params;
  if (actualAmountReceived <= 0) return true;

  const cashAcc = getOrCreateAcc(company, ACC.CASH_IN_HAND);
  // Scrap inventory — try 11519, fallback to glass inventory
  const scrapInvAcc = getOrCreateAcc(company, ACC.SCRAP_INVENTORY)
    || getOrCreateAcc(company, ACC.INVENTORY_GLASS);
  const otherIncomeAcc = getOrCreateAcc(company, ACC.OTHER_INCOME)
    || FinanceService.getAccounts().find(a => a.name?.toLowerCase().includes('other income') && a.type === 'Revenue');

  if (!cashAcc || !scrapInvAcc) {
    console.warn('[Scrap GL] Required accounts not found');
    return false;
  }

  const excess = actualAmountReceived - nominalBookValue;
  const details: LedgerTransaction['details'] = [
    {
      accountId: cashAcc.id,
      debit: actualAmountReceived,
      credit: 0,
      text: `Scrap sale proceeds — ${disposalId}`,
    },
    {
      accountId: scrapInvAcc.id,
      debit: 0,
      credit: nominalBookValue,
      text: `Scrap inventory derecognition (nominal value)`,
    },
  ];

  // If actual > nominal → Other Income for excess
  if (excess > 0 && otherIncomeAcc) {
    details.push({
      accountId: otherIncomeAcc.id,
      debit: 0,
      credit: excess,
      text: `Scrap sale gain — ${disposalId} (above nominal PKR ${nominalBookValue.toFixed(0)})`,
    });
  }

  // If actual < nominal → Breakage/loss
  if (excess < 0) {
    const breakageAcc = getOrCreateAcc(company, ACC.GLASS_BREAKAGE);
    if (breakageAcc) {
      details.push({
        accountId: breakageAcc.id,
        debit: Math.abs(excess),
        credit: 0,
        text: `Scrap sale loss — ${disposalId}`,
      });
    }
  }

  const tx: LedgerTransaction = {
    id: genTxId('CR'),
    company: company as any,
    docType: 'CJ' as LedgerDocType,
    docDate: disposalDate,
    date: disposalDate,
    description: `Scrap disposal — ${disposalId}${params.notes ? ': ' + params.notes : ''}`,
    referenceId: disposalId,
    status: 'Posted',
    details,
  };

  FinanceService.recordTransaction(tx);
  toast.success(`GL posted: Scrap disposal PKR ${actualAmountReceived.toLocaleString()} — ${disposalId}`);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// 5. OTHER CHARGES GL — Dr Other Expense / Cr Cash
// ══════════════════════════════════════════════════════════════════════════
export function postOtherChargesGL(params: {
  company: string;
  grnId: string;
  grnDate: string;
  amount: number;
  description: string;
}): boolean {
  const { company, grnId, grnDate, amount, description } = params;
  if (amount <= 0) return true;

  const expAcc  = FinanceService.getAccounts().find(a => a.name?.toLowerCase().includes('miscellaneous') && a.type === 'Expense')
    || getOrCreateAcc(company, '52291') // misc operating expense
    || FinanceService.getAccounts().find(a => a.type === 'Expense' && a.level >= 4);
  const cashAcc = getOrCreateAcc(company, ACC.CASH_IN_HAND);

  if (!expAcc || !cashAcc) return false;

  const tx: LedgerTransaction = {
    id: genTxId('PV'),
    company: company as any,
    docType: 'PV' as LedgerDocType,
    docDate: grnDate,
    date: grnDate,
    description: `GRN ${grnId} — Other charges: ${description}`,
    referenceId: grnId,
    status: 'Posted',
    details: [
      { accountId: expAcc.id, debit: amount, credit: 0, text: description, costCenterId: getProductionCCId(company) },
      { accountId: cashAcc.id, debit: 0, credit: amount, text: `Cash paid — GRN ${grnId}` },
    ],
  };

  FinanceService.recordTransaction(tx);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// 5b. CRANE PV — Dr Unloading Expense (Crane) / Cr Cash
// ══════════════════════════════════════════════════════════════════════════
export function postCranePV(params: {
  company: string;
  grnId: string;
  grnDate: string;
  craneVendorName: string;
  craneAmount: number;
}): boolean {
  const { company, grnId, grnDate, craneAmount, craneVendorName } = params;
  if (craneAmount <= 0) return true;

  const craneAcc = getOrCreateAcc(company, ACC.UNLOADING_CRANE)
    || FinanceService.getAccounts().find(a => a.name?.toLowerCase().includes('unloading') && a.type === 'Expense')
    || getOrCreateAcc(company, ACC.FREIGHT_EXPENSE); // fallback
  const cashAcc = getOrCreateAcc(company, ACC.CASH_IN_HAND);

  if (!craneAcc || !cashAcc) {
    console.warn('[Crane PV] Unloading Expense or Cash account not found');
    return false;
  }

  const tx: LedgerTransaction = {
    id: genTxId('PV'),
    company: company as any,
    docType: 'PV' as LedgerDocType,
    docDate: grnDate,
    date: grnDate,
    description: `GRN ${grnId} — Crane/Unloading (${craneVendorName})`,
    referenceId: grnId,
    status: 'Parked',
    details: [
      { accountId: craneAcc.id, debit: craneAmount, credit: 0, text: `Unloading Expense — Crane (${craneVendorName})`, costCenterId: getProductionCCId(company) },
      { accountId: cashAcc.id, debit: 0, credit: craneAmount, text: `Cash paid — Crane ${craneVendorName} — GRN ${grnId}` },
    ],
  };

  FinanceService.recordTransaction(tx);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// 5c. LABOUR + PACKING PV — IFRS Gross Accounting
//     Dr Unloading Expense (Labour) = gross labour
//     Cr Other Income (Packing Sale) = packing buyback
//     Cr Cash = net payable (labour - packing)
// ══════════════════════════════════════════════════════════════════════════
export function postLabourPackingPV(params: {
  company: string;
  grnId: string;
  grnDate: string;
  labourVendorName: string;
  labourGross: number;
  packingBuyback: number;
  netPayable: number;
}): boolean {
  const { company, grnId, grnDate, labourVendorName, labourGross, packingBuyback, netPayable } = params;
  if (labourGross <= 0) return true;

  const labourAcc = getOrCreateAcc(company, ACC.UNLOADING_LABOUR)
    || getOrCreateAcc(company, ACC.UNLOADING_CRANE)
    || FinanceService.getAccounts().find(a => a.name?.toLowerCase().includes('unloading') && a.type === 'Expense');
  const incomeAcc = getOrCreateAcc(company, ACC.OTHER_INCOME)
    || FinanceService.getAccounts().find(a => a.name?.toLowerCase().includes('other income') && a.type === 'Revenue');
  const cashAcc = getOrCreateAcc(company, ACC.CASH_IN_HAND);

  if (!labourAcc || !cashAcc) {
    console.warn('[Labour PV] Unloading Expense or Cash account not found');
    return false;
  }

  const details: LedgerTransaction['details'] = [
    { accountId: labourAcc.id, debit: labourGross, credit: 0, text: `Unloading Expense — Labour (${labourVendorName}) — GRN ${grnId}`, costCenterId: getProductionCCId(company) },
  ];

  // Packing buyback as Other Income
  if (packingBuyback > 0 && incomeAcc) {
    details.push({
      accountId: incomeAcc.id, debit: 0, credit: packingBuyback,
      text: `Other Income — Packing Material Sale (${labourVendorName}) — GRN ${grnId}`,
    });
  }

  // Net cash paid
  details.push({
    accountId: cashAcc.id, debit: 0, credit: netPayable > 0 ? netPayable : labourGross,
    text: `Cash paid — Labour net (${labourVendorName}) — GRN ${grnId}`,
  });

  const tx: LedgerTransaction = {
    id: genTxId('PV'),
    company: company as any,
    docType: 'PV' as LedgerDocType,
    docDate: grnDate,
    date: grnDate,
    description: `GRN ${grnId} — Labour & Packing (${labourVendorName}): Gross ${labourGross}, Packing -${packingBuyback}, Net ${netPayable}`,
    referenceId: grnId,
    status: 'Parked',
    details,
  };

  FinanceService.recordTransaction(tx);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// 6. FULL GRN GL ORCHESTRATOR — IAS 2 Landed Cost
// All inward charges (freight, crane, labour, other) are CAPITALIZED into
// inventory via a single material GL entry. No separate expense entries.
// Call this from GoodsReceiptMIGO after posting stock.
// ══════════════════════════════════════════════════════════════════════════
export function orchestrateGRNGL(params: {
  company: string;
  grnId: string;
  grnDate: string;
  vendorName: string;
  totalOKValue: number;
  totalDefectiveValue: number;
  freightType: 'Vendor Included' | 'Own Expense';
  freightAmount: number;
  cashPaymentRef?: string;
  otherCharges: number;
  otherChargesDesc: string;
  craneVendorName?: string;
  craneAmount?: number;
  labourVendorName?: string;
  labourGross?: number;
  packingBuyback?: number;
  labourNetPayable?: number;
  landedChargesTotal?: number;
}) {
  const { freightType, freightAmount } = params;
  let glCount = 0;
  const pvSummary: string[] = [];

  // 1. Material + Landed Cost receipt (single GL entry)
  // Dr Inventory = material + all landed charges
  // Cr GR/IR = material value (vendor payable)
  // Cr Cash = landed charges (freight+crane+labour+other paid)
  const ok1 = postGRNMaterialGL({
    company: params.company, grnId: params.grnId, grnDate: params.grnDate,
    vendorName: params.vendorName,
    totalOKValue: params.totalOKValue,
    totalDefectiveValue: params.totalDefectiveValue,
    lineCount: 1,
    landedChargesTotal: params.landedChargesTotal || 0,
  });
  if (ok1) glCount++;

  // 2. Freight — Vendor Included only needs separate PV (Dr Vendor Payable / Cr Cash)
  // Own Expense freight is already in landed charges → no separate GL needed
  if (freightAmount > 0 && freightType === 'Vendor Included') {
    const ok2 = postFreightVendorIncludedGL({
      company: params.company, grnId: params.grnId, grnDate: params.grnDate,
      vendorName: params.vendorName, freightAmount,
      cashPaymentRef: params.cashPaymentRef,
    });
    if (ok2) glCount++;
  }

  // 3-5: Crane, Labour, Other — cash already credited in material GL entry
  // Labour packing PV still needed for IFRS gross accounting visibility
  if ((params.craneAmount || 0) > 0) {
    pvSummary.push(`Crane: PKR ${params.craneAmount!.toLocaleString()}`);
  }

  if ((params.labourGross || 0) > 0) {
    const netPay = params.labourNetPayable ?? (params.labourGross! - (params.packingBuyback || 0));
    if (params.labourVendorName) {
      const ok5 = postLabourPackingPV({
        company: params.company, grnId: params.grnId, grnDate: params.grnDate,
        labourVendorName: params.labourVendorName, labourGross: params.labourGross!,
        packingBuyback: params.packingBuyback || 0, netPayable: netPay,
      });
      if (ok5) glCount++;
    }
    pvSummary.push(`Labour Net: PKR ${netPay.toLocaleString()}`);
  }

  if (glCount > 0) {
    const pvNote = pvSummary.length > 0 ? ` | ${pvSummary.join(', ')}` : '';
    toast.success(`${glCount} GL entr${glCount > 1 ? 'ies' : 'y'} — Landed cost capitalized into inventory${pvNote}`, { duration: 5000 });
  }

  return glCount;
}

// ══════════════════════════════════════════════════════════════════════════
// 7. NIPPON GRN ORCHESTRATOR — Trading-company hardware receipt (Phase 1)
//
// Replaces NipponGoodsReceipt's previous NO-GL save path with a balanced
// double-entry journal. Decision B (per-brand inventory) is encoded in
// `nipponInventoryAcc()`; decision C (flat AP) defaults to 21111.
//
// Journal pattern:
//   Dr <inventory accounts> per brand   (sum of qty × rate per line)
//   Cr <credit account>                  (single line, by payment mode)
//
// Optional landed cost (freight) capitalized into inventory per IAS-2 —
// rolled into per-brand inventory rows pro-rated by line value.
//
// Returns the posted ledger transaction id (caller stores it as the GL ref
// on the GRN) or null on failure (so the caller knows NOT to mark stock
// as received).
// ══════════════════════════════════════════════════════════════════════════

export type NipponPaymentMode = 'Credit' | 'Cash' | 'Advance';

export interface NipponGRNLine {
  productId: string;
  description: string;
  brand?: string;          // KIN LONG / Soleron / HuangXing / SIWAY / ...
  mainCategory?: string;   // 'Aluminium Products' | 'UPVC' | 'Steel Mesh' | 'Silicon'
  qty: number;             // PCS / SET
  rate: number;            // PKR per unit (landed cost basis)
}

/**
 * Per-brand inventory account resolution (decision B).
 * Falls back to 11514 General Hardware if brand/category not recognised.
 */
function nipponInventoryAcc(brand?: string, mainCategory?: string): string {
  const b = (brand || '').toUpperCase();
  const c = (mainCategory || '').toUpperCase();

  if (b.includes('KIN LONG') || b.includes('KINLONG')) return ACC_NIPPON.INVENTORY_KL;
  if (c.includes('UPVC'))                              return ACC_NIPPON.INVENTORY_UPVC;
  if (c.includes('ALUMINIUM'))                         return ACC_NIPPON.INVENTORY_ALUM;
  return ACC_NIPPON.INVENTORY_HW; // default General Hardware
}

/**
 * Resolve the credit-side account based on payment mode.
 *   Credit  → 21111 Payable (default)
 *   Cash    → 11121 Bank (or 11112 cash if Hassan picks that)
 *   Advance → 11411 Advance settlement (Dr-side asset reduction)
 */
function nipponCreditAcc(mode: NipponPaymentMode): string {
  switch (mode) {
    case 'Cash':    return ACC_NIPPON.BANK_MCB;
    case 'Advance': return ACC_NIPPON.ADVANCE_KL;
    case 'Credit':
    default:        return ACC_NIPPON.PAYABLE_KL;
  }
}

export function orchestrateNipponGRN(params: {
  grnId: string;
  grnDate: string;
  vendorName: string;
  paymentMode: NipponPaymentMode;       // 'Credit' default
  lines: NipponGRNLine[];
  freightTotal?: number;                // landed cost — pro-rated into inventory
}): string | null {
  const company = 'Nippon';
  const { grnId, grnDate, vendorName, paymentMode, lines } = params;
  const freightTotal = params.freightTotal || 0;

  if (!lines.length) {
    console.warn('[Nippon GRN GL] no lines — skip');
    return null;
  }

  // ── Compute material totals per inventory account ───────────────────
  const matByAcc: Record<string, number> = {};
  let totalMaterial = 0;
  for (const line of lines) {
    if (line.qty <= 0 || line.rate <= 0) continue;
    const lineVal = line.qty * line.rate;
    const accCode = nipponInventoryAcc(line.brand, line.mainCategory);
    matByAcc[accCode] = (matByAcc[accCode] || 0) + lineVal;
    totalMaterial += lineVal;
  }

  if (totalMaterial <= 0) {
    console.warn('[Nippon GRN GL] zero material total — skip');
    return null;
  }

  // ── Pro-rate freight (landed cost) into inventory accounts ─────────
  // IAS-2: landed cost capitalized into inventory, NOT expensed at GRN.
  if (freightTotal > 0) {
    for (const accCode of Object.keys(matByAcc)) {
      const share = freightTotal * (matByAcc[accCode] / totalMaterial);
      matByAcc[accCode] += share;
    }
  }

  // ── Resolve all accounts (auto-create if missing via ensureAccount) ──
  const details: LedgerTransaction['details'] = [];
  for (const [code, amount] of Object.entries(matByAcc)) {
    if (amount <= 0) continue;
    const acc = getOrCreateAcc(company, code);
    if (!acc) {
      console.error(`[Nippon GRN GL] could not create inventory account ${code}`);
      toast.error(`Nippon GRN GL: missing inventory account ${code}. Add to COA and retry.`);
      return null;
    }
    details.push({
      accountId: acc.id,
      debit: Math.round(amount * 100) / 100,
      credit: 0,
      text: `Inventory in — GRN ${grnId} (${vendorName})`,
    });
  }

  // ── Credit side: single payable / cash / advance line ──────────────
  const creditCode = nipponCreditAcc(paymentMode);
  const creditAcc  = getOrCreateAcc(company, creditCode);
  if (!creditAcc) {
    toast.error(`Nippon GRN GL: missing credit account ${creditCode}. Add to COA and retry.`);
    return null;
  }
  const totalDebit = details.reduce((s, d) => s + d.debit, 0);
  details.push({
    accountId: creditAcc.id,
    debit: 0,
    credit: Math.round(totalDebit * 100) / 100,
    text: paymentMode === 'Credit'
      ? `Payable accrued — ${vendorName} (GRN ${grnId})`
      : paymentMode === 'Cash'
        ? `Cash/bank paid — ${vendorName} (GRN ${grnId})`
        : `Advance settled — ${vendorName} (GRN ${grnId})`,
  });

  // ── Post via FinanceService (which enforces Dr = Cr) ──────────────
  const txId = genTxId('KR');
  const tx: LedgerTransaction = {
    id: txId,
    company,
    docType: 'KR' as LedgerDocType,
    docDate: grnDate,
    date: grnDate,
    description: `Nippon GRN ${grnId} — ${vendorName} (${paymentMode})`,
    referenceId: grnId,
    status: 'Posted',
    details,
  };

  try {
    FinanceService.recordTransaction(tx);
    toast.success(
      `GL posted: PKR ${totalDebit.toLocaleString()} inventory recorded — GRN ${grnId}`,
      { duration: 4000 }
    );
    return txId;
  } catch (err: any) {
    console.error('[Nippon GRN GL] posting failed:', err);
    toast.error(`Nippon GRN GL failed: ${err?.message || 'unknown'}. Stock NOT received.`);
    return null;
  }
}
