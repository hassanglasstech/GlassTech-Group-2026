/**
 * GLASSTECH ERP — Realtime Sync Service
 *
 * Kya karta hai:
 *   - Supabase Realtime se subscribe karta hai SARE tables pe
 *   - Jab koi bhi PC pe data save hota hai, 2-3 sec mein doosre PC pe auto-update
 *   - localStorage cache automatically refresh hoti hai
 *   - React components ko window event ke zariye batata hai "data badal gaya"
 *
 * Architecture:
 *   PC-A saves → Supabase → Realtime event → PC-B RealtimeService → localStorage update → React re-renders
 */

import { supabase } from './supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ── Same TABLE_MAP as SyncService (localStorage key per table) ─────────
const TABLE_MAP: Record<string, string> = {
  // HR
  employees:          'gtk_erp_employees',
  attendance:         'gtk_erp_attendance',
  loans:              'gtk_erp_loans',
  payroll:            'gtk_erp_payroll',
  tag_master:         'gtk_erp_tag_master',
  employee_tags:      'gtk_erp_employee_tags',
  departments:        'gtk_erp_departments',
  employee_docs:      'gtk_erp_employee_docs',
  // Finance
  accounts:           'gtk_erp_accounts',
  cost_centers:       'gtk_erp_cost_centers',
  ledger:             'gtk_erp_ledger',
  petty_cash:         'gtk_erp_petty_cash',
  recurring_expenses: 'gtk_erp_recurring_expenses',
  financial_events:   'gtk_erp_financial_events',
  mapping_rules:      'gtk_erp_mapping_rules',
  gl_config:          'gtk_erp_gl_config',
  // Sales
  clients:            'gtk_erp_clients',
  quotations:         'gtk_erp_quotations',
  projects:           'gtk_erp_projects',
  invoices:           'gtk_erp_invoices',
  payment_receipts:   'gtk_erp_payment_receipts',
  // Inventory / Procurement
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
  // Production
  production_pieces:  'gtk_erp_production_pieces',
  job_orders:         'gtk_erp_job_orders',
  // Sprint 2 — Glassco floor live updates (cutting + sheet consumption)
  cutting_sessions:   'gtk_erp_cutting_sessions',
  grn_sheet_entries:  'gtk_erp_grn_sheet_entries',
  // Logistics
  gate_passes:        'gtk_erp_gate_pass',
  warehouse_spots:    'gtk_erp_warehouse_spots',
  // NCR
  ncr_events:         'gtk_erp_ncr_events',
  ncr_reproductions:  'gtk_erp_ncr_reproductions',
  ncr_claims:         'gtk_erp_ncr_claims',
  ncr_remnants:       'gtk_erp_ncr_remnants',
  // RBAC
  roles:              'gtk_erp_roles',
  permissions:        'gtk_erp_permissions',
  role_permissions:   'gtk_erp_role_permissions',
  employee_roles:     'gtk_erp_employee_roles',
};

