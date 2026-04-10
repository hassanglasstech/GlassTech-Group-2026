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
import { supabase } from '../../../src/services/supabaseClient';

// ── SCM-1: QA Integrity Error ─────────────────────────────────────────────
// Thrown by assertGRNQAMatch() when the caller-supplied OK/defective values
// do not match the actual inspection_lots records for the GRN.
export class GRNQAIntegrityError extends Error {
  constructor(
    public readonly grnId: string,
    public readonly suppliedOKValue: number,
    public readonly actualOKValue: number,
    public readonly suppliedDefectiveValue: number,
    public readonly actualDefectiveValue: number,
  ) {
    super(
      `GRNQAIntegrityError: Inspection lot mismatch for GRN "${grnId}". ` +
      `Supplied OK value: PKR ${suppliedOKValue} vs inspected: PKR ${actualOKValue}. ` +
      `Supplied defective value: PKR ${suppliedDefectiveValue} vs inspected: PKR ${actualDefectiveValue}. ` +
      `Complete or correct the Quality Inspection (MIGO QA) before posting GL.`
    );
    this.name = 'GRNQAIntegrityError';
    Object.setPrototypeOf(this, GRNQAIntegrityError.prototype);
  }
}

// ── SCM-5: Three-Way Match Error ──────────────────────────────────────────
// Thrown by assertThreeWayMatch() when PO, GRN, and vendor invoice values
// do not agree within PKR 1 tolerance. Any of the three legs missing or
// mismatched must be resolved before a vendor payment GL entry is posted.
export class ThreeWayMatchError extends Error {
  constructor(
    public readonly grnId:  string,
    public readonly reason: string,
  ) {
    super(
      `ThreeWayMatchError for GRN "${grnId}": ${reason}. ` +
      `A vendor payment GL entry requires an Approved PO, a posted GRN, and a ` +
      `vendor invoice whose total matches both within PKR 1 tolerance.`
    );
    this.name = 'ThreeWayMatchError';
    Object.setPrototypeOf(this, ThreeWayMatchError.prototype);
  }
}

// ── SCM-5: Three-Way Match assertion ─────────────────────────────────────
// Verifies the three legs of a purchase before any vendor payment GL entry:
//   1. PO exists in purchase_orders with status = 'Approved'
//   2. GRN received value is within PKR 1 of the PO total
//   3. Vendor invoice amount is within PKR 1 of the GRN received value
//
// Call this before posting a Dr GR/IR Clearing / Cr Vendor Payable entry.
// Throws ThreeWayMatchError if any leg fails.
export const assertThreeWayMatch = async (params: {
  company:         string;
  grnId:           string;
  poId:            string;
  grnTotalValue:   number;   // OK value + defective usable value
  invoicedAmount:  number;   // vendor invoice total for this GRN
}): Promise<void> => {
  const { company, grnId, poId, grnTotalValue, invoicedAmount } = params;
  const TOLERANCE_PKR = 1;

  // Leg 1: PO must exist and be Approved
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select('id, status, total_amount')
    .eq('id', poId)
    .eq('company', company)
    .maybeSingle();

  if (poErr || !po) {
    throw new ThreeWayMatchError(grnId, `PO "${poId}" not found in ${company}`);
  }
  if (po.status !== 'Approved') {
    throw new ThreeWayMatchError(
      grnId, `PO "${poId}" is in status "${po.status}" — must be "Approved"`
    );
  }

  // Leg 2: GRN value must match PO total within tolerance
  const poTotal = Number(po.total_amount ?? 0);
  if (poTotal > 0 && Math.abs(grnTotalValue - poTotal) > TOLERANCE_PKR) {
    throw new ThreeWayMatchError(
      grnId,
      `GRN received value PKR ${grnTotalValue.toFixed(0)} differs from ` +
      `PO total PKR ${poTotal.toFixed(0)} by PKR ` +
      `${Math.abs(grnTotalValue - poTotal).toFixed(0)} (limit: PKR ${TOLERANCE_PKR})`
    );
  }

  // Leg 3: Vendor invoice must match GRN received value within tolerance
  if (Math.abs(invoicedAmount - grnTotalValue) > TOLERANCE_PKR) {
    throw new ThreeWayMatchError(
      grnId,
      `Vendor invoice amount PKR ${invoicedAmount.toFixed(0)} differs from ` +
      `GRN received value PKR ${grnTotalValue.toFixed(0)} by PKR ` +
      `${Math.abs(invoicedAmount - grnTotalValue).toFixed(0)} (limit: PKR ${TOLERANCE_PKR})`
    );
  }
  // All three legs confirmed — vendor payment GL entry may proceed.
};

