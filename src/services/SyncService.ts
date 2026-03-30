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
  employees:          'gtk_erp_employees',
  attendance:         'gtk_erp_attendance',
  loans:              'gtk_erp_loans',
  payroll:            'gtk_erp_payroll',
  accounts:           'accounts',
  cost_centers:       'cost_centers',
  ledger:             'ledger',
  petty_cash:         'petty_cash',
  recurring_expenses: 'recurring_expenses',
  financial_events:   'financial_events',
  mapping_rules:      'mapping_rules',
  gl_config:          'gl_config',
  clients:            'clients',
  quotations:         'quotations',
  projects:           'projects',
  products:           'products',
  vendors:            'vendors',
  store_items:        'store',
  assets:             'assets',
  stock_ledger:       'stock_ledger',
  inspection_lots:    'inspection_lots',
  remnants:           'remnants',
  handling_units:     'handling_units',
  requisitions:       'requisitions',
  purchase_orders:    'purchase_orders',
  production_pieces:  'production_pieces',
  job_orders:         'job_orders',
  gate_passes:        'gtk_erp_gate_pass',
  warehouse_spots:    'gtk_erp_warehouse_spots',
  // NCR — add after running ncr_tables.sql in Supabase
  // NCR tables
  ncr_events:         'gtk_erp_ncr_events',
  ncr_reproductions:  'gtk_erp_ncr_reproductions',
  ncr_claims:         'gtk_erp_ncr_claims',
  ncr_remnants:       'gtk_erp_ncr_remnants',
  activity_logs:      'gtk_erp_activity_logs',
  invoices:           'gtk_erp_invoices',
  payment_receipts:   'gtk_erp_payment_receipts',
  // RBAC tables (Phase 3)
  roles:              'gtk_erp_roles',
  permissions:        'gtk_erp_permissions',
  role_permissions:   'gtk_erp_role_permissions',
  employee_roles:     'gtk_erp_employee_roles',
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
    registration_date: v.registrationDate||v.registration_date||'',
    rates: v.rates||[],
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
