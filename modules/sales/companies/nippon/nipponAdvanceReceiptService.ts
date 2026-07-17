/**
 * nipponAdvanceReceiptService — the owner records a customer payment RECEIVED
 * against an order (advance / prepayment).
 *
 * IFRS 15 §106 / IAS 37: money received before delivery is a CONTRACT LIABILITY,
 * not revenue and not a reduction of receivables (there is no invoice yet). So the
 * receipt posts:
 *      Dr  Cash / Bank            (11112 / 11121, by method)
 *      Cr  Client Advance         (21123 External · 21121 GTK · 21122 GTI)
 * and the advance is applied against AR later, at delivery — which the existing
 * `buildAdvanceApplicationTx` in deliveryInvoiceService already does using the
 * order's `receivedAmount`. This service therefore also bumps `receivedAmount` so
 * that netting happens automatically at goods-issue.
 *
 * GL is posted ONLY when finance.gl_enabled is on for the company; until then the
 * receipt is a cash/control record (sequential no + order link) with no ledger.
 * The receipt number is atomic + gapless (allocate_serial). Receipts are
 * append-only on the order — a correction is a reversal, never an edit/delete.
 */

import { Company, Quotation, LedgerTransaction } from '@/modules/shared/types';
import { NipponAdvanceReceipt } from '@/modules/production/types/production';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { resolveCashAccount, resolveClientAdvanceAccount } from '@/modules/finance/services/clientAccountResolver';
import { allocateSerial } from '@/modules/sales/services/serialAllocator';
import { isFinanceGLEnabled } from '@/modules/shared/services/featureFlagService';
import { Logger } from '@/modules/shared/services/logger';

export interface RecordAdvanceReceiptParams {
  order: Quotation;
  company: Company;
  clientName: string;
  amount: number;
  method: NipponAdvanceReceipt['method'];
  reference?: string;
  by: string;                 // the owner posting it
}

export interface RecordAdvanceReceiptResult {
  receipt: NipponAdvanceReceipt;
  order: Quotation;           // the updated order (receivedAmount, paymentConfirmed, receipts)
  glPosted: boolean;
}

const buildReceiptNo = (seq: number): string => {
  const year = new Date().getFullYear();
  return `RCPT-NIP-${year}-${String(seq).padStart(4, '0')}`;
};

