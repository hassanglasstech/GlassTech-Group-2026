# GLASSCO ERP — SPRINT PROMPTS (Sprint 0–36)

**Repo:** `https://github.com/hassanglasstech/GlassTech-Group-2026`
**Local path:** `C:\Users\Hassa\Downloads\ERP\GlassTech-Group-2026`
**Use:** Copy any sprint section into a new Claude chat. Each prompt is self-contained.

---

## 📑 TABLE OF CONTENTS

| # | Sprint | Days | Phase |
|---|--------|------|-------|
| 0 | Manual Sheet Number Entry | 1 | Foundation |
| 1 | Atomic RPCs (Invoice/Stock/Version) | 3 | Foundation |
| 2 | Multi-User Safety + Realtime | 5 | Foundation |
| 3 | Postgres-Primary Read Path | 10 | Foundation |
| 4 | Real RLS + Audit Triggers + Health Monitor | 5 | Foundation |
| 5 | Production Atomicity RPCs | 4 | Production |
| 6 | Cutter UX Rewrite | 5 | Production |
| 7 | QC Reform + Defect Code Unification | 3 | Production |
| 8 | Bulk Operations + WIP Aging | 5 | Production |
| 9 | Production Performance + Pagination | 3 | Production |
| 10 | Production Realtime + Collaboration | 4 | Production |
| 11 | Atomic Dispatch + Audit Log | 5 | Outbound |
| 12 | POD + Mobile Driver App | 5 | Outbound |
| 13 | Smart Logistics Engine | 6 | Outbound |
| 14 | Real-Time GPS + Live Dashboard | 5 | Outbound |
| 15 | Production Workbench Foundation | 4 | One-Window |
| 16 | Kanban Board + Drag-Drop | 5 | One-Window |
| 17 | Slide-in Detail Panel | 3 | One-Window |
| 18 | Role-Based Mini-Apps | 6 | One-Window |
| 19 | Demolish Old Tabs | 3 | One-Window |
| 20 | Polish + Migration | 3 | One-Window |
| 21 | Global UX Foundations | 4 | UX Sweep |
| 22 | GlasscoEditor Rewrite | 6 | UX Sweep |
| 23 | MIGO + Requisition Wizards | 6 | UX Sweep |
| 24 | Material Mgmt Restructure | 4 | UX Sweep |
| 25 | Finance Workbench | 5 | UX Sweep |
| 26 | Mobile-First Sweep | 5 | UX Sweep |
| 27 | Security + Real RLS | 3 | Compliance |
| 28 | Pakistan GST + WHT Compliance | 4 | Compliance |
| 29 | Reporting Pack (P&L/BS/CF/GST Returns) | 5 | Business |
| 30 | Opening Balance + Migration Wizards | 4 | Business |
| 31 | Audit Trail + Period Lock + Year-End | 3 | Business |
| 32 | Backup + DR Strategy | 2 | Operations |
| 33 | Print Document Compliance | 3 | Compliance |
| 34 | Performance at Scale | 3 | Operations |
| 35 | Notifications + Alerts | 3 | Operations |
| 36 | Onboarding + Training Mode | 4 | Operations |

**Total: 152 days (~7-8 calendar months)**

---

## 🔧 STANDARD PROJECT PREAMBLE

> Every sprint prompt below assumes this preamble. New chats may need this context up-front.

```
PROJECT: GlassTech Group ERP — Glassco Sales/Production go-live
STACK: React 19.2 + TypeScript 5.8 (strict) + Vite 6.2 + Tailwind + 
       Supabase (Postgres + Auth + Realtime + Edge Functions) + 
       Zustand 5 + localStorage/IDB two-tier sync
REPO: https://github.com/hassanglasstech/GlassTech-Group-2026
LOCAL: C:\Users\Hassa\Downloads\ERP\GlassTech-Group-2026
DEV: npm run dev (port 3000)
LINT: npm run lint
FOCUS: modules/sales/* + modules/glassco/* + modules/production/companies/glassco/*
       modules/procurement/* + modules/finance/services/financeService.ts
DON'T TOUCH: HR module unless explicitly requested.
COMMITS: phase-7+ commits + Co-Authored-By trailer.
LANGUAGE: Hassan speaks Roman Urdu. Translate his short instructions to 
          technical tasks before answering.
COMPANY FILTER: Every Supabase query MUST .eq('company', 'Glassco') unless 
                cross-company is explicit.
GL: every JV must balance (assertGLBalance). System-auto entries set 
    createdBy: 'system-auto' to bypass MakerChecker.
SCHEMA: tables use JSONB `data` blob + flat columns dual-write. See 
        migrations 037, 038, 039, 040 for current schema state.
```

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 0 — Manual Sheet Number Entry
═══════════════════════════════════════════════════════════════════════════

## Goal
Replace QR scanner in cutting session with a manual text input + autocomplete drawing from `grn_sheet_entries.tag_id`. Hassan doesn't want QR scanning — sheet numbers are pre-printed on tags during GRN.

## Files to touch
- `modules/glassco/core/CutterScanPanel.tsx` — replace scanner UI with text input
- `modules/production/companies/glassco/components/CuttingIntelligenceHub.tsx` — wire manual lookup
- New migration: `supabase/migrations/041_sheet_consumption_lock.sql` — UNIQUE constraint to prevent double-consume

## Deliverables
1. Cutter types `GLS-T-123-04` → autocomplete suggests matching sheet from `grn_sheet_entries`
2. On select → auto-fill thickness/size/glass type from GRN
3. On consume → mark sheet `consumed_in_session_id` (DB column added)
4. UNIQUE constraint on `(tag_id)` for active sessions blocks double-scan attempts globally
5. Toast error if sheet already consumed by another session
6. Remove QR scanner imports + dependencies (`react-qr-reader` etc.)

## Acceptance criteria
- [ ] Cutter can find any sheet by typing partial tag id
- [ ] Cannot consume same sheet in 2 sessions (DB-enforced)
- [ ] Sheet auto-fills thickness/size on select
- [ ] No QR scanner code remains in codebase
- [ ] `npm run lint` passes

## Risks
- Existing cutting sessions may reference sheet IDs that don't exist in `grn_sheet_entries` (test data) — handle gracefully

## Estimated effort: 1 day

## Dependencies
None — can run today.

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 1 — Atomic RPCs (Invoice / Stock / Version)
═══════════════════════════════════════════════════════════════════════════

## Goal
Replace 6-step sequential client-side invoice flow with a single Postgres transaction. Add atomic stock consumption. Add optimistic concurrency for shared records.

## Background
Today's `deliveryInvoiceService.generateDeliveryInvoice` does:
1. recordTransaction (AR/Revenue/GST GL)
2. saveFinancialEvents
3. recordTransaction (IC mirror)
4. saveInvoices (localStorage + async Supabase)
5. saveQuotations (status update)
6. postDeliveryCOGS (GL entry)

If step N fails after N-1 succeeded → orphan GL, no rollback. Comment in code literally says "DELETE the invoice or post a manual JV to balance."

## Files to create
- `supabase/migrations/042_atomic_rpcs.sql` — three RPCs

## RPC #1 — `post_invoice_atomic(p_payload JSONB) RETURNS JSONB`
Inside one transaction:
- Validate payload (client exists, items > 0, sqft > 0 if glass items)
- INSERT into `ledger` for AR/Revenue/GST entry (with `assertGLBalance` check)
- INSERT into `invoices`
- UPDATE `quotations` SET status='Invoiced', invoice_no=...
- INSERT into `ledger` for COGS (Dr COGS / Cr WIP+Inventory)
- IF `mirror_company` set → INSERT mirror BILL ledger
- Throw on any error → full rollback

## RPC #2 — `consume_glass_stock(p_company TEXT, p_session_id TEXT, p_consumption JSONB)`
- For each (material_id, sqft) pair:
  - SELECT ... FOR UPDATE on `store_items`
  - Validate qty available
  - UPDATE qty
  - INSERT `stock_ledger` row
- INSERT `ledger` for Dr WIP / Cr Inventory
- All-or-nothing

## RPC #3 — `update_with_version(p_table TEXT, p_id TEXT, p_payload JSONB, p_expected_version INT)`
- SELECT ... FOR UPDATE on table
- IF version != expected → RAISE EXCEPTION 'version_conflict'
- ELSE UPDATE with payload, increment version, return new row

## Client wiring
- `modules/sales/services/deliveryInvoiceService.ts` — replace 6 sequential calls with one `supabase.rpc('post_invoice_atomic', ...)`
- `modules/production/companies/glassco/components/CuttingIntelligenceHub.tsx` — replace stock check + GL post + save with `supabase.rpc('consume_glass_stock', ...)`

## Acceptance criteria
- [ ] Migration 042 applies cleanly (idempotent)
- [ ] Force-fail mid-transaction in test → entire transaction rolls back
- [ ] Concurrent stock consumption from 2 sessions → second blocks until first commits
- [ ] Stale version update → throws `version_conflict`, UI shows reload prompt
- [ ] All existing E2E smoke tests still pass

## Risks
- Migrating client code — may miss callers
- Test thoroughly: imbalanced GL, missing client, glass items with no pieces

## Estimated effort: 3 days

## Dependencies
None.

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 2 — Multi-User Safety + Supabase Realtime
═══════════════════════════════════════════════════════════════════════════

## Goal
Add optimistic concurrency control + live updates so 2-3 users can work without overwriting each other.

