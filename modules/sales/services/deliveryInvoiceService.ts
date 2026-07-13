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
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { allocateSerial } from '@/modules/sales/services/serialAllocator';
import { supabase } from '../../../src/services/supabaseClient';
import { safeParse, safeSave } from '@/modules/shared/services/utils';
import { isTaxEnabled } from '@/modules/admin/services/taxSettingsService';
import { isFinanceGLEnabled } from '@/modules/shared/services/featureFlagService';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';

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

// ── (Nippon): trading COGS plan ─────────────────────────────────
// Nippon sells hardware from on-hand inventory. At invoice time:
//   Dr COGS — General Hardware  (sum of qty × moving-avg-price)
//   Cr Hardware Inventory — General Hardware
// Inventory quantity itself was already decremented at SO approval
// (useNipponQuotations.handleSave), so we ONLY post the value entry here
// — no double decrement of stock. If MAP shifted between approval and
// invoice, the value uses MAP-at-invoice, which is the conservative
// IFRS-consistent choice.
interface NipponTradingCOGSPlan {
  ledgerTx: LedgerTransaction | null;
  totalCogs: number;
  alreadyPosted: boolean;
}

// Mirror the Glassco delivery COGS plan shape so cogsPlan can be assigned
// from either builder without downstream branching.
type NipponTradingCOGSPlanCompat = {
  ledgerTx: LedgerTransaction | null;
  storeUpdates: never[];
  totalSqft: 0;
  rawGlassCOGS: number;
  totalCuttingCost: 0;
  totalProcessingCost: 0;
  alreadyPosted: boolean;
};

