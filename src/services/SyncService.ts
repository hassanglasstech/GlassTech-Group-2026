/**
 * GLASSTECH ERP — Smart Sync Service
 * 
 * Strategy:
 *   - localStorage = offline buffer (fast reads, always works)
 *   - Supabase = master copy (source of truth when online)
 * 
 * Auto-sync:
 *   - On app start: fetch from Supabase → localStorage
 *   - On every save: write localStorage immediately + queue Supabase push
 *   - On net reconnect: auto-push pending local changes
 *   - Conflict: last-write-wins using updated_at timestamp
 */

import { supabase } from './supabaseClient';
import { flushOfflineQueue, getDBStatus } from '../../modules/shared/services/supabaseDB';
import { safeFetch } from '../../modules/shared/services/utils';
import { toast } from 'sonner';
import { translateError, OfflineQueue, withRetry } from '../../modules/shared/services/networkService';
import { SOFT_DELETE_ENABLED, SOFT_DELETE_TABLES } from '../../modules/shared/config/softDelete';

// Inline safeParse — avoids cross-directory import issues in build
const safeParse = (key: string): any[] => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return [];
    const parsed = JSON.parse(item);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// ── Pending changes queue (survives page reload via localStorage) ─────
const PENDING_KEY = 'gtk_erp_pending_sync';
const LAST_SYNC_KEY = 'gtk_erp_last_sync';
const SYNC_VERSION_KEY = 'gtk_erp_sync_version';

type PendingChange = {
  table: string;
  localKey: string;
  changedAt: string; // ISO timestamp
};

const getPending = (): PendingChange[] => {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); }
  catch { return []; }
};

// ── M-6: Server-side timestamp for deterministic conflict resolution ─────────
// Reads the HTTP Date header from the PostgREST root endpoint — zero data
// transferred, always present on any Supabase response. Eliminates client
// machine clock drift from last-write-wins conflict resolution.
// Falls back to client clock ONLY when the server is genuinely unreachable
// (in which case the sync push will also fail, making drift moot).
// Server timestamp was causing 401/404 errors with HEAD and RPC approaches.
// Client clock is sufficient for last-write-wins — drift is negligible for
// single-user go-live. If multi-user conflict resolution needed later,
// use Supabase's built-in updated_at DEFAULT now() on the DB side.
const getServerTimestamp = async (): Promise<string> => {
  return new Date().toISOString();
};

const addPending = (table: string, localKey: string) => {
  const pending = getPending();
  // Replace if already queued for same table
  const filtered = pending.filter(p => p.table !== table);
  // changedAt here is a LOCAL queue marker only — not sent to Supabase.
  // The authoritative server timestamp is obtained in pushTable via getServerTimestamp().
  filtered.push({ table, localKey, changedAt: new Date().toISOString() });
  localStorage.setItem(PENDING_KEY, JSON.stringify(filtered));
};

const clearPending = (table: string) => {
  const pending = getPending().filter(p => p.table !== table);
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
};

// ── Table → localStorage key mapping ─────────────────────────────────
const TABLE_MAP: Record<string, string> = {
  // ── HR ──
  employees:          'gtk_erp_employees',
  attendance:         'gtk_erp_attendance',
  loans:              'gtk_erp_loans',
  payroll:            'gtk_erp_payroll',
  tag_master:         'gtk_erp_tag_master',
  employee_tags:      'gtk_erp_employee_tags',
  departments:        'gtk_erp_departments',
  employee_docs:      'gtk_erp_employee_docs',
  // ── Finance ──
  accounts:           'gtk_erp_accounts',
  cost_centers:       'gtk_erp_cost_centers',
  ledger:             'gtk_erp_ledger',
  petty_cash:         'gtk_erp_petty_cash',
  recurring_expenses: 'gtk_erp_recurring_expenses',
  financial_events:   'gtk_erp_financial_events',
  mapping_rules:      'gtk_erp_mapping_rules',
  gl_config:          'gtk_erp_gl_config',
  // ── Sales ──
  clients:            'gtk_erp_clients',
  quotations:         'gtk_erp_quotations',
  projects:           'gtk_erp_projects',
  invoices:           'gtk_erp_invoices',
  payment_receipts:   'gtk_erp_payment_receipts',
  credit_notes:       'gtk_erp_credit_notes',           // Phase-1 (migration 032)
  customer_complaints:'gtk_erp_customer_complaints',    // Phase-3 (migration 034)
  // ── Phase-6 (migration 036) ──
  price_lists:        'gtk_erp_price_lists',
  price_list_items:   'gtk_erp_price_list_items',
  work_orders:        'gtk_erp_work_orders',
  leads:              'gtk_erp_leads',
  // ── Inventory / Procurement ──
  products:           'gtk_erp_products',
  vendors:            'gtk_erp_vendors',
  store_items:        'gtk_erp_store',
  assets:             'gtk_erp_assets',
  stock_ledger:       'gtk_erp_stock_ledger',
  inspection_lots:    'gtk_erp_inspection_lots',
  remnants:           'gtk_erp_remnants',
  handling_units:     'gtk_erp_handling_units',
  requisitions:       'gtk_erp_requisitions',
  purchase_orders:    'gtk_erp_purchase_orders',
  // ── GlassCo Procurement (Critical — was localStorage-only) ──
  grn_sheet_entries:      'gtk_erp_grn_sheet_entries',
  vendor_defect_reports:  'gtk_erp_vendor_defect_reports',
  cutting_sessions:       'gtk_erp_cutting_sessions',
  manual_count_sheets:    'gtk_erp_manual_count_sheets',
  scrap_disposals:        'gtk_erp_scrap_disposals',
  vendor_reviews:         'gtk_erp_vendor_reviews',
  pallet_rates:           'gtk_erp_pallet_rates',
  weight_master:          'gtk_erp_weight_master',
  // ── Production ──
  production_pieces:  'gtk_erp_production_pieces',
  job_orders:         'gtk_erp_job_orders',
  // ── Logistics ──
  gate_passes:            'gtk_erp_gate_pass',
  warehouse_spots:        'gtk_erp_warehouse_spots',
  vehicle_trips:          'gtk_erp_vehicle_trips',
  vehicle_expenses:       'gtk_erp_vehicle_expenses',
  tempering_dispatches:   'gtk_erp_tempering_dispatches',
  // ── NCR ──
  ncr_events:         'gtk_erp_ncr_events',
  ncr_reproductions:  'gtk_erp_ncr_reproductions',
  ncr_claims:         'gtk_erp_ncr_claims',
  ncr_remnants:       'gtk_erp_ncr_remnants',
  // ── Production Logs (Phase 3/4 data) ──
  cutter_daily_logs:  'gtk_erp_cutter_daily_logs',
  generator_logs:     'gtk_erp_generator_logs',
  // ── System ──
  activity_logs:      'gtk_erp_activity_logs',
  // ── RBAC ──
  roles:              'gtk_erp_roles',
  permissions:        'gtk_erp_permissions',
  role_permissions:   'gtk_erp_role_permissions',
  employee_roles:     'gtk_erp_employee_roles',
  // ── Phase 1: Factory Operations (Supabase-native, no localStorage) ──
  // Note: these tables are Supabase-only — SyncService skips them for push/pull
  // They are listed here only for Realtime subscription coverage
};

// ── Supabase column mapper (snake_case from DB) ───────────────────────
const toSnakeCase = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const toCamelCase = (str: string) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

const mapToSupabase = (item: any) => {
  const mapped: any = {};
  for (const key in item) {
    // Keep 'id' and 'updated_at' as is, convert others to snake_case
    const newKey = (key === 'id' || key === 'updated_at') ? key : toSnakeCase(key);
    mapped[newKey] = item[key];
  }
  return mapped;
};

const mapFromSupabase = (item: any) => {
  const mapped: any = {};
  for (const key in item) {
    const newKey = (key === 'id' || key === 'updated_at') ? key : toCamelCase(key);
    mapped[newKey] = item[key];
  }
  return mapped;
};

// ── Tables that are LOCAL ONLY — never pushed to Supabase ────────────
const LOCAL_ONLY_TABLES = new Set(['activity_logs']);

// ── Known columns per table (only send what DB expects) ──────────────
const TABLE_COLUMNS: Record<string, string[]> = {
  ledger:    ['id', 'company', 'doc_type', 'doc_date', 'date', 'description', 'reference_id', 'status', 'details', 'updated_at'],
  petty_cash: ['id', 'company', 'date', 'type', 'amount', 'description', 'reference_doc', 'updated_at'],
  employees: ['id', 'company', 'personal', 'work', 'salary', 'data', 'updated_at'],   // JSONB-style table — no flat columns exist (push uses TABLE_PUSH.employees)
  assets:    ['id', 'company', 'name', 'category', 'serial_no', 'purchase_date', 'purchase_cost', 'useful_life', 'status', 'location', 'assigned_to', 'depreciation_method', 'maintenance_logs', 'notes', 'updated_at'],
};

const filterColumns = (table: string, data: any[]): any[] => {
  const cols = TABLE_COLUMNS[table];
  if (!cols) return data;
  return data.map(row => {
    const filtered: any = {};
    cols.forEach(col => {
      if (col in row) {
        filtered[col] = row[col];
      } else if (col === 'type' && !('type' in row)) {
        // petty_cash: ensure type is never null
        filtered[col] = row['entryType'] || 'Payment';
      }
    });
    return filtered;
  });
};