## Files to touch
- New migration: `supabase/migrations/043_version_columns_and_ic_fk.sql`
- `modules/sales/services/asyncSalesService.ts` — version-aware saves
- `modules/sales/pages/ClientMaster.tsx` — surface version conflict
- `modules/glassco/core/GlasscoEditor.tsx` — reload prompt on conflict
- `src/services/realtimeService.ts` — NEW file
- `App.tsx` — wire realtime channels

## Migration 043
```sql
ALTER TABLE quotations    ADD COLUMN version INT DEFAULT 1;
ALTER TABLE invoices      ADD COLUMN version INT DEFAULT 1;
ALTER TABLE products      ADD COLUMN version INT DEFAULT 1;
ALTER TABLE store_items   ADD COLUMN version INT DEFAULT 1;
ALTER TABLE clients       ADD COLUMN version INT DEFAULT 1;
ALTER TABLE production_pieces ADD COLUMN version INT DEFAULT 1;

-- IC mirror — explicit FK instead of regex on client name
ALTER TABLE clients ADD COLUMN mirror_company TEXT 
  CHECK (mirror_company IS NULL OR mirror_company IN ('GTK','GTI','Glassco','Nippon','Factory'));
CREATE INDEX idx_clients_mirror_company ON clients(mirror_company) 
  WHERE mirror_company IS NOT NULL;

NOTIFY pgrst, 'reload schema';
```

## Client work
1. Add `version` field to TS types
2. Every save: send expected version → use `update_with_version` RPC from Sprint 1
3. On 'version_conflict' error → show modal: *"Someone else edited this record. Reload to see latest changes."*
4. Add `<MirrorCompanySelect>` in ClientMaster (dropdown of 5 companies + None)
5. Remove regex-based IC mirror in `deliveryInvoiceService.ts`; use `client.mirror_company` directly
6. New `realtimeService.ts` subscribes to `postgres_changes` per company per critical table
7. On change → invalidate TanStack Query cache (will be wired in Sprint 3) OR direct setState

## Acceptance criteria
- [ ] User A + User B edit same quotation → second save shows reload prompt
- [ ] Stock consumed by User A → User B's screen updates within 1s (no refresh)
- [ ] Client created with mirror_company='GTI' → IC mirror posts to GTI books on invoice
- [ ] Client without mirror_company → no mirror entry posted

## Risks
- Realtime subscriptions may cause re-renders — debounce updates
- Version conflict UX must be friendly (don't lose user's typed data on conflict)

## Estimated effort: 5 days

## Dependencies
Sprint 1 (uses `update_with_version` RPC).

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 3 — Postgres-Primary Read Path (TanStack Query)
═══════════════════════════════════════════════════════════════════════════

## Goal
Move source-of-truth from localStorage to Postgres. localStorage becomes offline cache only. Use TanStack Query (React Query v5) for all data fetching.

## Background
Today: `SalesService.getInvoices()` returns synchronously from localStorage. Components depend on this. Stale data + tab close = data loss.

## Migration order (lowest risk first)
- **Day 10-11:** `useClients()` hook (read-heavy, low mutation)
- **Day 12-13:** `useInvoices()`, `usePaymentReceipts()` (read-heavy)
- **Day 14-16:** `useQuotations()` (high mutation, needs Sprint 2 version field)
- **Day 17-18:** `useProductionPieces()` (state machine + realtime)
- **Day 19:** localStorage demoted to **offline cache only**

## Files to add
- `src/services/queryClient.ts` — TanStack Query config
- `modules/sales/hooks/useClients.ts`
- `modules/sales/hooks/useInvoices.ts`
- `modules/sales/hooks/useQuotations.ts`
- `modules/sales/hooks/usePaymentReceipts.ts`
- `modules/production/hooks/useProductionPieces.ts`

## Pattern for each hook
```typescript
export const useInvoices = (company: string) => useQuery({
  queryKey: ['invoices', company],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('invoices').select('*').eq('company', company);
    if (error) throw error;
    return data;
  },
  staleTime: 30_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
});
```

## Files to deprecate
- `modules/sales/services/salesService.ts` synchronous getters — keep for offline read fallback only
- All `useEffect → setItems(SalesService.getX())` patterns

## Acceptance criteria
- [ ] All Sales components use hooks, not synchronous getters
- [ ] Tab close mid-write → on reload, server state shown (not stale localStorage)
- [ ] localStorage size capped at 2MB (offline cache, not source of truth)
- [ ] Mutation rollback on server error (TanStack `onError`)
- [ ] Realtime subscription invalidates query cache → instant updates

## Risks
- High-touch refactor — every component needs migration
- Test offline behavior carefully (TanStack offline plugin)

## Estimated effort: 10 days

## Dependencies
Sprint 1 (atomic RPCs as mutations).

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 4 — Real RLS + Audit Triggers + Health Monitor
═══════════════════════════════════════════════════════════════════════════

## Goal
Replace permissive RLS (migration 026) with strict company isolation. Add Postgres triggers for audit log. Build operational health page.

## Migration 044 — Strict RLS
```sql
-- Drop migration 026's permissive USING (true)
DROP POLICY IF EXISTS "permissive_rw" ON clients;
DROP POLICY IF EXISTS "permissive_rw" ON quotations;
-- ... etc for every table

-- Replace with strict company isolation
CREATE POLICY "company_strict" ON quotations FOR ALL
  USING (company = ANY(
    SELECT unnest(allowed_companies) FROM user_profiles WHERE id = auth.uid()
  ));

-- NO COALESCE fallback. Missing user_profiles row = no access.
-- Apply same to: clients, invoices, payment_receipts, credit_notes, 
-- customer_complaints, production_pieces, store_items, requisitions, 
-- purchase_orders, vendors
```

## Migration 045 — Audit Triggers
```sql
CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  operation TEXT NOT NULL,  -- INSERT/UPDATE/DELETE
  changed_at TIMESTAMPTZ DEFAULT now(),
  changed_by TEXT,
  before_data JSONB,
  after_data JSONB,
  company TEXT
);

CREATE INDEX idx_activity_log_table_row ON activity_log(table_name, row_id);
CREATE INDEX idx_activity_log_company_date ON activity_log(company, changed_at DESC);

CREATE OR REPLACE FUNCTION log_changes() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_log (table_name, row_id, operation, changed_by, before_data, after_data, company)
  VALUES (
    TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP,
    COALESCE(current_setting('app.current_user', true), 'unknown'),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    COALESCE(NEW.company, OLD.company)
  );
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

-- Apply trigger to: clients, quotations, invoices, payment_receipts, 
-- credit_notes, ledger, store_items, production_pieces
CREATE TRIGGER tr_invoices_audit AFTER INSERT OR UPDATE OR DELETE 
  ON invoices FOR EACH ROW EXECUTE FUNCTION log_changes();
-- ... repeat per table
```

## Health monitor page
- New route `/#/health` (admin only)
- Shows: trial balance Dr=Cr (auto-recompute hourly), localStorage size per user, queued sync items, last successful Supabase write per table
- Daily Supabase cron via Edge Function: `SELECT erp_snapshot('Glassco', 'auto_daily')`

## Acceptance criteria
- [ ] User in Glassco company cannot SELECT GTI rows (DB-level reject)
- [ ] Every UPDATE/INSERT/DELETE on critical tables logs to `activity_log`
- [ ] Activity log queryable by row_id (audit "who edited invoice X")
- [ ] Daily snapshot runs without manual trigger
- [ ] Health page shows pending sync items per user

## Estimated effort: 5 days

## Dependencies
Sprint 1, 2, 3.

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 5 — Production Atomicity RPCs
═══════════════════════════════════════════════════════════════════════════

## Goal
Eliminate the 5 P0/P1 production engineering defects identified in audit.

## Defects to fix
1. P0: `handleUpdatePieceStatus` non-awaited save race (ProductionContext.tsx:182)
2. P0: cutting session GL-then-stock split (CuttingIntelligenceHub.tsx:163-184)
3. P1: NCR can resurrect Delivered piece (NCRModule + ncrService)
4. P1: `loadAllPiecesToDispatch` non-atomic batch (ProductionContext.tsx:259-279)
5. P1: `Hold` state asymmetry — 7 exits without `holdFrom` tracking

## Migration 046 — Production atomic RPCs

### `close_cutting_session_atomic(p_session_id TEXT, p_company TEXT, p_consumption JSONB)`
- SELECT ... FOR UPDATE on each store_item
- Validate stock available
- UPDATE store_items qty
- INSERT stock_ledger rows
- INSERT cutting_sessions session row
- INSERT ledger Dr WIP / Cr Inventory
- All in one transaction

### `update_piece_status_atomic(p_piece_id TEXT, p_new_status TEXT, p_changed_by TEXT, p_reason TEXT)`
- SELECT ... FOR UPDATE on production_pieces
- Validate transition against PIECE_TRANSITIONS map (in PG)
- UPDATE status + increment version
- INSERT activity_log row
- IF p_new_status = 'Delivered' AND piece.dispatch_id IS NOT NULL → trigger COGS post

### `load_pieces_to_dispatch_atomic(p_dispatch_id TEXT, p_piece_ids TEXT[])`
- For each piece: validate not in another active dispatch
- UPDATE production_pieces SET dispatch_id, status='Dispatched'
- UPDATE tempering_dispatches SET piece_ids = pieces, status='Dispatched'
- All-or-nothing