export async function recordAdvanceReceipt(
  params: RecordAdvanceReceiptParams,
): Promise<{ data?: RecordAdvanceReceiptResult; error?: string }> {
  const { order, company, clientName, method, reference, by } = params;
  const amount = Math.round(Number(params.amount) || 0);   // whole PKR (Finding 10)

  if (!order?.id) return { error: 'Order is missing.' };
  if (amount <= 0) return { error: 'Receipt amount must be greater than zero.' };

  try {
    // Sequential, gapless, atomic receipt number.
    const seq = await allocateSerial(company, 'RCPT', new Date().getFullYear(), 1);
    const receiptNo = buildReceiptNo(seq);
    const dateIso = new Date().toISOString();

    // ── GL (books mode only): Dr Cash/Bank · Cr Client Advance (contract liability).
    let glTxId: string | undefined;
    let glPosted = false;
    if (isFinanceGLEnabled(company)) {
      const cashAcc = resolveCashAccount(company, method);
      const advAcc = resolveClientAdvanceAccount(company, clientName);
      glTxId = `GL-RCPT-${receiptNo}`;
      const tx: LedgerTransaction = {
        id: glTxId, company, docType: 'DR',
        docDate: dateIso.slice(0, 10), date: dateIso.slice(0, 10),
        description: `Advance receipt ${receiptNo} — ${clientName} — PKR ${amount.toLocaleString('en-PK')} (${method})`,
        referenceId: receiptNo, status: 'Posted', reqId: order.id,
        createdBy: 'system-auto',
        details: [
          { accountId: cashAcc.id, debit: amount, credit: 0, text: `${method} received — ${clientName}${reference ? ' · ' + reference : ''}` },
          { accountId: advAcc.id, debit: 0, credit: amount, text: `Advance from ${clientName} (contract liability, IFRS 15)` },
        ],
      } as unknown as LedgerTransaction;
      FinanceService.assertGLBalance(tx);
      FinanceService.saveLedger([...FinanceService.getLedger(), tx]);
      glPosted = true;
    }

    const receipt: NipponAdvanceReceipt = { receiptNo, amount, method, reference: reference?.trim() || undefined, date: dateIso, by, glTxId };

    // Update the order: append the receipt, bump the advance held (`receivedAmount`
    // — the same field the delivery invoice nets against), and confirm payment so
    // the owner-approval gate is unblocked.
    const priorReceipts = (order.advanceReceipts || []);
    const updated: Quotation = {
      ...order,
      advanceReceipts: [...priorReceipts, receipt],
      receivedAmount: (Number(order.receivedAmount) || 0) + amount,
      paymentConfirmed: true,
      paymentConfirmedAt: dateIso,
      paymentConfirmedBy: by,
    };
    const res = await AsyncSalesService.saveQuotations([updated]);
    if (res?.error) {
      // The order didn't persist — if we already posted GL, flag it loudly so it
      // can be reconciled (the ledger entry stands; the order link is what failed).
      Logger.error('NipponAdvanceReceipt', 'order save failed after receipt', new Error(res.error));
      return { error: `Receipt not saved — ${res.error}` };
    }

    Logger.action('SALES', 'NIPPON_ADVANCE_RECEIPT',
      `${receiptNo} — ${clientName} — PKR ${amount} (${method}) on ${order.orderNo || order.id}`,
      { referenceId: receiptNo, amount, extra: { company, glPosted } });

    return { data: { receipt, order: updated, glPosted } };
  } catch (err) {
    Logger.error('NipponAdvanceReceipt', 'recordAdvanceReceipt failed', err);
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Reverse / refund a posted advance receipt. Receipts are immutable, so a mistake
 * or a cancelled order is corrected with a REVERSAL (never an edit/delete):
 *      Dr  Client Advance      (unwinds the liability)
 *      Cr  Cash / Bank         (money paid back / never really received)
 * A negative-amount reversal row is appended and the advance held (receivedAmount)
 * is reduced. If nothing is left held, paymentConfirmed is cleared.
 */
export async function reverseAdvanceReceipt(params: {
  order: Quotation; company: Company; clientName: string;
  receipt: NipponAdvanceReceipt; by: string; reason?: string;
}): Promise<{ data?: { order: Quotation; glPosted: boolean }; error?: string }> {
  const { order, company, clientName, receipt, by, reason } = params;
  if (!order?.id) return { error: 'Order is missing.' };
  if (!receipt || receipt.amount <= 0) return { error: 'Only a positive receipt can be reversed.' };

  const alreadyReversed = (order.advanceReceipts || []).some(
    r => (r.reference || '').startsWith(`Reversal of ${receipt.receiptNo}`),
  );
  if (alreadyReversed) return { error: 'This receipt has already been reversed.' };

  try {
    const seq = await allocateSerial(company, 'RCPT', new Date().getFullYear(), 1);
    const revNo = buildReceiptNo(seq);
    const dateIso = new Date().toISOString();

    let glTxId: string | undefined;
    let glPosted = false;
    if (isFinanceGLEnabled(company)) {
      const cashAcc = resolveCashAccount(company, receipt.method);
      const advAcc = resolveClientAdvanceAccount(company, clientName);
      glTxId = `GL-RCPTREV-${revNo}`;
      const tx: LedgerTransaction = {
        id: glTxId, company, docType: 'KR',
        docDate: dateIso.slice(0, 10), date: dateIso.slice(0, 10),
        description: `Advance reversal ${revNo} of ${receipt.receiptNo} — ${clientName} — PKR ${receipt.amount.toLocaleString('en-PK')}${reason ? ' · ' + reason : ''}`,
        referenceId: revNo, status: 'Posted', reqId: order.id, createdBy: 'system-auto',
        details: [
          { accountId: advAcc.id, debit: receipt.amount, credit: 0, text: `Advance reversed — ${clientName}` },
          { accountId: cashAcc.id, debit: 0, credit: receipt.amount, text: `Refund via ${receipt.method}${reason ? ' · ' + reason : ''}` },
        ],
      } as unknown as LedgerTransaction;
      FinanceService.assertGLBalance(tx);
      FinanceService.saveLedger([...FinanceService.getLedger(), tx]);
      glPosted = true;
    }

    const reversal: NipponAdvanceReceipt = {
      receiptNo: revNo, amount: -receipt.amount, method: receipt.method,
      reference: `Reversal of ${receipt.receiptNo}${reason ? ' · ' + reason : ''}`,
      date: dateIso, by, glTxId,
    };
    const newReceived = Math.max(0, (Number(order.receivedAmount) || 0) - receipt.amount);
    const updated: Quotation = {
      ...order,
      advanceReceipts: [...(order.advanceReceipts || []), reversal],
      receivedAmount: newReceived,
      paymentConfirmed: newReceived > 0 ? order.paymentConfirmed : false,
    };
    const res = await AsyncSalesService.saveQuotations([updated]);
    if (res?.error) return { error: `Reversal not saved — ${res.error}` };

    Logger.action('SALES', 'NIPPON_ADVANCE_REVERSED',
      `${revNo} reverses ${receipt.receiptNo} — ${clientName} — PKR ${receipt.amount}`,
      { referenceId: revNo, amount: receipt.amount, extra: { company, glPosted } });

    return { data: { order: updated, glPosted } };
  } catch (err) {
    Logger.error('NipponAdvanceReceipt', 'reverseAdvanceReceipt failed', err);
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