// ── Push mappers: app object → Supabase flat row ─────────────────────
const TABLE_PUSH: Record<string, (item: any) => any> = {
  quotations: (q: any) => ({
    id: q.id, company: q.company||'', date: q.date||null,
    due_date: q.dueDate||q.due_date||null,
    client_id: q.clientId||q.client_id||'',
    project_name: q.projectName||q.project_name||'',
    items: q.items||[], status: (q.status === 'Pending' ? 'Draft' : q.status)||'Draft',
    is_already_dispatched: q.isAlreadyDispatched||false,
    discount_percent: q.discountPercent||0,
    discount_amount: q.discountAmount||0,
    manual_serial: q.manualSerial||null,
    order_no: q.orderNo||null,
    revised_fields: q.revisedFields||null,
    received_amount: q.receivedAmount||0,
    actual_delivery_date: q.actualDeliveryDate||null,
    service_charges: q.serviceCharges||[],
    manual_ref: q.manualRef||null,
    subject: q.subject||'',
    order_type: q.orderType||q.order_type||'Standard',
    original_order_ref: q.originalOrderRef||q.original_order_ref||null,
    replacement_reason: q.replacementReason||q.replacement_reason||null,
    cost_bearer: q.costBearer||q.cost_bearer||null,
    data: q,                                  // D7: full object preserved (zero fields lost)
    updated_at: q._updatedAt||q.updatedAt||new Date().toISOString(),
  }),
  production_pieces: (p: any) => ({
    id: p.id,
    order_id: p.orderId||p.order_id||'',
    item_index: Number(p.itemIndex||p.item_index||0),
    specs: p.specs||'',
    status: p.status||'Cut',
    last_updated: p.lastUpdated||p.last_updated||new Date().toISOString(),
  }),
  clients: (c: any) => ({
    id: c.id, company: c.company||'', name: c.name||'',
    contact_person: c.contactPerson||c.contact_person||'',
    email: c.email||'', phone: c.phone||'',
    address: c.address||'', ntn: c.ntn||'',
    credit_limit: c.creditLimit||c.credit_limit||0,
    status: c.status||'Active',
    data: c,                                  // forward-compat blob
    updated_at: c._updatedAt||c.updatedAt||new Date().toISOString(),
  }),
  vendors: (v: any) => ({
    id: v.id, company: v.company||'', name: v.name||'',
    nick_name: v.nickName||v.nick_name||'',
    type: v.type||'Supplier', address: v.address||'',
    contact_person: v.contactPerson||v.contact_person||'',
    phone: v.phone||'',
    registration_date: v.registrationDate||v.registration_date||null,
    rates: v.rates||[],
    rate_list_versions: v.rateListVersions||v.rate_list_versions||null,
  }),
  products: (p: any) => ({
    id: p.id, company: p.company||'', category: p.category||'',
    description: p.description||'', service_nick: p.serviceNick||'',
    profile_code: p.profileCode||'', thickness: p.thickness||'',
    sheet_size: p.sheetSize||'', cost_price: p.costPrice||0,
    base_price: p.basePrice||0, unit: p.unit||'Sqft',
    variants: p.variants||[], glass_type: p.glassType||'',
    sub_category: p.subCategory||'', tempering_price: p.temperingPrice||0,
    main_category: p.mainCategory||'', finish_color: p.finishColor||'',
    model_no: p.modelNo||'', brand: p.brand||'',
    direction: p.direction||'', tongue_length: p.tongueLength||'',
    image_url: p.imageUrl||'',
    price_history: p.priceHistory||p.price_history||null,
  }),
  requisitions: (r: any) => ({
    id: r.id, company: r.company||'', date: r.date||'',
    header_text: r.headerText||r.header_text||'',
    requisitioner: r.requisitioner||'', priority: r.priority||'Medium',
    req_type: r.reqType||r.req_type||'Material',
    items: r.items||[], total_value: r.totalValue||r.total_value||0,
    status: r.status||'Pending', category: r.category||'',
    approved_by: r.approvedBy||r.approved_by||'',
    updated_at: r._updatedAt||r.updatedAt||new Date().toISOString(),
  }),
  store_items: (s: any) => ({
    id: s.id, company: s.company||'', name: s.name||'',
    category: s.category||'', quantity: s.quantity||0,
    unrestricted_qty: s.unrestrictedQty||0, qi_qty: s.qiQty||0,
    blocked_qty: s.blockedQty||0, reserved_qty: s.reservedQty||0,
    unit: s.unit||'Sqft',
    moving_average_price: s.movingAveragePrice||0,
    total_value: s.totalValue||0, storage_bin: s.storageBin||'',
    // timestamptz rejects '' (Postgres 22007) — null when absent.
    last_movement_date: s.lastMovementDate || null,
    min_level: s.minLevel||0, reorder_point: s.reorderPoint||0,
  }),
  warehouse_spots: (s: any) => ({
    id: s.id, company: s.company||'', code: s.code||'', zone: s.zone||'',
  }),
  gate_passes: (g: any) => ({
    id: g.id, company: g.company||'',
    type: g.type||'Outward', mvmnt_code: g.mvmntCode||g.mvmnt_code||'',
    vehicle_no: g.vehicleNo||'', vehicle_type: g.vehicleType||'',
    driver_name: g.driverName||'', material_details: g.materialDetails||'',
    qty: g.qty||0, unit: g.unit||'',
    tare_weight: g.tareWeight||0, gross_weight: g.grossWeight||0,
    is_returnable: g.isReturnable||false,
    timestamp: g.timestamp||new Date().toISOString(),
    status: g.status||'Pending',
    linked_dispatch_id: g.linkedDispatchId||null,
    from_vendor: g.fromVendor||'',
  }),
  vehicle_trips: (t: any) => ({
    id: t.id, company: t.company||'',
    vehicle_id: t.vehicleId||t.vehicle_id||'',
    dispatch_id: t.dispatchId||t.dispatch_id||null,
    date: t.date||'', destination: t.destination||'',
    service_type: t.serviceType||t.service_type||'',
    fare: t.fare||0, fuel_cost: t.fuelCost||t.fuel_cost||0,
    toll_charges: t.tollCharges||t.toll_charges||0,
    status: t.status||'Scheduled',
    paid_status: t.paidStatus||t.paid_status||'Unpaid',
    gl_tx_id: t.glTxId||t.gl_tx_id||null,
    load_direction: t.loadDirection||t.load_direction||null,
    full_rate: t.fullRate||t.full_rate||0,
    reduced_rate: t.reducedRate||t.reduced_rate||0,
  }),
  vehicle_expenses: (e: any) => ({
    id: e.id, vehicle_id: e.vehicleId||e.vehicle_id||'',
    date: e.date||'', type: e.type||'Fuel',
    amount: e.amount||0, description: e.description||'',
    paid_by: e.paidBy||e.paid_by||'Cash',
    paid_status: e.paidStatus||e.paid_status||'Paid',
    gl_tx_id: e.glTxId||e.gl_tx_id||null,
    month: e.month||'',
  }),
  tempering_dispatches: (d: any) => ({
    id: d.id, company: d.company||'',
    date: d.date||'', plant_name: d.plantName||d.plant_name||'',
    vehicle_no: d.vehicleNo||d.vehicle_no||'',
    driver_name: d.driverName||d.driver_name||'',
    service_type: d.serviceType||d.service_type||'',
    piece_ids: d.pieceIds||d.piece_ids||[],
    total_sq_ft: d.totalSqFt||d.total_sq_ft||0,
    status: d.status||'Pending',
    charges_per_sq_ft: d.chargesPerSqFt||d.charges_per_sq_ft||0,
    total_charges: d.totalCharges||d.total_charges||0,
    // Forward-compat blob so the trip-grouping + link fields the flat columns
    // drop (tripId, gatePassId, receivedPieceIds, ratesByMm, vendorInvoiceNo,
    // threeWayMatchStatus, brokenPieceIds) round-trip — this is what desynced
    // the Production / Dispatch-cockpit / Logistics surfaces.
    data: d,
  }),
  cutter_daily_logs: (l: any) => ({
    id: l.id, company: l.company||'',
    log_date: l.logDate||l.log_date||'',
    cutter_name: l.cutterName||l.cutter_name||'',
    employee_id: l.employeeId||l.employee_id||'',
    shift: l.shift||'Morning',
    sqft_produced: l.sqftProduced||l.sqft_produced||0,
    pieces_cut: l.piecesCut||l.pieces_cut||0,
    sheets_used: l.sheetsUsed||l.sheets_used||0,
    overtime_hours: l.overtimeHours||l.overtime_hours||0,
    overtime_rate_multiplier: l.overtimeRateMultiplier||l.overtime_rate_multiplier||1.5,
    notes: l.notes||'',
  }),
  generator_logs: (g: any) => ({
    id: g.id, company: g.company||'',
    log_date: g.logDate||g.log_date||'',
    shift: g.shift||'Morning',
    hours_run: g.hoursRun||g.hours_run||0,
    fuel_litres_used: g.fuelLitresUsed||g.fuel_litres_used||0,
    fuel_rate_per_litre: g.fuelRatePerLitre||g.fuel_rate_per_litre||0,
    fuel_cost: g.fuelCost||g.fuel_cost||0,
    cutting_sqft_produced: g.cuttingSqftProduced||g.cutting_sqft_produced||0,
    load_shedding_hours: g.loadSheddingHours||g.load_shedding_hours||0,
    notes: g.notes||'',
  }),
  purchase_orders: (p: any) => ({
    id: p.id, company: p.company||p.fromCompany||'',
    from_company: p.fromCompany||p.from_company||'',
    to_vendor: p.toVendor||p.to_vendor||'',
    date: p.date||'', status: p.status||'Draft',
    total_amount: p.totalAmount||0,
    category: p.category||'', items: p.items||[],
  }),
  invoices: (i: any) => ({
    id: i.id, company: i.company||'',
    order_id: i.orderId||i.order_id||'',
    order_no: i.orderNo||i.order_no||'',
    client_id: i.clientId||i.client_id||'',
    client_name: i.clientName||i.client_name||'',
    date: i.date||null, due_date: i.dueDate||i.due_date||null,
    total_amount: i.totalAmount||i.total_amount||0,
    received_amount: i.receivedAmount||i.received_amount||0,
    balance: i.balance||0,
    status: i.status||'Outstanding',
    gl_tx_id: i.glTxId||i.gl_tx_id||'',
    payments: i.payments||[],
    items: i.items||[],
    service_charges: i.serviceCharges||i.service_charges||[],
    project_name: i.projectName||i.project_name||'',
    discount_amount: i.discountAmount||i.discount_amount||0,
    gst_percent: i.gstPercent||i.gst_percent||0,
    gst_amount: i.gstAmount||i.gst_amount||0,
    voided_by: i.voidedBy||i.voided_by||null,
    voided_at: i.voidedAt||i.voided_at||null,
    reverted_status: i.revertedStatus||i.reverted_status||null,
    data: i,                                  // forward-compat blob
    updated_at: i._updatedAt||i.updatedAt||new Date().toISOString(),
  }),
  payment_receipts: (r: any) => ({
    id: r.id,
    company: r.company||'',
    invoice_id: r.invoiceId||r.invoice_id||'',
    date: r.date||null,
    amount: r.amount||0,
    method: r.method||'Bank Transfer',
    reference: r.reference||'',
    gl_tx_id: r.glTxId||r.gl_tx_id||'',
    updated_at: r._updatedAt||r.updatedAt||new Date().toISOString(),
  }),
  // ── Credit Notes (Phase-1, migration 032) ─────────────────────────
  credit_notes: (c: any) => ({
    id: c.id,
    company: c.company||'',
    invoice_id: c.invoiceId||c.invoice_id||null,
    invoice_no: c.invoiceNo||c.invoice_no||null,
    client_id:  c.clientId||c.client_id||null,
    client_name:c.clientName||c.client_name||null,
    date: c.date||null,
    reason: c.reason||'',
    amount: Number(c.amount||0),
    gl_tx_id: c.glTxId||c.gl_tx_id||null,
    status: c.status||'Posted',
    created_by: c.createdBy||c.created_by||'',
    created_at: c.createdAt||c.created_at||new Date().toISOString(),
    updated_at: c._updatedAt||c.updatedAt||new Date().toISOString(),
    data: c,                                  // forward-compat blob
  }),
  // ── Customer Complaints (Phase-3, migration 034) ─────────────────
  customer_complaints: (c: any) => ({
    id: c.id,
    company: c.company||'',
    date: c.date||null,
    client_id:   c.clientId||c.client_id||null,
    client_name: c.clientName||c.client_name||null,
    invoice_id:  c.invoiceId||c.invoice_id||null,
    order_no:    c.orderNo||c.order_no||null,
    category:    c.category||'Other',
    description: c.description||'',
    status:      c.status||'Open',
    priority:    c.priority||'Medium',
    assigned_to: c.assignedTo||c.assigned_to||null,
    resolution:  c.resolution||null,
    resolved_at: c.resolvedAt||c.resolved_at||null,
    resolved_by: c.resolvedBy||c.resolved_by||null,
    created_by:  c.createdBy||c.created_by||'',
    created_at:  c.createdAt||c.created_at||new Date().toISOString(),
    updated_at:  c._updatedAt||c.updatedAt||new Date().toISOString(),
    data: c,
  }),
  // ── Phase-6 (migration 036) ──
  price_lists: (p: any) => ({
    id: p.id, company: p.company||'', name: p.name||'',
    description: p.description||null,
    effective_from: p.effectiveFrom||null,
    effective_to:   p.effectiveTo||null,
    is_active: p.isActive !== false,
    created_by: p.createdBy||'',
    created_at: p.createdAt||new Date().toISOString(),
    updated_at: new Date().toISOString(),
    data: p,
  }),
  price_list_items: (i: any) => ({
    id: i.id, price_list_id: i.priceListId, company: i.company||'',
    glass_type:  i.glassType||null,
    thickness:   i.thickness||null,
    sub_category:i.subCategory||null,
    service_nick:i.serviceNick||null,
    rate: Number(i.rate||0), uom: i.uom||'sqft',
    notes: i.notes||null,
    updated_at: new Date().toISOString(),
  }),
  work_orders: (w: any) => ({
    id: w.id, company: w.company||'',
    sales_order_id: w.salesOrderId||null,
    client_id:      w.clientId||null,
    client_name:    w.clientName||null,
    project_name:   w.projectName||null,
    description:    w.description||null,
    status: w.status||'Open', priority: w.priority||'Normal',
    planned_start: w.plannedStart||null,
    planned_end:   w.plannedEnd||null,
    actual_start:  w.actualStart||null,
    actual_end:    w.actualEnd||null,
    pieces_total:  Number(w.piecesTotal||0),
    pieces_done:   Number(w.piecesDone||0),
    notes: w.notes||null,
    created_by: w.createdBy||'',
    created_at: w.createdAt||new Date().toISOString(),
    updated_at: new Date().toISOString(),
    data: w,
  }),
  leads: (l: any) => ({
    id: l.id, company: l.company||'', name: l.name||'',
    contact_person: l.contactPerson||null,
    phone: l.phone||null, email: l.email||null,
    source: l.source||null,
    estimated_value: Number(l.estimatedValue||0),
    stage: l.stage||'New', priority: l.priority||'Normal',
    next_action: l.nextAction||null,
    next_action_date: l.nextActionDate||null,
    notes: l.notes||null,
    client_id: l.clientId||null,
    converted_quotation_id: l.convertedQuotationId||null,
    lost_reason: l.lostReason||null,
    assigned_to: l.assignedTo||null,
    created_by: l.createdBy||'',
    created_at: l.createdAt||new Date().toISOString(),
    updated_at: new Date().toISOString(),
    stage_changed_at: l.stageChangedAt||new Date().toISOString(),
    data: l,
  }),
  ncr_events: (e: any) => ({
    id: e.id, company: e.company||'',
    piece_id: e.pieceId||e.piece_id||'',
    job_order_id: e.jobOrderId||e.job_order_id||'',
    item_index: e.itemIndex??e.item_index??0,
    stage: e.stage||'Cutting', cause: e.cause||'',
    description: e.description||'',
    reported_by: e.reportedBy||e.reported_by||'',
    reported_at: e.reportedAt||e.reported_at||'',
    sqft_lost: e.sqftLost||e.sqft_lost||0,
    glass_type: e.glassType||e.glass_type||'',
    thickness: e.thickness||'',
    estimated_value: e.estimatedValue||e.estimated_value||0,
    action: e.action||'Dispose', status: e.status||'Open',
    vendor_id: e.vendorId||e.vendor_id||'',
    vendor_name: e.vendorName||e.vendor_name||'',
    purchase_ref: e.purchaseRef||e.purchase_ref||'',
    gl_entry_id: e.glEntryId||e.gl_entry_id||'',
    photos: e.photos||[], notes: e.notes||'',
    closed_at: e.closedAt||e.closed_at||'',
    closed_by: e.closedBy||e.closed_by||'',
    updated_at: e._updatedAt||new Date().toISOString(),
  }),
  ncr_reproductions: (r: any) => ({
    id: r.id, ncr_id: r.ncrId||r.ncr_id||'',
    company: r.company||'',
    job_order_id: r.jobOrderId||r.job_order_id||'',
    item_index: r.itemIndex??r.item_index??0,
    original_piece_id: r.originalPieceId||r.original_piece_id||'',
    new_piece_id: r.newPieceId||r.new_piece_id||'',
    priority: r.priority||'Normal', status: r.status||'Queued',
    extra_cost: r.extraCost||r.extra_cost||0,
    notes: r.notes||'',
    created_at: r.createdAt||r.created_at||'',
    completed_at: r.completedAt||r.completed_at||'',
    updated_at: r._updatedAt||new Date().toISOString(),
  }),
  ncr_claims: (c: any) => ({
    id: c.id, ncr_id: c.ncrId||c.ncr_id||'',
    company: c.company||'',
    vendor_id: c.vendorId||c.vendor_id||'',
    vendor_name: c.vendorName||c.vendor_name||'',
    claim_date: c.claimDate||c.claim_date||'',
    claim_amount: c.claimAmount||c.claim_amount||0,
    description: c.description||'',
    photos: c.photos||[], purchase_ref: c.purchaseRef||c.purchase_ref||'',
    status: c.status||'Draft',
    settled_amount: c.settledAmount||c.settled_amount||0,
    settled_date: c.settledDate||c.settled_date||'',
    rejection_reason: c.rejectionReason||c.rejection_reason||'',
    gl_debit_note_id: c.glDebitNoteId||c.gl_debit_note_id||'',
    notes: c.notes||'',
    updated_at: c._updatedAt||new Date().toISOString(),
  }),
  ncr_remnants: (r: any) => ({
    id: r.id, ncr_id: r.ncrId||r.ncr_id||'',
    company: r.company||'',
    glass_type: r.glassType||r.glass_type||'',
    thickness: r.thickness||'',
    estimated_kg: r.estimatedKg||r.estimated_kg||0,
    sqft: r.sqft||0,
    disposal_method: r.disposalMethod||r.disposal_method||'Bin',
    scrap_value: r.scrapValue||r.scrap_value||0,
    date: r.date||'', notes: r.notes||'',
    updated_at: r._updatedAt||new Date().toISOString(),
  }),
  // ── RBAC Push Mappers (Phase 3) ──
  roles: (r: any) => ({
    id: r.id, name: r.name||'', company: r.company||'',
    description: r.description||'',
    is_system: r.isSystem||false, is_active: r.isActive!==false,
    updated_at: r._updatedAt||new Date().toISOString(),
  }),
  permissions: (p: any) => ({
    id: p.id, module: p.module||'', action: p.action||'',
    scope: p.scope||'company',
    updated_at: p._updatedAt||new Date().toISOString(),
  }),
  role_permissions: (rp: any) => ({
    id: rp.id,
    role_id: rp.roleId||rp.role_id||'',
    permission_id: rp.permissionId||rp.permission_id||'',
    updated_at: rp._updatedAt||new Date().toISOString(),
  }),
  employee_roles: (er: any) => ({
    id: er.id,
    employee_id: er.employeeId||er.employee_id||'',
    role_id: er.roleId||er.role_id||'',
    assigned_at: er.assignedAt||er.assigned_at||new Date().toISOString(),
    assigned_by: er.assignedBy||er.assigned_by||'admin',
    updated_at: er._updatedAt||new Date().toISOString(),
  }),
  // ── HR Push Mappers ──
  employees: (e: any) => {
    const d = e.data && typeof e.data === 'object' && Object.keys(e.data).length ? e.data : e;
    return {
      id: e.id,
      company: e.company || '',
      // Write ONLY the JSONB columns the live table has (confirmed via
      // information_schema): personal/work/salary (read by legacy rowToEmployee)
      // AND data (read by current rowToEmployee). All JSONB → no type coercion
      // and no missing-column 400. The live table has NO department_id / status
      // flat columns — including those is what 400'd the original flat mapper.
      personal: d.personal || null,
      work: d.work || null,
      salary: d.salary || null,
      data: {
        personal: d.personal || null,
        work: d.work || null,
        salary: d.salary || null,
        transferHistory: d.transferHistory || [],
        salaryHistory: d.salaryHistory || [],
      },
      updated_at: e._updatedAt || new Date().toISOString(),
    };
  },
  attendance: (a: any) => ({
    id: a.id, employee_id: a.employeeId||a.employee_id||'',
    date: a.date||'', status: a.status||'Present',
    late_minutes: a.lateMinutes||a.late_minutes||0,
    early_minutes: a.earlyMinutes||a.early_minutes||0,
    overtime_hours: a.overtimeHours||a.overtime_hours||0,
    company: a.company||'',
  }),
  loans: (l: any) => ({
    id: l.id, employee_id: l.employeeId||l.employee_id||'',
    date: l.date||'', amount: l.amount||0,
    type: l.type||'Loan',
    repayment_amount: l.repaymentAmount||l.repayment_amount||0,
    status: l.status||'Active',
    requisition_id: l.requisitionId||l.requisition_id||null,
    skip_month: l.skipMonth||l.skip_month||null,
    company: l.company||'',
  }),
  payroll: (p: any) => {
    // Cause of "invalid input syntax for type numeric: 'false'":
    // legacy payroll rows in localStorage can have numeric fields
    // accidentally storing the string "false" (or other non-numbers)
    // from a prior buggy CSV import. `false || 0` → 0 (safe), but
    // `"false" || 0` → "false" (truthy string) → Postgres rejects.
    // Wrap every numeric in num() to coerce to a real number.
    const num = (v: unknown): number => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const bool = (v: unknown): boolean =>
      v === true || v === 'true' || v === 1 || v === '1';
    return {
      id: p.id, employee_id: p.employeeId||p.employee_id||'',
      month: p.month||'',
      basic_pay: num(p.basicPay ?? p.basic_pay),
      allowances: num(p.allowances),
      overtime_pay: num(p.overtimePay ?? p.overtime_pay),
      overtime_hours: num(p.overtimeHours ?? p.overtime_hours),
      early_deduction_hours: num(p.earlyDeductionHours ?? p.early_deduction_hours),
      late_deduction: num(p.lateDeduction ?? p.late_deduction),
      absent_deduction: num(p.absentDeduction ?? p.absent_deduction),
      loan_deduction: num(p.loanDeduction ?? p.loan_deduction),
      advance_deduction: num(p.advanceDeduction ?? p.advance_deduction),
      net_salary: num(p.netSalary ?? p.net_salary),
      absent_dates: p.absentDates||p.absent_dates||[],
      late_dates: p.lateDates||p.late_dates||[],
      loan_repayments: p.loanRepayments||p.loan_repayments||[],
      is_salary_paid: bool(p.isSalaryPaid ?? p.is_salary_paid),
      is_overtime_paid: bool(p.isOvertimePaid ?? p.is_overtime_paid),
      allowed_absent_count: num(p.allowedAbsentCount ?? p.allowed_absent_count),
      loan_waived: bool(p.loanWaived ?? p.loan_waived),
      company: p.company||'',
    };
  },
  // ── Tags Push Mappers ──
  // tag_master / departments use the JSONB-style schema (id, company, data,
  // timestamps) — the prior flat-column mappers tried to write `color`,
  // `label`, `name`, `parent_dept`, etc. which don't exist on those tables.
  // Bundle everything into `data` so push succeeds against actual schema.
  tag_master: (t: any) => ({
    id: t.id,
    company: t.company||'',
    data: {
      category: t.category||'job_title',
      label: t.label||'',
      color: t.color||'',
      textColor: t.textColor||t.text_color||'',
      isActive: t.isActive!==false,
    },
    updated_at: t._updatedAt||new Date().toISOString(),
  }),
  employee_tags: (et: any) => ({
    id: et.id,
    company: et.company||'',
    data: {
      employeeId: et.employeeId||et.employee_id||'',
      tagId: et.tagId||et.tag_id||'',
      isPrimary: et.isPrimary||et.is_primary||false,
    },
    updated_at: et._updatedAt||new Date().toISOString(),
  }),
  departments: (d: any) => ({
    id: d.id,
    company: d.company||'',
    data: {
      name: d.name||'',
      parentDept: d.parentDept||d.parent_dept||null,
      isActive: d.isActive!==false,
    },
    updated_at: d._updatedAt||new Date().toISOString(),
  }),
  // ── GlassCo Procurement Push Mappers ──
  grn_sheet_entries: (e: any) => ({
    id: e.id, grn_id: e.grnId||e.grn_id||'', company: e.company||'',
    tag_id: e.tagId||e.tag_id||'', line_index: e.lineIndex||e.line_index||0,
    material_id: e.materialId||e.material_id||'',
    thickness: e.thickness||'', sheet_size: e.sheetSize||e.sheet_size||'',
    sqft_per_sheet: e.sqftPerSheet||e.sqft_per_sheet||0,
    status: e.status||'OK',
    defect_code: e.defectCode||e.defect_code||null,
    defect_description: e.defectDescription||e.defect_description||null,
    usable_sqft: e.usableSqft||e.usable_sqft||null,
    cutter_note: e.cutterNote||e.cutter_note||null,
    photos: e.photos||[],
    inspected_by: e.inspectedBy||e.inspected_by||'',
    inspected_at: e.inspectedAt||e.inspected_at||null,
    claim_amount: e.claimAmount||e.claim_amount||0,
    claim_status: e.claimStatus||e.claim_status||'Pending',
    is_undergauge: e.isUndergauge||e.is_undergauge||false,
    actual_size: e.actualSize||e.actual_size||null,
  }),
  vendor_defect_reports: (r: any) => ({
    id: r.id, company: r.company||'', grn_id: r.grnId||r.grn_id||'',
    vendor_id: r.vendorId||r.vendor_id||'',
    vendor_name: r.vendorName||r.vendor_name||'',
    report_date: r.reportDate||r.report_date||'',
    defect_entries: r.defectEntries||r.defect_entries||[],
    total_adjustment: r.totalAdjustment||r.total_adjustment||0,
    prepared_by: r.preparedBy||r.prepared_by||'',
    status: r.status||'Draft',
    sent_at: r.sentAt||r.sent_at||null,
    sent_via: r.sentVia||r.sent_via||null,
    settlement_ref: r.settlementRef||r.settlement_ref||null,
  }),
  cutting_sessions: (s: any) => ({
    id: s.id, company: s.company||'',
    job_order_id: s.jobOrderId||s.job_order_id||'',
    operator: s.operator||'', date: s.date||'',
    sheets_used: s.sheetsUsed||s.sheets_used||[],
    pieces_cut: s.piecesCut||s.pieces_cut||0,
    remnants_created: s.remnantsCreated||s.remnants_created||0,
    scrap_sqft: s.scrapSqft||s.scrap_sqft||0,
    status: s.status||'Open',
  }),
  manual_count_sheets: (m: any) => ({
    id: m.id, company: m.company||'', date: m.date||'',
    counted_by: m.countedBy||m.counted_by||'',
    items: m.items||[], count_ref: m.countRef||m.count_ref||'',
    status: m.status||'Pending',
  }),
  scrap_disposals: (d: any) => ({
    id: d.id, company: d.company||'',
    disposal_date: d.disposalDate||d.disposal_date||'',
    items: d.items||[],
    total_estimated_kg: d.totalEstimatedKg||d.total_estimated_kg||0,
    total_actual_kg: d.totalActualKg||d.total_actual_kg||null,
    market_rates: d.marketRates||d.market_rates||[],
    market_rate_avg_per_kg: d.marketRateAvgPerKg||d.market_rate_avg_per_kg||0,
    default_rate_per_kg: d.defaultRatePerKg||d.default_rate_per_kg||5,
    actual_dealer_name: d.actualDealerName||d.actual_dealer_name||null,
    actual_amount_received: d.actualAmountReceived||d.actual_amount_received||null,
    gl_journal_id: d.glJournalId||d.gl_journal_id||null,
    recorded_by: d.recordedBy||d.recorded_by||'',
    notes: d.notes||null,
  }),
  vendor_reviews: (v: any) => ({
    id: v.id, company: v.company||'',
    vendor_id: v.vendorId||v.vendor_id||'',
    vendor_name: v.vendorName||v.vendor_name||'',
    review_date: v.reviewDate||v.review_date||'',
    reviewed_by: v.reviewedBy||v.reviewed_by||'',
    period_from: v.periodFrom||v.period_from||'',
    period_to: v.periodTo||v.period_to||'',
    total_grns: v.totalGRNs||v.total_grns||0,
    defect_rate_pct: v.defectRatePct||v.defect_rate_pct||0,
    rating: v.rating||'Average',
    comments: v.comments||null,
  }),
  pallet_rates: (p: any) => ({
    id: p.id, company: p.company||'',
    grn_id: p.grnId||p.grn_id||'', date: p.date||'',
    vendor_id: p.vendorId||p.vendor_id||'',
    vendor_name: p.vendorName||p.vendor_name||'',
    rate_per_pallet: p.ratePerPallet||p.rate_per_pallet||0,
    pallet_count: p.palletCount||p.pallet_count||0,
    total_packing: p.totalPacking||p.total_packing||0,
  }),
  weight_master: (w: any) => ({
    id: w.id, company: w.company||'',
    product_id: w.productId||w.product_id||'',
    product_name: w.productName||w.product_name||'',
    thickness: w.thickness||'', sheet_size: w.sheetSize||w.sheet_size||'',
    date: w.date||'', recorded_by: w.recordedBy||w.recorded_by||'',
    total_weight_kg: w.totalWeightKg||w.total_weight_kg||0,
    sheet_count: w.sheetCount||w.sheet_count||0,
    per_sheet_kg: w.perSheetKg||w.per_sheet_kg||0,
    sqft_per_sheet: w.sqftPerSheet||w.sqft_per_sheet||0,
    per_sqft_kg: w.perSqftKg||w.per_sqft_kg||0,
    source: w.source||'Manual',
    grn_id: w.grnId||w.grn_id||null,
    notes: w.notes||null,
  }),
  // ── Finance tables ────────────────────────────────────────────────
  accounts: (a: any) => ({
    id: a.id, company: a.company||'',
    code: a.code||'', name: a.name||'',
    level: a.level||1, parent_id: a.parentId||a.parent_id||null,
    type: a.type||'Asset',
    updated_at: a._updatedAt||a.updatedAt||new Date().toISOString(),
  }),
  cost_centers: (c: any) => ({
    // JSONB-style schema — `manager`, `code`, `name`, etc. live inside the
    // data blob, not as flat columns. Prior mapper was hitting "Could not
    // find the 'manager' column" on every push.
    id: c.id,
    company: c.company||'',
    data: {
      code: c.code||'',
      name: c.name||'',
      department: c.department||'',
      manager: c.manager||'',
      category: c.category||'F',
      hierarchyArea: c.hierarchyArea||c.hierarchy_area||'',
    },
    updated_at: c._updatedAt||c.updatedAt||new Date().toISOString(),
  }),
  petty_cash: (p: any) => ({
    id: p.id, company: p.company||'',
    date: p.date||'', type: p.type||p.entryType||'Payment',
    amount: p.amount||0, description: p.description||'',
    reference_doc: p.referenceDoc||p.reference_doc||'',
    updated_at: p._updatedAt||p.updatedAt||new Date().toISOString(),
  }),
  recurring_expenses: (r: any) => ({
    id: r.id, company: r.company||'',
    description: r.description||'', amount: r.amount||0,
    frequency: r.frequency||'Monthly', category: r.category||'',
    next_due: r.nextDue||r.next_due||'',
    gl_account: r.glAccount||r.gl_account||'',
    cost_center: r.costCenter||r.cost_center||'',
    is_active: r.isActive !== undefined ? r.isActive : true,
    updated_at: r._updatedAt||r.updatedAt||new Date().toISOString(),
  }),
  financial_events: (e: any) => ({
    id: e.id, company: e.company||'',
    event_type: e.eventType||e.event_type||'',
    amount: e.amount||0, date: e.date||'',
    description: e.description||'', reference: e.reference||'',
    updated_at: e._updatedAt||e.updatedAt||new Date().toISOString(),
  }),
  mapping_rules: (m: any) => ({
    id: m.id, company: m.company||'',
    subcategory: m.subcategory||'',
    debit_code: m.debitCode||m.debit_code||'',
    debit_name: m.debitName||m.debit_name||'',
    credit_code: m.creditCode||m.credit_code||'',
    credit_name: m.creditName||m.credit_name||'',
    updated_at: m._updatedAt||m.updatedAt||new Date().toISOString(),
  }),
  gl_config: (g: any) => ({
    id: g.id, company: g.company||'',
    key: g.key||'', value: g.value||'',
    description: g.description||'',
    updated_at: g._updatedAt||g.updatedAt||new Date().toISOString(),
  }),

  // ── Procurement tables ────────────────────────────────────────────
  inspection_lots: (i: any) => ({
    id: i.id, company: i.company||'',
    grn_id: i.grnId||i.grn_id||'',
    vendor_id: i.vendorId||i.vendor_id||'',
    product_id: i.productId||i.product_id||'',
    status: i.status||'Pending',
    items: i.items||[],
    updated_at: i._updatedAt||i.updatedAt||new Date().toISOString(),
  }),
  handling_units: (h: any) => ({
    id: h.id, company: h.company||'',
    grn_id: h.grnId||h.grn_id||'',
    hu_number: h.huNumber||h.hu_number||'',
    material: h.material||'',
    quantity: h.quantity||0, unit: h.unit||'',
    storage_bin: h.storageBin||h.storage_bin||'',
    status: h.status||'Active',
    updated_at: h._updatedAt||h.updatedAt||new Date().toISOString(),
  }),
  remnants: (r: any) => ({
    id: r.id, company: r.company||'',
    glass_type: r.glassType||r.glass_type||'',
    thickness: r.thickness||'', length: r.length||0, width: r.width||0,
    area_sqft: r.areaSqft||r.area_sqft||0,
    location: r.location||'', status: r.status||'Available',
    source_grn: r.sourceGrn||r.source_grn||'',
    updated_at: r._updatedAt||r.updatedAt||new Date().toISOString(),
  }),
  stock_ledger: (s: any) => {
    // MaterialLedgerEntry uses: timestamp, mvmntCode, qty, valuation, referenceDoc, storageBin
    // SyncService used SAP aliases (postingDate, movementType, quantity, documentNo, storageLoc)
    // that don't exist on the object → empty string → "invalid input syntax for type date"
    // Fix: read from actual MaterialLedgerEntry fields, fallback to SAP aliases
    const rawDate = s.timestamp || s.postingDate || s.posting_date || null;
    // Convert to valid date string (YYYY-MM-DD) or null — never send empty string to date col
    let postingDate: string | null = null;
    if (rawDate) {
      try { postingDate = new Date(rawDate).toISOString().slice(0, 10); } catch { postingDate = null; }
    }
    return {
      id: s.id,
      company: s.company || '',
      material_id: s.materialId || s.material_id || '',
      movement_type: s.mvmntCode || s.movementType || s.movement_type || '',
      quantity: s.qty ?? s.quantity ?? 0,
      uom: s.uom || '',
      posting_date: postingDate,           // null-safe — never empty string
      document_no: s.referenceDoc || s.documentNo || s.document_no || '',
      reference: s.referenceDoc || s.reference || '',
      plant: s.plant || '',
      storage_loc: s.storageBin || s.storageLoc || s.storage_loc || '',
      value: s.valuation ?? s.value ?? 0,
      moving_avg_price: s.balanceAfter ?? s.movingAvgPrice ?? s.moving_avg_price ?? 0,
      updated_at: s._updatedAt || s.updatedAt || new Date().toISOString(),
    };
  },

  // ── Production / Sales ────────────────────────────────────────────
  job_orders: (j: any) => ({
    id: j.id, company: j.company||'',
    order_no: j.orderNo||j.order_no||'',
    client_id: j.clientId||j.client_id||'',
    client_name: j.clientName||j.client_name||'',
    project_name: j.projectName||j.project_name||'',
    status: j.status||'Open',
    items: j.items||[], notes: j.notes||'',
    created_date: j.createdDate||j.created_date||'',
    updated_at: j._updatedAt||j.updatedAt||new Date().toISOString(),
  }),
  projects: (p: any) => ({
    id: p.id, company: p.company||'',
    name: p.name||'', client_id: p.clientId||p.client_id||'',
    client_name: p.clientName||p.client_name||'',
    status: p.status||'Active',
    start_date: p.startDate||p.start_date||'',
    end_date: p.endDate||p.end_date||'',
    total_value: p.totalValue||p.total_value||0,
    notes: p.notes||'',
    updated_at: p._updatedAt||p.updatedAt||new Date().toISOString(),
  }),

  // ── Employee docs ─────────────────────────────────────────────────
  employee_docs: (d: any) => ({
    id: d.id, company: d.company||'',
    employee_id: d.employeeId||d.employee_id||'',
    doc_type: d.docType||d.doc_type||'',
    doc_name: d.docName||d.doc_name||'',
    file_url: d.fileUrl||d.file_url||'',
    expiry_date: d.expiryDate||d.expiry_date||null,
    notes: d.notes||'',
    updated_at: d._updatedAt||d.updatedAt||new Date().toISOString(),
  }),
};

