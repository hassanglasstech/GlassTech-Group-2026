-- ═══════════════════════════════════════════════════════════════════════
-- Migration 021: Intercompany EDI (PO-to-SO) with Ripple Effect ETA
-- Atomic PO+SO generation via SECURITY DEFINER + trigger-based ETA sync
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Schema: Add EDI + ETA columns to purchase_orders ─────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS linked_internal_id   TEXT,
  ADD COLUMN IF NOT EXISTS current_eta          DATE,
  ADD COLUMN IF NOT EXISTS original_eta         DATE,
  ADD COLUMN IF NOT EXISTS priority_level       TEXT DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS eta_revision_reason  TEXT DEFAULT '';

-- ── 2. Schema: Add EDI + ETA columns to quotations ─────────────────
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS linked_po_id         TEXT,
  ADD COLUMN IF NOT EXISTS current_eta          DATE,
  ADD COLUMN IF NOT EXISTS original_eta         DATE,
  ADD COLUMN IF NOT EXISTS priority_level       TEXT DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS eta_revision_reason  TEXT DEFAULT '';

-- ── 3. Indexes for fast EDI lookups ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_po_linked_internal ON purchase_orders(linked_internal_id) WHERE linked_internal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qt_linked_po       ON quotations(linked_po_id) WHERE linked_po_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_priority        ON purchase_orders(priority_level) WHERE priority_level <> 'Normal';
CREATE INDEX IF NOT EXISTS idx_qt_priority        ON quotations(priority_level) WHERE priority_level <> 'Normal';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. RPC: generate_intercompany_order
--    SECURITY DEFINER — bypasses RLS for atomic cross-company write.
--    Creates a Buyer PO (status: Sent) + Seller SO (status: Draft) in
--    one transaction, cross-linked via linked_internal_id ↔ linked_po_id.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION generate_intercompany_order(
  p_buyer_company    TEXT,           -- e.g., 'GTK'
  p_seller_company   TEXT,           -- e.g., 'Glassco'
  p_items            JSONB,          -- [{description, qty, rate, specs}]
  p_total_amount     NUMERIC,
  p_category         TEXT DEFAULT 'Glass',
  p_project_name     TEXT DEFAULT '',
  p_delivery_date    TEXT DEFAULT NULL,
  p_priority         TEXT DEFAULT 'Normal',
  p_created_by       TEXT DEFAULT 'system'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id        TEXT;
  v_so_id        TEXT;
  v_date         TEXT;
  v_eta          DATE;
  v_now          TEXT;
  v_ts           TEXT;
BEGIN
  -- ── Validation ──
  IF p_buyer_company IS NULL OR p_seller_company IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Both buyer and seller companies required.');
  END IF;
  IF p_buyer_company = p_seller_company THEN
    RETURN jsonb_build_object('success', false, 'error', 'Buyer and seller cannot be the same company.');
  END IF;
  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Total amount must be greater than zero.');
  END IF;
  IF p_priority NOT IN ('Normal', 'High', 'Urgent') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Priority must be Normal, High, or Urgent.');
  END IF;

  -- ── Generate IDs ──
  v_date := to_char(now(), 'YYYY-MM-DD');
  v_now  := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_ts   := to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6);
  v_po_id := 'PO-ICO-' || p_buyer_company || '-' || v_ts;
  v_so_id := 'SO-ICO-' || p_seller_company || '-' || v_ts;
  v_eta   := COALESCE(p_delivery_date::date, (now() + interval '7 days')::date);

  -- ── LEG 1: Buyer PO ──
  INSERT INTO purchase_orders (id, company, data, linked_internal_id, current_eta, original_eta, priority_level)
  VALUES (
    v_po_id,
    p_buyer_company,
    jsonb_build_object(
      'id',              v_po_id,
      'fromCompany',     p_buyer_company,
      'toVendor',        p_seller_company,
      'toCompany',       p_seller_company,
      'date',            v_date,
      'status',          'Sent',
      'totalAmount',     p_total_amount,
      'category',        p_category,
      'projectId',       p_project_name,
      'items',           COALESCE(p_items, '[]'::jsonb),
      'deliveryDate',    to_char(v_eta, 'YYYY-MM-DD'),
      'isIntercompany',  true,
      'linkedInternalId', v_so_id,
      'currentEta',      to_char(v_eta, 'YYYY-MM-DD'),
      'originalEta',     to_char(v_eta, 'YYYY-MM-DD'),
      'priorityLevel',   p_priority,
      'etaRevisionReason', '',
      'createdBy',       p_created_by,
      'createdAt',       v_now
    ),
    v_so_id,
    v_eta,
    v_eta,
    p_priority
  );

  -- ── LEG 2: Seller SO (Quotation) ──
  INSERT INTO quotations (id, company, data, linked_po_id, current_eta, original_eta, priority_level)
  VALUES (
    v_so_id,
    p_seller_company,
    jsonb_build_object(
      'id',              v_so_id,
      'company',         p_seller_company,
      'clientId',        p_buyer_company,
      'clientName',      p_buyer_company,
      'projectName',     COALESCE(p_project_name, 'ICO Order from ' || p_buyer_company),
      'date',            v_date,
      'dueDate',         to_char(v_eta, 'YYYY-MM-DD'),
      'status',          'Draft',
      'items',           COALESCE(p_items, '[]'::jsonb),
      'serviceCharges',  '[]'::jsonb,
      'discountPercent',  0,
      'discountAmount',   0,
      'architect',       '',
      'site',            '',
      'subject',         'Intercompany Order from ' || p_buyer_company,
      'isIntercompany',  true,
      'linkedPOId',      v_po_id,
      'currentEta',      to_char(v_eta, 'YYYY-MM-DD'),
      'originalEta',     to_char(v_eta, 'YYYY-MM-DD'),
      'priorityLevel',   p_priority,
      'etaRevisionReason', '',
      'createdBy',       p_created_by,
      'createdAt',       v_now
    ),
    v_po_id,
    v_eta,
    v_eta,
    p_priority
  );

  RETURN jsonb_build_object(
    'success',    true,
    'poId',       v_po_id,
    'soId',       v_so_id,
    'eta',        to_char(v_eta, 'YYYY-MM-DD'),
    'priority',   p_priority
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM,
    'detail',  SQLSTATE
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Trigger: Ripple Effect ETA Sync
--    When GlassCo updates current_eta or priority_level on a linked SO,
--    the change automatically propagates to the buyer's PO.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_sync_intercompany_eta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire for linked intercompany quotations
  IF NEW.linked_po_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only fire if ETA or priority actually changed
  IF (OLD.current_eta IS NOT DISTINCT FROM NEW.current_eta)
     AND (OLD.priority_level IS NOT DISTINCT FROM NEW.priority_level)
  THEN
    RETURN NEW;
  END IF;

  -- ── Push ETA change to linked PO ──
  UPDATE purchase_orders
  SET
    current_eta         = NEW.current_eta,
    priority_level      = NEW.priority_level,
    eta_revision_reason = NEW.eta_revision_reason,
    data                = data
                          || jsonb_build_object('currentEta', to_char(NEW.current_eta, 'YYYY-MM-DD'))
                          || jsonb_build_object('priorityLevel', NEW.priority_level)
                          || jsonb_build_object('etaRevisionReason', COALESCE(NEW.eta_revision_reason, '')),
    updated_at          = now()
  WHERE id = NEW.linked_po_id;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if re-running
DROP TRIGGER IF EXISTS trg_sync_intercompany_eta ON quotations;

CREATE TRIGGER trg_sync_intercompany_eta
  AFTER UPDATE OF current_eta, priority_level, eta_revision_reason
  ON quotations
  FOR EACH ROW
  WHEN (NEW.linked_po_id IS NOT NULL)
  EXECUTE FUNCTION fn_sync_intercompany_eta();

-- ── 6. Grants ───────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION generate_intercompany_order TO authenticated;