// ── SCM-1: QA gate — MUST be awaited before postGRNMaterialGL() ──────────
// Queries inspection_lots for the given grnId and asserts that the passed-in
// totalOKValue and totalDefectiveValue match the QA records to within PKR 1
// (to absorb floating-point rounding in MAP-based valuations).
//
// If no inspection lot exists at all, this is also an integrity failure —
// you cannot receive inventory without a corresponding QA record.
export const assertGRNQAMatch = async (params: {
  grnId: string;
  totalOKValue: number;
  totalDefectiveValue: number;
}): Promise<void> => {
  const { grnId, totalOKValue, totalDefectiveValue } = params;
  const TOLERANCE_PKR = 1; // PKR 1 rounding tolerance

  const { data: lots, error } = await supabase
    .from('inspection_lots')
    .select('ok_value, defective_value, ok_qty, defective_qty')
    .eq('grn_id', grnId);

  if (error) {
    throw new GRNQAIntegrityError(grnId, totalOKValue, 0, totalDefectiveValue, 0);
  }
  if (!lots || lots.length === 0) {
    throw new GRNQAIntegrityError(grnId, totalOKValue, 0, totalDefectiveValue, 0);
  }

  const inspectedOKValue  = lots.reduce((s, l) => s + (Number(l.ok_value)        ?? 0), 0);
  const inspectedDefValue = lots.reduce((s, l) => s + (Number(l.defective_value) ?? 0), 0);

  if (
    Math.abs(totalOKValue        - inspectedOKValue)  > TOLERANCE_PKR ||
    Math.abs(totalDefectiveValue - inspectedDefValue) > TOLERANCE_PKR
  ) {
    throw new GRNQAIntegrityError(
      grnId, totalOKValue, inspectedOKValue, totalDefectiveValue, inspectedDefValue,
    );
  }
  // Passed — values are consistent with QA records. GL posting may proceed.
};

// ── Account code constants (GlassCo COA) ─────────────────────────────────
const ACC = {
  INVENTORY_GLASS:   '11511',   // Float Glass — Clear (raw glass inventory)
  GRIR_MATERIAL:     '21151',   // GR/IR — Glass Material
  GRIR_FREIGHT:      '21152',   // GR/IR — Freight & Transport
  PAYABLE_GLASS:     '21111',   // Payable — Glass Importers
  PAYABLE_TEMPERING: '21112',   // Payable — Tempering Vendors
  PAYABLE_OTHER:     '21113',   // Payable — Other Vendors
  CASH_IN_HAND:      '11112',   // Cash in Hand
  GLASS_BREAKAGE:    '56113',   // Glass Breakage & Write-off
  FREIGHT_EXPENSE:   '51214',   // Inward Freight Expense (fallback: 51213)
  SCRAP_INVENTORY:   '11519',   // Scrap Inventory (nominal) — may not exist, fallback to 11511
  OTHER_INCOME:      '44112',   // Other Income / Miscellaneous
};

// ── Helper: find account by code ──────────────────────────────────────────
function findAcc(accounts: any[], code: string) {
  return accounts.find(a => a.code === code);
}

function genTxId(prefix: string): string {
  return `${prefix}-${Date.now().toString().slice(-8)}`;
}