## Code changes
- `modules/production/services/ncrService.ts` — `createNCR()` rejects pieces in `Delivered/Broken` status
- `modules/production/components/ProductionContext.tsx` — `Hold` state tracks `holdFrom` (e.g. piece moved Cut→Hold→holdFrom='Cut'); exits restricted to that origin
- Replace handleUpdatePieceStatus with RPC call (await properly)
- Replace cutting session close with RPC call
- Replace loadAllPiecesToDispatch with RPC

## Acceptance criteria
- [ ] Cannot create NCR on Delivered piece
- [ ] Cannot dispatch a piece that's already in another active dispatch
- [ ] Cutting session close: if stock save fails → GL not posted (atomic)
- [ ] Hold state: piece in Cut→Hold can only exit to Cut, not jumps to Dispatched
- [ ] Concurrent piece status updates from 2 users → second blocks until first commits

## Estimated effort: 4 days

## Dependencies
Sprint 1, 4 (audit log triggers).

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 6 — Cutter UX Rewrite
═══════════════════════════════════════════════════════════════════════════

## Goal
Cutter is the most-impacted user (50× clicks/shift, semi-literate, mobile-bound). Today UX is 4/10. Target: 9/10.

## Files to add
- `modules/production/companies/glassco/pages/CutterWorkbench.tsx` — new dedicated page
- Add route in App.tsx: `/#/cutter` (lazy-loaded)
- Restrict route to `glassco_cutter` role

## Design (mobile-first, 375px)
```
┌─────────────────────────────────────────┐
│  Cutter: Ahmed | Today: 145/200 sqft    │
├─────────────────────────────────────────┤
│  Active Session: SES-2026-0152 (45 min) │
│  ━━━━━━━━━━━━━━━━━━░░░░ 35/50 pieces   │
│                                         │
│  [📋 ENTER SHEET NUMBER]  ← 60px button │
│  [➕ ADD PIECE]            ← 60px button│
│  [✓ END SESSION]           ← 60px button│
│                                         │
│  Recent (last 5):                       │
│   ✓ GLS-PC-153  6mm  10sqft   2pm     │
│   ✓ GLS-PC-154  6mm  8sqft    2:05    │
│   ...                                   │
│                                         │
│  [↶ UNDO LAST]  ← 30s window           │
└─────────────────────────────────────────┘
```

## Features
- 3 main buttons, all 60×60px minimum
- Big fonts (16px minimum)
- Single-tap status changes (no nested tabs)
- Manual sheet number entry from Sprint 0 (autocomplete from grn_sheet_entries)
- **Undo last action** button — 30 second window using state stack
- Required field markers (*) universally
- Audible feedback (toast.success → optional chime) — config in user prefs
- Roman Urdu mode toggle (button labels switch to Urdu)

## Acceptance criteria
- [ ] Tested at 375px in Chrome DevTools
- [ ] Single-finger usable on phone (no need for two hands)
- [ ] Cutter does typical task (start session, scan 5 pieces, end session) in <2 min
- [ ] Undo recovers last 3 actions
- [ ] No tabs anywhere on this page
- [ ] Works offline (PWA cache for this route)

## Estimated effort: 5 days

## Dependencies
Sprint 0 (manual sheet entry), Sprint 5 (atomic RPCs).

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 7 — QC Reform + Defect Code Unification
═══════════════════════════════════════════════════════════════════════════

## Goal
Two different defect code lists exist (ProcessingView.tsx:12-22 + QCCheckPanel.tsx:60-68). Unify. Make picker searchable. Surface "blind check" mode tutorial.

## Files
- New: `modules/production/constants/qcCodes.ts` — single canonical list
- `modules/production/companies/glassco/components/views/ProcessingView.tsx` — import from constants
- `modules/glassco/core/QCCheckPanel.tsx` — same
- New page: `modules/production/companies/glassco/pages/QCWorkbench.tsx`
- New tutorial: `modules/glassco/core/QCBlindCheckIntro.tsx`

## Canonical defect list
```typescript
// modules/production/constants/qcCodes.ts
export const QC_DEFECT_CODES = [
  { code: 'QC-01', label: 'Scratch / Surface Damage', severity: 'major' },
  { code: 'QC-02', label: 'Edge Chip / Rough Edge',  severity: 'major' },
  { code: 'QC-03', label: 'Hole Misalignment',        severity: 'critical' },
  { code: 'QC-04', label: 'Notch Out of Spec',        severity: 'critical' },
  { code: 'QC-05', label: 'Crack',                    severity: 'critical' },
  { code: 'QC-06', label: 'Color Mismatch',           severity: 'major' },
  { code: 'QC-07', label: 'Dimension Out of Spec',    severity: 'critical' },
  { code: 'QC-08', label: 'Bubbles / Inclusions',     severity: 'minor' },
  { code: 'QC-09', label: 'Coating Defect',           severity: 'major' },
  { code: 'QC-10', label: 'Other (specify)',          severity: 'minor' },
] as const;
```

## Features
- Searchable defect picker — type "scratch" → filtered
- Recent codes pinned (last 5 used)
- Severity badge color (critical=red, major=amber, minor=yellow)
- Hole/notch measurement fields hidden by default — expand only for relevant types
- "Blind check" mode tutorial banner on first use
- Required vs optional fields visibly marked

## Acceptance criteria
- [ ] Both ProcessingView and QCCheckPanel import from `qcCodes.ts`
- [ ] No duplicate code lists in codebase
- [ ] Search filters as user types
- [ ] "Other" code requires text explanation
- [ ] Mobile usable at 375px

## Estimated effort: 3 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 8 — Bulk Operations + WIP Aging
═══════════════════════════════════════════════════════════════════════════

## Goal
Manager-grade tools for managing 200-1000 pieces/day at scale.

## Features
1. **Multi-select with checkbox column** in piece grids (ProcessingView, DispatchView)
2. **Bulk action bar** — appears at bottom when N pieces selected
   - "Mark 25 selected as QC-Passed"
   - "Move 50 to Dispatched"
   - "Print tags for 30 selected"
3. **WIP aging report** at `/#/production/aging` — pieces stuck >7 days in same state
4. **Vendor SLA tracking** — tempering_dispatch sets `expected_return_date`, alert if breached
5. **Cutter productivity metrics** — sqft/hour, wastage trend per cutter
6. **Job order grouped views** — collapse by `orderId` instead of flat list

## Files
- `modules/production/companies/glassco/components/views/ProcessingView.tsx` — add bulk selection
- `modules/production/companies/glassco/components/views/DispatchView.tsx` — same
- New: `modules/production/companies/glassco/pages/WIPAging.tsx`
- New: `modules/production/companies/glassco/pages/CutterPerformance.tsx`

## Migration 047 — `expected_return_date` column
```sql
ALTER TABLE tempering_dispatches 
  ADD COLUMN IF NOT EXISTS expected_return_date DATE,
  ADD COLUMN IF NOT EXISTS actual_return_date DATE;

CREATE INDEX idx_tempering_overdue 
  ON tempering_dispatches(expected_return_date) 
  WHERE actual_return_date IS NULL;
```

## Acceptance criteria
- [ ] Bulk select 50 pieces, mark all QC-Passed in 2 clicks
- [ ] Aging report shows pieces stuck >7 days in red, >14 days flashing
- [ ] Vendor SLA dashboard: PSG 95% on-time, AHM 78%, etc.
- [ ] Cutter performance: Ahmed 250 sqft/hr (above target), Bilal 180 (below)

## Estimated effort: 5 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 9 — Production Performance + Pagination
═══════════════════════════════════════════════════════════════════════════

## Goal
Smooth UI at 1000+ active pieces. Virtual scrolling.

## Features
- **Virtual scrolling** in ProcessingView grid using `react-window`
- **Server-side pagination** for `getProductionPiecesPage` (already exists — wire UI to it)
- **Memoize piece→weight map** in DispatchView (avoid O(n*m) recalc)
- **Index `production_pieces (company, status, order_id)`** at DB level
- **Lazy load piece images** (intersection observer)

## Migration 048 — Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_pieces_company_status_order 
  ON production_pieces(company, status, order_id);
CREATE INDEX IF NOT EXISTS idx_pieces_dispatch_id 
  ON production_pieces(dispatch_id) WHERE dispatch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pieces_updated_at 
  ON production_pieces(updated_at DESC);
```

## Acceptance criteria
- [ ] ProcessingView with 1000 pieces renders in <500ms
- [ ] Scrolling at 60fps on mid-range hardware
- [ ] No more "Browser unresponsive" warnings

## Estimated effort: 3 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 10 — Production Realtime + Collaboration
═══════════════════════════════════════════════════════════════════════════

## Goal
Cutter + QC + Dispatcher see each other's work live. No more "didn't you see I did that?"

## Features
- Supabase Realtime channel on `production_pieces` filtered by company
- Live status badges that change color across screens within 1s
- "User X is editing this" indicator (presence)
- Toast notifications for cross-team events ("PSG returned 50 pieces")
- Optimistic UI updates (TanStack mutation onMutate)

## Files
- `src/services/realtimeService.ts` — extend from Sprint 2
- Each piece row has presence indicator
- New `usePiecePresence(pieceId)` hook

## Acceptance criteria
- [ ] User A marks piece QC-Passed → User B's screen updates in <1s
- [ ] Tempering inward by Dispatcher → Supervisor dashboard updates live
- [ ] Network blip → reconnects automatically, syncs missed events
- [ ] Presence indicator: see who else is on the same page

## Estimated effort: 4 days

## Dependencies
Sprint 2 (realtime infra), Sprint 3 (TanStack).

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 11 — Atomic Dispatch + Audit Log
═══════════════════════════════════════════════════════════════════════════

## Goal
Replace fragmented dispatch lifecycle with single event-sourced log. Close P0 outbound bugs.

## Migration 049 — Dispatch events table
```sql
CREATE TABLE IF NOT EXISTS dispatch_events (
  id BIGSERIAL PRIMARY KEY,
  dispatch_id TEXT NOT NULL,
  company TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- CREATED, PIECES_LOADED, AUTHORIZED, GATE_OUT, IN_TRANSIT, ARRIVED, RECEIVING, CLOSED
  event_data JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT,
  CONSTRAINT fk_dispatch_event_dispatch FOREIGN KEY (dispatch_id) 
    REFERENCES tempering_dispatches(id)
);

