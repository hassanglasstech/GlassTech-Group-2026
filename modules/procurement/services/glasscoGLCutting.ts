// ============================================================================
// glasscoGLCutting — cutting-session-close GL (Dr WIP / Cr Glass Inventory)
// Extracted verbatim from glasscoGLService.ts (H6 decomposition, behaviour-
// neutral). Re-exported from glasscoGLService.ts so external import paths are
// unchanged.
// ============================================================================
import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Company } from '@/modules/shared/types/core';
import { glassAccounts, getMAPForMaterial } from './glasscoGLHelpers';

// ══════════════════════════════════════════════════════════════════
// A. CUTTING SESSION CLOSE → Dr WIP / Cr Glass Inventory
// ══════════════════════════════════════════════════════════════════

/**
 * Sprint 1: builder for the atomic cutting-close flow.
 * Returns the ledger row + per-material consumption plan WITHOUT
 * writing. Caller bundles into consume_glass_stock RPC.
 */
export interface CuttingGLPlan {
  ledgerTx: any | null;
  consumption: Array<{ material_id: string; qty: number }>;
  stockLedgerRows: any[];
  totalSqft: number;
  totalValue: number;
  alreadyPosted: boolean;
}

export function buildCuttingGLPlan(params: {
  company: Company;
  sessionId: string;
  sheetsScanned: { tagId: string; isDefective: boolean }[];
  scrapSqft: number;
  date: string;
}): CuttingGLPlan {
  const { company, sessionId, sheetsScanned, scrapSqft, date } = params;
  const accs = glassAccounts(company);
  const ledger = FinanceService.getLedger();
  const txId = `GL-CUT-${sessionId}`;
  if (ledger.some((t: any) => t.id === txId)) {
    return { ledgerTx: null, consumption: [], stockLedgerRows: [],
      totalSqft: 0, totalValue: 0, alreadyPosted: true };
  }

  const sheetEntries = sheetsScanned
    .map(s => InventoryService.getGRNSheetEntryByTag(s.tagId))
    .filter(Boolean);
  if (sheetEntries.length === 0) {
    return { ledgerTx: null, consumption: [], stockLedgerRows: [],
      totalSqft: 0, totalValue: 0, alreadyPosted: false };
  }

  const byMaterial: Record<string, { sqft: number; map: number }> = {};
  sheetEntries.forEach((entry: any) => {
    if (!entry) return;
    const map = getMAPForMaterial(company, entry.materialId);
    if (!byMaterial[entry.materialId]) byMaterial[entry.materialId] = { sqft: 0, map };
    byMaterial[entry.materialId].sqft += entry.sqftPerSheet || 0;
  });

  const totalSqft  = Object.values(byMaterial).reduce((s, v) => s + v.sqft, 0);
  const totalValue = Object.values(byMaterial).reduce((s, v) => s + v.sqft * v.map, 0);
  const wipValue   = totalValue;
  const scrapValue = scrapSqft > 0 && totalSqft > 0
    ? (scrapSqft / totalSqft) * totalValue : 0;
  if (totalValue <= 0) {
    return { ledgerTx: null, consumption: [], stockLedgerRows: [],
      totalSqft, totalValue: 0, alreadyPosted: false };
  }

  const details: any[] = [
    { accountId: accs.wip.id, debit: wipValue - scrapValue, credit: 0,
      text: `Cutting: ${sheetEntries.length} sheets → WIP (${totalSqft.toFixed(1)} sqft)` },
  ];
  if (scrapValue > 0) {
    details.push({ accountId: accs.scrap.id, debit: scrapValue, credit: 0,
      text: `Cutting scrap: ${scrapSqft.toFixed(1)} sqft @ avg MAP` });
  }
  details.push({ accountId: accs.glassInv.id, debit: 0, credit: totalValue,
    text: `Cutting session ${sessionId} — ${sheetEntries.length} sheets` });

  const ledgerTx = {
    id: txId, company, docType: 'WA',
    docDate: date, date,
    description: `Cutting GL: ${sessionId} — ${totalSqft.toFixed(1)} sqft → WIP`,
    referenceId: sessionId, status: 'Posted' as const,
    createdBy: 'system-auto',
    details,
  };

  const consumption = Object.entries(byMaterial)
    .map(([material_id, { sqft }]) => ({ material_id, qty: sqft }));

  // Stock ledger audit rows — one per material consumed
  const stockLedgerRows = consumption.map(c => ({
    id: `SL-CUT-${sessionId}-${c.material_id}`,
    company,
    data: {
      company,
      materialId: c.material_id,
      txnType: 'CUT-CONSUME',
      qty: -c.qty,
      sessionId,
      date,
      reference: txId,
    },
  }));

  return { ledgerTx, consumption, stockLedgerRows,
    totalSqft, totalValue, alreadyPosted: false };
}