// ══════════════════════════════════════════════════════════════════════════
// 1. GRN POST — Dr Inventory / Cr GR/IR
// Called from GoodsReceiptMIGO on Post
// ══════════════════════════════════════════════════════════════════════════
// SCM-1: postGRNMaterialGL is now async — it must await assertGRNQAMatch()
// before writing any GL entry. Callers (orchestrateGRNGL and any direct
// call sites) must be updated to await this function.
export async function postGRNMaterialGL(params: {
  company: string;
  grnId: string;
  grnDate: string;
  vendorName: string;
  totalOKValue: number;        // OK sheets value at MAP
  totalDefectiveValue: number; // Defective usable value at MAP
  lineCount: number;
}): Promise<boolean> {
  const { company, grnId, grnDate, vendorName } = params;

  // SCM-1: Assert QA records exist and values match before any GL posting.
  // Throws GRNQAIntegrityError if inspection_lots are missing or mismatched.
  await assertGRNQAMatch({
    grnId,
    totalOKValue:        params.totalOKValue,
    totalDefectiveValue: params.totalDefectiveValue,
  });

  const totalValue = params.totalOKValue + params.totalDefectiveValue;
  if (totalValue <= 0) return true; // nothing to post

  const accounts = FinanceService.getAccounts().filter(a => a.company === company);
  const invAcc  = findAcc(accounts, ACC.INVENTORY_GLASS);
  const grirAcc = findAcc(accounts, ACC.GRIR_MATERIAL);

  if (!invAcc || !grirAcc) {
    const missing = [!invAcc && ACC.INVENTORY_GLASS, !grirAcc && ACC.GRIR_MATERIAL].filter(Boolean).join(', ');
    toast.error(`GL FAILED: Account(s) ${missing} not found in COA for ${company}. GRN inventory not posted to GL. Create these accounts or verify GL Code Verifier.`, { duration: 10000 });
    return false;
  }

  const tx: LedgerTransaction = {
    id: genTxId('WE'),
    company: company as any,
    docType: 'JV' as LedgerDocType,
    docDate: grnDate,
    date: grnDate,
    description: `GRN ${grnId} — Material Receipt (${vendorName})`,
    referenceId: grnId,
    status: 'Posted',
    details: [
      {
        accountId: invAcc.id,
        debit: totalValue,
        credit: 0,
        text: `Inventory in — GRN ${grnId} (OK: ${params.totalOKValue.toFixed(0)} + Defective: ${params.totalDefectiveValue.toFixed(0)})`,
      },
      {
        accountId: grirAcc.id,
        debit: 0,
        credit: totalValue,
        text: `GR/IR Clearing — clear on vendor SO match`,
      },
    ],
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

  const accounts = FinanceService.getAccounts().filter(a => a.company === company);
  const payableAcc = findAcc(accounts, ACC.PAYABLE_GLASS)
    || findAcc(accounts, ACC.PAYABLE_OTHER);
  const cashAcc = findAcc(accounts, ACC.CASH_IN_HAND);

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

  const accounts = FinanceService.getAccounts().filter(a => a.company === company);
  // Try 51214 first (inward freight), fallback to 51213
  const frtAcc = findAcc(accounts, ACC.FREIGHT_EXPENSE)
    || findAcc(accounts, '51213')
    || accounts.find(a => a.name?.toLowerCase().includes('freight') && a.type === 'Expense');
  const crAcc = paidBy === 'Cash'
    ? findAcc(accounts, ACC.CASH_IN_HAND)
    : findAcc(accounts, ACC.PAYABLE_OTHER);

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
      { accountId: frtAcc.id, debit: freightAmount, credit: 0, text: `Inward freight — GRN ${grnId}` },
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

  const accounts = FinanceService.getAccounts().filter(a => a.company === company);
  const grirAcc     = findAcc(accounts, ACC.GRIR_MATERIAL);
  const breakageAcc = findAcc(accounts, ACC.GLASS_BREAKAGE);

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

  const accounts = FinanceService.getAccounts().filter(a => a.company === company);
  const cashAcc = findAcc(accounts, ACC.CASH_IN_HAND);
  // Scrap inventory — try 11519, fallback to glass inventory
  const scrapInvAcc = findAcc(accounts, ACC.SCRAP_INVENTORY)
    || findAcc(accounts, ACC.INVENTORY_GLASS);
  const otherIncomeAcc = findAcc(accounts, ACC.OTHER_INCOME)
    || accounts.find(a => a.name?.toLowerCase().includes('other income') && a.type === 'Revenue');

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
    const breakageAcc = findAcc(accounts, ACC.GLASS_BREAKAGE);
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

  const accounts = FinanceService.getAccounts().filter(a => a.company === company);
  const expAcc  = accounts.find(a => a.name?.toLowerCase().includes('miscellaneous') && a.type === 'Expense')
    || findAcc(accounts, '52291') // misc operating expense
    || accounts.find(a => a.type === 'Expense' && a.level >= 4);
  const cashAcc = findAcc(accounts, ACC.CASH_IN_HAND);

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
      { accountId: expAcc.id, debit: amount, credit: 0, text: description },
      { accountId: cashAcc.id, debit: 0, credit: amount, text: `Cash paid — GRN ${grnId}` },
    ],
  };

  FinanceService.recordTransaction(tx);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// 6. FULL GRN GL ORCHESTRATOR