CREATE INDEX idx_dispatch_events_dispatch ON dispatch_events(dispatch_id, occurred_at);
CREATE INDEX idx_dispatch_events_company_date ON dispatch_events(company, occurred_at DESC);

-- Single piece in only one active dispatch
CREATE UNIQUE INDEX idx_pieces_active_dispatch 
  ON production_pieces(dispatch_id) 
  WHERE status IN ('Dispatched','Tempered','Received-From-Tempering') AND dispatch_id IS NOT NULL;

-- Vendor invoice 3-way match field
ALTER TABLE tempering_dispatches 
  ADD COLUMN IF NOT EXISTS vendor_invoice_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS vendor_invoice_no TEXT,
  ADD COLUMN IF NOT EXISTS three_way_match_status TEXT 
    CHECK (three_way_match_status IS NULL OR three_way_match_status IN ('Match','Mismatch','Pending'));

-- Gate pass mandatory before dispatch
ALTER TABLE tempering_dispatches 
  ADD COLUMN IF NOT EXISTS gate_pass_id TEXT REFERENCES gate_passes(id);
```

## Code changes
- New `modules/procurement/services/dispatchService.ts` — event-sourced lifecycle
- `postTemperingInwardGL` — partial inward support: post AP for received pieces immediately, defect ledger for broken
- `glasscoGLService.ts` — vendor invoice 3-way match (flag if delta > 5%)
- DispatchPlanner.tsx — gate pass required before status='Dispatched' (UI guard + DB constraint)

## Acceptance criteria
- [ ] Cannot mark dispatch 'Dispatched' without gate pass
- [ ] Single piece cannot be in 2 active dispatches (DB constraint)
- [ ] Vendor returns 9/10 → AP posts for 9, defect ledger for 1
- [ ] Vendor invoice mismatch >5% → flag for supervisor approval
- [ ] Reconciliation query: SELECT * FROM dispatch_events WHERE dispatch_id='X' shows full lifecycle

## Estimated effort: 5 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 12 — POD + Mobile Driver App
═══════════════════════════════════════════════════════════════════════════

## Goal
Customer experience 2/10 → 8/10. Eliminate "where is my truck" calls.

## Features
1. **Driver mobile screen** at `/#/driver/{tripId}` — works on any phone, no app install
2. **POD capture flow** — driver clicks customer → photo of delivered glass → digital signature → submit
3. **Customer OTP** — system sends OTP to customer mobile, driver enters it on his phone, gate-out proven
4. **Photo at gate-out** — security clicks photo of loaded truck before allowing exit
5. **WhatsApp notification** — auto-message to customer when truck dispatched

## Migrations
- `dispatch_photos` table (photos linked to dispatch_id)
- `customer_signatures` table (signature SVG/PNG)
- `delivery_otps` table

## Edge Functions
- `send-dispatch-whatsapp` — uses WhatsApp Business API or Twilio
- `generate-delivery-otp` — generates 6-digit OTP, sends to customer

## External SaaS (recommend buy not build)
- WhatsApp messaging: Twilio or Cloud API (~PKR 0.50/msg)
- SMS OTP: LMK Resources / Saysol (~PKR 0.30/SMS)

## Code
- `src/pages/DriverScreen.tsx` — mobile-first single page
- `src/components/SignaturePad.tsx` — touch signature capture
- `src/components/PhotoCapture.tsx` — camera API
- `modules/sales/components/DeliveryNotification.tsx` — config UI for WhatsApp templates

## Acceptance criteria
- [ ] Driver opens link → sees trip with pieces list → captures POD photo → signature → submit
- [ ] Customer receives WhatsApp 5 mins before truck leaves
- [ ] OTP delivered to customer phone, driver enters on his phone, dispatch confirmed
- [ ] All photos and signatures stored in Supabase Storage with 7-year retention

## Estimated effort: 5 days

## External costs
~PKR 25,000/month for 5-truck fleet (WhatsApp + SMS + storage).

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 13 — Smart Logistics Engine
═══════════════════════════════════════════════════════════════════════════

## Goal
Dispatcher saves 1-2 hours/day. Fuel costs drop 15-20%. Vendor SLAs measurable.

## Features
1. **Vehicle capacity validator** — load weight > capacity → block dispatch
2. **Multi-stop route optimizer** — Google Maps Distance Matrix → suggest visit order
3. **ETA prediction** — distance + historical avg + buffer
4. **Vendor SLA breach detector** — daily cron checks `expected_return_date < today`
5. **Trip profitability dashboard** — Charge minus (fuel + driver + tolls + maintenance)
6. **Failed delivery workflow** — customer absent → reschedule + credit-note workflow
7. **Empty-return optimizer** — when truck returns from PSG, suggest pickup en route
8. **Driver license/permit expiry alerts** — weekly check, toast on dispatch creation

## Files
- `modules/procurement/services/routeOptimizer.ts` — Google Maps integration
- `modules/procurement/services/vendorSLATracker.ts` — daily cron
- `modules/procurement/components/logistics/CapacityValidator.tsx`
- `modules/procurement/components/logistics/TripProfitability.tsx`

## External SaaS
- Google Maps Distance Matrix API (~PKR 0.20/call)
- TrackElite Pakistan or similar for GPS (Sprint 14 will use)

## Acceptance criteria
- [ ] Load 1.5T into 1T truck → blocked with toast
- [ ] 5-stop trip → optimized order shown vs original
- [ ] ETA shown to dispatcher + customer
- [ ] PSG dispatched 8 days ago, expected 5 → alert in supervisor inbox
- [ ] Trip P&L: Charge PKR 5000, Fuel 1500, Driver 800, Tolls 200, Maintenance 100 → Net 2400

## Estimated effort: 6 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 14 — Real-Time GPS + Live Dashboard
═══════════════════════════════════════════════════════════════════════════

## Goal
Hassan opens single dashboard, sees every truck in real-time.

## Features
1. **Driver GPS pings** — mobile app emits location every 5 min
2. **Live truck map** at `/#/dispatch/live` — supervisor sees all trucks at once
3. **Customer link** — customer gets URL to track their delivery
4. **Geofence alerts** — truck deviates >5km from route → alert
5. **Auto status update** — truck enters customer geofence → status auto='Arriving'

## Migration 050
```sql
CREATE TABLE IF NOT EXISTS vehicle_locations (
  vehicle_id TEXT NOT NULL,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  trip_id TEXT,
  PRIMARY KEY (vehicle_id, recorded_at)
);
CREATE INDEX idx_vehicle_locations_recent ON vehicle_locations(vehicle_id, recorded_at DESC);
```

## Files
- `src/pages/LiveDispatchMap.tsx` — Leaflet/Mapbox integration
- `modules/procurement/components/logistics/GeofenceAlert.tsx`
- Driver app emits location to `vehicle_locations` table

## External SaaS
- TrackElite Pakistan or Bro4u (~PKR 1500/vehicle/month) — physical GPS device
- OR: driver mobile app emits browser geolocation (free but driver must keep app open)

## Acceptance criteria
- [ ] All in-transit trucks visible on map at any moment
- [ ] Customer URL shows real-time truck location
- [ ] Truck enters customer 500m radius → status auto-updates
- [ ] Truck route deviation >5km → alert dispatcher

## Estimated effort: 5 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 15 — Production Workbench Foundation
═══════════════════════════════════════════════════════════════════════════

## Goal
Replace 19 production tabs + 12 sub-tabs with one URL: `/#/production/workbench`.

## Files
- New: `modules/production/companies/glassco/pages/Workbench.tsx`
- New: `modules/production/companies/glassco/components/workbench/SearchBar.tsx`
- New: `modules/production/companies/glassco/components/workbench/FilterChips.tsx`
- New: `modules/production/companies/glassco/components/workbench/ViewToggle.tsx`

## Layout
```
┌─────────────────────────────────────────────────────────────┐
│  🔍 Search: ___________  [Job: All▾] [Date: Today▾] [+more]│ ← Sticky filter
├──────────┬──────────────────────────────────────────────────┤
│ LENSES   │  CONTENT AREA (Kanban / List / Grid)             │
│ ▣ Today  │                                                  │
│ ▢ My job │  Empty state with reset button when no matches   │
│ ▢ Hold   │                                                  │
│ ▢ NCR    │                                                  │
│ ▢ PSG    │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

## Features
- Search bar (Cmd+K opens) — instant filter on piece code
- Filter chips: Job, Date, Mm, Vendor, Status (chips toggle on/off)
- View toggle: Kanban / List / Grid (saved per-user pref)
- Empty state with clear "no matches, reset filters" button
- Old tabs accessible via `/#/production/legacy/{tab}` for emergency (deprecate Sprint 19)