export function postCuttingGL(params: {
  company: Company;
  sessionId: string;
  sheetsScanned: { tagId: string; isDefective: boolean }[];
  scrapSqft: number;
  date: string;
}): void {
  const { company, sessionId, sheetsScanned, scrapSqft, date } = params;
  const accs = glassAccounts(company);
  const ledger = FinanceService.getLedger();
  const txId = `GL-CUT-${sessionId}`;
  if (ledger.some((t: any) => t.id === txId)) return; // already posted

  // Get GRN sheet entries to find material + sqft per sheet
  const sheetEntries = sheetsScanned
    .map(s => InventoryService.getGRNSheetEntryByTag(s.tagId))
    .filter(Boolean);

  if (sheetEntries.length === 0) return;

  // Group by material, sum sqft
  const byMaterial: Record<string, { sqft: number; map: number }> = {};
  sheetEntries.forEach((entry: any) => {
    if (!entry) return;
    const map = getMAPForMaterial(company, entry.materialId);
    if (!byMaterial[entry.materialId]) byMaterial[entry.materialId] = { sqft: 0, map };
    byMaterial[entry.materialId].sqft += entry.sqftPerSheet || 0;
  });

  const totalSqft  = Object.values(byMaterial).reduce((s, v) => s + v.sqft, 0);
  const totalValue = Object.values(byMaterial).reduce((s, v) => s + v.sqft * v.map, 0);
  const wipValue   = totalValue; // full sheet value → WIP
  const scrapValue = scrapSqft > 0 && totalSqft > 0
    ? (scrapSqft / totalSqft) * totalValue : 0;

  if (totalValue <= 0) return;

  const details: any[] = [
    // Dr WIP (glass now in process)
    { accountId: accs.wip.id,      debit: wipValue - scrapValue, credit: 0,
      text: `Cutting: ${sheetEntries.length} sheets → WIP (${totalSqft.toFixed(1)} sqft)` },
  ];

  // Scrap if any
  if (scrapValue > 0) {
    details.push({ accountId: accs.scrap.id, debit: scrapValue, credit: 0,
      text: `Cutting scrap: ${scrapSqft.toFixed(1)} sqft @ avg MAP` });
  }

  // Cr Glass Inventory (total sheets consumed)
  details.push({ accountId: accs.glassInv.id, debit: 0, credit: totalValue,
    text: `Cutting session ${sessionId} — ${sheetEntries.length} sheets` });

  // Phase-7 (B2): Cutting GL also Posts directly. Pure asset
  // reclassification (Glass Inventory → WIP) — no liability, no Maker-
  // Checker concern. Keeping it Parked left raw inventory overstated on
  // the balance sheet until a manual post. system-auto bypasses the JV
  // approval gate.
  FinanceService.recordTransaction({
    id: txId, company, docType: 'WA',
    docDate: date, date,
    description: `Cutting GL: ${sessionId} — ${totalSqft.toFixed(1)} sqft → WIP`,
    referenceId: sessionId, status: 'Posted',
    createdBy: 'system-auto',
    details,
  } as any);
}