// Call this from GoodsReceiptMIGO after posting stock
// ══════════════════════════════════════════════════════════════════════════
// orchestrateGRNGL is now async because postGRNMaterialGL requires awaiting
// the SCM-1 QA gate. All call sites must await this function.
export async function orchestrateGRNGL(params: {
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
  // SCM-5: Optional Three-Way Match params — supply when posting a vendor
  // payment GL entry (Dr GR/IR Clearing / Cr Vendor Payable). If provided,
  // assertThreeWayMatch() is called before any GL entries are written.
  poId?: string;
  vendorInvoiceAmount?: number;
}): Promise<number> {
  const { freightType, freightAmount, otherCharges } = params;
  let glCount = 0;

  // SCM-5: If PO and vendor invoice details are provided, enforce Three-Way
  // Match before posting. This blocks vendor payment GL if PO/GRN/Invoice
  // values diverge beyond PKR 1 tolerance.
  if (params.poId && params.vendorInvoiceAmount !== undefined) {
    await assertThreeWayMatch({
      company:        params.company,
      grnId:          params.grnId,
      poId:           params.poId,
      grnTotalValue:  params.totalOKValue + params.totalDefectiveValue,
      invoicedAmount: params.vendorInvoiceAmount,
    });
  }

  // 1. Material receipt (throws GRNQAIntegrityError if QA gate fails)
  const ok1 = await postGRNMaterialGL({
    company: params.company, grnId: params.grnId, grnDate: params.grnDate,
    vendorName: params.vendorName,
    totalOKValue: params.totalOKValue,
    totalDefectiveValue: params.totalDefectiveValue,
    lineCount: 1,
  });
  if (ok1) glCount++;

  // 2. Freight
  if (freightAmount > 0) {
    const ok2 = freightType === 'Vendor Included'
      ? postFreightVendorIncludedGL({
          company: params.company, grnId: params.grnId, grnDate: params.grnDate,
          vendorName: params.vendorName, freightAmount,
          cashPaymentRef: params.cashPaymentRef,
        })
      : postFreightOwnExpenseGL({
          company: params.company, grnId: params.grnId, grnDate: params.grnDate,
          freightAmount, paidBy: 'Cash',
        });
    if (ok2) glCount++;
  }

  // 3. Other charges
  if (otherCharges > 0 && params.otherChargesDesc) {
    const ok3 = postOtherChargesGL({
      company: params.company, grnId: params.grnId, grnDate: params.grnDate,
      amount: otherCharges, description: params.otherChargesDesc,
    });
    if (ok3) glCount++;
  }

  if (glCount > 0) {
    toast.success(`${glCount} GL entr${glCount > 1 ? 'ies' : 'y'} posted for GRN ${params.grnId}`, { duration: 4000 });
  } else {
    toast.error(`GL FAILED: No GL entries posted for GRN ${params.grnId}. Check Chart of Accounts and GL Code Verifier in Finance → Config.`, { duration: 10000 });
  }

  return glCount;
}