## Acceptance criteria
- [ ] Single URL replaces fabrication/processing/dispatch/ncr tabs for daily work
- [ ] Search by `GLS-PC-...` finds piece in <300ms
- [ ] Filter chips persist in URL (shareable links)
- [ ] View toggle saved per user

## Estimated effort: 4 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 16 — Kanban Board + Drag-Drop
═══════════════════════════════════════════════════════════════════════════

## Goal
Visual production state machine. Pieces as cards, columns as states.

## Features
- 6 columns: Cut → QC → Dispatched → Tempering → Ready → Delivered
- Drag piece card across columns → validates against PIECE_TRANSITIONS map (Sprint 5 RPC)
- Universal drop zones (always available): Hold / Broken / Returned
- Card density modes: Compact / Normal / Detailed
- Color coding: state badge + priority dot + age indicator (red >7 days)
- Bulk select: checkbox → selection count → bulk action button bottom
- Realtime: User A's drag → User B's screen updates in <1s

## Library
- `@dnd-kit/core` and `@dnd-kit/sortable` (modern, accessible, mobile-friendly)

## Files
- `modules/production/companies/glassco/components/workbench/KanbanBoard.tsx`
- `modules/production/companies/glassco/components/workbench/PieceCard.tsx`
- `modules/production/companies/glassco/components/workbench/BulkActionBar.tsx`

## Acceptance criteria
- [ ] Drag works on touch (tablet) and mouse
- [ ] Illegal transitions show red drop zone + reject toast
- [ ] Bulk select 50 pieces → "Move to Dispatched" → all move atomically
- [ ] Aging colors: green <3d, amber 3-7d, red >7d
- [ ] Realtime: 1s propagation across users

## Estimated effort: 5 days

## Dependencies
Sprint 5 (atomic piece updates), Sprint 10 (realtime), Sprint 15 (workbench shell).

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 17 — Slide-in Detail Panel
═══════════════════════════════════════════════════════════════════════════

## Goal
Click piece card → panel slides in from right (40% width). No tab nav, no modal.

## Features
- Click piece card → panel opens with: details, photos, history, actions
- Action buttons: Move to Next State / Hold / NCR / Print Tag / Add Photo
- History tab — full activity log (from Sprint 4 audit triggers)
- Stack: open multiple panels (Linear/Notion pattern)
- Keyboard: ESC closes, ←/→ navigates between selected pieces
- Animation: slide right→left, 200ms ease-out

## Library
- Custom (no animation lib needed, just CSS transition)

## Files
- `modules/production/companies/glassco/components/workbench/PieceDetailPanel.tsx`
- `modules/production/companies/glassco/components/workbench/PieceHistoryTab.tsx`

## Acceptance criteria
- [ ] Panel opens in <100ms
- [ ] Activity log shows last 20 events
- [ ] Action buttons trigger atomic RPCs from Sprint 5
- [ ] Mobile: panel becomes bottom sheet (full-width, swipe-down to close)

## Estimated effort: 3 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 18 — Role-Based Mini-Apps
═══════════════════════════════════════════════════════════════════════════

## Goal
Each role gets ONE optimized page. No tabs, no nav.

## Pages
1. **`/cutter`** — built in Sprint 6, polished here
2. **`/qc`** — built in Sprint 7, polished here
3. **`/dispatch`** — new
4. **`/supervisor`** — Workbench from Sprint 15-17 + aging alerts banner

## Dispatch Workbench layout
```
┌──────────────────────────────────────────┐
│  Filter: Ready to Dispatch | Today      │
├──────────────────────────────────────────┤
│  □ Select All  [Bulk: Load to Truck]    │
│                                          │
│  ☐ GLS-PC-153  Job: GT-SO-001 (DHA)    │
│  ☐ GLS-PC-154  Job: GT-SO-001 (DHA)    │
│  ☐ GLS-PC-155  Job: GT-SO-002 (Bahria)  │
│  ...                                     │
│                                          │
│  [Print Dispatch Slip]  [Scan Vehicle]   │
└──────────────────────────────────────────┘
```

## Acceptance criteria
- [ ] Each role lands on their dedicated page after login
- [ ] No global nav visible (just role title + sign-out)
- [ ] Cutter doesn't see Dispatch options, QC doesn't see Cutter session
- [ ] Supervisor sees aging alerts at top

## Estimated effort: 6 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 19 — Demolish Old Tabs
═══════════════════════════════════════════════════════════════════════════

## Goal
Cleanup. From 31 tabs → 1 page + 5 lenses.

## Removals
- Remove primary tabs: Fabrication, Processing, QC&Dispatch, NCR
- Move Performance, Energy, Labour, Finance Intel → `/reports`
- Move Data Import, AI Plan, Floor Planner → `/admin/data`
- Move BOM Master, Price Lists, Work Orders, Lead Kanban → `/sales` (already exist there)
- Cross Company Orders → `/md-dashboard`
- Add `/production/legacy/*` redirect for 30 days (deprecate after)

## Files
- Edit `App.tsx` route map
- Delete `GlasscoProduction.tsx` tab buttons (keep file for legacy routing)
- Update sidebar nav

## Acceptance criteria
- [ ] Old tab URLs redirect to new pages
- [ ] No 404s for any old links
- [ ] Sidebar nav shows 1 production item ("Workbench")
- [ ] After 30 days, drop legacy routes

## Estimated effort: 3 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 20 — Polish + Migration
═══════════════════════════════════════════════════════════════════════════

## Goal
User onboarding for new Workbench. Saved presets. Print/PDF reports.

## Features
- User onboarding tour (first-time use, with skip option) — `react-joyride` or similar
- Saved filter presets ("My Yesterday's Cuts", "PSG Returned Today")
- Bookmarkable URLs with filter state
- Print-to-PDF report from any view
- Keyboard shortcut cheat sheet (press `?`)

## Files
- `modules/production/companies/glassco/components/workbench/OnboardingTour.tsx`
- `modules/production/companies/glassco/components/workbench/FilterPresets.tsx`
- `modules/production/companies/glassco/components/workbench/ShortcutSheet.tsx`

## Acceptance criteria
- [ ] First-time user gets 5-step tour
- [ ] Save current filter as preset, reuse from sidebar
- [ ] Print any view to PDF (trial balance style report)
- [ ] `?` shows shortcut overlay

## Estimated effort: 3 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 21 — Global UX Foundations
═══════════════════════════════════════════════════════════════════════════

## Goal
Cross-cutting UX wins that benefit every module: search, breadcrumbs, clickable IDs, auto-save.

## Features
1. **Global search** — Postgres full-text on clients/invoices/orders/pieces/vendors. Cmd+K opens command palette.
2. **All entity IDs become clickable** — `clientId`, `orderId`, `invoiceId`, `pieceId` → `<Link to="/sales/clients/{id}">`
3. **Persistent breadcrumb** — every page header: `Sales > Quotations > GT-QUT-GLS-...`
4. **Auto-save drafts hook** — `useDraftAutoSave(key, data)` saves to localStorage every 10s, restores on reload
5. **Required field markers (*)** — sweep all forms

## Migration 051 — full-text search
```sql
ALTER TABLE clients   ADD COLUMN search_tsv tsvector;
ALTER TABLE invoices  ADD COLUMN search_tsv tsvector;
ALTER TABLE quotations ADD COLUMN search_tsv tsvector;

CREATE INDEX idx_clients_search    ON clients   USING GIN(search_tsv);
CREATE INDEX idx_invoices_search   ON invoices  USING GIN(search_tsv);
CREATE INDEX idx_quotations_search ON quotations USING GIN(search_tsv);

-- Trigger to maintain tsvector
CREATE FUNCTION update_clients_search() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english', 
    COALESCE(NEW.name,'') || ' ' || COALESCE(NEW.contact_person,'') || ' ' || 
    COALESCE(NEW.email,'') || ' ' || COALESCE(NEW.phone,'') || ' ' || COALESCE(NEW.id,'')
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_clients_search BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_clients_search();
-- Repeat for invoices, quotations
```

## Files
- `modules/shared/components/CommandPalette.tsx` — Cmd+K palette
- `modules/shared/components/Breadcrumbs.tsx`
- `modules/shared/hooks/useDraftAutoSave.ts`
- `modules/shared/components/EntityLink.tsx` — wraps IDs

## Acceptance criteria
- [ ] Cmd+K → search "INV-001" → jump to invoice in 2 sec
- [ ] Click client name in invoice → opens Client Master
- [ ] Tab close mid-form → reopens with restored draft
- [ ] All required fields show *
- [ ] Breadcrumb on every page

## Estimated effort: 4 days

## Dependencies
None. Highest leverage sprint.

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 22 — GlasscoEditor Rewrite
═══════════════════════════════════════════════════════════════════════════

## Goal
Single highest-ROI screen rewrite. Used 5x/day. Today: 1/10. Target: 8/10.

## Files
- New: `modules/glassco/core/GlasscoEditorUnified.tsx` (replaces MM + Inch dual)
- Delete: `GlasscoEditorMM.tsx`, `GlasscoEditorInch.tsx`
- Refactor: design upload, manual SqFt, wastage tab

