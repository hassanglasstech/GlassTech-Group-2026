-- 030_stock_ledger_bilty_weight.sql
-- Add bilty_weight_kg column to stock_ledger table
-- (transporter bilty weight, separate from our own line_weight_kg)

ALTER TABLE stock_ledger
  ADD COLUMN IF NOT EXISTS bilty_weight_kg NUMERIC(10,3) DEFAULT 0;
