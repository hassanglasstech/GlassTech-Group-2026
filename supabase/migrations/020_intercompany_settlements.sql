-- ═══════════════════════════════════════════════════════════════════════
-- Migration 020: IFRS 10 / IAS 24 Intercompany Settlement Engine
-- ACID-compliant dual-ledger GL posting via SECURITY DEFINER RPCs
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Settlement ledger table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS intercompany_settlements (
  id              TEXT PRIMARY KEY,
  from_company    TEXT NOT NULL,                          -- payer (clears its ICO Payable)
  to_company      TEXT NOT NULL,                          -- payee (clears its ICO Receivable)
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  settlement_date TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  reference       TEXT DEFAULT '',                        -- cheque#, bank ref, etc.
  description     TEXT DEFAULT '',
  method          TEXT DEFAULT 'Bank Transfer',           -- Cash, Bank Transfer, Cheque
  from_gl_tx_id   TEXT NOT NULL,                          -- GL entry ref in payer's ledger
  to_gl_tx_id     TEXT NOT NULL,                          -- GL entry ref in payee's ledger
  status          TEXT NOT NULL DEFAULT 'Posted' CHECK (status IN ('Posted','Reversed')),
  settled_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ico_different_companies CHECK (from_company <> to_company)
);

CREATE INDEX IF NOT EXISTS idx_ico_settle_from  ON intercompany_settlements(from_company);
CREATE INDEX IF NOT EXISTS idx_ico_settle_to    ON intercompany_settlements(to_company);
CREATE INDEX IF NOT EXISTS idx_ico_settle_status ON intercompany_settlements(status);

-- Enable RLS (but RPCs use SECURITY DEFINER to bypass for cross-tenant writes)
ALTER TABLE intercompany_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY ico_settle_read ON intercompany_settlements FOR SELECT USING (true);
CREATE POLICY ico_settle_write ON intercompany_settlements FOR INSERT WITH CHECK (true);
CREATE POLICY ico_settle_update ON intercompany_settlements FOR UPDATE USING (true);

-- ── 2. Dynamic ICO Balance View ─────────────────────────────────────
-- Computes net position between each company pair from ledger JSONB data.
-- ICO accounts: 1220 = Intercompany Receivable, 2210 = Intercompany Payable
-- Ledger rows store full transaction inside data->details array.
CREATE OR REPLACE VIEW intercompany_balances AS
WITH ico_entries AS (
  SELECT
    l.company,
    l.id                                             AS tx_id,
    (l.data->>'status')                              AS tx_status,
    (l.data->>'description')                         AS tx_desc,
    detail->>'accountId'                             AS account_id,
    COALESCE((detail->>'debit')::numeric, 0)         AS debit,
    COALESCE((detail->>'credit')::numeric, 0)        AS credit
  FROM ledger l,
       jsonb_array_elements(l.data->'details') AS detail
  WHERE (l.data->>'status') = 'Posted'
    AND (
      detail->>'accountId' LIKE '%-1220%'
      OR detail->>'accountId' LIKE '%-122%'
      OR detail->>'accountId' LIKE '%-2210%'
      OR detail->>'accountId' LIKE '%-221%'
    )
),
receivables AS (
  SELECT
    company                                          AS from_company,
    SUM(debit) - SUM(credit)                         AS receivable_net
  FROM ico_entries
  WHERE account_id LIKE '%-122%'
  GROUP BY company
),
payables AS (
  SELECT
    company                                          AS to_company,
    SUM(credit) - SUM(debit)                         AS payable_net
  FROM ico_entries
  WHERE account_id LIKE '%-221%'
  GROUP BY company
)
SELECT
  COALESCE(r.from_company, p.to_company)             AS company,
  COALESCE(r.receivable_net, 0)::numeric(15,2)       AS total_receivable,
  COALESCE(p.payable_net, 0)::numeric(15,2)          AS total_payable,
  (COALESCE(r.receivable_net, 0) - COALESCE(p.payable_net, 0))::numeric(15,2)  AS net_position
FROM receivables r
FULL OUTER JOIN payables p ON r.from_company = p.to_company;

