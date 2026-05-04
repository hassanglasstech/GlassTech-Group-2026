/**
 * deliveryInvoiceService.ts — Phase 3
 *
 * Changes:
 *  - GST support: gstPercent param → separate GST GL line + GST Payable account
 *  - GL status → Posted directly (no more Parked for invoice entries)
 *  - Sequential invoice numbering via localStorage counter
 */

import { Company, Quotation, LedgerTransaction, Invoice } from '@/modules/shared/types';
import { FinanceService, ledgerToRow } from '@/modules/finance/services/financeService';
import { SalesService } from '@/modules/sales/services/salesService';
import {
  postDeliveryCOGS,
  buildDeliveryCOGSPlan,
  applyDeliveryCOGSStoreUpdates,
} from '@/modules/procurement/services/glasscoGLService';
import { ProductionService } from '@/modules/production/services/productionService';
import { allocateSerial } from '@/modules/sales/services/serialAllocator';
import { supabase } from '../../../src/services/supabaseClient';
import { safeParse, safeSave } from '@/modules/shared/services/utils';

// Sprint 1: localStorage cache keys mirrored after the atomic RPC commits,
// so synchronous getters (SalesService.getInvoices, FinanceService.getLedger)
// see the new rows on the next read without waiting for the next pull cycle.
const LS_INVOICES   = 'gtk_erp_invoices';
const LS_LEDGER     = 'gtk_erp_ledger';
const LS_QUOTATIONS = 'gtk_erp_quotations';

interface InvoiceResult {
  invoiceId: string;
  finalAmount: number;
  gstAmount: number;
  grandTotal: number;
  alreadyInvoiced: boolean;
  clientName: string;
}

// ── Sequential invoice number (collision-safe) ────────────────────────
const buildInvoiceNumber = (company: Company, seq: number): string => {
  const now = new Date();
  const year = now.getFullYear();
  const prefix = company.substring(0, 3).toUpperCase();
  if (company === 'Glassco') {
    const mmyy = `${(now.getMonth() + 1).toString().padStart(2, '0')}${year.toString().slice(-2)}`;
    return `GT-INV-GLS-${mmyy}-${String(seq).padStart(4, '0')}`;
  }
  return `INV-${prefix}-${year}-${String(seq).padStart(4, '0')}`;
};

// Phase-2: atomic Postgres-issued invoice number (RC-8 fix).
// Falls back to local counter when RPC unavailable (offline mode).
//
// Phase-7 (B4): the previous local collision check was removed. With the
// `uk_invoices_company_no` UNIQUE constraint added in migration 037, the
// DB itself rejects duplicates — and `allocate_serial` is already atomic
// at the Postgres level, so a clean candidate is guaranteed. Appending a
// timestamp suffix on a phantom collision was masking pre-Phase-2 dirty
// data and risked legitimate sequential numbers being mutated.
const getNextInvoiceNumber = async (company: Company): Promise<string> => {
  const year = new Date().getFullYear();
  const seq  = await allocateSerial(company, 'INV', year, 1);
  return buildInvoiceNumber(company, seq);
};