## Design changes
1. **Item card pattern** — replace row-expand with cards (Linear/Notion style)
2. **MM/Inch toggle** — single component with unit switcher
3. **Sidebar slide-in for design upload** — uses Sprint 17 pattern
4. **Auto-save every 10s** — no more manual SqFt interrupt
5. **Field groups** with collapsible sections: Dimensions / Glass / Services / Pricing
6. **Mobile-first responsive** — 1 col phone, 2 col tablet, 3 col desktop
7. **Visible keyboard shortcut hints** — `?` shows overlay
8. **Wastage check moves to save action** — not interrupt during entry

## Acceptance criteria
- [ ] One unified editor handles MM + Inch
- [ ] Design upload accessible without modal nesting
- [ ] No interrupt modals during dimension entry
- [ ] Mobile usable at 375px
- [ ] Quotation creation: 30 min → 5 min for typical 10-item quote

## Estimated effort: 6 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 23 — MIGO + Requisition Wizards
═══════════════════════════════════════════════════════════════════════════

## Goal
Two biggest forms in system, redesigned as wizards.

## MIGO 3-step wizard
- Step 1: Header (vendor, date, ref, vehicle) — 6 fields
- Step 2: Line items + per-sheet inspection — expandable rows with inline edit
- Step 3: Charges (freight, crane, labour, packing) — 8 fields
- Progress bar at top, validation per step
- Auto-save between steps

## Requisitions split
- `RequisitionList` (just the table)
- `RequisitionForm` (creation/edit modal)
- `RequisitionApprovals` (release strategy queue)
- 1837-line monolith → 3 files of ~600 each

## Files
- Refactor `modules/procurement/components/inventory/GoodsReceiptMIGO.tsx`
- Split `modules/procurement/pages/Requisitions.tsx` into 3

## Acceptance criteria
- [ ] MIGO entry time: 20 min → 3 min for typical 10-line GRN
- [ ] Wizard prevents progressing with invalid data
- [ ] Requisitions.tsx removed; 3 new files together <2000 lines

## Estimated effort: 6 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 24 — Material Mgmt Restructure
═══════════════════════════════════════════════════════════════════════════

## Goal
13 tabs in InventoryModule → 5 tabs.

## Restructure
| Today | After |
|-------|-------|
| Stock / Master / Opening / Issuance / Consumption / Tools / Advances / Remnants / GRN Reg / Weight / MRP / Purchase Return | Stock / Master / Movements / GRN / Planning |

- **Stock** (with sub-filters: All / Low / Tools / Advances / Remnants)
- **Master** (Materials + Weight Master + Opening as sub-sections)
- **Movements** (Goods Issue + Purchase Return + Project Consumption)
- **GRN** (Glass GRN + Local Purchase + GRN Register)
- **Planning** (MRP — promoted to top-level button alongside GRN)

## Files
- Edit `modules/procurement/pages/InventoryModule.tsx`

## Acceptance criteria
- [ ] MRP reachable in 1 click (top-level button)
- [ ] No tab discoverability complaints from material planner
- [ ] Old tab IDs redirect to new locations

## Estimated effort: 4 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 25 — Finance Workbench
═══════════════════════════════════════════════════════════════════════════

## Goal
Build the missing accountant dashboard. Score 4 → 8.

## Features
- **`/finance/inbox`** — single page showing everything awaiting accountant action:
  - Parked JVs needing review
  - Parked PVs from approved requisitions
  - 3-way matching pending
  - Bank recon discrepancies
  - Aging > 90 days flagged
- **Trial Balance pagination** — 100 rows/page, search by code
- **Drill-down** — click GL account → all transactions in date range
- **AR Aging clickable** — click bucket → invoice list → click invoice → detail
- **GL code + name shown together** everywhere — `21151 GR/IR Glass Material`
- **Bank recon retry UX** — clear error message, allow column re-mapping

## Files
- New: `modules/finance/pages/FinanceInbox.tsx`
- Refactor: `modules/finance/components/TrialBalance.tsx` — add pagination
- Refactor: `modules/finance/components/ARAging.tsx` — make rows clickable
- Refactor: `modules/finance/components/BankReconciliation.tsx` — retry UX

## Acceptance criteria
- [ ] Accountant lands on `/finance/inbox` after login
- [ ] All "needs my action" items visible in <2s
- [ ] Trial balance with 5000 rows: paginated, no browser stall
- [ ] AR Aging click → drill to detail in <300ms

## Estimated effort: 5 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 26 — Mobile-First Sweep
═══════════════════════════════════════════════════════════════════════════

## Goal
Make every screen actually work on phones. Mobile UX 6 → 9.

## Sweep
- All form modals → bottom-sheet on mobile (slide up, swipe down to close)
- All tables → card view on mobile (each row becomes a card)
- Sticky action buttons at bottom of forms
- Touch targets 44px minimum (WCAG)
- Test every screen at 375px in Chrome DevTools
- Add `useMediaQuery` hook for responsive component switching

## Files
- New: `modules/shared/hooks/useMediaQuery.ts`
- New: `modules/shared/components/BottomSheet.tsx` (replaces Modal on mobile)
- New: `modules/shared/components/ResponsiveTable.tsx` (table → cards on mobile)
- Sweep: every form modal in codebase

## Acceptance criteria
- [ ] Every form usable at 375px (iPhone SE / Android entry-level)
- [ ] No horizontal scroll on any page (except wide reports with explicit toggle)
- [ ] All buttons ≥44px touch target
- [ ] Cutter, QC, Dispatcher can do their work entirely from phone

## Estimated effort: 5 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 27 — Security + Real RLS
═══════════════════════════════════════════════════════════════════════════

## Goal
Close cross-company data bleed. Replace permissive RLS (migration 026) with strict policies.

## Tasks
1. Audit every Supabase query — must filter by company
2. Replace migration 026's `USING (true)` policies with strict `USING (company IN allowed_companies)`
3. Audit `service_role` key usage — never expose to client
4. Verify Edge Functions check JWT before processing
5. Add rate limiting on login endpoint (Supabase Auth has this — confirm enabled)
6. Password policy: min 12 chars, uppercase + digit + special
7. Time-restricted roles enforcement at DB (not just UI hiding)
8. Penetration test scenarios (see below)

## Migration 052
```sql
-- Drop all permissive policies from migration 026
-- Replace with strict company isolation (see Sprint 4 migration 044)
-- Plus: deny anonymous access entirely except auth tables
```

## Pen-test scenarios
- [ ] Logged in as Glassco user — try `SELECT * FROM clients WHERE company='GTI'` → must return 0 rows
- [ ] Inspect `.env` — anon key should be public-safe (only RLS-gated reads possible)
- [ ] Brute force login: 100 attempts in 1 min → blocked
- [ ] Forge JWT → blocked
- [ ] Time-restricted user tries to access at 7am Sunday → blocked at DB

## Acceptance criteria
- [ ] All pen-test scenarios pass
- [ ] No `service_role` key in client bundle
- [ ] All policies use strict `auth.uid()` resolution

## Estimated effort: 3 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 28 — Pakistan GST + WHT Compliance
═══════════════════════════════════════════════════════════════════════════

## Goal
Avoid FBR penalties. Auto-compute WHT on payments. Generate compliant tax invoices and GST returns.

## Features
1. **Tax invoice format** (Sales Tax Act 1990 Rule 28):
   - "Tax Invoice / ٹیکس انوائس" header
   - NTN of seller + buyer, STRN of seller
   - Sequential invoice number (no gaps)
   - Date of issue
   - HS code per item
   - Description, qty, unit price
   - Total before tax + GST 17% + grand total
   - Total in words
   - Authorized signature line

2. **WHT auto-deduction at vendor payment**:
   - Vendor type → WHT % (e.g., resident services = 4.5%, goods = 5%, foreign = 7%)
   - On `postVendorPaymentGL`: post Dr AP / Cr Cash + Cr WHT Payable

3. **GST returns**:
   - Sales register (output tax) — date, invoice no, customer, taxable, GST, total
   - Purchase register (input tax) — date, GRN no, vendor, taxable, GST, total
   - Return summary — output - input = payable

4. **Unregistered vendor surcharge** — 17% extra GST when buying from unregistered

5. **Provincial Sales Tax** — Sindh SRB has SST. Different from FBR's GST.

6. **SRO 350 / 1190 etc** — industry-specific exemptions configurable per product.

## Migration 053
```sql
-- WHT rates per vendor type
CREATE TABLE wht_rates (
  vendor_type TEXT PRIMARY KEY,
  rate NUMERIC(5,2) NOT NULL,
  effective_from DATE NOT NULL,
  description TEXT
);

INSERT INTO wht_rates VALUES
  ('resident_services', 4.5, '2026-01-01', 'Section 153(1)(b)'),
  ('resident_goods', 5.0, '2026-01-01', 'Section 153(1)(a)'),
  ('non_resident', 7.0, '2026-01-01', 'Section 153(1)(c)'),
  ('unregistered', 8.0, '2026-01-01', 'higher rate');

-- Vendor type field
ALTER TABLE vendors ADD COLUMN wht_type TEXT REFERENCES wht_rates(vendor_type);
ALTER TABLE vendors ADD COLUMN registration_status TEXT DEFAULT 'unregistered';
ALTER TABLE vendors ADD COLUMN ntn TEXT, ADD COLUMN strn TEXT;

-- Tax tracking on invoices
ALTER TABLE invoices ADD COLUMN gst_payable NUMERIC(15,2) DEFAULT 0;
ALTER TABLE payment_receipts ADD COLUMN wht_amount NUMERIC(15,2) DEFAULT 0;
```

