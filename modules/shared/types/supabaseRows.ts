/**
 * supabaseRows.ts — Phase 0 Round 2 Type Safety
 *
 * Typed shapes for raw Supabase row data returned from `.select('*')`.
 * Each table has a flat-columns + JSONB `data` blob. These interfaces
 * model that shape so service-layer map callbacks can stop using `any`.
 *
 * Pattern:
 *   const { data } = await supabase.from('clients').select('*');
 *   const rows = (data ?? []) as SbClientRow[];
 *   const mapped: Client[] = rows.map(r => ({ id: r.id, name: r.name ?? '' }));
 */

// ── Generic JSONB blob — most tables have one ────────────────────────────────
export type SbJsonb = Record<string, unknown>;

// ── Shared base — every row has these ────────────────────────────────────────
export interface SbBaseRow {
  id:          string;
  company:     string;
  data?:       SbJsonb | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// ── clients table ────────────────────────────────────────────────────────────
export interface SbClientRow extends SbBaseRow {
  name?:           string | null;
  contact_person?: string | null;
  email?:          string | null;
  phone?:          string | null;
  address?:        string | null;
  ntn?:            string | null;
  credit_limit?:   number | null;
  status?:         string | null;
}

// ── products table (extended — covers all flat columns added by migrations) ──
export interface SbProductRow extends SbBaseRow {
  name?:            string | null;
  category?:        string | null;
  description?:     string | null;
  thickness?:       string | null;
  unit?:            string | null;
  rate_per_unit?:   number | null;
  tempering_rate?:  number | null;
  glass_type?:      string | null;
  active?:          boolean | null;
  // GTK / Nippon product fields
  service_nick?:    string | null;
  profile_code?:    string | null;
  sheet_size?:      string | null;
  cost_price?:      number | null;
  base_price?:      number | null;
  tempering_price?: number | null;
  variants?:        SbJsonb | SbJsonb[] | null;
  model_no?:        string | null;
  brand?:           string | null;
  main_category?:   string | null;
  sub_category?:    string | null;
  finish_color?:    string | null;
  material?:        string | null;
  direction?:       string | null;
  tongue_length?:   string | null;
  spindle_length?:  string | null;
  image_url?:       string | null;
  hs_code?:         string | null;
  is_set?:          boolean | null;
  set_components?:  SbJsonb[] | null;
  technical_specs?: SbJsonb | null;
  width?:           number | null;
  height?:          number | null;
  frame_color?:     string | null;
  mesh_color?:      string | null;
  sub_description?: string | null;
  nick_name?:       string | null;
}

// ── quotations table ─────────────────────────────────────────────────────────
export interface SbQuotationRow extends SbBaseRow {
  quote_number?:  string | null;
  client_id?:     string | null;
  client_name?:   string | null;
  date?:          string | null;
  due_date?:      string | null;
  status?:        string | null;
  items?:         SbJsonb[] | null;
  subtotal?:      number | null;
  discount?:      number | null;
  gst?:           number | null;
  grand_total?:   number | null;
}

// ── invoices table ───────────────────────────────────────────────────────────
export interface SbInvoiceRow extends SbBaseRow {
  invoice_number?:  string | null;
  order_id?:        string | null;
  client_id?:       string | null;
  client_name?:     string | null;
  date?:            string | null;
  due_date?:        string | null;
  status?:          string | null;
  items?:           SbJsonb[] | null;
  total_amount?:    number | null;
  received_amount?: number | null;
  balance?:         number | null;
}

// ── vendors table ────────────────────────────────────────────────────────────
export interface SbVendorRow extends SbBaseRow {
  name?:         string | null;
  type?:         string | null;
  contact?:      string | null;
  phone?:        string | null;
  email?:        string | null;
  address?:      string | null;
  payment_terms?: string | null;
}

// ── projects table ───────────────────────────────────────────────────────────
export interface SbProjectRow extends SbBaseRow {
  name?:        string | null;
  client_id?:   string | null;
  status?:      string | null;
  start_date?:  string | null;
  end_date?:    string | null;
}

// ── payment_receipts ─────────────────────────────────────────────────────────
export interface SbPaymentReceiptRow extends SbBaseRow {
  invoice_id?: string | null;
  date?:       string | null;
  amount?:     number | null;
  method?:     string | null;
  reference?:  string | null;
}

// ── credit_notes table ───────────────────────────────────────────────────────
export interface SbCreditNoteRow extends SbBaseRow {
  cn_number?:  string | null;
  invoice_id?: string | null;
  client_id?:  string | null;
  date?:       string | null;
  amount?:     number | null;
  reason?:     string | null;
  status?:     string | null;
}

// ── Loose row for tables without a strict schema (JSONB-primary) ─────────────
// Use for generic CRUD functions (credit_notes, customer_complaints, price_lists,
// work_orders, leads, etc.) instead of `any[]`.
export interface SbLooseRow {
  id: string;
  company: string;
  [key: string]: unknown;
}

// ── Helper accessors — narrow unknown JSONB fields safely ────────────────────
export const sbStr = (v: unknown, fallback = ''): string =>
  v === null || v === undefined ? fallback : String(v);

export const sbNum = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const sbBool = (v: unknown, fallback = false): boolean => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return /^(true|yes|1|y)$/i.test(v);
  return Boolean(v);
};

export const sbObj = (v: unknown): SbJsonb =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as SbJsonb) : {};

export const sbArr = <T = SbJsonb>(v: unknown): T[] =>
  Array.isArray(v) ? (v as T[]) : [];