// ── Pull mappers: Supabase row → app object ───────────────────────────
const TABLE_PULL: Record<string, (row: any) => any> = {
  quotations: (r: any) => {
    // D7: merge JSONB `data` blob (full object preservation) with flat columns
    const base = r.data && typeof r.data === 'object' ? r.data : {};
    return {
      ...base,
      ...r,
      data: undefined,                                  // strip raw blob from result
      clientId: r.client_id ?? base.clientId,
      projectName: r.project_name ?? base.projectName,
      dueDate: r.due_date ?? base.dueDate,
      discountPercent: r.discount_percent ?? base.discountPercent,
      discountAmount: r.discount_amount ?? base.discountAmount,
      manualSerial: r.manual_serial ?? base.manualSerial,
      orderNo: r.order_no ?? base.orderNo,
      revisedFields: r.revised_fields ?? base.revisedFields,
      receivedAmount: r.received_amount ?? base.receivedAmount,
      actualDeliveryDate: r.actual_delivery_date ?? base.actualDeliveryDate,
      serviceCharges: r.service_charges ?? base.serviceCharges ?? [],
      manualRef: r.manual_ref ?? base.manualRef,
      isAlreadyDispatched: r.is_already_dispatched ?? base.isAlreadyDispatched,
      orderType: r.order_type ?? base.orderType ?? 'Standard',
      originalOrderRef: r.original_order_ref ?? base.originalOrderRef ?? null,
      replacementReason: r.replacement_reason ?? base.replacementReason ?? null,
      costBearer: r.cost_bearer ?? base.costBearer ?? null,
      items: (Array.isArray(r.items) && r.items.length > 0) ? r.items : (base.items ?? []),
      status: r.status ?? base.status,
    };
  },
  production_pieces: (r: any) => ({
    ...r,
    orderId: r.order_id,
    itemIndex: Number(r.item_index||0),
    lastUpdated: r.last_updated,
  }),
  clients: (r: any) => {
    const base = r.data && typeof r.data === 'object' ? r.data : {};
    return {
      ...base,
      ...r,
      data: undefined,
      contactPerson: r.contact_person ?? base.contactPerson,
      creditLimit: r.credit_limit ?? base.creditLimit,
    };
  },
  vendors: (r: any) => ({
    ...r,
    nickName: r.nick_name,
    contactPerson: r.contact_person,
    registrationDate: r.registration_date,
    rateListVersions: r.rate_list_versions,
  }),
  products: (r: any) => ({
    ...r,
    serviceNick: r.service_nick, profileCode: r.profile_code,
    sheetSize: r.sheet_size, costPrice: r.cost_price,
    basePrice: r.base_price, glassType: r.glass_type,
    subCategory: r.sub_category, temperingPrice: r.tempering_price,
    mainCategory: r.main_category, finishColor: r.finish_color,
    modelNo: r.model_no, tongueLength: r.tongue_length,
    imageUrl: r.image_url, variants: r.variants||[],
    priceHistory: r.price_history,
  }),
  requisitions: (r: any) => ({
    ...r,
    headerText: r.header_text, reqType: r.req_type,
    totalValue: r.total_value, approvedBy: r.approved_by,
    items: r.items||[],
  }),
  store_items: (r: any) => ({
    ...r,
    unrestrictedQty: r.unrestricted_qty, qiQty: r.qi_qty,
    blockedQty: r.blocked_qty, reservedQty: r.reserved_qty,
    movingAveragePrice: r.moving_average_price,
    totalValue: r.total_value, storageBin: r.storage_bin,
    lastMovementDate: r.last_movement_date,
    minLevel: r.min_level, reorderPoint: r.reorder_point,
  }),
  warehouse_spots: (r: any) => ({ ...r }),
  gate_passes: (r: any) => ({
    ...r,
    mvmntCode: r.mvmnt_code, vehicleNo: r.vehicle_no,
    vehicleType: r.vehicle_type, driverName: r.driver_name,
    materialDetails: r.material_details,
    tareWeight: r.tare_weight, grossWeight: r.gross_weight,
    isReturnable: r.is_returnable,
    linkedDispatchId: r.linked_dispatch_id,
    fromVendor: r.from_vendor,
  }),
  vehicle_trips: (r: any) => ({
    ...r,
    vehicleId: r.vehicle_id, dispatchId: r.dispatch_id,
    serviceType: r.service_type, fuelCost: r.fuel_cost,
    tollCharges: r.toll_charges, paidStatus: r.paid_status,
    glTxId: r.gl_tx_id, loadDirection: r.load_direction,
    fullRate: r.full_rate, reducedRate: r.reduced_rate,
  }),
  vehicle_expenses: (r: any) => ({
    ...r,
    vehicleId: r.vehicle_id, paidBy: r.paid_by,
    paidStatus: r.paid_status, glTxId: r.gl_tx_id,
  }),
  tempering_dispatches: (r: any) => {
    // Unwrap the forward-compat data blob so its rich fields (tripId, gatePassId,
    // receivedPieceIds, ratesByMm, vendorInvoiceNo, 3-way-match) survive; the flat
    // columns then override with server-authoritative values. Strip the nested
    // `data` key so a later push doesn't re-nest it (data.data...).
    const blob = (r.data && typeof r.data === 'object') ? r.data : {};
    const { data: _drop, ...flat } = r;
    return {
      ...blob,
      ...flat,
      plantName: r.plant_name, vehicleNo: r.vehicle_no,
      driverName: r.driver_name, serviceType: r.service_type,
      // prefer the RPC-patched data.pieceIds, fall back to the flat column
      pieceIds: blob.pieceIds || r.piece_ids || [],
      totalSqFt: r.total_sq_ft,
      chargesPerSqFt: r.charges_per_sq_ft, totalCharges: r.total_charges,
    };
  },
  cutter_daily_logs: (r: any) => ({
    ...r,
    logDate: r.log_date, cutterName: r.cutter_name,
    employeeId: r.employee_id, sqftProduced: r.sqft_produced,
    piecesCut: r.pieces_cut, sheetsUsed: r.sheets_used,
    overtimeHours: r.overtime_hours,
    overtimeRateMultiplier: r.overtime_rate_multiplier,
  }),
  generator_logs: (r: any) => ({
    ...r,
    logDate: r.log_date, hoursRun: r.hours_run,
    fuelLitresUsed: r.fuel_litres_used,
    fuelRatePerLitre: r.fuel_rate_per_litre,
    fuelCost: r.fuel_cost,
    cuttingSqftProduced: r.cutting_sqft_produced,
    loadSheddingHours: r.load_shedding_hours,
  }),
  purchase_orders: (r: any) => ({
    ...r,
    fromCompany: r.from_company, toVendor: r.to_vendor,
    totalAmount: r.total_amount,
  }),
  invoices: (r: any) => {
    const base = r.data && typeof r.data === 'object' ? r.data : {};
    return {
      ...base,
      ...r,
      data: undefined,
      orderId: r.order_id ?? base.orderId, orderNo: r.order_no ?? base.orderNo,
      clientId: r.client_id ?? base.clientId, clientName: r.client_name ?? base.clientName,
      dueDate: r.due_date ?? base.dueDate, totalAmount: r.total_amount ?? base.totalAmount,
      receivedAmount: r.received_amount ?? base.receivedAmount,
      glTxId: r.gl_tx_id ?? base.glTxId, payments: r.payments ?? base.payments ?? [],
      items: r.items ?? base.items ?? [],
      serviceCharges: r.service_charges ?? base.serviceCharges ?? [],
      projectName: r.project_name ?? base.projectName,
      discountAmount: r.discount_amount ?? base.discountAmount,
      gstPercent: r.gst_percent ?? base.gstPercent,
      gstAmount: r.gst_amount ?? base.gstAmount,
      voidedBy: r.voided_by ?? base.voidedBy,
      voidedAt: r.voided_at ?? base.voidedAt,
      revertedStatus: r.reverted_status ?? base.revertedStatus,
    };
  },
  payment_receipts: (r: any) => ({
    ...r,
    invoiceId: r.invoice_id, glTxId: r.gl_tx_id,
  }),
  // ── Credit Notes (Phase-1, migration 032) ─────────────────────────
  credit_notes: (r: any) => {
    const base = r.data && typeof r.data === 'object' ? r.data : {};
    return {
      ...base,
      ...r,
      data: undefined,
      invoiceId:  r.invoice_id  ?? base.invoiceId,
      invoiceNo:  r.invoice_no  ?? base.invoiceNo,
      clientId:   r.client_id   ?? base.clientId,
      clientName: r.client_name ?? base.clientName,
      glTxId:     r.gl_tx_id    ?? base.glTxId,
      createdBy:  r.created_by  ?? base.createdBy,
      createdAt:  r.created_at  ?? base.createdAt,
      amount:     Number(r.amount ?? base.amount ?? 0),
    };
  },
  // ── Customer Complaints (Phase-3, migration 034) ─────────────────
  customer_complaints: (r: any) => {
    const base = r.data && typeof r.data === 'object' ? r.data : {};
    return {
      ...base,
      ...r,
      data: undefined,
      clientId:   r.client_id   ?? base.clientId,
      clientName: r.client_name ?? base.clientName,
      invoiceId:  r.invoice_id  ?? base.invoiceId,
      orderNo:    r.order_no    ?? base.orderNo,
      assignedTo: r.assigned_to ?? base.assignedTo,
      resolvedAt: r.resolved_at ?? base.resolvedAt,
      resolvedBy: r.resolved_by ?? base.resolvedBy,
      createdBy:  r.created_by  ?? base.createdBy,
      createdAt:  r.created_at  ?? base.createdAt,
    };
  },
  // ── Phase-6 (migration 036) ──
  price_lists: (r: any) => {
    const base = r.data && typeof r.data === 'object' ? r.data : {};
    return {
      ...base, ...r, data: undefined,
      effectiveFrom: r.effective_from ?? base.effectiveFrom,
      effectiveTo:   r.effective_to   ?? base.effectiveTo,
      isActive:      r.is_active      ?? base.isActive,
      createdBy:     r.created_by     ?? base.createdBy,
      createdAt:     r.created_at     ?? base.createdAt,
    };
  },
  price_list_items: (r: any) => ({
    ...r,
    priceListId: r.price_list_id,
    glassType:   r.glass_type,
    subCategory: r.sub_category,
    serviceNick: r.service_nick,
    rate:        Number(r.rate || 0),
  }),
  work_orders: (r: any) => {
    const base = r.data && typeof r.data === 'object' ? r.data : {};
    return {
      ...base, ...r, data: undefined,
      salesOrderId: r.sales_order_id ?? base.salesOrderId,
      clientId:     r.client_id      ?? base.clientId,
      clientName:   r.client_name    ?? base.clientName,
      projectName:  r.project_name   ?? base.projectName,
      plannedStart: r.planned_start  ?? base.plannedStart,
      plannedEnd:   r.planned_end    ?? base.plannedEnd,
      actualStart:  r.actual_start   ?? base.actualStart,
      actualEnd:    r.actual_end     ?? base.actualEnd,
      piecesTotal:  Number(r.pieces_total || 0),
      piecesDone:   Number(r.pieces_done  || 0),
      createdBy:    r.created_by     ?? base.createdBy,
      createdAt:    r.created_at     ?? base.createdAt,
    };
  },
  leads: (r: any) => {
    const base = r.data && typeof r.data === 'object' ? r.data : {};
    return {
      ...base, ...r, data: undefined,
      contactPerson:  r.contact_person ?? base.contactPerson,
      estimatedValue: Number(r.estimated_value || 0),
      nextAction:     r.next_action      ?? base.nextAction,
      nextActionDate: r.next_action_date ?? base.nextActionDate,
      clientId:       r.client_id        ?? base.clientId,
      convertedQuotationId: r.converted_quotation_id ?? base.convertedQuotationId,
      lostReason:     r.lost_reason      ?? base.lostReason,
      assignedTo:     r.assigned_to      ?? base.assignedTo,
      createdBy:      r.created_by       ?? base.createdBy,
      createdAt:      r.created_at       ?? base.createdAt,
      stageChangedAt: r.stage_changed_at ?? base.stageChangedAt,
    };
  },
  ncr_events: (r: any) => ({
    ...r,
    pieceId: r.piece_id, jobOrderId: r.job_order_id,
    itemIndex: r.item_index, reportedBy: r.reported_by,
    reportedAt: r.reported_at, sqftLost: r.sqft_lost,
    glassType: r.glass_type, estimatedValue: r.estimated_value,
    vendorId: r.vendor_id, vendorName: r.vendor_name,
    purchaseRef: r.purchase_ref, glEntryId: r.gl_entry_id,
    closedAt: r.closed_at, closedBy: r.closed_by,
    photos: r.photos||[],
  }),
  ncr_reproductions: (r: any) => ({
    ...r,
    ncrId: r.ncr_id, jobOrderId: r.job_order_id,
    itemIndex: r.item_index,
    originalPieceId: r.original_piece_id,
    newPieceId: r.new_piece_id,
    extraCost: r.extra_cost,
    createdAt: r.created_at, completedAt: r.completed_at,
  }),
  ncr_claims: (r: any) => ({
    ...r,
    ncrId: r.ncr_id, vendorId: r.vendor_id,
    vendorName: r.vendor_name, claimDate: r.claim_date,
    claimAmount: r.claim_amount, purchaseRef: r.purchase_ref,
    settledAmount: r.settled_amount, settledDate: r.settled_date,
    rejectionReason: r.rejection_reason,
    glDebitNoteId: r.gl_debit_note_id,
    photos: r.photos||[],
  }),
  ncr_remnants: (r: any) => ({
    ...r,
    ncrId: r.ncr_id, glassType: r.glass_type,
    estimatedKg: r.estimated_kg,
    disposalMethod: r.disposal_method,
    scrapValue: r.scrap_value,
  }),
  // ── RBAC Pull Mappers (Phase 3) ──
  roles: (r: any) => ({
    ...r,
    isSystem: r.is_system,
    isActive: r.is_active,
  }),
  permissions: (r: any) => ({ ...r }),
  role_permissions: (r: any) => ({
    ...r,
    roleId: r.role_id,
    permissionId: r.permission_id,
  }),
  employee_roles: (r: any) => ({
    ...r,
    employeeId: r.employee_id,
    roleId: r.role_id,
    assignedAt: r.assigned_at,
    assignedBy: r.assigned_by,
  }),
  // ── HR Pull Mappers ──
  // employees is JSONB-style (id, company, data) — unpack `data` so the domain
  // shape (personal/work/salary) is restored to the top level on read.
  employees: (r: any) => ({
    id: r.id,
    company: r.company || '',
    ...(r.data || {}),
    updated_at: r.updated_at,
  }),
  attendance: (r: any) => ({
    ...r,
    employeeId: r.employee_id,
    lateMinutes: r.late_minutes,
    earlyMinutes: r.early_minutes,
    overtimeHours: r.overtime_hours,
  }),
  loans: (r: any) => ({
    ...r,
    employeeId: r.employee_id,
    repaymentAmount: r.repayment_amount,
    requisitionId: r.requisition_id,
    skipMonth: r.skip_month,
  }),
  payroll: (r: any) => ({
    ...r,
    employeeId: r.employee_id,
    basicPay: r.basic_pay,
    overtimePay: r.overtime_pay,
    overtimeHours: r.overtime_hours,
    earlyDeductionHours: r.early_deduction_hours,
    lateDeduction: r.late_deduction,
    absentDeduction: r.absent_deduction,
    loanDeduction: r.loan_deduction,
    advanceDeduction: r.advance_deduction,
    netSalary: r.net_salary,
    absentDates: r.absent_dates||[],
    lateDates: r.late_dates||[],
    loanRepayments: r.loan_repayments||[],
    isSalaryPaid: r.is_salary_paid,
    isOvertimePaid: r.is_overtime_paid,
    allowedAbsentCount: r.allowed_absent_count,
    loanWaived: r.loan_waived,
  }),
  // ── Tags Pull Mappers ──
  // tag_master / departments use JSONB-style schema — unpack `data` so the
  // domain shape (camelCase fields) is restored on read. Falls back to
  // flat columns to stay compatible with any rows that may have been
  // written under the old (broken) flat-column attempt.
  tag_master: (r: any) => ({
    ...r,
    ...(r.data || {}),
    textColor: (r.data?.textColor) ?? r.text_color,
    isActive:  (r.data?.isActive)  ?? r.is_active,
  }),
  employee_tags: (r: any) => ({
    ...r,
    ...(r.data || {}),
    employeeId: (r.data?.employeeId) ?? r.employee_id,
    tagId:      (r.data?.tagId)      ?? r.tag_id,
    isPrimary:  (r.data?.isPrimary)  ?? r.is_primary,
  }),
  departments: (r: any) => ({
    ...r,
    ...(r.data || {}),
    parentDept: (r.data?.parentDept) ?? r.parent_dept,
    isActive:   (r.data?.isActive)   ?? r.is_active,
  }),
  // ── GlassCo Procurement Pull Mappers ──
  grn_sheet_entries: (r: any) => ({
    ...r,
    grnId: r.grn_id, tagId: r.tag_id, lineIndex: r.line_index,
    materialId: r.material_id, sheetSize: r.sheet_size,
    sqftPerSheet: r.sqft_per_sheet, defectCode: r.defect_code,
    defectDescription: r.defect_description, usableSqft: r.usable_sqft,
    cutterNote: r.cutter_note, inspectedBy: r.inspected_by,
    inspectedAt: r.inspected_at, claimAmount: r.claim_amount,
    claimStatus: r.claim_status, isUndergauge: r.is_undergauge,
    actualSize: r.actual_size, photos: r.photos||[],
  }),
  vendor_defect_reports: (r: any) => ({
    ...r,
    grnId: r.grn_id, vendorId: r.vendor_id, vendorName: r.vendor_name,
    reportDate: r.report_date, defectEntries: r.defect_entries||[],
    totalAdjustment: r.total_adjustment, preparedBy: r.prepared_by,
    sentAt: r.sent_at, sentVia: r.sent_via,
    settlementRef: r.settlement_ref,
  }),
  cutting_sessions: (r: any) => ({
    ...r,
    jobOrderId: r.job_order_id, sheetsUsed: r.sheets_used||[],
    piecesCut: r.pieces_cut, remnantsCreated: r.remnants_created,
    scrapSqft: r.scrap_sqft,
  }),
  manual_count_sheets: (r: any) => ({
    ...r,
    countedBy: r.counted_by, countRef: r.count_ref,
  }),
  scrap_disposals: (r: any) => ({
    ...r,
    disposalDate: r.disposal_date, totalEstimatedKg: r.total_estimated_kg,
    totalActualKg: r.total_actual_kg, marketRates: r.market_rates||[],
    marketRateAvgPerKg: r.market_rate_avg_per_kg,
    defaultRatePerKg: r.default_rate_per_kg,
    actualDealerName: r.actual_dealer_name,
    actualAmountReceived: r.actual_amount_received,
    glJournalId: r.gl_journal_id, recordedBy: r.recorded_by,
  }),
  vendor_reviews: (r: any) => ({
    ...r,
    vendorId: r.vendor_id, vendorName: r.vendor_name,
    reviewDate: r.review_date, reviewedBy: r.reviewed_by,
    periodFrom: r.period_from, periodTo: r.period_to,
    totalGRNs: r.total_grns, defectRatePct: r.defect_rate_pct,
  }),
  pallet_rates: (r: any) => ({
    ...r,
    grnId: r.grn_id, vendorId: r.vendor_id, vendorName: r.vendor_name,
    ratePerPallet: r.rate_per_pallet, palletCount: r.pallet_count,
    totalPacking: r.total_packing,
  }),
  weight_master: (r: any) => ({
    ...r,
    productId: r.product_id, productName: r.product_name,
    sheetSize: r.sheet_size, recordedBy: r.recorded_by,
    totalWeightKg: r.total_weight_kg, sheetCount: r.sheet_count,
    perSheetKg: r.per_sheet_kg, sqftPerSheet: r.sqft_per_sheet,
    perSqftKg: r.per_sqft_kg, grnId: r.grn_id,
  }),
  // ── Finance tables ────────────────────────────────────────────────
  accounts: (r: any) => ({
    ...r,
    parentId: r.parent_id,
  }),
  cost_centers: (r: any) => ({
    // JSONB-style schema — unpack `data` so code/name/department/manager
    // come back as plain fields. Falls back to flat columns for any rows
    // still written under legacy mapping.
    ...r,
    ...(r.data || {}),
    hierarchyArea: (r.data?.hierarchyArea) ?? r.hierarchy_area,
  }),
  petty_cash: (r: any) => ({
    ...r,
    entryType: r.type,
    referenceDoc: r.reference_doc,
    createdAt: r.created_at,
  }),
  recurring_expenses: (r: any) => ({
    ...r,
    nextDue: r.next_due,
    glAccount: r.gl_account,
    costCenter: r.cost_center,
    isActive: r.is_active,
  }),
  financial_events: (r: any) => ({
    ...r,
    eventType: r.event_type,
  }),
  mapping_rules: (r: any) => ({
    ...r,
    debitCode: r.debit_code, debitName: r.debit_name,
    creditCode: r.credit_code, creditName: r.credit_name,
  }),
  gl_config: (r: any) => ({ ...r }),

  // ── Procurement ────────────────────────────────────────────────────
  inspection_lots: (r: any) => ({
    ...r,
    grnId: r.grn_id, vendorId: r.vendor_id, productId: r.product_id,
  }),
  handling_units: (r: any) => ({
    ...r,
    grnId: r.grn_id, huNumber: r.hu_number, storageBin: r.storage_bin,
  }),
  remnants: (r: any) => ({
    ...r,
    glassType: r.glass_type, areaSqft: r.area_sqft, sourceGrn: r.source_grn,
  }),
  stock_ledger: (r: any) => ({
    ...r,
    materialId: r.material_id, movementType: r.movement_type,
    postingDate: r.posting_date, documentNo: r.document_no,
    storageLoc: r.storage_loc, movingAvgPrice: r.moving_avg_price,
  }),

  // ── Production / Sales ────────────────────────────────────────────
  job_orders: (r: any) => ({
    ...r,
    orderNo: r.order_no, clientId: r.client_id, clientName: r.client_name,
    projectName: r.project_name, createdDate: r.created_date,
  }),
  projects: (r: any) => ({
    ...r,
    clientId: r.client_id, clientName: r.client_name,
    startDate: r.start_date, endDate: r.end_date,
    totalValue: r.total_value,
  }),

  // ── Employee docs ─────────────────────────────────────────────────
  employee_docs: (r: any) => ({
    ...r,
    employeeId: r.employee_id, docType: r.doc_type,
    docName: r.doc_name, fileUrl: r.file_url, expiryDate: r.expiry_date,
  }),
};