// ── Same Pull Mappers as SyncService (Supabase row → app object) ──────
const TABLE_PULL: Record<string, (row: any) => any> = {
  quotations: (r: any) => ({
    ...r,
    clientId: r.client_id, projectName: r.project_name,
    dueDate: r.due_date, discountPercent: r.discount_percent,
    discountAmount: r.discount_amount, manualSerial: r.manual_serial,
    orderNo: r.order_no, revisedFields: r.revised_fields,
    receivedAmount: r.received_amount,
    actualDeliveryDate: r.actual_delivery_date,
    serviceCharges: r.service_charges || [],
    manualRef: r.manual_ref,
    isAlreadyDispatched: r.is_already_dispatched,
    items: r.items || [], status: r.status,
  }),
  production_pieces: (r: any) => ({
    ...r,
    orderId: r.order_id,
    itemIndex: Number(r.item_index || 0),
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
    imageUrl: r.image_url, variants: r.variants || [],
  }),
  requisitions: (r: any) => ({
    ...r,
    headerText: r.header_text, reqType: r.req_type,
    totalValue: r.total_value, approvedBy: r.approved_by,
    items: r.items || [],
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
    glTxId: r.gl_tx_id, payments: r.payments || [],
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
    photos: r.photos || [],
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
    photos: r.photos || [],
  }),
  ncr_remnants: (r: any) => ({
    ...r,
    ncrId: r.ncr_id, glassType: r.glass_type,
    estimatedKg: r.estimated_kg,
    disposalMethod: r.disposal_method,
    scrapValue: r.scrap_value,
  }),
  roles: (r: any) => ({ ...r, isSystem: r.is_system, isActive: r.is_active }),
  permissions: (r: any) => ({ ...r }),
  role_permissions: (r: any) => ({
    ...r, roleId: r.role_id, permissionId: r.permission_id,
  }),
  employee_roles: (r: any) => ({
    ...r,
    employeeId: r.employee_id, roleId: r.role_id,
    assignedAt: r.assigned_at, assignedBy: r.assigned_by,
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
    absentDates: r.absent_dates || [],
    lateDates: r.late_dates || [],
    loanRepayments: r.loan_repayments || [],
    isSalaryPaid: r.is_salary_paid,
    isOvertimePaid: r.is_overtime_paid,
    allowedAbsentCount: r.allowed_absent_count,
    loanWaived: r.loan_waived,
  }),
  tag_master: (r: any) => ({ ...r, textColor: r.text_color, isActive: r.is_active }),
  employee_tags: (r: any) => ({
    ...r, employeeId: r.employee_id, tagId: r.tag_id, isPrimary: r.is_primary,
  }),
  departments: (r: any) => ({
    ...r, parentDept: r.parent_dept, isActive: r.is_active,
  }),
};

// ── Employees: rebuild nested structure after pull ────────────────────
const rebuildEmployee = (e: any) => ({
  ...e,
  personal: e.personal && typeof e.personal === 'object' && e.personal.name
    ? e.personal
    : { name: e.name || '', cnic: e.cnic || '', phone: e.phone || '', address: e.address || '' },
  work: e.work && typeof e.work === 'object' && e.work.employeeCode
    ? e.work
    : {
        designation: e.designation || '',
        department: e.department || '',
        grade: e.grade || '',
        joinDate: e.joinDate || e.join_date || '',
        employeeCode: e.employeeCode || e.employee_code || '',
      },
  salary: e.salary && typeof e.salary === 'object' && e.salary.basic !== undefined
    ? e.salary
    : {
        basic: e.basic || 0,
        houseRent: e.houseRent || e.house_rent || 0,
        conveyance: e.conveyance || 0,
        specialAllowance: e.specialAllowance || e.special_allowance || 0,
      },
});

// ── Apply a single realtime event to localStorage ─────────────────────
const applyRealtimeEvent = (
  table: string,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  newRow: any,
  oldRow: any,
) => {
  const localKey = TABLE_MAP[table];
  if (!localKey) return;

  try {
    const raw = localStorage.getItem(localKey);
    let items: any[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) items = [];

    const puller = TABLE_PULL[table];
    const mapRow = (row: any) => {
      if (!row) return row;
      let mapped = puller ? puller(row) : row;
      if (table === 'employees') mapped = rebuildEmployee(mapped);
      return mapped;
    };

    if (eventType === 'DELETE') {
      const deleteId = oldRow?.id || newRow?.id;
      items = items.filter((i: any) => i.id !== deleteId);
    } else if (eventType === 'INSERT') {
      const mapped = mapRow(newRow);
      if (mapped?.id) {
        // Avoid duplicates — replace if already exists
        const idx = items.findIndex((i: any) => i.id === mapped.id);
        if (idx >= 0) items[idx] = mapped;
        else items.push(mapped);
      }
    } else if (eventType === 'UPDATE') {
      const mapped = mapRow(newRow);
      if (mapped?.id) {
        const idx = items.findIndex((i: any) => i.id === mapped.id);
        if (idx >= 0) items[idx] = mapped;
        else items.push(mapped); // row was missing locally, add it
      }
    }

    localStorage.setItem(localKey, JSON.stringify(items));

    // Notify React components — they listen to 'gtk_realtime_update' event
    window.dispatchEvent(
      new CustomEvent('gtk_realtime_update', {
        detail: { table, localKey, eventType },
      })
    );

    console.log(`[Realtime] ${eventType} on ${table} → localStorage updated`);
  } catch (err) {
    console.warn(`[Realtime] Failed to apply ${eventType} on ${table}:`, err);
  }
};