## Files
- `modules/finance/services/whtService.ts` — auto-compute WHT on payment
- `modules/finance/components/GSTReturn.tsx` — monthly return generator
- `modules/sales/components/prints/SalesInvoicePrint.tsx` — Pakistani format compliance
- `modules/finance/services/financeService.ts` — `postVendorPaymentGL` adds WHT entry

## Acceptance criteria
- [ ] Print invoice → all 10 legally required fields present
- [ ] Pay vendor PKR 100k (services, registered) → Dr AP 100k / Cr Cash 95.5k / Cr WHT Payable 4.5k
- [ ] Generate Feb-2026 sales register CSV → matches FBR upload format
- [ ] Buy from unregistered vendor → 17% extra GST auto-added

## Estimated effort: 4 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 29 — Reporting Pack (P&L / Balance Sheet / Cash Flow / GST Returns)
═══════════════════════════════════════════════════════════════════════════

## Goal
Build the reports CFOs and auditors need. Today: only Trial Balance. Target: 12+ reports.

## Reports to build
1. **P&L (Profit & Loss)** — month / quarter / year
   - Revenue (Service Income + Sales)
   - Direct costs (COGS = raw glass + labour + tempering)
   - Gross profit
   - Operating expenses (overheads from GL category 5x)
   - Operating profit
   - Other income/expense
   - Net profit
   - Comparison columns (vs last period, vs YoY)

2. **Balance Sheet** — point-in-time
   - Assets (Current + Fixed) by category
   - Liabilities (Current + Long-term) by category
   - Equity (Capital + Retained earnings + P&L)
   - Total = total

3. **Cash Flow Statement** — direct method
   - Operating activities
   - Investing activities
   - Financing activities
   - Net cash change

4. **GST Return** (already in Sprint 28, refine here)
5. **Tax Withholding Statement** (Form 165 ready format)
6. **Bank Reconciliation Report** — per bank account, monthly
7. **AR Aging by Client** — 0-30/31-60/61-90/90+ buckets, drill-down
8. **AP Aging by Vendor** — same structure
9. **Sales Analysis** — by client, by product, by region, by month
10. **Cutter Productivity Report** — sqft/hour, wastage trend, defect rate
11. **Vendor Scorecard** — on-time %, defect %, price variance
12. **Stock Aging** — slow-moving, dead stock, ABC analysis
13. **Project Profitability** — revenue - direct cost - allocated overhead

## Migration 054
```sql
-- Helper view for P&L roll-up
CREATE VIEW v_gl_pnl AS
SELECT 
  l.company,
  date_trunc('month', l.date) AS month,
  a.type, a.code, a.name,
  SUM(d.debit - d.credit) AS net
FROM ledger l
JOIN UNNEST(l.details) d ON true
JOIN accounts a ON a.id = d.account_id
WHERE l.status = 'Posted'
GROUP BY 1,2,3,4,5;

-- Other helper views: v_balance_sheet, v_cash_flow, v_ar_aging, etc.
```

## Files
- `modules/finance/pages/PnLReport.tsx`
- `modules/finance/pages/BalanceSheet.tsx`
- `modules/finance/pages/CashFlow.tsx`
- `modules/finance/pages/GSTReturn.tsx`
- `modules/finance/pages/ARAging.tsx`
- `modules/finance/pages/APAging.tsx`
- `modules/finance/pages/SalesAnalysis.tsx`
- `modules/production/pages/CutterPerformance.tsx`
- `modules/procurement/pages/VendorScorecard.tsx`
- `modules/procurement/pages/StockAging.tsx`
- `modules/sales/pages/ProjectProfitability.tsx`
- `modules/finance/components/ReportExport.tsx` — PDF/Excel export

## Acceptance criteria
- [ ] All 13 reports render in <3s for 1 month range
- [ ] Comparison columns (vs prev period, vs YoY)
- [ ] Drill-down from summary to detail (click row → transactions)
- [ ] Export to PDF + Excel for every report
- [ ] Auditor read-only mode shows full history

## Estimated effort: 5 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 30 — Opening Balance + Migration Wizards
═══════════════════════════════════════════════════════════════════════════

## Goal
Import historical data without breaking books. Run 2 systems in parallel for at most 1 month.

## Wizards
1. **Clients** — CSV with id/name/contact/credit_limit/opening_balance
2. **Vendors** — CSV with id/name/ntn/wht_type/opening_payable
3. **Products / Materials** — CSV with code/name/unit/rate/opening_qty/opening_value
4. **Open Invoices** — CSV with date/client/amount/balance (mark as opening)
5. **Open Bills** (vendor invoices) — CSV with date/vendor/amount/balance
6. **Stock Opening** — CSV per warehouse with material/qty/unit_value
7. **WIP at Vendor** (tempering pieces in transit) — CSV with vendor/piece_count/value
8. **GL Opening Balances** — TB CSV with account/debit/credit

## Pattern for each wizard
```
1. Upload CSV → preview validation
2. Show: rows valid (X), rows with errors (Y), rows that conflict with existing (Z)
3. User chooses: skip errors, replace conflicts, abort all
4. Click "Import" → atomic transaction
5. Each row tagged `is_opening_balance: true` → not double-counted in P&L
6. Rollback button (undo last import within 24h)
```

## Files
- `modules/admin/pages/MigrationCenter.tsx` — main page
- `modules/admin/components/migration/ClientImporter.tsx`
- `modules/admin/components/migration/VendorImporter.tsx`
- `modules/admin/components/migration/StockImporter.tsx`
- `modules/admin/components/migration/OpeningInvoiceImporter.tsx`
- `modules/admin/components/migration/GLOpeningImporter.tsx`
- `supabase/migrations/055_opening_balance_flag.sql`

## Migration 055
```sql
ALTER TABLE invoices ADD COLUMN is_opening BOOLEAN DEFAULT false;
ALTER TABLE ledger ADD COLUMN is_opening BOOLEAN DEFAULT false;
ALTER TABLE store_items ADD COLUMN opening_qty NUMERIC(15,2) DEFAULT 0;
ALTER TABLE store_items ADD COLUMN opening_value NUMERIC(15,2) DEFAULT 0;

-- Filter views to exclude opening from running totals
CREATE VIEW v_invoices_active AS SELECT * FROM invoices WHERE is_opening = false;
```

## Acceptance criteria
- [ ] Import 100 clients + 50 vendors + 20 invoices in <2 min
- [ ] Validation catches: duplicate IDs, invalid dates, negative amounts
- [ ] Rollback within 24h restores prior state
- [ ] Trial balance after import = imported opening TB

## Estimated effort: 4 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 31 — Audit Trail + Period Lock + Year-End Close
═══════════════════════════════════════════════════════════════════════════

## Goal
Auditor's first question: "Show me who modified invoice INV-001 in March." Currently unanswerable.

## Features
1. **Activity log** (already started Sprint 4) — full history per row
2. **"View History" button** on every invoice/quotation/payment
3. **Period lock** — close month → no entries dated before close (without admin override)
4. **Year-end procedure**:
   - Close all P&L accounts → transfer to retained earnings
   - Freeze prior year (no new entries)
   - Carryforward balances to new year
5. **Auditor read-only view** across all data with full history

## Migration 056
```sql
CREATE TABLE accounting_periods (
  id SERIAL PRIMARY KEY,
  company TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Open','Soft-Close','Hard-Close','Locked')),
  closed_by TEXT,
  closed_at TIMESTAMPTZ
);

-- Trigger to reject ledger inserts in closed periods
CREATE FUNCTION check_period_open() RETURNS TRIGGER AS $$
DECLARE p_status TEXT;
BEGIN
  SELECT status INTO p_status FROM accounting_periods 
    WHERE company = NEW.company AND NEW.date BETWEEN period_start AND period_end;
  IF p_status IN ('Hard-Close','Locked') THEN
    RAISE EXCEPTION 'Period is closed for entries dated %', NEW.date;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tr_ledger_period_check BEFORE INSERT OR UPDATE ON ledger
  FOR EACH ROW EXECUTE FUNCTION check_period_open();

-- Year-end close RPC
CREATE FUNCTION year_end_close(p_company TEXT, p_year INT) RETURNS JSONB AS $$
-- Roll up all P&L accounts → retained earnings
-- Mark period 'Hard-Close'
-- Return summary
$$ LANGUAGE plpgsql;
```

## Files
- `modules/finance/pages/PeriodClose.tsx` — close month UI
- `modules/finance/pages/YearEndClose.tsx` — year-end wizard
- `modules/finance/components/RowHistoryButton.tsx` — view history modal
- `modules/admin/pages/AuditorView.tsx` — read-only access

## Acceptance criteria
- [ ] Click "View History" on invoice → full change log
- [ ] Try posting JV dated last month after close → rejected
- [ ] Year-end close → P&L accounts zeroed, retained earnings credited
- [ ] Auditor login → read-only, sees all history

## Estimated effort: 3 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 32 — Backup + DR Strategy
═══════════════════════════════════════════════════════════════════════════

## Goal
The 4pm scenario: Supabase outage. Have a plan.

## Deliverables
1. **Daily snapshot via Supabase cron**: `SELECT erp_snapshot('Glassco', 'auto_DD')`
2. **Point-in-time recovery** enabled on Supabase paid plan (manual config — document)
3. **Local export script** — Node.js script downloads all data as JSON nightly via API → S3/local NAS
4. **Documented runbook** — `RUNBOOK_DISASTER_RECOVERY.md` in repo root
5. **Disaster drill scheduled** — simulate 4-hour outage, verify recovery