function buildNipponTradingCOGSPlan(params: {
  company: Company;
  invoiceId: string;
  orderId: string;
  items: Quotation['items'];
  date: string;
  clientName: string;
}): NipponTradingCOGSPlan {
  const { company, invoiceId, orderId, items, date, clientName } = params;
  const txId = `GL-COGS-${invoiceId}`;

  const ledger = FinanceService.getLedger();
  if (ledger.some((t) => t.id === txId)) {
    return { ledgerTx: null, totalCogs: 0, alreadyPosted: true };
  }

  const store = InventoryService.getStore();
  // Resolve the store_item (whose id === product.id, e.g. NIP-KL-CZS133-L55-W)
  // for each quote line. The line may reference the product three ways:
  //   1. productRef   — set on new quotes; holds the real product.id  (preferred)
  //   2. locationCode — legacy quotes held the id here; new quotes hold the modelNo
  //   3. modelNo→id   — map via products master when locationCode is a modelNo
  // Without this chain, store.find(s => s.id === locationCode) silently misses
  // (modelNo ≠ store id) → unitCost 0 → COGS 0 → inventory never relieved. P1.
  const nipponProducts = SalesService.getProducts().filter((p) => p.company === company);
  const idByModelNo = new Map<string, string>();
  nipponProducts.forEach((p) => {
    if (p.modelNo) idByModelNo.set(p.modelNo, p.id);
  });
  const resolveStoreItem = (item: { productRef?: string; locationCode?: string }) => {
    if (item.productRef) {
      const byRef = store.find((s) => s.id === item.productRef);
      if (byRef) return byRef;
    }
    if (item.locationCode) {
      const byCode = store.find((s) => s.id === item.locationCode);
      if (byCode) return byCode;
      const mappedId = idByModelNo.get(item.locationCode);
      if (mappedId) {
        const byModel = store.find((s) => s.id === mappedId);
        if (byModel) return byModel;
      }
    }
    return undefined;
  };

  let totalCogs = 0;
  const unmatched: string[] = [];
  (items || []).forEach((item) => {
    if (item.isSection) return;
    const qty = Number(item.qty) || 0;
    if (qty <= 0) return;
    const si = resolveStoreItem(item);
    if (!si) {
      unmatched.push(item.locationCode || item.productRef || item.description || '?');
      return;
    }
    const unitCost = si.movingAveragePrice || 0;
    totalCogs += qty * unitCost;
  });

  // Surface a loud warning if any line could not be cost-matched — a missing
  // COGS line understates COGS and overstates gross profit. Better the user
  // knows than the books silently drift.
  if (unmatched.length > 0) {
    console.warn(
      `[Nippon COGS] ${unmatched.length} line(s) had no matching stock item — ` +
      `COGS excluded for: ${unmatched.join(', ')}`
    );
    // Surface to the operator (was console-only): these lines book revenue with
    // NO cost, overstating gross profit. They usually mean the product was never
    // received via GRN, or is a set-component line without a stock link.
    toast.warning(
      `${unmatched.length} line(s) posted with NO COGS (no stock match): ${unmatched.slice(0, 3).join(', ')}` +
      `${unmatched.length > 3 ? '…' : ''}. Receive these via Hardware GRN so profit isn't overstated.`,
      { id: 'nippon-cogs-unmatched', duration: 9000 },
    );
  }

  if (totalCogs <= 0) {
    return { ledgerTx: null, totalCogs: 0, alreadyPosted: false };
  }

  const invParent  = FinanceService.ensureAccount(company, 'ASSETS',               1, null,            'Asset',   '10');
  const invCurrent = FinanceService.ensureAccount(company, 'CURRENT ASSETS',       2, invParent.id,    'Asset',   '11');
  const invRoot    = FinanceService.ensureAccount(company, 'INVENTORY',            3, invCurrent.id,   'Asset',   '115');
  const invHw      = FinanceService.ensureAccount(company, 'HARDWARE INVENTORY',   4, invRoot.id,      'Asset',   '1151');
  const invGen     = FinanceService.ensureAccount(company, 'GENERAL HARDWARE — STOCK', 5, invHw.id,    'Asset',   '11514');

  const expParent  = FinanceService.ensureAccount(company, 'EXPENSES',             1, null,            'Expense', '50');
  const cogsRoot   = FinanceService.ensureAccount(company, 'COST OF GOODS SOLD',   2, expParent.id,    'Expense', '51');
  const cogsGroup  = FinanceService.ensureAccount(company, 'COGS',                 3, cogsRoot.id,     'Expense', '511');
  // Post to the COA-defined leaf 51114 (511 → 5111 Purchase Cost → 51114) instead
  // of a phantom 5114 that did not exist in the seeded Nippon chart — keeps COGS on
  // the real "General Hardware — COGS" account so reports reconcile.
  const cogsPurch  = FinanceService.ensureAccount(company, 'Purchase Cost',        4, cogsGroup.id,    'Expense', '5111');
  const cogsGen    = FinanceService.ensureAccount(company, 'GENERAL HARDWARE — COGS', 5, cogsPurch.id, 'Expense', '51114');

  const ledgerTx: LedgerTransaction = {
    id: txId,
    company,
    docType: 'DR',
    docDate: date,
    date,
    description: `COGS @ delivery — ${orderId} → ${clientName}`,
    referenceId: invoiceId,
    status: 'Posted',
    reqId: orderId,
    details: [
      { accountId: cogsGen.id, debit: totalCogs, credit: 0,
        text: `Trading COGS — General Hardware: ${(items || []).filter(i => !i.isSection).length} lines` },
      { accountId: invGen.id, debit: 0, credit: totalCogs,
        text: `Inventory relief — General Hardware → ${clientName}` },
    ],
    createdBy: 'system-auto',
  };

  FinanceService.assertGLBalance(ledgerTx);

  return { ledgerTx, totalCogs, alreadyPosted: false };
}

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

/**
 * IFRS 15 §31 / IAS 1 cut-off: revenue and COGS must be recognized in the
 * period CONTROL transferred to the customer (delivery), not on the
 * invoice-entry clock. Returns a valid YYYY-MM-DD delivery date when available,
 * else today; never future-dates recognition (data-entry guard).
 */