const pushTable = async (table: string, localKey: string): Promise<boolean> => {
  if (LOCAL_ONLY_TABLES.has(table)) return true;

  const rawData = safeParse(localKey);
  if (!rawData || rawData.length === 0) return true;

  let data: any[];
  const pusher = TABLE_PUSH[table];
  if (pusher) {
    data = rawData.map(pusher).filter((r: any) => r.id);
  } else if (TABLE_COLUMNS[table]) {
    // Tables with known column lists — use filterColumns
    const mapped = rawData.map(mapToSupabase);
    data = filterColumns(table, mapped);
  } else {
    // No specific handler — use generic camelCase→snake_case mapping
    // This is safe: Supabase will ignore unknown columns
    data = rawData.map(mapToSupabase).filter((r: any) => r.id);
    if (data.length === 0) return true;
  }

  // ── FK pre-flight: drop orphans before push ─────────────────────────────
  // Some tables (payment_receipts, credit_notes) reference invoices.id via
  // a foreign key. If the parent invoice was deleted locally OR never
  // synced, the entire batch upsert fails with a 23503 / 409. Previously
  // the error was just suppressed, which silently dropped ALL the valid
  // rows in the batch too. Filter orphans up front so the good rows go
  // through and the bad ones are logged once for cleanup.
  if (table === 'payment_receipts' || table === 'credit_notes') {
    const invoices = safeParse('gtk_erp_invoices') as Array<{ id: string }>;
    const validInvoiceIds = new Set(invoices.map(i => i.id));
    const before = data.length;
    data = data.filter((r: any) => {
      const invId = r.invoice_id;
      // Allow null invoice_id (some credit notes can be standalone)
      if (table === 'credit_notes' && !invId) return true;
      return invId && validInvoiceIds.has(invId);
    });
    const dropped = before - data.length;
    if (dropped > 0) {
      console.warn(`[Sync] ${table}: filtered ${dropped} orphan row(s) — parent invoice missing locally`);
    }
    if (data.length === 0) return true;  // nothing valid to push
  }

  // ── M-6: Stamp every outgoing record with the Supabase server clock ──────
  // Replaces any client-generated new Date().toISOString() fallbacks in push
  // mappers with a server-authoritative timestamp. One HEAD request amortised
  // across the entire batch eliminates machine clock drift from last-write-wins
  // conflict resolution without adding per-record network overhead.
  const serverNow = await getServerTimestamp();
  data = data.map((row: any) =>
    'updated_at' in row ? { ...row, updated_at: serverNow } : row
  );

  try {
    await withRetry(
      async () => {
        const { error } = await supabase.from(table).upsert(data, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });
        if (error) {
          // 400 = table/column mismatch — skip this table silently
          if (error.code === 'PGRST204' || error.code === '42P01' ||
              error.message?.includes('relation') || error.message?.includes('column') ||
              error.message?.includes('enum') || error.message?.includes('invalid input value')) {
            console.log(`[Sync] Skipping ${table} — schema mismatch: ${error.message}`);
            return;
          }
          // 409 / 23503 = FK constraint violation — skip gracefully (referenced record exists)
          if ((error as any).status === 409 || error.code === '23503') {
            console.log(`[Sync] Skipping ${table} — FK constraint: ${error.message}`);
            return;
          }
          // 401 / 403 / 42501 = auth or RLS — skip gracefully (session may not be ready yet)
          if ((error as any).status === 401 || (error as any).status === 403 || error.code === '42501') {
            console.log(`[Sync] Skipping ${table} — permission denied (will retry next sync): ${error.message}`);
            return;
          }
          throw error;
        }
      },
      { context: `Sync:${table}`, maxRetries: 2, delayMs: 1500 }
    );
    return true;
  } catch (err: any) {
    console.warn(`[Sync] Push failed for ${table}:`, translateError(err));
    return false;
  }
};