## Files
- New: `scripts/nightly-export.js` — runs via cron
- New: `RUNBOOK_DISASTER_RECOVERY.md` — step-by-step recovery
- Edit Supabase dashboard: enable PITR (paid feature, ~USD 25/month)

## Runbook contents
- Supabase status check URL
- Steps to switch app to "offline mode"
- localStorage data export to USB/email
- Restore from snapshot procedure
- Restore from PITR procedure
- Contact: Supabase support, Hassan, technical lead
- SLA expectations

## Acceptance criteria
- [ ] `erp_snapshot` runs daily at 2am via Supabase cron
- [ ] Local export creates dated `.json.gz` file nightly
- [ ] Runbook reviewed by Hassan, tested in dry-run
- [ ] Recovery from yesterday's snapshot < 30 min

## Estimated effort: 2 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 33 — Print Document Compliance
═══════════════════════════════════════════════════════════════════════════

## Goal
Every customer-facing document legally compliant.

## Documents to verify/fix
1. **Sales Tax Invoice** — Pakistan format compliance (Sprint 28 covered fields, here we polish presentation)
2. **Quotation** — validity dates, T&C, bank details
3. **Delivery Challan** — driver name, vehicle no, recipient signature line
4. **Service Order to Vendor** — vendor NTN field, terms
5. **Receipt** — proper acknowledgment format (revenue stamp space, signatures)
6. **Credit Note** — reasons code, original invoice ref, refund mode
7. **Vendor Bill payment voucher** — WHT certificate format
8. **Goods Received Note (GRN)** — internal stamp format
9. **Cutting Job Card** — clear dimensions, services, sheet refs (cutter-readable)

## Files
- All `modules/**/prints/*.tsx` — review and update
- New: `modules/shared/components/prints/PrintHeader.tsx` — common letterhead component
- New: `modules/shared/components/prints/PrintFooter.tsx` — bank details, T&C

## Acceptance criteria
- [ ] All 9 documents pass Pakistani legal format check
- [ ] Print preview at A4 + thermal receipt sizes
- [ ] Optional company logo upload (settings → branding)
- [ ] Bilingual (English + Urdu) toggle on customer-facing docs
- [ ] PDF export quality (300 DPI minimum)

## Estimated effort: 3 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 34 — Performance at Scale
═══════════════════════════════════════════════════════════════════════════

## Goal
6-month projection: 36k invoices, 10k pieces in flight, 5GB DB. Survive it.

## Tasks
1. Load test: insert 10k fake invoices → measure load time
2. Open trial balance with 5 years GL → fix if hangs
3. Add 100 production pieces in one batch → fix if chokes
4. localStorage size monitor — alert at 4MB (5MB limit)
5. Network panel audit — find pages transferring >2MB on load
6. N+1 query detection — fix common patterns
7. Add indexes on common WHERE columns (already mostly done)
8. Server-side pagination for all big lists (already started Sprint 9)
9. Code splitting per route (Vite default, verify config)

## Files
- New: `scripts/load-test.js` — generates fake data
- Edit: every list view to use server pagination
- Edit: every heavy import to be lazy-loaded
- New: `modules/admin/pages/HealthMetrics.tsx` — perf dashboard

## Acceptance criteria
- [ ] 10k invoices: load <2s
- [ ] 100 pieces save: <1s
- [ ] Initial app bundle: <500KB
- [ ] Trial balance with 50k rows: paginated, no stall
- [ ] localStorage at 4MB: user warned

## Estimated effort: 3 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 35 — Notifications + Alerts
═══════════════════════════════════════════════════════════════════════════

## Goal
Stop silent failures. Surface what needs attention.

## Features
1. **In-app notification center** — bell icon, badge count, dropdown panel
2. **Daily email digest** — configurable per user
3. **WhatsApp critical alerts** — vendor SLA breach, overdue receivable, stock out
4. **Configurable thresholds** per company
5. **Alerts:**
   - PR awaiting your approval since 3 days
   - Stock below reorder point
   - Tempering vendor not returned in 7 days
   - Invoice overdue 30 days
   - Cutter exceeded daily target (positive!)
   - GL imbalance detected (panic alert)
   - Failed Supabase sync queue >50 items

## Migration 057
```sql
CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  company TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
```

## Files
- `modules/shared/components/NotificationCenter.tsx`
- `modules/shared/services/notificationService.ts`
- `supabase/functions/daily-digest/` — Edge Function
- `modules/admin/pages/NotificationSettings.tsx` — thresholds config

## Acceptance criteria
- [ ] Bell icon shows unread count, opens panel
- [ ] Daily email at 8am with summary
- [ ] Critical alert (GL imbalance) → WhatsApp within 5 min
- [ ] Threshold config UI per company

## Estimated effort: 3 days

---

═══════════════════════════════════════════════════════════════════════════
# SPRINT 36 — Onboarding + Training Mode
═══════════════════════════════════════════════════════════════════════════

## Goal
New cutter joins → 1 day to learn (down from 2-3 weeks).

## Features
1. **Sample/demo data injector** — one click populates sandbox with 50 clients, 100 quotes, 200 pieces
2. **"Getting Started" wizard** per role on first login
3. **Inline tooltips** with `?` icons next to jargon ("MAP = Moving Average Price")
4. **Video walkthroughs** embedded (YouTube unlisted) — Hassan records, links per page
5. **Practice mode** — separate Supabase project, data resets at midnight
6. **Achievement system** — motivates trainee ("Completed first cutting session", "Generated 10 invoices")

## Migration 058 — Achievements
```sql
CREATE TABLE achievements (
  user_id UUID NOT NULL,
  achievement_code TEXT NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, achievement_code)
);
```

## Files
- `modules/onboarding/components/WelcomeTour.tsx` — `react-joyride`
- `modules/onboarding/components/JargonTooltip.tsx` — wraps any text
- `modules/onboarding/components/AchievementToast.tsx`
- `modules/admin/pages/SampleDataLoader.tsx`
- `modules/onboarding/pages/PracticeMode.tsx`

## Tooltip glossary
- MAP = Moving Average Price
- WIP = Work In Progress
- NCR = Non-Conformance Report
- GRN = Goods Received Note
- PO = Purchase Order
- PR = Purchase Requisition
- PV = Payment Voucher
- JV = Journal Voucher
- AR = Accounts Receivable (money customers owe us)
- AP = Accounts Payable (money we owe vendors)
- COGS = Cost Of Goods Sold
- GST = General Sales Tax (Pakistan 17%)
- WHT = Withholding Tax
- IFRS = International Financial Reporting Standards

## Acceptance criteria
- [ ] First-time login → tour starts automatically
- [ ] Hover any jargon → tooltip with plain English
- [ ] Practice mode resets nightly, separate from production data
- [ ] Sample data loads in 30 sec
- [ ] Achievement notifications on milestones

## Estimated effort: 4 days

---

## 🏁 GRAND TOTAL

| Phase | Sprints | Days |
|-------|---------|------|
| Foundation (multi-user safety) | 0-4 | 19 |
| Production engineering + UX | 5-10 | 24 |
| Outbound dispatch | 11-14 | 21 |
| One-window UX | 15-20 | 24 |
| Glassco UX sweep | 21-26 | 30 |
| Compliance | 27-28, 33 | 10 |
| Business-critical | 29-31 | 12 |
| Operational excellence | 32, 34-36 | 12 |
| **TOTAL** | **0-36** | **152 days** |

**~7-8 calendar months at 1 dev full-time.**

**End state:**
- UX: 4.4 → **8.5/10**
- Engineering: 5 → **8.5/10**
- Legal compliance: 4 → **9/10**
- Multi-user safety: 3 → **9/10**
- Cross-module: 5 → **9/10**

**OVERALL ERP RATING: 4.5/10 today → 8.7/10 after 7 months.**

---

## 📌 USAGE NOTES

1. **Each sprint is a standalone prompt** — copy-paste any section to a new Claude chat.
2. **Always include the STANDARD PROJECT PREAMBLE** at the top of the new chat.
3. **Sprints have dependencies** — listed in each. Don't skip foundational sprints (0-4).
4. **Suggested execution order:**
   - Week 1-2: Live with current build, watch for real issues
   - Week 3-4: Sprint 0 + 1 + 2 (multi-user safety foundation)
   - Week 5-7: Sprint 21 + 22 (highest UX leverage)
   - Week 8-10: Sprint 15-17 + 25 (workbench + finance inbox)
   - Week 11-14: Sprint 23-26 (forms + mobile)
   - Week 15-18: Sprint 11-14 + 18-20 (dispatch + role apps)
   - Week 19-24: Sprint 5-10 + 27-28 (production + compliance)
   - Year-end: Sprint 29-36 (reporting + ops)

5. **If only 3 sprints possible:**
   - **Sprint 21** (4 days) — highest leverage UX, instant +1 across modules
   - **Sprint 1** (3 days) — closes 6 P0 transaction bugs
   - **Sprint 27** (3 days) — closes security holes

6. **Roman Urdu prompts work** — Hassan's natural language is supported. Each sprint chat will translate as needed.

7. **End-of-sprint definition of done:**
   - Migration applied
   - Tests pass
   - Acceptance criteria met
   - Committed with proper message
   - Pushed to main
   - Smoke tested via preview

---

*End of sprint prompts. Total: 37 sprints, 152 days, complete roadmap to enterprise-grade Glassco ERP.*

*Generated: 2026-05-02*
