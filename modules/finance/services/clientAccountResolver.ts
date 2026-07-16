/**
 * clientAccountResolver — ONE source of truth for the customer-side control
 * accounts (Accounts Receivable + Client Advance / contract liability).
 *
 * Why this exists (EPIC 4): the invoice DEBITS AR and the receipt CREDITS AR.
 * If the two resolve the account differently, AR never nets to zero and the
 * subledger silently drifts. Previously the AR chain was inlined in THREE
 * places — deliveryInvoiceService (debit), SalesOrders receipt (credit) and
 * BillingHub receipt (credit) — and the trading (Nippon) branch had only been
 * fixed in the invoice, so a Nippon receipt credited the phantom 12210 while
 * the invoice debited the real 11213. Routing every caller through this
 * resolver makes that drift impossible by construction.
 *
 * Trading (Nippon) posts to the REAL seeded trading COA (coa.nippon.ts),
 * routed by customer type:
 *   AR       1/11/112/1121/{11211 GTK · 11212 GTI · 11213 External}
 *   Advance  2/21/211/2112/{21121 GTK · 21122 GTI · 21123 External}
 * Non-trading (glass — GTK/GTI/Glassco) keeps its existing generic chain
 * (AR 12210 under CUSTOMERS CONTROL, Advance 2230) EXACTLY as before —
 * ensureAccount matches by (company, code), so the same code = the same account
 * regardless of the leaf name, which is why the glass path already nets today.
 */

import { FinanceService } from '@/modules/finance/services/financeService';
import { Account } from '@/modules/shared/types';
import type { Company } from '@/modules/shared/types';

/** Trading companies use the hardware trading COA, not the glass-services COA. */
const isTradingCompany = (company: string): boolean => company === 'Nippon';

/** Route a trading customer to its control sub-account by name marker. */
type NipCust = 'GTK' | 'GTI' | 'EXT';
const nipCustType = (clientName: string): NipCust => {
  const u = (clientName || '').toUpperCase();
  return u.includes('GTK') ? 'GTK' : u.includes('GTI') ? 'GTI' : 'EXT';
};

/**
 * The client's Accounts Receivable leaf. Invoice debits it; receipt credits it.
 * `projectName` only affects the non-trading leaf NAME (cosmetic — the account
 * is matched by code 12210); trading ignores it (one control leaf per customer
 * type, subledger is at the invoice level).
 */
export function resolveClientARAccount(
  company: Company,
  clientName: string,
  projectName?: string,
): Account {
  if (isTradingCompany(company)) {
    const t = nipCustType(clientName);
    const leaf = t === 'GTK' ? { code: '11211', name: 'Receivable — GTK (Hardware)' }
               : t === 'GTI' ? { code: '11212', name: 'Receivable — GTI (Hardware)' }
               :               { code: '11213', name: 'Receivable — External Wholesale' };
    const a1 = FinanceService.ensureAccount(company, 'Assets',              1, null,   'Asset', '1');
    const a2 = FinanceService.ensureAccount(company, 'Current Assets',      2, a1.id,  'Asset', '11');
    const a3 = FinanceService.ensureAccount(company, 'Trade Receivables',   3, a2.id,  'Asset', '112');
    const a4 = FinanceService.ensureAccount(company, 'Accounts Receivable', 4, a3.id,  'Asset', '1121');
    return     FinanceService.ensureAccount(company, leaf.name,             5, a4.id,  'Asset', leaf.code);
  }
  // Non-trading (glass) — preserve the existing generic chain EXACTLY.
  const p1 = FinanceService.ensureAccount(company, 'ASSETS',            1, null,   'Asset', '10');
  const p2 = FinanceService.ensureAccount(company, 'CURRENT ASSETS',    2, p1.id,  'Asset', '11');
  const p3 = FinanceService.ensureAccount(company, 'TRADE RECEIVABLES', 3, p2.id,  'Asset', '122');
  const p4 = FinanceService.ensureAccount(company, 'CUSTOMERS CONTROL', 4, p3.id,  'Asset', '1221');
  const leafName = clientName.toUpperCase() + (projectName ? ' — ' + projectName.toUpperCase() : '');
  return     FinanceService.ensureAccount(company, leafName,            5, p4.id,  'Asset', '12210');
}

/**
 * The client's advance / contract-liability leaf (IFRS 15: cash received before
 * control transfers is a contract liability, not revenue). An advance receipt
 * credits it; applying the advance at delivery debits it.
 */