-- ── 3. Core RPC: Post Intercompany Settlement (ACID) ────────────────
-- SECURITY DEFINER: runs as DB owner, bypasses RLS for dual-company writes.
-- Posts 4 GL legs in one atomic transaction:
--   Payer:  Dr ICO-PAY (2210)  /  Cr Cash (11112)
--   Payee:  Dr Cash (11112)    /  Cr ICO-REC (1220)
CREATE OR REPLACE FUNCTION post_intercompany_settlement(
  p_from_company   TEXT,
  p_to_company     TEXT,
  p_amount         NUMERIC,
  p_reference      TEXT DEFAULT '',
  p_description    TEXT DEFAULT '',
  p_method         TEXT DEFAULT 'Bank Transfer',
  p_settled_by     TEXT DEFAULT 'system',
  p_date           TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settle_id    TEXT;
  v_from_tx_id   TEXT;
  v_to_tx_id     TEXT;
  v_date         TEXT;
  v_now          TEXT;
  v_from_pay_acc TEXT;
  v_from_cash_acc TEXT;
  v_to_cash_acc  TEXT;
  v_to_rec_acc   TEXT;
  v_desc_from    TEXT;
  v_desc_to      TEXT;
BEGIN
  -- ── Validation ──
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero.');
  END IF;
  IF p_from_company IS NULL OR p_to_company IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Both companies are required.');
  END IF;
  IF p_from_company = p_to_company THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot settle between the same company.');
  END IF;

  -- ── Generate IDs ──
  v_date       := COALESCE(p_date, to_char(now(), 'YYYY-MM-DD'));
  v_now        := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_settle_id  := 'ICO-SETTLE-' || to_char(now(), 'YYYYMMDD-HH24MISS-') || substr(md5(random()::text), 1, 4);
  v_from_tx_id := 'GL-' || v_settle_id || '-FROM';
  v_to_tx_id   := 'GL-' || v_settle_id || '-TO';

  -- ── Build account IDs (pattern: {company}-{code}) ──
  v_from_pay_acc  := p_from_company || '-2210';   -- Payer's ICO Payable
  v_from_cash_acc := p_from_company || '-11112';  -- Payer's Cash
  v_to_cash_acc   := p_to_company   || '-11112';  -- Payee's Cash
  v_to_rec_acc    := p_to_company   || '-1220';   -- Payee's ICO Receivable

  v_desc_from := '[ICO-SETTLE] Payment to ' || p_to_company || ': ' || COALESCE(p_description, 'Intercompany Settlement');
  v_desc_to   := '[ICO-SETTLE] Receipt from ' || p_from_company || ': ' || COALESCE(p_description, 'Intercompany Settlement');

  -- ── Ensure GL accounts exist in accounts table ──
  INSERT INTO accounts (id, company, data) VALUES
    (v_from_pay_acc,  p_from_company, jsonb_build_object('code','2210','name','Intercompany Payable','level',3,'type','Liability')),
    (v_from_cash_acc, p_from_company, jsonb_build_object('code','11112','name','Cash in Hand — Main','level',3,'type','Asset')),
    (v_to_cash_acc,   p_to_company,   jsonb_build_object('code','11112','name','Cash in Hand — Main','level',3,'type','Asset')),
    (v_to_rec_acc,    p_to_company,   jsonb_build_object('code','1220','name','Intercompany Receivable','level',3,'type','Asset'))
  ON CONFLICT (id) DO NOTHING;

  -- ── LEG 1: Payer GL (from_company) ──
  --   Dr: ICO Payable (2210)   → clears payable
  --   Cr: Cash (11112)         → cash going out
  INSERT INTO ledger (id, company, data) VALUES (
    v_from_tx_id,
    p_from_company,
    jsonb_build_object(
      'id',           v_from_tx_id,
      'company',      p_from_company,
      'docType',      'JV',
      'docDate',      v_date,
      'date',         v_date,
      'description',  v_desc_from,
      'referenceId',  v_settle_id,
      'status',       'Posted',
      'createdBy',    'system-auto',
      'postedAt',     v_now,
      'details',      jsonb_build_array(
        jsonb_build_object('accountId', v_from_pay_acc,  'debit', p_amount, 'credit', 0, 'text', 'Clear ICO Payable to ' || p_to_company),
        jsonb_build_object('accountId', v_from_cash_acc, 'debit', 0, 'credit', p_amount, 'text', p_method || ' — ' || COALESCE(p_reference, ''))
      )
    )
  );

  -- ── LEG 2: Payee GL (to_company) ──
  --   Dr: Cash (11112)              → cash coming in
  --   Cr: ICO Receivable (1220)     → clears receivable
  INSERT INTO ledger (id, company, data) VALUES (
    v_to_tx_id,
    p_to_company,
    jsonb_build_object(
      'id',           v_to_tx_id,
      'company',      p_to_company,
      'docType',      'JV',
      'docDate',      v_date,
      'date',         v_date,
      'description',  v_desc_to,
      'referenceId',  v_settle_id,
      'status',       'Posted',
      'createdBy',    'system-auto',
      'postedAt',     v_now,
      'details',      jsonb_build_array(
        jsonb_build_object('accountId', v_to_cash_acc, 'debit', p_amount, 'credit', 0, 'text', 'Receipt from ' || p_from_company),
        jsonb_build_object('accountId', v_to_rec_acc,  'debit', 0, 'credit', p_amount, 'text', 'Clear ICO Receivable from ' || p_from_company)
      )
    )
  );

  -- ── Settlement record ──
  INSERT INTO intercompany_settlements (
    id, from_company, to_company, amount, settlement_date,
    reference, description, method, from_gl_tx_id, to_gl_tx_id,
    status, settled_by
  ) VALUES (
    v_settle_id, p_from_company, p_to_company, p_amount, v_date,
    p_reference, p_description, p_method, v_from_tx_id, v_to_tx_id,
    'Posted', p_settled_by
  );

  RETURN jsonb_build_object(
    'success',      true,
    'settlementId', v_settle_id,
    'fromGlTxId',   v_from_tx_id,
    'toGlTxId',     v_to_tx_id,
    'amount',       p_amount
  );

EXCEPTION WHEN OTHERS THEN
  -- Full rollback on any failure (PG auto-rollback on exception in plpgsql)
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM,
    'detail',  SQLSTATE
  );