// ── Channel management ────────────────────────────────────────────────
let channels: RealtimeChannel[] = [];
let isSubscribed = false;

// Tables that Realtime is skipped for — local-only
const SKIP_TABLES = new Set(['activity_logs']);

// ── Phase 1-5 Supabase-native tables (no localStorage — just realtime dispatch) ──
const NATIVE_SUPABASE_TABLES = [
  'factory_events',
  'factory_escalation_alerts',
  'factory_assets',
  'hse_incidents',
  'daily_reports',
  'agent_memories',
  'agent_alert_history',
  'agent_tasks',
  'build_backlog',
  'vendor_sla',
  'vendor_sla_log',
  'worker_kpi',
  'team_pairs',
  'strategic_memory',
  'predictive_alerts',
  'whatsapp_log',
];

// Event name for native table changes (UI can listen to this)
const NATIVE_TABLE_EVENT = 'glasstech:native_table_change';

// ── Subscribe to all tables ───────────────────────────────────────────
const subscribeAll = () => {
  if (isSubscribed) return;
  isSubscribed = true;

  const tables = Object.keys(TABLE_MAP).filter(t => !SKIP_TABLES.has(t));

  // Group into batches of 10 to avoid channel limit issues
  const BATCH_SIZE = 10;
  for (let i = 0; i < tables.length; i += BATCH_SIZE) {
    const batch = tables.slice(i, i + BATCH_SIZE);
    const channelName = `gtk_realtime_batch_${Math.floor(i / BATCH_SIZE)}`;

    let channel = supabase.channel(channelName);

    for (const table of batch) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          applyRealtimeEvent(
            table,
            eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            newRow,
            oldRow,
          );
        }
      );
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] Channel ${channelName} subscribed (${batch.join(', ')})`);
      } else if (status === 'CHANNEL_ERROR') {
        console.warn(`[Realtime] Channel ${channelName} error — will retry`);
      } else if (status === 'TIMED_OUT') {
        console.warn(`[Realtime] Channel ${channelName} timed out`);
      }
    });

    channels.push(channel);
  }

  console.log(`[Realtime] Subscribed to ${tables.length} tables across ${channels.length} channels`);

  // ── Subscribe to Phase 1-5 native Supabase tables ──────────────────
  const NATIVE_BATCH_SIZE = 8;
  for (let i = 0; i < NATIVE_SUPABASE_TABLES.length; i += NATIVE_BATCH_SIZE) {
    const batch = NATIVE_SUPABASE_TABLES.slice(i, i + NATIVE_BATCH_SIZE);
    const channelName = `gtk_native_batch_${Math.floor(i / NATIVE_BATCH_SIZE)}`;
    let channel = supabase.channel(channelName);
    for (const table of batch) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          // Dispatch custom event — UI components listen and re-fetch themselves
          window.dispatchEvent(new CustomEvent(NATIVE_TABLE_EVENT, {
            detail: { table, eventType: payload.eventType, row: payload.new || payload.old }
          }));
        }
      );
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED')
        console.log(`[Realtime] Native channel ${channelName} subscribed (${batch.join(', ')})`);
    });
    channels.push(channel);
  }
  console.log(`[Realtime] Also subscribed to ${NATIVE_SUPABASE_TABLES.length} native Phase 1-5 tables`);
};

// ── Unsubscribe all (on logout / cleanup) ─────────────────────────────
const unsubscribeAll = async () => {
  for (const channel of channels) {
    await supabase.removeChannel(channel);
  }
  channels = [];
  isSubscribed = false;
  console.log('[Realtime] All channels unsubscribed');
};

// ── Main export ───────────────────────────────────────────────────────
export const RealtimeService = {
  /**
   * Call this once after user logs in (after SyncService.fetchFromCloud)
   * Subscribes to ALL tables for live cross-device updates
   */
  start: () => {
    subscribeAll();
  },

  /**
   * Call this on logout
   */
  stop: async () => {
    await unsubscribeAll();
  },

  /**
   * Check if currently subscribed
   */
  isActive: () => isSubscribed,

  /**
   * How many channels are open
   */
  channelCount: () => channels.length,
};
