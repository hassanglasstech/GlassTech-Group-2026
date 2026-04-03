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
import { toast } from 'sonner';
import { translateError, OfflineQueue, withRetry } from '../../modules/shared/services/networkService';

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

const addPending = (table: string, localKey: string) => {
  const pending = getPending();
  // Replace if already queued for same table
  const filtered = pending.filter(p => p.table !== table);
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
  petty_cash: ['id', 'company', 'date', 'type', 'amount', 'description', 'reference_doc', 'created_at'],
  employees: ['id', 'company', 'name', 'personal', 'work', 'salary', 'basic', 'house_rent', 'conveyance', 'special_allowance', 'department', 'department_id', 'designation', 'grade', 'join_date', 'employee_code', 'status', 'address', 'phone', 'cnic', 'updated_at'],
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
    id: q.id, company: q.company||'', date: q.date||'',
    due_date: q.dueDate||q.due_date||null,
    client_id: q.clientId||q.client_id||'',
    project_name: q.projectName||q.project_name||'',
    items: q.items||[], status: q.status||'Draft',
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
    last_movement_date: s.lastMovementDate||'',
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
    date: i.date||'', due_date: i.dueDate||i.due_date||'',
    total_amount: i.totalAmount||i.total_amount||0,
    received_amount: i.receivedAmount||i.received_amount||0,
    balance: i.balance||0,
    status: i.status||'Outstanding',
    gl_tx_id: i.glTxId||i.gl_tx_id||'',
    payments: i.payments||[],
    updated_at: i._updatedAt||i.updatedAt||new Date().toISOString(),
  }),
  payment_receipts: (r: any) => ({
    id: r.id,
    invoice_id: r.invoiceId||r.invoice_id||'',
    date: r.date||'',
    amount: r.amount||0,
    method: r.method||'Bank Transfer',
    reference: r.reference||'',
    gl_tx_id: r.glTxId||r.gl_tx_id||'',
    updated_at: r._updatedAt||r.updatedAt||new Date().toISOString(),
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
  employees: (e: any) => ({
    id: e.id, 
    company: e.company||'',
    name: e.personal?.name||e.name||'',
    cnic: e.personal?.cnic||e.cnic||'',
    phone: e.personal?.phone||e.phone||'',
    address: e.personal?.address||e.address||'',
    designation: e.work?.designation||e.designation||'',
    department: e.work?.department||e.department||'',
    department_id: e.work?.departmentId||e.departmentId||'',
    grade: e.work?.grade||e.grade||'',
    join_date: e.work?.joinDate||e.joinDate||e.join_date||'',
    employee_code: e.work?.employeeCode||e.employeeCode||e.employee_code||'',
    status: e.work?.status||e.status||'confirmed',
    basic: e.salary?.basic||e.basic||0,
    house_rent: e.salary?.houseRent||e.houseRent||e.house_rent||0,
    conveyance: e.salary?.conveyance||e.conveyance||0,
    special_allowance: e.salary?.specialAllowance||e.specialAllowance||e.special_allowance||0,
    personal: e.personal||null,
    work: e.work||null,
    salary: e.salary||null,
    updated_at: e._updatedAt||new Date().toISOString(),
  }),
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
  payroll: (p: any) => ({
    id: p.id, employee_id: p.employeeId||p.employee_id||'',
    month: p.month||'',
    basic_pay: p.basicPay||p.basic_pay||0,
    allowances: p.allowances||0,
    overtime_pay: p.overtimePay||p.overtime_pay||0,
    overtime_hours: p.overtimeHours||p.overtime_hours||0,
    early_deduction_hours: p.earlyDeductionHours||p.early_deduction_hours||0,
    late_deduction: p.lateDeduction||p.late_deduction||0,
    absent_deduction: p.absentDeduction||p.absent_deduction||0,
    loan_deduction: p.loanDeduction||p.loan_deduction||0,
    advance_deduction: p.advanceDeduction||p.advance_deduction||0,
    net_salary: p.netSalary||p.net_salary||0,
    absent_dates: p.absentDates||p.absent_dates||[],
    late_dates: p.lateDates||p.late_dates||[],
    loan_repayments: p.loanRepayments||p.loan_repayments||[],
    is_salary_paid: p.isSalaryPaid||p.is_salary_paid||false,
    is_overtime_paid: p.isOvertimePaid||p.is_overtime_paid||false,
    allowed_absent_count: p.allowedAbsentCount||p.allowed_absent_count||0,
    loan_waived: p.loanWaived||p.loan_waived||false,
    company: p.company||'',
  }),
  // ── Tags Push Mappers ──
  tag_master: (t: any) => ({
    id: t.id, company: t.company||'', category: t.category||'job_title',
    label: t.label||'', color: t.color||'', text_color: t.textColor||t.text_color||'',
    is_active: t.isActive!==false,
    updated_at: t._updatedAt||new Date().toISOString(),
  }),
  employee_tags: (et: any) => ({
    id: et.id, employee_id: et.employeeId||et.employee_id||'',
    tag_id: et.tagId||et.tag_id||'', is_primary: et.isPrimary||et.is_primary||false,
    updated_at: et._updatedAt||new Date().toISOString(),
  }),
  departments: (d: any) => ({
    id: d.id, company: d.company||'', name: d.name||'',
    parent_dept: d.parentDept||d.parent_dept||null,
    is_active: d.isActive!==false,
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
};

// ── Pull mappers: Supabase row → app object ───────────────────────────
const TABLE_PULL: Record<string, (row: any) => any> = {
  quotations: (r: any) => ({
    ...r,
    clientId: r.client_id, projectName: r.project_name,
    dueDate: r.due_date, discountPercent: r.discount_percent,
    discountAmount: r.discount_amount, manualSerial: r.manual_serial,
    orderNo: r.order_no, revisedFields: r.revised_fields,
    receivedAmount: r.received_amount,
    actualDeliveryDate: r.actual_delivery_date,
    serviceCharges: r.service_charges||[],
    manualRef: r.manual_ref,
    isAlreadyDispatched: r.is_already_dispatched,
    items: r.items||[], status: r.status,
  }),
  production_pieces: (r: any) => ({
    ...r,
    orderId: r.order_id,
    itemIndex: Number(r.item_index||0),
    lastUpdated: r.last_updated,
  }),
  clients: (r: any) => ({
    ...r,
    contactPerson: r.contact_person,
    creditLimit: r.credit_limit,
  }),
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
  tempering_dispatches: (r: any) => ({
    ...r,
    plantName: r.plant_name, vehicleNo: r.vehicle_no,
    driverName: r.driver_name, serviceType: r.service_type,
    pieceIds: r.piece_ids||[], totalSqFt: r.total_sq_ft,
    chargesPerSqFt: r.charges_per_sq_ft, totalCharges: r.total_charges,
  }),
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
  invoices: (r: any) => ({
    ...r,
    orderId: r.order_id, orderNo: r.order_no,
    clientId: r.client_id, clientName: r.client_name,
    dueDate: r.due_date, totalAmount: r.total_amount,
    receivedAmount: r.received_amount,
    glTxId: r.gl_tx_id, payments: r.payments||[],
  }),
  payment_receipts: (r: any) => ({
    ...r,
    invoiceId: r.invoice_id, glTxId: r.gl_tx_id,
  }),
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
  tag_master: (r: any) => ({
    ...r,
    textColor: r.text_color,
    isActive: r.is_active,
  }),
  employee_tags: (r: any) => ({
    ...r,
    employeeId: r.employee_id,
    tagId: r.tag_id,
    isPrimary: r.is_primary,
  }),
  departments: (r: any) => ({
    ...r,
    parentDept: r.parent_dept,
    isActive: r.is_active,
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
};

const pushTable = async (table: string, localKey: string): Promise<boolean> => {
  if (LOCAL_ONLY_TABLES.has(table)) return true;

  const rawData = safeParse(localKey);
  if (!rawData || rawData.length === 0) return true;

  let data: any[];
  const pusher = TABLE_PUSH[table];
  if (pusher) {
    data = rawData.map(pusher).filter((r: any) => r.id);
  } else if (['assets','ledger','petty_cash'].includes(table)) {
    const mapped = rawData.map(mapToSupabase);
    data = filterColumns(table, mapped);
  } else {
    console.log(`[Sync] No push handler for ${table} — skipping`);
    return true;
  }
  
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
        const { data, error } = await supabase.from(table).select('*');
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
      { context: `Pull:${table}`, maxRetries: 2, delayMs: 1000 }
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
      
      localStorage.setItem(localKey, JSON.stringify(data));
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
      OfflineQueue.flush(supabase).then(() => SyncService.pushPending());
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

  // Fetch from Supabase → localStorage (app start / device switch)
  fetchFromCloud: async (): Promise<{ success: boolean }> => {
    if (!isOnline) {
      console.log('[Sync] Offline — using cached localStorage data');
      return { success: false };
    }

    // Pull all tables
    const tables = Object.keys(TABLE_MAP);
    let fetched = 0;

    for (const table of tables) {
      const localKey = TABLE_MAP[table];
      const ok = await pullTable(table, localKey);
      if (ok) fetched++;
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