export async function generateDeliveryInvoice(
  order: Quotation,
  company: Company,
  gstPercent: number = 0
): Promise<InvoiceResult> {
  // ── Validation guards (P1) ────────────────────────────────────────
  if (!order || !order.id) {
    throw new Error('Invoice generation: order is missing.');
  }
  if (!order.clientId) {
    throw new Error('Invoice generation: client is required.');
  }
  const items = order.items || [];
  const serviceChargesArr = order.serviceCharges || [];
  if (items.length === 0 && serviceChargesArr.length === 0) {
    throw new Error('Invoice generation: at least one line item or service charge required.');
  }

  // ── Guard: already invoiced? ──────────────────────────────────────
  const existing = SalesService.getInvoices().find(
    (i: Invoice) => i.orderId === order.id
  );
  if (existing) {
    return {
      invoiceId: existing.id,
      finalAmount: existing.totalAmount,
      gstAmount: (existing as any).gstAmount || 0,
      grandTotal: existing.totalAmount,
      alreadyInvoiced: true,
      clientName: existing.clientName,
    };
  }

  // ── Calculate amounts ─────────────────────────────────────────────
  const clients = SalesService.getClients();
  const client = clients.find((c: any) => c.id === order.clientId);
  const clientName = client?.name || order.clientId || 'Walk-in';

  // ── Apply wastage decision if override/review ─────────────────────
  const wDec: any = (order as any).wastageDecision;
  const applyWastage =
    wDec &&
    (wDec.decision === 'review' || wDec.decision === 'override') &&
    Number(wDec.suggestedNewRatePerSqft) > 0;

  const effectiveItems = applyWastage
    ? items.map((i: any) => {
        if (i.isSection) return i;
        const newRate = Number(wDec.suggestedNewRatePerSqft);
        const currentRate = Number(i.pricePerUnit) || 0;
        if (newRate <= currentRate) return i;
        const sqft = Number(i.totalSqFt) || 0;
        return { ...i, pricePerUnit: newRate, amount: Math.round(sqft * newRate) };
      })
    : items;

  const totalRevenue = effectiveItems.reduce(
    (s: number, i: any) => s + (Number(i.amount) || 0), 0
  );
  const serviceCharges = serviceChargesArr.reduce(
    (s: number, sc: any) => s + (Number(sc.amount) || 0), 0
  );
  const subtotal = totalRevenue + serviceCharges;
  const discount = order.discountAmount ||
    (subtotal * ((order.discountPercent || 0) / 100));
  const finalAmount = subtotal - discount;
  const gstAmount = gstPercent > 0 ? Math.round(finalAmount * (gstPercent / 100)) : 0;
  const grandTotal = finalAmount + gstAmount;

  // ── Amount guard: reject zero/negative invoices ───────────────────
  if (finalAmount <= 0 || grandTotal <= 0) {
    throw new Error(`Invoice generation: grand total must be > 0 (got PKR ${grandTotal}).`);
  }

  // ── Credit Limit Check (Phase-2: HARD ENFORCE — was console.warn) ─
  // Audit F3: silent log let AR balloon for defaulting clients.
  // Now throws so the invoice is NOT posted unless the client is within
  // their credit limit. Override path: caller must increase the client's
  // creditLimit (in ClientMaster) or have customer settle outstanding.
  if (client) {
    const creditLimit = (client as any).creditLimit || 0;
    if (creditLimit > 0) {
      const outstanding = SalesService.getInvoices()
        .filter((i: any) => i.clientId === order.clientId && i.status !== 'Paid' && i.status !== 'Voided')
        .reduce((s: number, i: any) => s + (Number(i.balance) || 0), 0);
      if (outstanding + grandTotal > creditLimit) {
        throw new Error(
          `Credit limit exceeded for ${clientName}: outstanding PKR ${outstanding.toLocaleString('en-PK')} + ` +
          `new invoice PKR ${grandTotal.toLocaleString('en-PK')} = PKR ${(outstanding + grandTotal).toLocaleString('en-PK')} ` +
          `> limit PKR ${creditLimit.toLocaleString('en-PK')}. ` +
          `Increase client credit limit in Client Master or collect outstanding balance first.`
        );
      }
    }
  }

  // ── Phase-7 (B10): pre-flight pieces validation. Audit I10: glass-cutting
  // invoices used to post Revenue with zero COGS when no production pieces
  // were linked, permanently inflating gross profit. Validate UPFRONT — before
  // any GL or DB writes — so the books stay clean if pieces are missing.
  const hasGlassItems = effectiveItems.some(
    (i: any) => !i.isSection && (Number(i.totalSqFt) || Number(i.sqft) || 0) > 0
  );
  const linkedPieceIds = ProductionService.getProductionPieces()
    .filter((p: any) => p.orderId === order.id || p.orderId === order.orderNo)
    .map((p: any) => p.id);

  if (hasGlassItems && linkedPieceIds.length === 0) {
    throw new Error(
      `Invoice generation blocked for "${order.orderNo || order.id}": order has glass items ` +
      `(sqft > 0) but no production pieces are linked. Cutting session must be closed first ` +
      `(it creates the pieces). Otherwise revenue would post without COGS — gross profit ` +
      `would be permanently inflated. Close the cutting session, then retry invoicing.`
    );
  }

  // ── JIT Account Creation — AR & Revenue ──────────────────────────
  const arParent  = FinanceService.ensureAccount(company, 'ASSETS',             1, null,          'Asset',   '10');
  const arCurrent = FinanceService.ensureAccount(company, 'CURRENT ASSETS',     2, arParent.id,   'Asset',   '11');
  const arTrade   = FinanceService.ensureAccount(company, 'TRADE RECEIVABLES',  3, arCurrent.id,  'Asset',   '122');
  const arControl = FinanceService.ensureAccount(company, 'CUSTOMERS CONTROL',  4, arTrade.id,    'Asset',   '1221');
  const clientAR  = FinanceService.ensureAccount(
    company,
    (clientName.toUpperCase() + (order.projectName ? ' — ' + order.projectName.toUpperCase() : '')),
    5, arControl.id, 'Asset', '12210'
  );

  const revParent  = FinanceService.ensureAccount(company, 'REVENUE',                    1, null,           'Revenue', '40');
  const revSales   = FinanceService.ensureAccount(company, 'SALES REVENUE',              2, revParent.id,   'Revenue', '41');
  const revService = FinanceService.ensureAccount(company, 'SERVICE REVENUE',            3, revSales.id,    'Revenue', '411');
  const revGlass   = FinanceService.ensureAccount(company, 'GLASS PROCESSING SERVICES', 4, revService.id,  'Revenue', '4111');
  const revenueAcc = FinanceService.ensureAccount(company, 'SERVICE INCOME',            5, revGlass.id,    'Revenue', '41110');

  // ── GST Payable account ───────────────────────────────────────────
  let gstPayableAcc: any = null;
  if (gstAmount > 0) {
    const liabParent = FinanceService.ensureAccount(company, 'LIABILITIES',         1, null,           'Liability', '20');
    const liabCurr   = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES', 2, liabParent.id,  'Liability', '22');
    const taxLiab    = FinanceService.ensureAccount(company, 'TAX LIABILITIES',     3, liabCurr.id,    'Liability', '221');
    gstPayableAcc    = FinanceService.ensureAccount(company, 'GST Payable',         4, taxLiab.id,     'Liability', '2214');
  }

  // ── Invoice ID (sequential, atomic via Postgres allocate_serial RPC) ─
  const invoiceId = await getNextInvoiceNumber(company);
  const txId      = 'GL-' + invoiceId;
  const today     = new Date().toISOString().split('T')[0];

  // ── GL Entry — Posted directly ────────────────────────────────────
  const details: any[] = [
    {
      accountId: clientAR.id,
      debit: grandTotal,
      credit: 0,
      text: 'AR: ' + clientName + (order.projectName ? ' | ' + order.projectName : ''),
    },
    {
      accountId: revenueAcc.id,
      debit: 0,
      credit: finalAmount,
      text: 'Service Revenue: ' + (order.projectName || order.orderNo || 'General'),
    },
  ];
  if (gstAmount > 0 && gstPayableAcc) {
    details.push({
      accountId: gstPayableAcc.id,
      debit: 0,
      credit: gstAmount,
      text: 'GST ' + gstPercent + '%: ' + invoiceId,
    });
  }

  const glTx: LedgerTransaction = {
    id: txId, company, docType: 'DR',
    docDate: today, date: today,
    description: 'INVOICE ' + invoiceId + ': ' + clientName + ' — ' + (order.orderNo || order.id),
    referenceId: invoiceId,
    status: 'Posted',
    reqId: order.id,
    details,
    // Phase-7 (B1): system-auto invoice GL bypasses Maker-Checker (this is
    // an automated event, not a manual JV). Without this, saveLedger throws.
    createdBy: 'system-auto',
  } as any;

  // Phase-7 (B1): pre-assert balance — fail fast before any RPC dispatch.
  FinanceService.assertGLBalance(glTx);

  // ── Inter-company mirror — build (don't write) ──────────────────────
  // Sprint 2: prefer the explicit `client.mirrorCompany` FK over the legacy
  // regex-on-name lookup. Regex stays as a fallback for migrating clients
  // that haven't been edited yet (Hassan can backfill mirrorCompany via
  // Client Master → Mirror Company dropdown).
  const VALID_COMPANIES: Company[] = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];
  let targetCompany: Company | null = null;
  const explicitMirror = (client as any)?.mirrorCompany;
  if (explicitMirror && VALID_COMPANIES.includes(explicitMirror)) {
    targetCompany = explicitMirror as Company;
  } else if (!explicitMirror) {
    // Legacy fallback — only used when mirrorCompany is null/undefined
    const cNameUpper = clientName.toUpperCase();
    const MIRROR_MAP: Record<string, Company> = {
      GTI: 'GTI', GTK: 'GTK', NIPPON: 'Nippon', GLASSCO: 'Glassco', FACTORY: 'Factory',
    };
    targetCompany =
      Object.entries(MIRROR_MAP).find(([key]) => cNameUpper.includes(key))?.[1] ?? null;
  }
  // explicitMirror set to '' / 'None' / null → no mirror (overrides regex).

  let mirrorTx: LedgerTransaction | null = null;
  if (targetCompany && targetCompany !== company) {
    const targetAccounts = FinanceService.getAccounts().filter(
      (a: any) => a.company === targetCompany
    );
    const costAcc = targetAccounts.find(
      (a: any) => a.name.includes('CONSUMED') || a.name.includes('MATERIAL') || (a.code || '').startsWith('511')
    ) || targetAccounts.find((a: any) => a.type === 'Expense');
    const payableAcc = targetAccounts.find(
      (a: any) => a.name.includes('PAYABLE') || (a.code || '').startsWith('221')
    ) || targetAccounts.find((a: any) => a.type === 'Liability');

    if (costAcc && payableAcc) {
      mirrorTx = {
        id: 'BILL-' + txId, company: targetCompany, docType: 'KR',
        docDate: today, date: today,
        description: 'AUTO-PURCHASE: From ' + company + ' — ' + invoiceId,
        referenceId: txId, status: 'Posted',
        createdBy: 'system-auto',
        details: [
          { accountId: costAcc.id,    debit: grandTotal, credit: 0,           text: 'Service from ' + company },
          { accountId: payableAcc.id, debit: 0,           credit: grandTotal, text: 'Payable to ' + company },
        ],
      } as any;
      FinanceService.assertGLBalance(mirrorTx as LedgerTransaction);
    }
  }

  // ── Build invoice record ─────────────────────────────────────────
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const invoice: any = {
    id: invoiceId, company,
    orderId: order.id, orderNo: order.orderNo || order.id,
    clientId: order.clientId, clientName,
    date: today, dueDate: dueDate.toISOString().split('T')[0],
    subtotal: finalAmount,
    gstPercent,
    gstAmount,
    totalAmount: grandTotal,
    receivedAmount: 0,
    balance: grandTotal,
    status: 'Outstanding',
    glTxId: txId,
    payments: [],
    projectName: order.projectName || '',
    items: effectiveItems,
    serviceCharges: order.serviceCharges || [],
    discountAmount: discount,
    wastageApplied: applyWastage,
  };

  // ── Build quotation patch ─────────────────────────────────────────
  const orderRow = SalesService.getQuotations().find((q: Quotation) => q.id === order.id);
  let quotationPatch: { id: string; patch: any } | null = null;
  let quotationFullUpdated: any = null;
  if (orderRow) {
    const updated: any = {
      ...orderRow,
      status: 'Invoiced',
      invoiceNo: invoiceId,
    };
    if (applyWastage) {
      updated.items = effectiveItems;
      updated.wastageAppliedAt = today;
      updated.wastageAppliedInvoiceId = invoiceId;
    }
    quotationFullUpdated = updated;
    quotationPatch = {
      id: order.id,
      patch: {
        status: 'Invoiced',
        invoiceNo: invoiceId,
        ...(applyWastage ? {
          items: effectiveItems,
          wastageAppliedAt: today,
          wastageAppliedInvoiceId: invoiceId,
        } : {}),
      },
    };
  }

  // ── Build COGS plan (without writing) ────────────────────────────
  let cogsPlan: ReturnType<typeof buildDeliveryCOGSPlan> = null;
  if (linkedPieceIds.length > 0) {
    cogsPlan = buildDeliveryCOGSPlan({
      company, invoiceId,
      orderId: order.orderNo || order.id,
      pieceIds: linkedPieceIds,
      date: today, clientName,
    });
  }

  // ── Sprint 1: ATOMIC RPC — invoice + GL + quote + COGS + mirror ─
  // One Postgres transaction. If any step fails, the entire transaction
  // rolls back. No more orphan ledger entries when step N+1 fails.
  const rpcPayload = {
    company,
    invoice_row: {
      id: invoice.id, company: invoice.company,
      order_id: invoice.orderId, order_no: invoice.orderNo,
      client_id: invoice.clientId, client_name: invoice.clientName,
      date: invoice.date, due_date: invoice.dueDate,
      total_amount: invoice.totalAmount, received_amount: invoice.receivedAmount,
      balance: invoice.balance, status: invoice.status, gl_tx_id: invoice.glTxId,
      payments: invoice.payments, items: invoice.items,
      service_charges: invoice.serviceCharges, project_name: invoice.projectName,
      discount_amount: invoice.discountAmount, gst_percent: invoice.gstPercent,
      gst_amount: invoice.gstAmount,
      data: { wastageApplied: invoice.wastageApplied, subtotal: invoice.subtotal },
    },
    main_ledger_row: ledgerToRow(glTx),
    cogs_ledger_row: cogsPlan && cogsPlan.ledgerTx
      ? ledgerToRow(cogsPlan.ledgerTx as LedgerTransaction)
      : null,
    mirror_ledger_row: mirrorTx ? ledgerToRow(mirrorTx) : null,
    quotation_patch: quotationPatch,
  };

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'post_invoice_atomic',
    { p_payload: rpcPayload }
  );

  if (rpcError) {
    // Atomic transaction failed — nothing was written to the cloud.
    // Surface the specific error so caller can act (already-exists →
    // user re-pulls; imbalance → fix the calc; etc).
    throw new Error(
      `Atomic invoice post failed: ${rpcError.message || 'unknown'}. ` +
      `No GL entry, no invoice, no quotation update — books unchanged. Retry safely.`
    );
  }

  // ── Mirror writes to localStorage so synchronous reads agree ─────
  // The RPC committed everything to Supabase. Writing to localStorage
  // here does NOT trigger a duplicate cloud upsert — we use safeSave
  // directly instead of the service-layer save functions which queue a
  // sync push.
  try {
    const localInvoices = safeParse(LS_INVOICES) as any[];
    safeSave(LS_INVOICES, [...localInvoices.filter((i: any) => i.id !== invoice.id), invoice]);

    const localLedger = safeParse(LS_LEDGER) as any[];
    const newLedgerEntries: any[] = [{ ...glTx }];
    if (cogsPlan && cogsPlan.ledgerTx) newLedgerEntries.push({ ...cogsPlan.ledgerTx });
    if (mirrorTx) newLedgerEntries.push({ ...mirrorTx });
    const ledgerWithoutNew = localLedger.filter(
      (t: any) => !newLedgerEntries.some(n => n.id === t.id)
    );
    safeSave(LS_LEDGER, [...ledgerWithoutNew, ...newLedgerEntries]);

    if (quotationFullUpdated) {
      const localQuotes = safeParse(LS_QUOTATIONS) as any[];
      safeSave(LS_QUOTATIONS, [
        ...localQuotes.filter((q: any) => q.id !== quotationFullUpdated.id),
        quotationFullUpdated,
      ]);
    }

    if (cogsPlan && !cogsPlan.alreadyPosted && cogsPlan.storeUpdates.length > 0) {
      applyDeliveryCOGSStoreUpdates(company, cogsPlan.storeUpdates, today);
    }
  } catch (e) {
    console.warn('[generateDeliveryInvoice] cloud committed but local mirror failed:', e);
    // Non-fatal — next sync pull from Supabase will reconcile.
  }

  // ── Financial Event Registry (non-atomic, audit-only) ────────────
  try {
    FinanceService.saveFinancialEvents([
      ...FinanceService.getFinancialEvents(),
      {
        id: 'EVT-' + invoiceId, company, date: today,
        sourceModule: 'Sales',
        description: 'Invoice ' + invoiceId + ' — ' + clientName + ' — PKR ' + grandTotal.toLocaleString('en-PK'),
        amount: grandTotal, referenceId: invoiceId, status: 'Posted',
      },
    ]);
  } catch { /* event log is best-effort, never blocks an invoice */ }

  return { invoiceId, finalAmount, gstAmount, grandTotal, alreadyInvoiced: false, clientName };
}

// Sprint 1: legacy postDeliveryCOGS path is still imported for any direct
// callers that have not been migrated to the atomic flow. Re-export for
// backward compatibility.
export { postDeliveryCOGS };