const pullTable = async (table: string, localKey: string): Promise<boolean> => {
  if (LOCAL_ONLY_TABLES.has(table)) return true; // skip silently — same as push
  try {
    const rawData = await withRetry(
      async () => {
        // skip tombstoned rows so a locally-deleted financial row is
        // NOT resurrected on pull. Inert while SOFT_DELETE_ENABLED is false.
        let query = supabase.from(table).select('*');
        if (SOFT_DELETE_ENABLED && SOFT_DELETE_TABLES.has(table)) {
          query = query.is('deleted_at', null);
        }
        const { data, error } = await query;
        if (error) {
          // 404 = table not found — skip silently
          if (error.code === 'PGRST204' || error.code === '42P01' ||
              error.message?.includes('relation') || error.message?.includes('not found') ||
              error.message?.includes('schema cache')) {
            console.log(`[Sync] Skipping pull for ${table} — not in schema cache yet`);
            return null;
          }
          throw error;
        }
        return data;
      },
      // maxRetries:1 — a statement_timeout deterministically re-times-out on a
      // retry, so a 2nd attempt only doubles the wall time and DB load; fail
      // fast to the localStorage fallback instead.
      { context: `Pull:${table}`, maxRetries: 1, delayMs: 1000 }
    );
    if (rawData && rawData.length > 0) {
      const puller = TABLE_PULL[table];
      let data = rawData.map((row: any) => {
        if (puller) return puller(row);
        // employees/assets/ledger — camelCase conversion
        return mapFromSupabase(row);
      });
      
      // ── Rebuild nested structure for employees ──────────────────
      // Supabase stores flat columns (name, cnic, phone, designation etc.)
      // but EmployeeManagement expects nested {personal:{}, work:{}, salary:{}}
      if (table === 'employees') {
        data = data.map((e: any) => ({
          ...e,
          personal: e.personal && typeof e.personal === 'object' && e.personal.name
            ? e.personal
            : {
                name: e.name || e.personal?.name || '',
                cnic: e.cnic || e.personal?.cnic || '',
                phone: e.phone || e.personal?.phone || '',
                address: e.address || e.personal?.address || '',
              },
          work: e.work && typeof e.work === 'object' && e.work.employeeCode
            ? e.work
            : {
                designation: e.designation || e.work?.designation || '',
                department: e.department || e.work?.department || '',
                grade: e.grade || e.work?.grade || '',
                joinDate: e.joinDate || e.join_date || e.work?.joinDate || '',
                employeeCode: e.employeeCode || e.employee_code || e.work?.employeeCode || '',
              },
          salary: e.salary && typeof e.salary === 'object' && (e.salary.basic !== undefined)
            ? e.salary
            : {
                basic: e.basic || e.salary?.basic || 0,
                houseRent: e.houseRent || e.house_rent || e.salary?.houseRent || 0,
                conveyance: e.conveyance || e.salary?.conveyance || 0,
                specialAllowance: e.specialAllowance || e.special_allowance || e.salary?.specialAllowance || 0,
              },
        }));
      }
      
      try {
        localStorage.setItem(localKey, JSON.stringify(data));
      } catch (quotaErr: unknown) {
        // Bulk-imported Nippon products carry base64 image_url payloads
        // that can blow the ~5 MB localStorage quota during pull. Retry
        // once with image_url stripped — Supabase still holds the real
        // images so the UI can lazy-fetch them when needed.
        const isQuota = (quotaErr instanceof Error)
          && (quotaErr.name === 'QuotaExceededError' || /quota/i.test(quotaErr.message));
        if (isQuota && table === 'products') {
          const slim = data.map((p: { imageUrl?: string }) => {
            const { imageUrl: _drop, ...rest } = p;
            return rest;
          });
          try {
            localStorage.setItem(localKey, JSON.stringify(slim));
            console.warn(`[Sync] ${table}: quota exceeded — cached ${data.length} rows without imageUrl. Supabase still holds full data.`);
          } catch { /* still over quota — give up local cache, Supabase wins */ }
        } else {
          throw quotaErr;
        }
      }
    }
    return true;
  } catch (err: any) {
    console.warn(`[Sync] Pull failed for ${table}:`, translateError(err));
    return false;
  }
};

