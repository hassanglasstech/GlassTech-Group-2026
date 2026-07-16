# Nippon — God-Mode Section Audit & Roadmap (2026-07-16)

9 parallel section auditors compared every Nippon area against modern B2B
distribution SaaS (Odoo, Zoho Inventory, NetSuite, Unleashed, inFlow, Cin7).
Bar = feature/workflow parity, because the owner pays PKR 1 lakh/month vs
$30–100/seat competitors. Every finding is evidence-cited (file:line) in the
source audits; this doc is the synthesis + build order.

## Scorecard

| # | Section | Score | One-line |
|---|---------|:---:|----------|
| 6 | Finance / Order-to-Cash | **6.0** | CA-grade engine; 2 entry points diverge, Billing Hub posts phantom cash + ungated |
| 1 | Product Master + Variants | **5.5** | Great dup-defense & import; no price-lists, supplier/landed-cost, barcodes, archive |
| 2 | Quotation + Pricing | **4.5** | No live margin, line-rate locked, no tiers/discount/tax on quote |
| 4 | Inventory / Stock | **4.5** | Strong MAP/IAS-2; on-hand/reserved hidden, aging report dead, decrement non-atomic |
| 7 | Catalogue + Documents | **4.5** | 3 letterheads, print-only, no WhatsApp share, no priced catalogue |
| 8 | Navigation / IA / UX | **4.5** | Back→Home bug (state-based nav), dead header search, wrong bottom-nav |
| 3 | Order → Store Issue → Fulfilment | **3.5** | Reservation good; no pick/pack/partial/POD, `Delivered` status leak |
| 5 | Procurement / GRN / Import | **3.5** | No FX, landed-cost freight-only, GL off, GRN non-atomic, no PO |
| 9 | Data Integrity / Governance | **3.5** | Product hard-delete w/ history, dedupe is a no-op that lies, no code-unique/audit |

**Whole-Nippon ≈ 4.4 / 10.** Pattern: the **accounting/valuation/data engines are genuinely strong** (often above SMB SaaS), but the **operational surface** on top of them lags cheap SaaS on table-stakes workflows. The premium price is defensible on *bespoke group ERP + dedicated dev + Pakistani fit*, NOT on feature-parity today — closing Phase 0/1 is what protects the price.

---

## Phase 0 — Correctness / go-live blockers (WRONG right now — fix before flipping GL)

These either post bad accounting data or lose records. Several are from this
week's own EPIC work — fixing them is non-negotiable before `finance.gl_enabled`
goes ON.

