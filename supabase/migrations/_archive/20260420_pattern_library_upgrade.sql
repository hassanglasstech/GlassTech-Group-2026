-- ═══════════════════════════════════════════════════════════════════
-- Migration: Pattern Library Upgrade — add company scope + seed data
-- Date: 2026-04-20
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Add company + is_global columns ───────────────────────────────
ALTER TABLE pattern_library
  ADD COLUMN IF NOT EXISTS company   TEXT NOT NULL DEFAULT 'GlassCo',
  ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_pattern_company ON pattern_library (company);

-- ── 2. Seed 8 core patterns ─────────────────────────────────────────
INSERT INTO pattern_library (event_id, trigger_keywords, category, label, color, modules_involved, workflow_steps, confidence, defined_by, company, is_global) VALUES

('EVT-ATTEND', ARRAY['late','absent','chutti','leave','hajri','attendance','nahi aaya','half day','sick','aaj nahi aaya'],
 'attendance', 'Staff Attendance Update', '#EAB308', ARRAY['HR'],
 '[{"step":1,"module":"HR","action":"Log attendance status","tool":"log_factory_event","fields":{"sector":"HR","event_type":"Attendance","priority":"Low"},"gl_flag":false,"requires_approval":false}]'::jsonb,
 0.92, 'system', 'GlassCo', true),

('EVT-GRN', ARRAY['maal aaya','shipment','delivery aai','truck aaya','GRN','goods received','vendor ne bheja','glass aaya','sheets aayi'],
 'grn_inward', 'GRN Material Inward', '#22C55E', ARRAY['Purchase','Store','QC'],
 '[{"step":1,"module":"Purchase","action":"Verify against PO","tool":"purchase_order_status","fields":{},"gl_flag":false,"requires_approval":false},{"step":2,"module":"Store","action":"Update stock","tool":"stock_status","fields":{},"gl_flag":false,"requires_approval":false},{"step":3,"module":"QC","action":"Create inspection lot","tool":"log_factory_event","fields":{"sector":"Store","event_type":"GRN Received","priority":"Medium"},"gl_flag":true,"requires_approval":true}]'::jsonb,
 0.93, 'system', 'GlassCo', true),

('EVT-LOCAL', ARRAY['khareed','purchase','buy','lelo','mangao','vendor se','local purchase','bazaar se'],
 'local_purchase', 'Local Vendor Purchase', '#8B5CF6', ARRAY['Purchase','Finance'],
 '[{"step":1,"module":"Purchase","action":"Create requisition","tool":"create_requisition","fields":{"category":"Store","priority":"Normal"},"gl_flag":false,"requires_approval":true},{"step":2,"module":"Finance","action":"Process payment","tool":"draft_payment_voucher","fields":{},"gl_flag":true,"requires_approval":true}]'::jsonb,
 0.88, 'system', 'GlassCo', true),

('EVT-CASH', ARRAY['kharcha','expense','petty cash','paisa diya','bill','receipt','chai pani','riksha','fuel','diesel'],
 'cash_expense', 'Petty Cash Expense', '#06B6D4', ARRAY['Finance'],
 '[{"step":1,"module":"Finance","action":"Record petty cash entry","tool":"log_factory_event","fields":{"sector":"Office","event_type":"Petty Cash","priority":"Low"},"gl_flag":true,"requires_approval":false}]'::jsonb,
 0.94, 'system', 'GlassCo', true),

('EVT-CUT', ARRAY['kaam lga do','cutting shuru','order assign','table pe lga do','kaatna hai','kaat do','cutting start'],
 'production_table_assign', 'Cutting Job Assignment', '#6366F1', ARRAY['Production'],
 '[{"step":1,"module":"Production","action":"Verify order and stock","tool":"floor_status","fields":{},"gl_flag":false,"requires_approval":false},{"step":2,"module":"Production","action":"Assign to cutting table","tool":"log_factory_event","fields":{"sector":"Production","event_type":"Cutting Assignment","priority":"Medium"},"gl_flag":false,"requires_approval":false}]'::jsonb,
 0.92, 'system', 'GlassCo', true),

('EVT-NCR', ARRAY['toot gaya','shesha toot','broken','crack','tuta','NCR','breakage','chip ho gaya','defect'],
 'ncr_breakage', 'Piece Breakage / NCR', '#DC2626', ARRAY['Production','QC','Finance'],
 '[{"step":1,"module":"QC","action":"Log NCR","tool":"log_factory_event","fields":{"sector":"Production","event_type":"NCR - Glass Breakage","priority":"Urgent"},"gl_flag":false,"requires_approval":false},{"step":2,"module":"Production","action":"Decide action","tool":"ncr_report","fields":{"query":"aaj"},"gl_flag":false,"requires_approval":true}]'::jsonb,
 0.95, 'system', 'GlassCo', true),

('EVT-DLVR', ARRAY['dispatch','bhejo','delivery','gate pass','truck load','nikal do','client ko','ready hai'],
 'delivery_update', 'Delivery Dispatch', '#10B981', ARRAY['Production','Logistics','Sales'],
 '[{"step":1,"module":"Production","action":"Verify pieces ready","tool":"delivery_status","fields":{},"gl_flag":false,"requires_approval":false},{"step":2,"module":"Logistics","action":"Create gate pass","tool":"log_factory_event","fields":{"sector":"Logistics","event_type":"Dispatch","priority":"Medium"},"gl_flag":false,"requires_approval":true},{"step":3,"module":"Sales","action":"Update status","tool":"update_order_status","fields":{"doc_type":"job_order","status":"Dispatched"},"gl_flag":false,"requires_approval":true}]'::jsonb,
 0.89, 'system', 'GlassCo', true),

('EVT-VPAY', ARRAY['vendor payment','supplier payment','vendor ko pay','bill pay','vendor ka paisa'],
 'vendor_payment', 'Vendor Payment', '#F59E0B', ARRAY['Finance'],
 '[{"step":1,"module":"Finance","action":"Check vendor balance","tool":"get_vendor_balance","fields":{},"gl_flag":false,"requires_approval":false},{"step":2,"module":"Finance","action":"Draft payment voucher","tool":"draft_payment_voucher","fields":{},"gl_flag":true,"requires_approval":true}]'::jsonb,
 0.87, 'system', 'GlassCo', true)

ON CONFLICT (event_id) DO UPDATE SET
  trigger_keywords = EXCLUDED.trigger_keywords,
  workflow_steps = EXCLUDED.workflow_steps,
  company = EXCLUDED.company,
  is_global = EXCLUDED.is_global,
  updated_at = now();