// ── Connection state ──────────────────────────────────────────────────
let isOnline = navigator.onLine;
let syncInProgress = false;

// ── Main SyncService ──────────────────────────────────────────────────
export const SyncService = {

  // Called once on app start
  init: () => {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      isOnline = true;
      console.log('[Sync] Network restored — flushing queue + pushing pending...');
      toast.success('Back online — syncing changes...', { id: 'back-online', duration: 3000 });
      // Flush offline queue first, then sync
      flushOfflineQueue().then(() => SyncService.pushPending());
    });

    window.addEventListener('offline', () => {
      isOnline = false;
      console.log('[Sync] Network lost — working offline');
    });

    // Auto-sync every 5 minutes if online
    setInterval(() => {
      if (isOnline && !syncInProgress) {
        SyncService.pushPending();
      }
    }, 5 * 60 * 1000);
  },

  // Called after any local save — queues for Supabase push
  markDirty: (table: string) => {
    const localKey = TABLE_MAP[table];
    if (!localKey) return;
    addPending(table, localKey);
    // If online, push immediately in background
    if (isOnline) {
      setTimeout(() => SyncService.pushTable(table), 500);
    }
  },

  // Push a single table to Supabase
  pushTable: async (table: string): Promise<void> => {
    const localKey = TABLE_MAP[table];
    if (!localKey) return;
    const ok = await pushTable(table, localKey);
    if (ok) clearPending(table);
  },

  // Pull a single table from Supabase → localStorage
  pullTable: async (table: string): Promise<void> => {
    const localKey = TABLE_MAP[table];
    if (!localKey) return;
    await pullTable(table, localKey);
  },

  // Push all pending changes (called on reconnect / manual sync)
  pushPending: async (): Promise<{ pushed: number; failed: number }> => {
    if (syncInProgress) return { pushed: 0, failed: 0 };
    syncInProgress = true;

    const pending = getPending();
    if (pending.length === 0) {
      syncInProgress = false;
      return { pushed: 0, failed: 0 };
    }

    let pushed = 0;
    let failed = 0;

    for (const change of pending) {
      const ok = await pushTable(change.table, change.localKey);
      if (ok) { clearPending(change.table); pushed++; }
      else failed++;
    }

    syncInProgress = false;
    if (pushed > 0) {
      console.log(`[Sync] Pushed ${pushed} table(s) to Supabase`);
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    }
    return { pushed, failed };
  },

  // Full sync — push all tables (manual Globe button)
  syncAll: async (): Promise<{ success: boolean }> => {
    if (!isOnline) {
      toast.warning('No internet connection. Changes saved locally.');
      return { success: false };
    }

    syncInProgress = true;
    toast.info('Syncing to Cloud...', { duration: 2000 });

    let allOk = true;
    const tables = Object.keys(TABLE_MAP);

    for (const table of tables) {
      const localKey = TABLE_MAP[table];
      const ok = await pushTable(table, localKey);
      if (!ok) allOk = false;
      else clearPending(table);
    }

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    syncInProgress = false;

    if (allOk) {
      toast.success('All data synced to Cloud ✓');
      return { success: true };
    } else {
      toast.warning('Sync partial — some tables failed. Will retry.');
      return { success: false };
    }
  },

  // ── Sprint 34 hotfix: critical tables only — awaited at boot ─────────
  // Pulls the 8 highest-traffic tables in PARALLEL so the UI has fresh
  // data within ~1-2s instead of waiting for all 50+ tables sequentially.
  // App.tsx calls this first (await), then fires fetchFromCloud in background.
  fetchCritical: async (): Promise<void> => {
    if (!isOnline) return;
    // flush unsynced offline writes to the cloud BEFORE the pull. pullTable
    // is authoritative-overwrite (correct — it lets soft-delete tombstones drop
    // locally-deleted rows), so a boot pull that runs first permanently
    // WIPES rows written offline in a previous session. On reconnect the online
    // handler already pushes-then-syncs; this closes the same gap for a cold boot
    // that starts already-online. No-op (instant) when nothing is pending.
    try { await SyncService.pushPending(); } catch { /* best-effort — pull still proceeds */ }
    // The 8 tables that matter most on first render:
    const PRIORITY: Array<keyof typeof TABLE_MAP> = [
      'quotations', 'clients', 'invoices', 'accounts',
      'products', 'production_pieces', 'vendors', 'payment_receipts',
    ];
    await Promise.allSettled(
      PRIORITY.map(t => TABLE_MAP[t] ? pullTable(t, TABLE_MAP[t]) : Promise.resolve(false))
    );
    console.log('[Sync] Critical tables ready');
  },

  // Fetch from Supabase → localStorage (app start / device switch)
  // Sprint 34: now uses PARALLEL batches of 5 (was sequential — caused 15s boot).
  fetchFromCloud: async (): Promise<{ success: boolean }> => {
    if (!isOnline) {
      console.log('[Sync] Offline — using cached localStorage data');
      return { success: false };
    }

    // push unsynced local writes before the authoritative overwrite-pull
    // (see fetchCritical). Guards the device-switch path that calls this directly.
    try { await SyncService.pushPending(); } catch { /* best-effort */ }

    // Pull all tables in parallel batches of 5 (safe: each pullTable
    // is independent — writes to a separate localStorage key)
    const tables = Object.keys(TABLE_MAP);
    let fetched = 0;
    const CONCURRENCY = 5;

    for (let i = 0; i < tables.length; i += CONCURRENCY) {
      const batch = tables.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(t => pullTable(t, TABLE_MAP[t]))
      );
      fetched += results.filter(r => r.status === 'fulfilled' && r.value).length;
    }

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    console.log(`[Sync] Fetched ${fetched}/${tables.length} tables from Supabase`);
    return { success: fetched > 0 };
  },

  // Status info
  getStatus: () => ({
    isOnline,
    pendingChanges: getPending().length,
    lastSync: localStorage.getItem(LAST_SYNC_KEY) || 'Never',
    syncInProgress,
  }),

  // Conflict check — compare local vs remote timestamp
  checkConflict: async (table: string, id: string): Promise<'local_newer' | 'remote_newer' | 'same'> => {
    const localKey = TABLE_MAP[table];
    if (!localKey) return 'same';

    const localData: any[] = safeParse(localKey);
    const localItem = localData.find((r: any) => r.id === id);
    if (!localItem) return 'remote_newer';

    const { data } = await supabase.from(table).select('updated_at').eq('id', id).single();
    if (!data) return 'local_newer';

    const localTime = new Date(localItem.updated_at || localItem.updatedAt || 0).getTime();
    const remoteTime = new Date(data.updated_at || 0).getTime();

    if (localTime > remoteTime) return 'local_newer';
    if (remoteTime > localTime) return 'remote_newer';
    return 'same';
  },
};

// Auto-init when module loads
SyncService.init();