- **P0-1 · `Delivered` status leak.** `issueNipponOrder` stamps `status:'Delivered'` but `QuotationStatus`/`ORDER_STATUSES` have no such member → delivered orders fall back into the *Quotations* tab and vanish from every order list. Add `DELIVERED` (+`PARTIALLY_DELIVERED`) to the enum + order views. *(fulfilment #1)*
- **P0-2 · Billing Hub posts phantom CASH tree for Nippon.** Receipt cash leg builds `10→11→111→{code}0` (orphan 11110…) instead of Nippon's real `11111/11112/11121/11122`. AR side is correct (resolver) but cash lands off-balance-sheet → TB splits. Add `resolveCashAccount(company, method)` and wire into BOTH SalesOrders + BillingHub receipts (+ petty cash). *(finance P0)*
- **P0-3 · Billing Hub bypasses `finance.gl_enabled` AND the delivery gate.** `confirmGenerateInvoice` calls `generateDeliveryInvoice` with no flag check and lists *Approved* (not-yet-issued) orders as billable → full books can post before delivery with GL "off". Gate it + restrict billable list to issued/delivered. *(finance P1→P0 for integrity)*
- **P0-4 · "Remove Duplicates" is a lying no-op.** `handleDedupe` upserts survivors but never deletes losers (upsert doesn't remove omitted rows) → dupes return next refresh, yet toast says "Removed N". Disable now; rebuild as a real merge RPC (repoint refs + transfer stock, then archive losers). *(data-integrity P0)*
- **P0-5 · Product hard-delete with history (MM-G / user Q4).** Deleting a SKU referenced by quotations/orders/invoices orphans that history (no FK, no soft-delete, no reference check). Standard: reference-count → **Archive** (soft, hidden from pickers, record kept) when referenced; hard-delete only when zero refs + zero stock. Add `products.status`/`active` + audit trigger. *(data-integrity P0)*
- **P0-6 · Over-issue + non-atomic trading stock.** Issue decrements `quantity` unconditionally via full-array localStorage write (no `consume_glass_stock`-style atomic RPC) → concurrent issues lose writes, on-hand goes negative silently. Add `issue_order_atomic` / `consume_hardware_stock` RPC (row-level, guarded). *(fulfilment #2, inventory G7)*

## Phase 1 — Trader parity essentials (P1 — defends the price)

- **P1-1 · URL-addressable in-module nav** (nested routes / searchParams). ONE fix repairs the Back→Home P0 **and** deep-linking, refresh-persistence, breadcrumbs, and the command-palette hand-off. *(nav)*
- **P1-2 · Live margin + editable line rate on quotes.** Show cost / GP Rs / GP% per line + quote footer; make `pricePerUnit` editable (keep list price as margin reference). Stops blind margin give-away. *(quotation P0-commercial)*
- **P1-3 · Customer price-lists / tiers** — reuse Glassco's `buildPriceListResolver` (already in-repo) for Nippon; qty breaks + per-customer/tier rates feed quote + priced catalogue. *(quotation/catalogue)*
- **P1-4 · Pick / pack / partial fulfilment + backorders + Delivery Challan + POD** for the trading flow (reuse existing POD/print infra; create a Nippon dispatch record on issue). *(fulfilment)*
- **P1-5 · Stock operational cockpit** — surface on-hand/available/reserved columns (data exists), repair the dead Stock Aging report, editable per-SKU reorder points + low-stock/reorder suggestions, reason-code adjustments + a real cycle-count sheet (service exists, no UI). *(inventory)*
- **P1-6 · Per-customer AR** — statement document (invoices − receipts − CNs, running balance), per-`clientId` aging subledger, WhatsApp/Telegram dunning (infra exists). *(finance)*
- **P1-7 · FBR/WHT compliance** — WHT split on receipt (`Dr Bank + Dr WHT-Recv / Cr AR`), NTN/STRN on client + invoice, enforce when required; scope FBR e-invoicing (IRN+QR). *(finance)*
- **P1-8 · Unified documents + WhatsApp share** — route quote/SO/catalogue through the existing `BrandingService` letterhead (one identity); reliable PDF via `exportElementToPdf`; one-tap WhatsApp/native share. *(catalogue)*
- **P1-9 · Import landed cost + FX** — GRN currency+fxRate (default CNY) capturing RMB & PKR; multi-charge landed cost (duty / import-GST / clearing / freight / inland) capitalised into MAP; route GRN through `post_grn_atomic`. *(procurement)*
- **P1-10 · Master-data governance** — DB `UNIQUE(company, upper(profile_code))`, `products` audit trigger, version-guarded product writes (`update_with_version`), finish half-wired soft-delete for sales docs. *(data-integrity)*
- **P1-11 · Variant grouping (feature B)** — collapse variants under parent card + "N sizes" badge in registry; quotation variant-picker (base code → axis value w/ thumbnail+stock); existing-product → variant grouping tool; template (non-stock) parent for color-axis. *(product master)*

## Phase 2 — Depth / differentiation (P2)

- Purchase Order entity + 3-way match (PO↔GRN↔Invoice); vendor master enrichment (terms/currency/lead-time/tax IDs/bank).
- Cheque/PDC lifecycle (Cheques-in-Hand clearing, bounced reversal); on-account cash + multi-invoice allocation.
- Barcode/SKU on products + scan at GRN/pick/count; batch/lot + expiry (SIWAY sealants); multi-location/bin.
- Multi-axis variants (Color × Size matrix); digital/shareable catalogue link; Urdu document toggle; selectable-text PDF.
- Nav polish: command-palette for admin pages, collapse Production twins, wire header search + role-aware bottom-nav, a11y (focus-trap/aria-current), real 404, confirm-logout.

---

## Honest note on this week's EPIC work
EPIC 0–4 sealed the **SalesOrders → fulfilment** order-to-cash path (real COA,
atomic receipt, advances, IFRS 15 timing) — that part is strong (finance scored
6.0, the highest). But the audit found the **Billing Hub** alternate path was
NOT brought along: it posts phantom cash (P0-2) and can invoice ungated/pre-
delivery (P0-3). So "finance sealed" is true for one path, not both — Phase 0
finishes the job before GL is flipped ON.
