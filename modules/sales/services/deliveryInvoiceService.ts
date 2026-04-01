/**
 * deliveryInvoiceService.ts
 *
 * Shared logic: generate invoice from a delivered order.
 * Called from both:
 *  - ProductionContext.executeDirectDelivery (auto-trigger on delivery)
 *  - BillingHub.handleGenerateInvoice (manual Finance entry)
 *
 * Returns { invoiceId, finalAmount, alreadyInvoiced }
 */

import { Company, Quotation, LedgerTransaction, Invoice } from '@/modules/shared/types';
import { FinanceService } from '@/modules/finance/services/financeService';
import { SalesService } from '@/modules/sales/services/salesService';

interface InvoiceResult {
  invoiceId: string;
  finalAmount: number;
  alreadyInvoiced: boolean;
  clientName: string;
}

export function generateDeliveryInvoice(
  order: Quotation,
  company: Company
): InvoiceResult {
  // ── Guard: already invoiced? ──────────────────────────────────────
  const existing = SalesService.getInvoices().find(
    (i: Invoice) => i.orderId === order.id
  );
  if (existing) {
    return {
      invoiceId: existing.id,
      finalAmount: existing.totalAmount,
      alreadyInvoiced: true,
      clientName: existing.clientName,
    };
  }

  // ── Calculate amount ──────────────────────────────────────────────
  const clients = SalesService.getClients();
  const client = clients.find((c: any) => c.id === order.clientId);
  const clientName = client?.name || order.clientId || 'Walk-in';

  const totalRevenue = (order.items || []).reduce(
    (s: number, i: any) => s + (i.amount || 0),
    0
  );
  const serviceCharges = (order.serviceCharges || []).reduce(
    (s: number, sc: any) => s + (sc.amount || 0),
    0
  );
  const subtotal = totalRevenue + serviceCharges;
  const discount =
    order.discountAmount ||
    (subtotal * ((order.discountPercent || 0) / 100));
  const finalAmount = subtotal - discount;

  // ── Credit Limit Check ──────────────────────────────────────────────
  if (client) {
    const creditLimit = (client as any).creditLimit || 0;
    if (creditLimit > 0) {
      const outstanding = SalesService.getInvoices()
        .filter((i: any) => i.clientId === order.clientId && i.status !== 'Paid')
        .reduce((s: number, i: any) => s + (i.balance || 0), 0);
      if (outstanding + finalAmount > creditLimit) {
        console.warn(`[CreditLimit] ${clientName}: PKR ${outstanding.toLocaleString()} outstanding + PKR ${finalAmount.toLocaleString()} new invoice exceeds limit PKR ${creditLimit.toLocaleString()}`);
        // Flag on invoice — non-blocking (Finance can override)
        // To make hard block: throw new Error(\`Credit limit exceeded for \${clientName}\`)
      }
    }
  }

  // ── JIT Account Creation ──────────────────────────────────────────
  const arParent  = FinanceService.ensureAccount(company, 'ASSETS',            1, null,        'Asset',   '10');
  const arCurrent = FinanceService.ensureAccount(company, 'CURRENT ASSETS',    2, arParent.id, 'Asset',   '11');
  const arTrade   = FinanceService.ensureAccount(company, 'TRADE RECEIVABLES', 3, arCurrent.id,'Asset',   '122');
  const arControl = FinanceService.ensureAccount(company, 'CUSTOMERS CONTROL', 4, arTrade.id,  'Asset',   '1221');
  const clientAR  = FinanceService.ensureAccount(
    company,
    `${clientName.toUpperCase()}${order.projectName ? ' — ' + order.projectName.toUpperCase() : ''}`,
    5, arControl.id, 'Asset', '12210'
  );

  const revParent  = FinanceService.ensureAccount(company, 'REVENUE',                   1, null,          'Revenue', '40');
  const revSales   = FinanceService.ensureAccount(company, 'SALES REVENUE',             2, revParent.id,  'Revenue', '41');
  const revService = FinanceService.ensureAccount(company, 'SERVICE REVENUE',           3, revSales.id,   'Revenue', '411');
  const revGlass   = FinanceService.ensureAccount(company, 'GLASS PROCESSING SERVICES', 4, revService.id, 'Revenue', '4111');
  const revenueAcc = FinanceService.ensureAccount(company, 'SERVICE INCOME',            5, revGlass.id,   'Revenue', '41110');

  // ── IDs ───────────────────────────────────────────────────────────
  const invoiceId = `INV-${company.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
  const txId      = `GL-${invoiceId}`;
  const today     = new Date().toISOString().split('T')[0];

  // ── GL Entry (Parked — Finance reviews then posts) ────────────────
  const glTx: LedgerTransaction = {
    id: txId, company, docType: 'DR',
    docDate: today, date: today,
    description: `[PARKED] INVOICE ${invoiceId}: ${clientName} — ${order.orderNo || order.id}`,
    referenceId: invoiceId, status: 'Parked',
    reqId: order.id,
    details: [
      {
        accountId: clientAR.id, debit: finalAmount, credit: 0,
        text: `AR: ${clientName}${order.projectName ? ' | ' + order.projectName : ''}`,
      },
      {
        accountId: revenueAcc.id, debit: 0, credit: finalAmount,
        text: `Service Revenue: ${order.projectName || order.orderNo || 'General'}`,
      },
    ],
  };
  FinanceService.saveLedger([...FinanceService.getLedger(), glTx]);

  // ── Financial Event Registry ──────────────────────────────────────
  const events = FinanceService.getFinancialEvents();
  FinanceService.saveFinancialEvents([
    ...events,
    {
      id: `EVT-${invoiceId}`, company, date: today,
      sourceModule: 'Sales',
      description: `Invoice ${invoiceId} — ${clientName} — PKR ${finalAmount.toLocaleString('en-PK')}`,
      amount: finalAmount, referenceId: invoiceId, status: 'Pending',
    },
  ]);

  // ── Inter-company mirror (GTK/GTI clients) ────────────────────────
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
      (a: any) =>
        a.name.includes('CONSUMED') ||
        a.name.includes('MATERIAL') ||
        (a.code || '').startsWith('511')
    ) || targetAccounts.find((a: any) => a.type === 'Expense');
    const payableAcc = targetAccounts.find(
      (a: any) =>
        a.name.includes('PAYABLE') ||
        (a.code || '').startsWith('221')
    ) || targetAccounts.find((a: any) => a.type === 'Liability');

    if (costAcc && payableAcc) {
      const mirrorTx: LedgerTransaction = {
        id: `BILL-${txId}`, company: targetCompany, docType: 'KR',
        docDate: today, date: today,
        description: `AUTO-PURCHASE: From ${company} — ${invoiceId}`,
        referenceId: txId, status: 'Parked',
        details: [
          { accountId: costAcc.id,    debit: finalAmount, credit: 0,           text: `Service from ${company}` },
          { accountId: payableAcc.id, debit: 0,           credit: finalAmount, text: `Payable to ${company}` },
        ],
      };
      FinanceService.saveLedger([...FinanceService.getLedger(), mirrorTx]);
    }
  }

  // ── Create Invoice record ─────────────────────────────────────────
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const invoice: Invoice = {
    id: invoiceId, company,
    orderId: order.id, orderNo: order.orderNo || order.id,
    clientId: order.clientId, clientName,
    date: today, dueDate: dueDate.toISOString().split('T')[0],
    totalAmount: finalAmount, receivedAmount: 0, balance: finalAmount,
    status: 'Outstanding', glTxId: txId, payments: [],
  };
  SalesService.saveInvoices([...SalesService.getInvoices(), invoice]);

  // ── Update Quotation status → Invoiced ───────────────────────────
  const allQuotations = SalesService.getQuotations();
  SalesService.saveQuotations(
    allQuotations.map((q: Quotation) =>
      q.id === order.id
        ? { ...q, status: 'Invoiced' as any, invoiceNo: invoiceId }
        : q
    )
  );

  return { invoiceId, finalAmount, alreadyInvoiced: false, clientName };
}