export function resolveClientAdvanceAccount(
  company: Company,
  clientName: string,
): Account {
  if (isTradingCompany(company)) {
    const t = nipCustType(clientName);
    const leaf = t === 'GTK' ? { code: '21121', name: 'Client Advance — GTK' }
               : t === 'GTI' ? { code: '21122', name: 'Client Advance — GTI' }
               :               { code: '21123', name: 'Client Advance — External' };
    const l1 = FinanceService.ensureAccount(company, 'Liabilities',         1, null,   'Liability', '2');
    const l2 = FinanceService.ensureAccount(company, 'Current Liabilities', 2, l1.id,  'Liability', '21');
    const l3 = FinanceService.ensureAccount(company, 'Trade Payables',      3, l2.id,  'Liability', '211');
    const l4 = FinanceService.ensureAccount(company, 'Advances & Accruals', 4, l3.id,  'Liability', '2112');
    return     FinanceService.ensureAccount(company, leaf.name,             5, l4.id,  'Liability', leaf.code);
  }
  // Non-trading (glass) — preserve the existing generic advance chain EXACTLY.
  const q1 = FinanceService.ensureAccount(company, 'LIABILITIES',         1, null,   'Liability', '20');
  const q2 = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES', 2, q1.id,  'Liability', '22');
  const q3 = FinanceService.ensureAccount(company, 'CUSTOMER ADVANCES',   3, q2.id,  'Liability', '223');
  return     FinanceService.ensureAccount(company, `${clientName.toUpperCase()} — ADVANCE`, 4, q3.id, 'Liability', '2230');
}

/**
 * The cash/bank leaf a receipt DEBITS, by payment method. Same drift risk as AR:
 * the receipt cash leg was inlined in SalesOrders + BillingHub building the glass
 * chain (10→111→{code}0), which for Nippon created ORPHAN accounts (11110…) that
 * don't exist in the seeded trading chart — so a Nippon receipt debited off-
 * balance-sheet cash and the trial balance split (P0-2). Trading now posts to the
 * REAL seeded cash/bank leaves; glass keeps its exact existing chain.
 */
export function resolveCashAccount(company: Company, method: string): Account {
  if (isTradingCompany(company)) {
    // Nippon seeded Cash & Bank: Cash in Hand 11112, MCB Bank 11121 (coa.nippon).
    const isCash = method === 'Cash';
    const leaf = isCash
      ? { code: '11112', name: 'Cash in Hand',       pCode: '1111', pName: 'Cash' }
      : { code: '11121', name: 'Bank — MCB Current', pCode: '1112', pName: 'Bank' };
    const a1 = FinanceService.ensureAccount(company, 'Assets',         1, null,  'Asset', '1');
    const a2 = FinanceService.ensureAccount(company, 'Current Assets', 2, a1.id, 'Asset', '11');
    const a3 = FinanceService.ensureAccount(company, 'Cash & Bank',    3, a2.id, 'Asset', '111');
    const a4 = FinanceService.ensureAccount(company, leaf.pName,       4, a3.id, 'Asset', leaf.pCode);
    return     FinanceService.ensureAccount(company, leaf.name,        5, a4.id, 'Asset', leaf.code);
  }
  // Non-trading (glass) — preserve the existing generic cash chain EXACTLY.
  const MAP: Record<string, { code: string; name: string }> = {
    'Cash':          { code: '1111', name: 'CASH IN HAND' },
    'Bank Transfer': { code: '1112', name: 'CASH AT BANK' },
    'Cheque':        { code: '1112', name: 'CASH AT BANK' },
    'Online':        { code: '1113', name: 'ONLINE COLLECTIONS' },
  };
  const m = MAP[method] || MAP['Cash'];
  const p1 = FinanceService.ensureAccount(company, 'ASSETS',         1, null,   'Asset', '10');
  const p2 = FinanceService.ensureAccount(company, 'CURRENT ASSETS', 2, p1.id,  'Asset', '11');
  const p3 = FinanceService.ensureAccount(company, 'CASH & BANK',    3, p2.id,  'Asset', '111');
  const p4 = FinanceService.ensureAccount(company, m.name,           4, p3.id,  'Asset', m.code);
  return     FinanceService.ensureAccount(company, `${m.name} — MAIN`, 5, p4.id, 'Asset', `${m.code}0`);
}
