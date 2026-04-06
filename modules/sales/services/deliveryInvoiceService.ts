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

interface InvoiceResult {
  invoiceId: string;
  finalAmount: number;
  gstAmount: number;
  grandTotal: number;
  alreadyInvoiced: boolean;
  clientName: string;
}

// ── Sequential invoice number ─────────────────────────────────────────
const getNextInvoiceNumber = (company: Company): string => {
  const year = new Date().getFullYear();
  const key = `gtk_erp_inv_seq_${company}_${year}`;
  const current = parseInt(localStorage.getItem(key) || '0', 10);
  const next = current + 1;
  localStorage.setItem(key, String(next));
  const prefix = company.substring(0, 3).toUpperCase();
  return `INV-${prefix}-${year}-${String(next).padStart(4, '0')}`;
};

export function generateDeliveryInvoice(
  order: Quotation,
  company: Company,
  gstPercent: number = 0
): InvoiceResult {
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

  const totalRevenue = (order.items || []).reduce(
    (s: number, i: any) => s + (i.amount || 0), 0
  );
  const serviceCharges = (order.serviceCharges || []).reduce(
    (s: number, sc: any) => s + (sc.amount || 0), 0
  );
  const subtotal = totalRevenue + serviceCharges;
  const discount = order.discountAmount ||
    (subtotal * ((order.discountPercent || 0) / 100));
  const finalAmount = subtotal - discount;
  const gstAmount = gstPercent > 0 ? Math.round(finalAmount * (gstPercent / 100)) : 0;
  const grandTotal = finalAmount + gstAmount;

  // ── Credit Limit Check ────────────────────────────────────────────
  if (client) {
    const creditLimit = (client as any).creditLimit || 0;
    if (creditLimit > 0) {
      const outstanding = SalesService.getInvoices()
        .filter((i: any) => i.clientId === order.clientId && i.status !== 'Paid')
        .reduce((s: number, i: any) => s + (i.balance || 0), 0);
      if (outstanding + grandTotal > creditLimit) {
        console.warn('[CreditLimit] ' + clientName + ': outstanding ' + outstanding + ' + new ' + grandTotal + ' > limit ' + creditLimit);
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

  // ── Invoice ID (sequential) ───────────────────────────────────────
  const invoiceId = getNextInvoiceNumber(company);
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
  };
  try {
    FinanceService.saveLedger([...FinanceService.getLedger(), glTx]);
  } catch (e: any) {
    console.error('[Invoice GL] GL posting failed:', e.message);
    toast.error(`Invoice GL failed for ${invoiceId}: ${e.message}. Invoice created but GL entry missing — check Finance.`, { duration: 10000 });
  }

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
      FinanceService.saveLedger([...FinanceService.getLedger(), {
        id: 'BILL-' + txId, company: targetCompany, docType: 'KR',
        docDate: today, date: today,
        description: 'AUTO-PURCHASE: From ' + company + ' — ' + invoiceId,
        referenceId: txId, status: 'Posted',
        details: [
          { accountId: costAcc.id,    debit: grandTotal, credit: 0,           text: 'Service from ' + company },
          { accountId: payableAcc.id, debit: 0,           credit: grandTotal, text: 'Payable to ' + company },
        ],
      } as LedgerTransaction]);
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
    items: order.items || [],
    serviceCharges: order.serviceCharges || [],
    discountAmount: discount,
  };
  SalesService.saveInvoices([...SalesService.getInvoices(), invoice]);

  // ── Update Quotation status → Invoiced ───────────────────────────
  SalesService.saveQuotations(
    SalesService.getQuotations().map((q: Quotation) =>
      q.id === order.id
        ? { ...q, status: 'Invoiced' as any, invoiceNo: invoiceId }
        : q
    )
  );

  return { invoiceId, finalAmount, gstAmount, grandTotal, alreadyInvoiced: false, clientName };
}
