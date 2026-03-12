import { supabase } from './supabaseClient';
import { safeParse } from '@/modules/shared/services/utils';
import { initDB } from '@/modules/shared/services/db';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// EXACT keys as used by every module in the app  (verified from source code)
// ─────────────────────────────────────────────────────────────────────────────
const KEYS = {
  EMPLOYEES:            'gtk_erp_employees',
  ATTENDANCE:           'gtk_erp_attendance',
  LOANS:                'gtk_erp_loans',
  PAYROLL:              'gtk_erp_payroll',
  ACCOUNTS:             'gtk_erp_accounts',
  COST_CENTERS:         'gtk_erp_cost_centers',       // ← underscore (not camelCase)
  LEDGER:               'gtk_erp_ledger',
  PETTY_CASH:           'gtk_erp_petty_cash',          // ← underscore
  RECURRING_EXPENSES:   'gtk_erp_recurring_expenses',  // ← underscore
  FINANCIAL_EVENTS:     'gtk_erp_financial_events',    // ← underscore
  MAPPING_RULES:        'gtk_erp_mapping_rules',       // ← underscore
  GL_CONFIG:            'gtk_erp_gl_config',           // ← underscore
  CLIENTS:              'gtk_erp_clients',
  QUOTATIONS:           'gtk_erp_quotations',
  PROJECTS:             'gtk_erp_projects',
  PRODUCTS:             'gtk_erp_products',
  STORE:                'gtk_erp_store',
  STOCK_LEDGER:         'gtk_erp_stock_ledger',        // ← underscore
  INSPECTION_LOTS:      'gtk_erp_inspection_lots',     // ← underscore
  PRODUCTION_PIECES:    'gtk_erp_production_pieces',   // ← underscore
  TEMPERING_DISPATCHES: 'gtk_erp_tempering_dispatches',// ← "dispatches" in backup maps here
  GATE_PASSES:          'gtk_erp_gate_passes',         // ← underscore (service uses gate_pass but restore uses gate_passes)
  WAREHOUSE_SPOTS:      'gtk_erp_warehouse_spots',     // ← underscore
  JOB_ORDERS:           'gtk_erp_job_orders',          // ← underscore
  REQUISITIONS:         'gtk_erp_requisitions',
  PURCHASE_ORDERS:      'gtk_erp_purchase_orders',     // ← underscore
  VENDORS:              'gtk_erp_vendors',
  REMNANTS:             'gtk_erp_remnants',
  HANDLING_UNITS:       'gtk_erp_handling_units',      // ← underscore
  ACTIVITY_LOGS:        'gtk_erp_activity_logs',       // ← underscore
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

// Converts empty string / falsy to null for DATE columns
function dateOrNull(v: any): string | null {
  if (!v || v === '' || v === 'null' || v === 'undefined') return null;
  return v;
}

async function upsertTable(tableName: string, rows: any[]) {
  if (!rows || rows.length === 0) return;
  const { error } = await supabase.from(tableName).upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`${tableName}: ${error.message}`);
  console.log(`[SyncService] ✅ ${tableName} synced (${rows.length} rows)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD MAPPERS  (app nested/camelCase → Supabase snake_case flat)
// ─────────────────────────────────────────────────────────────────────────────
const up = {
  employees: (data: any[]) => data.map(e => ({
    id: e.id, company: e.company,
    name: e.personal?.name ?? '', cnic: e.personal?.cnic ?? '',
    phone: e.personal?.phone ?? '', address: e.personal?.address ?? '',
    designation: e.work?.designation ?? '', department: e.work?.department ?? '',
    grade: e.work?.grade ?? '', join_date: dateOrNull(e.work?.joinDate),
    employee_code: e.work?.employeeCode ?? '',
    basic: e.salary?.basic ?? 0, house_rent: e.salary?.houseRent ?? 0,
    conveyance: e.salary?.conveyance ?? 0, special_allowance: e.salary?.specialAllowance ?? 0,
  })),

  attendance: (data: any[]) => data.map(a => ({
    id: a.id, employee_id: a.employeeId, date: dateOrNull(a.date), status: a.status,
    late_minutes: a.lateMinutes ?? 0, early_minutes: a.earlyMinutes ?? 0,
    overtime_hours: a.overtimeHours ?? 0,
  })),

  loans: (data: any[]) => data.map(l => ({
    id: l.id, employee_id: l.employeeId, type: l.type,
    amount: l.amount ?? 0, repayment_amount: l.repaymentAmount ?? 0,
    status: l.status, date: dateOrNull(l.date),
  })),

  payroll: (data: any[]) => data.map(p => ({
    id: p.id, employee_id: p.employeeId, month: p.month,
    basic_pay: p.basicPay ?? 0, allowances: p.allowances ?? 0,
    overtime_pay: p.overtimePay ?? 0, overtime_hours: p.overtimeHours ?? 0,
    early_deduction_hours: p.earlyDeductionHours ?? 0,
    late_deduction: p.lateDeduction ?? 0, absent_deduction: p.absentDeduction ?? 0,
    loan_deduction: p.loanDeduction ?? 0, advance_deduction: p.advanceDeduction ?? 0,
    net_salary: p.netSalary ?? 0, absent_dates: p.absentDates ?? [],
    late_dates: p.lateDates ?? [], loan_repayments: p.loanRepayments ?? [],
    is_salary_paid: p.isSalaryPaid ?? false, is_overtime_paid: p.isOvertimePaid ?? false,
    allowed_absent_count: p.allowedAbsentCount ?? 0,
    loan_waived: typeof p.loanWaived === 'boolean' ? (p.loanWaived ? 1 : 0) : (p.loanWaived ?? 0),
  })),

  accounts: (data: any[]) => data.map(a => ({
    id: a.id, company: a.company, code: a.code, name: a.name,
    level: a.level, parent_id: a.parentId ?? null, type: a.type,
  })),

  cost_centers: (data: any[]) => data.map(c => ({
    id: c.id, company: c.company, code: c.code, name: c.name,
    department: c.department, category: c.category, hierarchy_area: c.hierarchyArea,
  })),

  ledger: (data: any[]) => data.map(l => ({
    id: l.id, company: l.company, doc_type: l.docType,
    doc_date: dateOrNull(l.docDate), date: dateOrNull(l.date),
    description: l.description, reference_id: l.referenceId,
    status: l.status, details: l.details ?? [],
  })),

  clients: (data: any[]) => data.map(c => ({
    id: c.id, company: c.company, name: c.name,
    contact_person: c.contactPerson, email: c.email, phone: c.phone,
    address: c.address, ntn: c.ntn, credit_limit: c.creditLimit ?? 0,
    status: c.status ?? 'Active',
  })),

  quotations: (data: any[]) => data.map(q => ({
    id: q.id, company: q.company, date: dateOrNull(q.date), due_date: dateOrNull(q.dueDate),
    client_id: q.clientId, project_name: q.projectName, items: q.items ?? [],
    status: q.status ?? 'Draft', is_already_dispatched: q.isAlreadyDispatched ?? false,
    discount_percent: q.discountPercent ?? 0, manual_serial: q.manualSerial ?? '',
    order_no: q.orderNo ?? '', revised_fields: q.revisedFields ?? [],
    received_amount: q.receivedAmount ?? 0, actual_delivery_date: dateOrNull(q.actualDeliveryDate),
  })),

  products: (data: any[]) => data.map(p => ({
    id: p.id, company: p.company, category: p.category, description: p.description,
    service_nick: p.serviceNick, profile_code: p.profileCode, thickness: p.thickness,
    sheet_size: p.sheetSize, cost_price: p.costPrice ?? 0, base_price: p.basePrice ?? 0,
    unit: p.unit, variants: p.variants ?? [],
    model_no: p.modelNo ?? '', brand: p.brand ?? '',
    main_category: p.mainCategory ?? '', sub_category: p.subCategory ?? '',
    finish_color: p.finishColor ?? '', material: p.material ?? '',
    direction: p.direction ?? '', tongue_length: p.tongueLength ?? '',
    spindle_length: p.spindleLength ?? '', image_url: p.imageUrl ?? '',
    hs_code: p.hsCode ?? '', is_set: p.isSet ?? false,
    set_components: p.setComponents ?? [], technical_specs: p.technicalSpecs ?? {},
    width: p.width ?? 0, height: p.height ?? 0,
    frame_color: p.frameColor ?? '', mesh_color: p.meshColor ?? '',
  })),

  store: (data: any[]) => data.map(s => ({
    id: s.id, company: s.company, name: s.name, category: s.category,
    quantity: s.quantity ?? 0, unrestricted_qty: s.unrestrictedQty ?? 0,
    qi_qty: s.qiQty ?? 0, blocked_qty: s.blockedQty ?? 0,
    reserved_qty: s.reservedQty ?? 0, consignment_qty: s.consignmentQty ?? 0,
    unit: s.unit, alt_unit: s.altUnit, conversion_factor: s.conversionFactor ?? 1,
    min_level: s.minLevel ?? 0, reorder_point: s.reorderPoint ?? 0,
    moving_average_price: s.movingAveragePrice ?? 0, total_value: s.totalValue ?? 0,
    storage_bin: s.storageBin, last_movement_date: dateOrNull(s.lastMovementDate),
  })),

  production_pieces: (data: any[]) => data.map(p => ({
    id: p.id, order_id: p.orderId, item_index: p.itemIndex ?? 0,
    specs: p.specs, status: p.status ?? 'Pending',
    last_updated: p.lastUpdated ?? new Date().toISOString(),
  })),

  // backup key "dispatches" → app key "tempering_dispatches" → supabase table "dispatches"
  dispatches: (data: any[]) => data.map(d => ({
    id: d.id, trip_id: d.tripId, company: d.company, date: dateOrNull(d.date),
    dispatch_time: d.dispatchTime, origin_location: d.originLocation,
    plant_name: d.plantName, pick_location: d.pickLocation,
    vehicle_no: d.vehicleNo, driver_name: d.driverName, service_type: d.serviceType,
    piece_ids: d.pieceIds ?? [], total_sq_ft: d.totalSqFt ?? 0,
    status: d.status ?? 'Pending', charges_per_sq_ft: d.chargesPerSqFt ?? 0,
    total_charges: d.totalCharges ?? 0, expected_return_date: dateOrNull(d.expectedReturnDate),
  })),

  requisitions: (data: any[]) => data.map(r => ({
    id: r.id, company: r.company, date: dateOrNull(r.date), header_text: r.headerText,
    requisitioner: r.requisitioner, priority: r.priority ?? 'Normal', req_type: r.reqType,
    items: r.items ?? [], total_value: r.totalValue ?? 0, status: r.status ?? 'Pending',
    employee_id: r.employeeId ?? null, loan_amount: r.loanAmount ?? 0,
    loan_purpose: r.loanPurpose, installments: r.installments ?? 0,
    overtime_hours: r.overtimeHours ?? 0, overtime_employees: r.overtimeEmployees ?? [],
    approved_by: r.approvedBy,
  })),

  purchase_orders: (data: any[]) => data.map(p => ({
    id: p.id, from_company: p.fromCompany, to_vendor: p.toVendor, date: dateOrNull(p.date),
    status: p.status ?? 'Draft', total_amount: p.totalAmount ?? 0,
    category: p.category, project_id: p.projectId, items: p.items ?? [],
  })),

  vendors: (data: any[]) => data.map(v => ({
    id: v.id, name: v.name, nick_name: v.nickName, type: v.type, company: v.company,
    address: v.address, contact_person: v.contactPerson, phone: v.phone,
    registration_date: dateOrNull(v.registrationDate), rates: v.rates ?? [],
  })),

  warehouse_spots: (data: any[]) => data.map(w => ({
    id: w.id, company: w.company, code: w.code, zone: w.zone,
  })),

  activity_logs: (data: any[]) => data.map(l => ({
    id: l.id, company: l.company, module: l.module, action: l.action,
    description: l.description, reference_id: l.referenceId,
    timestamp: l.timestamp ?? new Date().toISOString(), user: l.user,
  })),
};

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD MAPPERS  (Supabase flat snake_case → app nested camelCase)
// ─────────────────────────────────────────────────────────────────────────────
const down = {
  employees: (rows: any[]) => rows.map(r => ({
    id: r.id, company: r.company,
    personal: {
      name: r.name ?? '', cnic: r.cnic ?? '',
      phone: r.phone ?? '', address: r.address ?? '',
    },
    work: {
      designation: r.designation ?? '', department: r.department ?? '',
      grade: r.grade ?? '', joinDate: r.join_date ?? '',
      employeeCode: r.employee_code ?? '',
    },
    salary: {
      basic: r.basic ?? 0, houseRent: r.house_rent ?? 0,
      conveyance: r.conveyance ?? 0, specialAllowance: r.special_allowance ?? 0,
    },
  })),

  attendance: (rows: any[]) => rows.map(r => ({
    id: r.id, employeeId: r.employee_id, date: r.date, status: r.status,
    lateMinutes: r.late_minutes ?? 0, earlyMinutes: r.early_minutes ?? 0,
    overtimeHours: r.overtime_hours ?? 0,
  })),

  loans: (rows: any[]) => rows.map(r => ({
    id: r.id, employeeId: r.employee_id, type: r.type,
    amount: r.amount ?? 0, repaymentAmount: r.repayment_amount ?? 0,
    status: r.status, date: r.date ?? '',
  })),

  payroll: (rows: any[]) => rows.map(r => ({
    id: r.id, employeeId: r.employee_id, month: r.month,
    basicPay: r.basic_pay ?? 0, allowances: r.allowances ?? 0,
    overtimePay: r.overtime_pay ?? 0, overtimeHours: r.overtime_hours ?? 0,
    earlyDeductionHours: r.early_deduction_hours ?? 0,
    lateDeduction: r.late_deduction ?? 0, absentDeduction: r.absent_deduction ?? 0,
    loanDeduction: r.loan_deduction ?? 0, advanceDeduction: r.advance_deduction ?? 0,
    netSalary: r.net_salary ?? 0, absentDates: r.absent_dates ?? [],
    lateDates: r.late_dates ?? [], loanRepayments: r.loan_repayments ?? [],
    isSalaryPaid: r.is_salary_paid ?? false, isOvertimePaid: r.is_overtime_paid ?? false,
    allowedAbsentCount: r.allowed_absent_count ?? 0,
    loanWaived: r.loan_waived ? true : false,
  })),

  accounts: (rows: any[]) => rows.map(r => ({
    id: r.id, company: r.company, code: r.code, name: r.name,
    level: r.level, parentId: r.parent_id ?? null, type: r.type,
  })),

  cost_centers: (rows: any[]) => rows.map(r => ({
    id: r.id, company: r.company, code: r.code, name: r.name,
    department: r.department, category: r.category, hierarchyArea: r.hierarchy_area,
  })),

  ledger: (rows: any[]) => rows.map(r => ({
    id: r.id, company: r.company, docType: r.doc_type,
    docDate: r.doc_date, date: r.date, description: r.description,
    referenceId: r.reference_id, status: r.status, details: r.details ?? [],
  })),

  clients: (rows: any[]) => rows.map(r => ({
    id: r.id, company: r.company, name: r.name,
    contactPerson: r.contact_person, email: r.email, phone: r.phone,
    address: r.address, ntn: r.ntn, creditLimit: r.credit_limit ?? 0,
    status: r.status, createdAt: r.created_at,
  })),

  quotations: (rows: any[]) => rows.map(r => ({
    id: r.id, company: r.company, date: r.date, dueDate: r.due_date,
    clientId: r.client_id, projectName: r.project_name, items: r.items ?? [],
    status: r.status, isAlreadyDispatched: r.is_already_dispatched ?? false,
    discountPercent: r.discount_percent ?? 0, manualSerial: r.manual_serial ?? '',
    orderNo: r.order_no ?? '', revisedFields: r.revised_fields ?? [],
    receivedAmount: r.received_amount ?? 0, actualDeliveryDate: r.actual_delivery_date,
  })),

  products: (rows: any[]) => rows.map(r => ({
    id: r.id, company: r.company, category: r.category, description: r.description,
    serviceNick: r.service_nick, profileCode: r.profile_code, thickness: r.thickness,
    sheetSize: r.sheet_size, costPrice: r.cost_price ?? 0, basePrice: r.base_price ?? 0,
    unit: r.unit, variants: r.variants ?? [],
    modelNo: r.model_no ?? '', brand: r.brand ?? '',
    mainCategory: r.main_category ?? '', subCategory: r.sub_category ?? '',
    finishColor: r.finish_color ?? '', material: r.material ?? '',
    direction: r.direction ?? '', tongueLength: r.tongue_length ?? '',
    spindleLength: r.spindle_length ?? '', imageUrl: r.image_url ?? '',
    hsCode: r.hs_code ?? '', isSet: r.is_set ?? false,
    setComponents: r.set_components ?? [], technicalSpecs: r.technical_specs ?? {},
    width: r.width ?? 0, height: r.height ?? 0,
    frameColor: r.frame_color ?? '', meshColor: r.mesh_color ?? '',
  })),

  store: (rows: any[]) => rows.map(r => ({
    id: r.id, company: r.company, name: r.name, category: r.category,
    quantity: r.quantity ?? 0, unrestrictedQty: r.unrestricted_qty ?? 0,
    qiQty: r.qi_qty ?? 0, blockedQty: r.blocked_qty ?? 0,
    reservedQty: r.reserved_qty ?? 0, consignmentQty: r.consignment_qty ?? 0,
    unit: r.unit, altUnit: r.alt_unit, conversionFactor: r.conversion_factor ?? 1,
    minLevel: r.min_level ?? 0, reorderPoint: r.reorder_point ?? 0,
    movingAveragePrice: r.moving_average_price ?? 0, totalValue: r.total_value ?? 0,
    storageBin: r.storage_bin, lastMovementDate: r.last_movement_date,
  })),

  production_pieces: (rows: any[]) => rows.map(r => ({
    id: r.id, orderId: r.order_id, itemIndex: r.item_index ?? 0,
    specs: r.specs, status: r.status, lastUpdated: r.last_updated,
  })),

  // supabase "dispatches" table → app localStorage key "gtk_erp_tempering_dispatches"
  dispatches: (rows: any[]) => rows.map(r => ({
    id: r.id, tripId: r.trip_id, company: r.company, date: r.date,
    dispatchTime: r.dispatch_time, originLocation: r.origin_location,
    plantName: r.plant_name, pickLocation: r.pick_location,
    vehicleNo: r.vehicle_no, driverName: r.driver_name, serviceType: r.service_type,
    pieceIds: r.piece_ids ?? [], totalSqFt: r.total_sq_ft ?? 0, status: r.status,
    chargesPerSqFt: r.charges_per_sq_ft ?? 0, totalCharges: r.total_charges ?? 0,
    expectedReturnDate: r.expected_return_date,
  })),

  requisitions: (rows: any[]) => rows.map(r => ({
    id: r.id, company: r.company, date: r.date, headerText: r.header_text,
    requisitioner: r.requisitioner, priority: r.priority, reqType: r.req_type,
    items: r.items ?? [], totalValue: r.total_value ?? 0, status: r.status,
    employeeId: r.employee_id, loanAmount: r.loan_amount ?? 0,
    loanPurpose: r.loan_purpose, installments: r.installments ?? 0,
    overtimeHours: r.overtime_hours ?? 0, overtimeEmployees: r.overtime_employees ?? [],
    approvedBy: r.approved_by,
  })),

  purchase_orders: (rows: any[]) => rows.map(r => ({
    id: r.id, fromCompany: r.from_company, toVendor: r.to_vendor, date: r.date,
    status: r.status, totalAmount: r.total_amount ?? 0,
    category: r.category, projectId: r.project_id, items: r.items ?? [],
  })),

  vendors: (rows: any[]) => rows.map(r => ({
    id: r.id, name: r.name, nickName: r.nick_name, type: r.type, company: r.company,
    address: r.address, contactPerson: r.contact_person, phone: r.phone,
    registrationDate: r.registration_date, rates: r.rates ?? [],
  })),

  warehouse_spots: (rows: any[]) => rows.map(r => ({
    id: r.id, company: r.company, code: r.code, zone: r.zone,
  })),

  activity_logs: (rows: any[]) => rows.map(r => ({
    id: r.id, company: r.company, module: r.module, action: r.action,
    description: r.description, referenceId: r.reference_id,
    timestamp: r.timestamp, user: r.user,
  })),
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SYNC SERVICE
// ─────────────────────────────────────────────────────────────────────────────
export const SyncService = {

  // Upload: localStorage + IndexedDB → Supabase
  syncAll: async () => {
    try {
      console.log('[SyncService] 🚀 Starting full sync...');
      toast.info('Syncing to Cloud...');

      // IndexedDB tables (production pieces)
      let productionPieces: any[] = [];
      try {
        const db = await initDB();
        productionPieces = await db.getAll('productionPieces');
        if (productionPieces.length === 0) productionPieces = safeParse(KEYS.PRODUCTION_PIECES) ?? [];
      } catch { productionPieces = safeParse(KEYS.PRODUCTION_PIECES) ?? []; }

      await upsertTable('employees',         up.employees(safeParse(KEYS.EMPLOYEES) ?? []));
      await upsertTable('attendance',        up.attendance(safeParse(KEYS.ATTENDANCE) ?? []));
      await upsertTable('loans',             up.loans(safeParse(KEYS.LOANS) ?? []));
      await upsertTable('payroll',           up.payroll(safeParse(KEYS.PAYROLL) ?? []));
      await upsertTable('accounts',          up.accounts(safeParse(KEYS.ACCOUNTS) ?? []));
      await upsertTable('cost_centers',      up.cost_centers(safeParse(KEYS.COST_CENTERS) ?? []));
      await upsertTable('ledger',            up.ledger(safeParse(KEYS.LEDGER) ?? []));
      await upsertTable('petty_cash',        safeParse(KEYS.PETTY_CASH)          ?? []);
      await upsertTable('recurring_expenses',safeParse(KEYS.RECURRING_EXPENSES)  ?? []);
      await upsertTable('financial_events',  safeParse(KEYS.FINANCIAL_EVENTS)    ?? []);
      await upsertTable('mapping_rules',     safeParse(KEYS.MAPPING_RULES)       ?? []);
      await upsertTable('gl_config',         safeParse(KEYS.GL_CONFIG)           ?? []);
      await upsertTable('clients',           up.clients(safeParse(KEYS.CLIENTS) ?? []));
      await upsertTable('quotations',        up.quotations(safeParse(KEYS.QUOTATIONS) ?? []));
      await upsertTable('projects',          safeParse(KEYS.PROJECTS)            ?? []);
      await upsertTable('products',          up.products(safeParse(KEYS.PRODUCTS) ?? []));
      await upsertTable('store',       up.store(safeParse(KEYS.STORE) ?? []));
      await upsertTable('stock_ledger',      safeParse(KEYS.STOCK_LEDGER)        ?? []);
      await upsertTable('inspection_lots',   safeParse(KEYS.INSPECTION_LOTS)     ?? []);
      await upsertTable('production_pieces', up.production_pieces(productionPieces));
      await upsertTable('dispatches',        up.dispatches(safeParse(KEYS.TEMPERING_DISPATCHES) ?? []));
      await upsertTable('gate_passes',       safeParse(KEYS.GATE_PASSES)         ?? []);
      await upsertTable('warehouse_spots',   up.warehouse_spots(safeParse(KEYS.WAREHOUSE_SPOTS) ?? []));
      
      await upsertTable('requisitions',      up.requisitions(safeParse(KEYS.REQUISITIONS) ?? []));
      await upsertTable('purchase_orders',   up.purchase_orders(safeParse(KEYS.PURCHASE_ORDERS) ?? []));
      await upsertTable('vendors',           up.vendors(safeParse(KEYS.VENDORS) ?? []));
      
      
      await upsertTable('activity_logs',     up.activity_logs(safeParse(KEYS.ACTIVITY_LOGS) ?? []));

      console.log('[SyncService] ✅ Full sync done!');
      toast.success('Data Synced to Cloud!');
      return { success: true };
    } catch (error: any) {
      console.error('[SyncService] ❌ Sync failed:', error);
      toast.error(`Sync Failed: ${error.message || 'Unknown error'}`);
      return { success: false, error };
    }
  },

  // Download: Supabase → localStorage + IndexedDB
  fetchFromCloud: async () => {
    try {
      console.log('[SyncService] 📥 Fetching from Supabase...');
      toast.info('Fetching from Cloud...');

      async function fetch(table: string, key: string, mapper?: (r: any[]) => any[]) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) { console.error(`[SyncService] ❌ ${table}:`, error.message); return; }
        if (!data) return;
        const mapped = mapper ? mapper(data) : data;
        localStorage.setItem(key, JSON.stringify(mapped));
        console.log(`[SyncService] ✅ ${table} → ${key} (${data.length} rows)`);
        return mapped;
      }

      await fetch('employees',         KEYS.EMPLOYEES,            down.employees);
      await fetch('attendance',        KEYS.ATTENDANCE,           down.attendance);
      await fetch('loans',             KEYS.LOANS,                down.loans);
      await fetch('payroll',           KEYS.PAYROLL,              down.payroll);
      await fetch('accounts',          KEYS.ACCOUNTS,             down.accounts);
      await fetch('cost_centers',      KEYS.COST_CENTERS,         down.cost_centers);
      await fetch('ledger',            KEYS.LEDGER,               down.ledger);
      await fetch('petty_cash',        KEYS.PETTY_CASH);
      await fetch('recurring_expenses',KEYS.RECURRING_EXPENSES);
      await fetch('financial_events',  KEYS.FINANCIAL_EVENTS);
      await fetch('mapping_rules',     KEYS.MAPPING_RULES);
      await fetch('gl_config',         KEYS.GL_CONFIG);
      await fetch('clients',           KEYS.CLIENTS,              down.clients);
      await fetch('quotations',        KEYS.QUOTATIONS,           down.quotations);
      await fetch('projects',          KEYS.PROJECTS);
      await fetch('products',          KEYS.PRODUCTS,             down.products);
      await fetch('store',       KEYS.STORE,                down.store);
      await fetch('stock_ledger',      KEYS.STOCK_LEDGER);
      await fetch('inspection_lots',   KEYS.INSPECTION_LOTS);
      await fetch('gate_passes',       KEYS.GATE_PASSES);
      await fetch('warehouse_spots',   KEYS.WAREHOUSE_SPOTS,      down.warehouse_spots);
      
      await fetch('requisitions',      KEYS.REQUISITIONS,         down.requisitions);
      await fetch('purchase_orders',   KEYS.PURCHASE_ORDERS,      down.purchase_orders);
      await fetch('vendors',           KEYS.VENDORS,              down.vendors);
      
      
      await fetch('activity_logs',     KEYS.ACTIVITY_LOGS,        down.activity_logs);

      // dispatches → tempering_dispatches key
      await fetch('dispatches', KEYS.TEMPERING_DISPATCHES, down.dispatches);

      // Production pieces also go into IndexedDB
      const { data: pieces } = await supabase.from('production_pieces').select('*');
      if (pieces && pieces.length > 0) {
        const mapped = down.production_pieces(pieces);
        localStorage.setItem(KEYS.PRODUCTION_PIECES, JSON.stringify(mapped));
        try {
          const db = await initDB();
          await db.clear('productionPieces');
          const tx = db.transaction('productionPieces', 'readwrite');
          await Promise.all(mapped.map((item: any) => tx.store.put(item)));
          await tx.done;
          console.log(`[SyncService] ✅ production_pieces → IndexedDB (${mapped.length} rows)`);
        } catch (e) { console.warn('[SyncService] IDB write failed:', e); }
      }

      console.log('[SyncService] ✅ Fetch complete!');
      toast.success('Data Fetched from Cloud!');
      return { success: true };
    } catch (error: any) {
      console.error('[SyncService] ❌ Fetch failed:', error);
      toast.error(`Fetch Failed: ${error.message || 'Unknown error'}`);
      return { success: false };
    }
  },
};
