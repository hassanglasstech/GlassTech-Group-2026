/**
 * deliveryInvoiceService.ts — Phase 3
 *
 * Changes:
 *  - GST support: gstPercent param → separate GST GL line + GST Payable account
 *  - GL status → Posted directly (no more Parked for invoice entries)
 *  - Sequential invoice numbering via localStorage counter
 */

import { toast } from 'sonner';
import { Company, Quotation, LedgerTransaction, Invoice } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import { SalesService } from '@/modules/sales/services/salesService';
import { postDeliveryCOGS } from '@/modules/procurement/services/glasscoGLService';
import { ProductionService } from '@/modules/production/services/productionService';
import { allocateSerial } from '@/modules/sales/services/serialAllocator';

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

  // Phase-7 (B1): pre-assert balance + abort invoice creation on imbalance.
  // Previous flow swallowed the assertion error and persisted the invoice
  // record anyway — books were left missing the AR/Revenue entry while the
  // invoice itself appeared valid in the UI. Now the throw aborts the whole
  // operation so the user can fix and retry, leaving books consistent.
  FinanceService.assertGLBalance(glTx);
  FinanceService.recordTransaction(glTx);

  // ── Financial Event Registry ──────────────────────────────────────
  FinanceService.saveFinancialEvents([
    ...FinanceService.getFinancialEvents(),
    {
      id: 'EVT-' + invoiceId, company, date: today,
      sourceModule: 'Sales',
      description: 'Invoice ' + invoiceId + ' — ' + clientName + ' — PKR ' + grandTotal.toLocaleString('en-PK'),
      amount: grandTotal, referenceId: invoiceId, status: 'Posted',
    },
  ]);

  // ── Inter-company mirror ──────────────────────────────────────────
  const cNameUpper = clientName.toUpperCase();
  const MIRROR_MAP: Record<string, Company> = {
    GTI: 'GTI', GTK: 'GTK', NIPPON: 'Nippon', GLASSCO: 'Glassco', FACTORY: 'Factory',
  };
  const targetCompany =
    Object.entries(MIRROR_MAP).find(([key]) => cNameUpper.includes(key))?.[1] ?? null;

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
      // Phase-7 (B1): system-auto + recordTransaction (pre-asserts balance).
      const mirrorTx = {
        id: 'BILL-' + txId, company: targetCompany, docType: 'KR',
        docDate: today, date: today,
        description: 'AUTO-PURCHASE: From ' + company + ' — ' + invoiceId,
        referenceId: txId, status: 'Posted',
        createdBy: 'system-auto',
        details: [
          { accountId: costAcc.id,    debit: grandTotal, credit: 0,           text: 'Service from ' + company },
          { accountId: payableAcc.id, debit: 0,           credit: grandTotal, text: 'Payable to ' + company },
        ],
      } as LedgerTransaction;
      FinanceService.assertGLBalance(mirrorTx);
      FinanceService.recordTransaction(mirrorTx);
    }
  }

  // ── Create Invoice record ─────────────────────────────────────────
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
  SalesService.saveInvoices([...SalesService.getInvoices(), invoice]);

  // ── Update Quotation status → Invoiced ───────────────────────────
  // Phase-3 (3.10): when wastage was applied, push the adjusted items
  // (with the higher rate / amount) back to the quotation so the printed
  // quotation matches the invoice. Audit I11: previously the rate
  // increment lived only on the invoice — customer reconciliation gap.
  // Phase-2 (2.6): per-row save instead of read-modify-write-all.
  const orderRow = SalesService.getQuotations().find((q: Quotation) => q.id === order.id);
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
    SalesService.saveQuotations([updated]);
  }

  // ── COGS GL — raw glass + service labor ──────────────────────────
  try {
    const pieceIds = ProductionService.getProductionPieces()
      .filter((p: any) => p.orderId === order.id || p.orderId === order.orderNo)
      .map((p: any) => p.id);

    if (pieceIds.length > 0) {
      postDeliveryCOGS({
        company,
        invoiceId,
        orderId: order.orderNo || order.id,
        pieceIds,
        date: today,
        clientName,
      });
    } else {
      // No production pieces linked — GP will be overstated until COGS posted.
      toast.warning(
        `Invoice ${invoiceId}: No production pieces found. COGS skipped — Gross Profit will look inflated. Link production pieces to post COGS.`,
        { duration: 8000 }
      );
      console.warn('[Invoice COGS] Skipped — no production pieces for order', order.id);
    }
  } catch (e: any) {
    console.warn('[Invoice] COGS GL skipped:', e?.message);
    toast.error(`COGS posting failed for ${invoiceId}: ${e?.message || 'unknown error'}`);
  }

  return { invoiceId, finalAmount, gstAmount, grandTotal, alreadyInvoiced: false, clientName };
}