function resolveRecognitionDate(raw: string | undefined, today: string): string {
  const candidate = (raw ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return today;
  return candidate > today ? today : candidate;
}

export async function generateDeliveryInvoice(
  order: Quotation,
  company: Company,
  gstPercent: number = 0,
  deliveryDate?: string
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
  const client = clients.find((c) => c.id === order.clientId);
  const clientName = client?.name || order.clientId || 'Walk-in';

  // ── Apply wastage decision if override/review ─────────────────────
  const wDec: Record<string, unknown> = (order as any).wastageDecision;
  const applyWastage =
    wDec &&
    (wDec.decision === 'review' || wDec.decision === 'override') &&
    Number(wDec.suggestedNewRatePerSqft) > 0;

  const effectiveItems = applyWastage
    ? items.map((i) => {
        if (i.isSection) return i;
        const newRate = Number(wDec.suggestedNewRatePerSqft);
        const currentRate = Number(i.pricePerUnit) || 0;
        if (newRate <= currentRate) return i;
        const sqft = Number(i.totalSqFt) || 0;
        return { ...i, pricePerUnit: newRate, amount: Math.round(sqft * newRate) };
      })
    : items;

  const totalRevenue = effectiveItems.reduce(
    (s: number, i) => s + (Number(i.amount) || 0), 0
  );
  const serviceCharges = serviceChargesArr.reduce(
(s: number, sc) => s + (Number(sc.amount) || 0), 0
  );
  const subtotal = totalRevenue + serviceCharges;
  const discount = order.discountAmount ||
    (subtotal * ((order.discountPercent || 0) / 100));
  const finalAmount = subtotal - discount;
  // GST gate (admin Tax Settings toggle, default OFF): GST only applies when an
  // admin has enabled tax for this company. Until then every invoice is GST-free
  // regardless of any gstPercent passed in — this also keeps the GST GL branch
  // (and its account chain) unreachable, so no tax is ever posted by accident.
  const taxOn = await isTaxEnabled(company);
  const effectiveGstPercent = taxOn ? gstPercent : 0;
  const gstAmount = effectiveGstPercent > 0 ? Math.round(finalAmount * (effectiveGstPercent / 100)) : 0;
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
        .filter((i) => i.clientId === order.clientId && i.status !== 'Paid' && i.status !== 'Voided')
        .reduce((s: number, i) => s + (Number(i.balance) || 0), 0);
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
  //
  // (Nippon go-live): trading companies don't produce anything — they
  // sell from on-hand inventory. The pieces gate must be skipped for them;
  // COGS for trading flows comes from inventory (handled in the trading
  // revenue branch below).
  const isTradingCompany = company === 'Nippon';

  const hasGlassItems = !isTradingCompany && effectiveItems.some(
    (i) => !i.isSection && (Number(i.totalSqFt) || Number(i.sqft) || 0) > 0
  );
  const linkedPieceIds = isTradingCompany
    ? []
    : ProductionService.getProductionPieces()
        .filter((p) => p.orderId === order.id || p.orderId === order.orderNo)
        .map((p) => p.id);

  if (hasGlassItems && linkedPieceIds.length === 0) {
    if (isFinanceGLEnabled(company)) {
      // Books mode: protect the ledger — never post revenue without COGS.
      throw new Error(
        `Invoice generation blocked for "${order.orderNo || order.id}": order has glass items ` +
        `(sqft > 0) but no production pieces are linked. Cutting session must be closed first ` +
        `(it creates the pieces). Otherwise revenue would post without COGS — gross profit ` +
        `would be permanently inflated. Close the cutting session, then retry invoicing.`
      );
    }
    // Single-entry go-live (finance GL off): don't block the sale on missing
    // pieces. The invoice records revenue only (no COGS this invoice). Logged,
    // not silent, so it's visible when books mode is later turned on.
    Logger.warn('DeliveryInvoice',
      `Pieces-gate relaxed (finance GL off): invoicing "${order.orderNo || order.id}" with no linked ` +
      `pieces — revenue posts without COGS. Enable Finance GL to enforce the pieces gate.`);
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

  // (Nippon go-live): trading revenue chain differs from glass services.
  // Nippon sells hardware — revenue must hit "HARDWARE SALES" under SALES
  // REVENUE, not "GLASS PROCESSING SERVICES". Wrong chain = wrong P&L from day 1.
  const revParent  = FinanceService.ensureAccount(company, 'REVENUE',                    1, null,           'Revenue', '40');
  const revSales   = FinanceService.ensureAccount(company, 'SALES REVENUE',              2, revParent.id,   'Revenue', '41');
  let revenueAcc;
  if (isTradingCompany) {
    const revHardware = FinanceService.ensureAccount(company, 'HARDWARE SALES',          3, revSales.id,    'Revenue', '412');
    revenueAcc        = FinanceService.ensureAccount(company, 'HARDWARE SALES INCOME',   4, revHardware.id, 'Revenue', '4120');
  } else {
    const revService = FinanceService.ensureAccount(company, 'SERVICE REVENUE',            3, revSales.id,    'Revenue', '411');
    const revGlass   = FinanceService.ensureAccount(company, 'GLASS PROCESSING SERVICES', 4, revService.id,  'Revenue', '4111');
    revenueAcc       = FinanceService.ensureAccount(company, 'SERVICE INCOME',            5, revGlass.id,    'Revenue', '41110');
  }

  // ── GST Payable account ───────────────────────────────────────────
  let gstPayableAcc: ReturnType<typeof FinanceService.ensureAccount> | null = null;
  if (gstAmount > 0) {
    if (isTradingCompany) {
      // Nippon trading COA: output GST belongs in Sales Tax Payable 21211 under
      // CURRENT LIABILITIES(21) → TAX LIABILITIES(212) → TAX(2121). The old generic
      // 20/22/221/2214 chain landed GST on 2214 = GR/IR Clearing, corrupting the
      // three-way-match clearing account and under-stating tax owed to FBR.
      const liab    = FinanceService.ensureAccount(company, 'Liabilities',         1, null,       'Liability', '2');
      const curLiab = FinanceService.ensureAccount(company, 'Current Liabilities', 2, liab.id,    'Liability', '21');
      const taxLiab = FinanceService.ensureAccount(company, 'Tax Liabilities',     3, curLiab.id, 'Liability', '212');
      const taxGrp  = FinanceService.ensureAccount(company, 'Tax',                 4, taxLiab.id, 'Liability', '2121');
      gstPayableAcc = FinanceService.ensureAccount(company, 'Sales Tax Payable',   5, taxGrp.id,  'Liability', '21211');
    } else {
      const liabParent = FinanceService.ensureAccount(company, 'LIABILITIES',         1, null,           'Liability', '20');
      const liabCurr   = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES', 2, liabParent.id,  'Liability', '22');
      const taxLiab    = FinanceService.ensureAccount(company, 'TAX LIABILITIES',     3, liabCurr.id,    'Liability', '221');
      gstPayableAcc    = FinanceService.ensureAccount(company, 'GST Payable',         4, taxLiab.id,     'Liability', '2214');
    }
  }

  // ── Invoice ID (sequential, atomic via Postgres allocate_serial RPC) ─
  const invoiceId = await getNextInvoiceNumber(company);
  const txId      = 'GL-' + invoiceId;
  const today     = new Date().toISOString().split('T')[0];
  // Recognize revenue + COGS at delivery (control transfer), not the
  // invoice-entry date — IFRS 15 §31 / IAS 1 cut-off fix. Both GL legs (and
  // the inter-company mirror) post on this date; invoice.date stays = today
  // (issuance) for AR aging / due-date terms.
  const glDate    = resolveRecognitionDate(deliveryDate ?? order.actualDeliveryDate, today);

  // ── GL Entry — Posted directly ────────────────────────────────────
  const details: { accountId: string; debit: number; credit: number; text: string }[] = [
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
      text: 'GST ' + effectiveGstPercent + '%: ' + invoiceId,
    });
  }

  const glTx: LedgerTransaction = {
    id: txId, company, docType: 'DR',
    docDate: glDate, date: glDate,
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
      (a) => a.company === targetCompany
    );
    const costAcc = targetAccounts.find(
      (a) => a.name.includes('CONSUMED') || a.name.includes('MATERIAL') || (a.code || '').startsWith('511')
    ) || targetAccounts.find((a) => a.type === 'Expense');
    const payableAcc = targetAccounts.find(
      (a) => a.name.includes('PAYABLE') || (a.code || '').startsWith('221')
    ) || targetAccounts.find((a) => a.type === 'Liability');

    if (costAcc && payableAcc) {
      mirrorTx = {
        id: 'BILL-' + txId, company: targetCompany, docType: 'KR',
        docDate: glDate, date: glDate,
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

  const invoice: Invoice & Record<string, unknown> = {
    id: invoiceId, company,
    orderId: order.id, orderNo: order.orderNo || order.id,
    clientId: order.clientId, clientName,
    date: today, dueDate: dueDate.toISOString().split('T')[0],
    subtotal: finalAmount,
    gstPercent: effectiveGstPercent,
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
  let quotationPatch: { id: string; patch: Record<string, unknown> } | null = null;
  let quotationFullUpdated: Record<string, unknown> | null = null;
  if (orderRow) {
    const updated: Quotation & Record<string, unknown> = {
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
  // Glassco path = production-pieces driven. Nippon (trading) path =
  // qty × MAP from inventory. Both produce the same shape for the RPC
  // payload (ledgerTx + storeUpdates), so downstream code stays uniform.
  let cogsPlan: ReturnType<typeof buildDeliveryCOGSPlan> | NipponTradingCOGSPlanCompat = null;
  if (isTradingCompany) {
    const tradingPlan = buildNipponTradingCOGSPlan({
      company, invoiceId,
      orderId: order.orderNo || order.id,
      items: effectiveItems,
      date: glDate, clientName,
    });
    cogsPlan = {
      ledgerTx: tradingPlan.ledgerTx,
      storeUpdates: [],
      totalSqft: 0,
      rawGlassCOGS: tradingPlan.totalCogs,
      totalCuttingCost: 0,
      totalProcessingCost: 0,
      alreadyPosted: tradingPlan.alreadyPosted,
    };
  } else if (linkedPieceIds.length > 0) {
    cogsPlan = buildDeliveryCOGSPlan({
      company, invoiceId,
      orderId: order.orderNo || order.id,
      pieceIds: linkedPieceIds,
      date: glDate, clientName,
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
    safeSave(LS_INVOICES, [...localInvoices.filter((i) => i.id !== invoice.id), invoice]);

    const localLedger = safeParse(LS_LEDGER) as any[];
    const newLedgerEntries: LedgerTransaction[] = [{ ...glTx }];
    if (cogsPlan && cogsPlan.ledgerTx) newLedgerEntries.push({ ...cogsPlan.ledgerTx });
    if (mirrorTx) newLedgerEntries.push({ ...mirrorTx });
    const ledgerWithoutNew = localLedger.filter(
      (t) => !newLedgerEntries.some(n => n.id === t.id)
    );
    safeSave(LS_LEDGER, [...ledgerWithoutNew, ...newLedgerEntries]);

    if (quotationFullUpdated) {
      const localQuotes = safeParse(LS_QUOTATIONS) as any[];
      safeSave(LS_QUOTATIONS, [
        ...localQuotes.filter((q) => q.id !== quotationFullUpdated.id),
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