END;
$$;

-- ── 4. Reversal RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reverse_intercompany_settlement(
  p_settlement_id  TEXT,
  p_reversed_by    TEXT DEFAULT 'system'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec             RECORD;
  v_rev_from_tx_id  TEXT;
  v_rev_to_tx_id    TEXT;
  v_now             TEXT;
  v_date            TEXT;
  v_from_pay_acc    TEXT;
  v_from_cash_acc   TEXT;
  v_to_cash_acc     TEXT;
  v_to_rec_acc      TEXT;
BEGIN
  -- ── Find original settlement ──
  SELECT * INTO v_rec FROM intercompany_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement not found: ' || p_settlement_id);
  END IF;
  IF v_rec.status = 'Reversed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement already reversed.');
  END IF;

  v_now  := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_date := to_char(now(), 'YYYY-MM-DD');
  v_rev_from_tx_id := 'GL-REV-' || p_settlement_id || '-FROM';
  v_rev_to_tx_id   := 'GL-REV-' || p_settlement_id || '-TO';

  v_from_pay_acc  := v_rec.from_company || '-2210';
  v_from_cash_acc := v_rec.from_company || '-11112';
  v_to_cash_acc   := v_rec.to_company   || '-11112';
  v_to_rec_acc    := v_rec.to_company   || '-1220';

  -- ── Reversal LEG 1: Payer (restore payable, refund cash) ──
  INSERT INTO ledger (id, company, data) VALUES (
    v_rev_from_tx_id,
    v_rec.from_company,
    jsonb_build_object(
      'id',           v_rev_from_tx_id,
      'company',      v_rec.from_company,
      'docType',      'RV',
      'docDate',      v_date,
      'date',         v_date,
      'description',  '[ICO-REVERSAL] Reverse settlement ' || p_settlement_id || ' to ' || v_rec.to_company,
      'referenceId',  p_settlement_id,
      'status',       'Posted',
      'createdBy',    'system-auto',
      'postedAt',     v_now,
      'details',      jsonb_build_array(
        jsonb_build_object('accountId', v_from_cash_acc, 'debit', v_rec.amount, 'credit', 0, 'text', 'Refund cash — settlement reversal'),
        jsonb_build_object('accountId', v_from_pay_acc,  'debit', 0, 'credit', v_rec.amount, 'text', 'Restore ICO Payable to ' || v_rec.to_company)
      )
    )
  );

  -- ── Reversal LEG 2: Payee (restore receivable, return cash) ──
  INSERT INTO ledger (id, company, data) VALUES (
    v_rev_to_tx_id,
    v_rec.to_company,
    jsonb_build_object(
      'id',           v_rev_to_tx_id,
      'company',      v_rec.to_company,
      'docType',      'RV',
      'docDate',      v_date,
      'date',         v_date,
      'description',  '[ICO-REVERSAL] Reverse settlement ' || p_settlement_id || ' from ' || v_rec.from_company,
      'referenceId',  p_settlement_id,
      'status',       'Posted',
      'createdBy',    'system-auto',
      'postedAt',     v_now,
      'details',      jsonb_build_array(
        jsonb_build_object('accountId', v_to_rec_acc,  'debit', v_rec.amount, 'credit', 0, 'text', 'Restore ICO Receivable from ' || v_rec.from_company),
        jsonb_build_object('accountId', v_to_cash_acc, 'debit', 0, 'credit', v_rec.amount, 'text', 'Return cash — settlement reversal')
      )
    )
  );

  -- ── Mark original as reversed ──
  UPDATE intercompany_settlements
  SET status = 'Reversed', updated_at = now()
  WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'success',        true,
    'settlementId',   p_settlement_id,
    'reversalFromTx', v_rev_from_tx_id,
    'reversalToTx',   v_rev_to_tx_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM,
    'detail',  SQLSTATE
  );
END;
$$;

-- ── 5. Grant execute to authenticated users ─────────────────────────
GRANT EXECUTE ON FUNCTION post_intercompany_settlement    TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_intercompany_settlement TO authenticated;
GRANT SELECT ON intercompany_balances TO authenticated;
