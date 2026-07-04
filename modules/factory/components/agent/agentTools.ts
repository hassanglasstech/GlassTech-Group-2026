import { supabase } from '@/src/services/supabaseClient';
import { FinanceAgent } from './FinanceAgent';
import { ProductionAgent } from './ProductionAgent';
import { OpsAgent } from './OpsAgent';
import { logAudit } from '@/modules/factory/services/auditService';

const ls    = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
const lsSet = (key: string, val: any) => localStorage.setItem(key, JSON.stringify(val));

// ════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ════════════════════════════════════════════════════════════════════
export const TOOL_DEFINITIONS = [

  // ── READ: FIND / SEARCH ─────────────────────────────────────────
  { name: 'find_order',
    description: 'Find any document (quotation, sales order, job order, requisition) by ID, order number, client name, or month/year. Call before print_document.',
    input_schema: { type: 'object', properties: {
      doc_type:    { type: 'string', enum: ['quotation','sales_order','job_order','requisition'] },
      search_id:   { type: 'string', description: 'ID or order number e.g. 2367' },
      client_name: { type: 'string' },
      month:       { type: 'string', description: 'e.g. November' },
      year:        { type: 'string', description: 'e.g. 2024' },
    }, required: ['doc_type'] },
  },

  { name: 'search_client',
    description: 'Search for a client by name.',
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },

  { name: 'get_glass_rate',
    description: 'Get current selling rate for glass type and thickness from product master.',
    input_schema: { type: 'object', properties: {
      glass_type: { type: 'string', description: 'Plain, Color, Mirror, Fluted' },
      thickness:  { type: 'string', description: '5mm, 6mm, 8mm etc.' },
    }, required: ['glass_type','thickness'] },
  },

  // ── FINANCE AGENT ───────────────────────────────────────────────
  { name: 'petty_cash_report',
    description: 'Petty cash ka hisab — kisi bhi period ka. "is hafte petty cash", "November ka petty cash", "aaj kitna kharch hua". PDF bhi generate kar sakta hai.',
    input_schema: { type: 'object', properties: {
      query:     { type: 'string', description: '"is hafte", "last month", "November"' },
      print_pdf: { type: 'boolean', description: 'true = PDF generate karo' },
    }, required: ['query'] },
  },

  { name: 'outstanding_payments',
    description: 'Client outstanding payments — kiski kitni baaki, kitne din se. "kiski payment baaki hai", "overdue clients".',
    input_schema: { type: 'object', properties: {
      client_name:  { type: 'string', description: 'Specific client (blank = sab)' },
      overdue_only: { type: 'boolean', description: 'true = sirf 30+ din wale' },
    }, required: [] },
  },

  { name: 'expense_summary',
    description: 'Expense summary by category. "is mahine ke kharche", "category wise expenses".',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: '"is mahine", "last week"' },
    }, required: ['query'] },
  },

  { name: 'get_client_balance',
    description: 'Client ka outstanding balance, total orders, payment history.',
    input_schema: { type: 'object', properties: {
      client_name: { type: 'string' },
    }, required: ['client_name'] },
  },

  // ── PRODUCTION AGENT ────────────────────────────────────────────
  { name: 'floor_status',
    description: 'Production floor ka full status — active jobs, stuck, cutting, dispatch. "floor ka kya hal hai", "morning briefing", "aaj kya chal raha hai".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  { name: 'ncr_report',
    description: 'NCR aur breakage report — kitna tuta, kis cutter ne, kya reason. "breakage report", "NCR", "is hafte kitna tuta".',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: '"aaj", "is hafte", "is mahine"' },
    }, required: ['query'] },
  },

  { name: 'cutting_report',
    description: 'Cutting sessions report — aaj kitna kita, kaun sa cutter, kaun si table.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: '"aaj", "is hafte"' },
    }, required: ['query'] },
  },

  { name: 'stuck_jobs',
    description: 'Jobs jo zyada din se stuck hain. "kaunse orders stuck hain", "pending jobs".',
    input_schema: { type: 'object', properties: {
      min_days: { type: 'number', description: 'Minimum days (default 3)' },
    }, required: [] },
  },

  // ── OPS AGENT ───────────────────────────────────────────────────
  { name: 'stock_status',
    description: 'Stock check — glass, store items, low stock alerts. "8mm ka stock", "kya khatam ho raha hai", "low stock".',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Item name, thickness, or category' },
    }, required: [] },
  },

  { name: 'purchase_order_status',
    description: 'Purchase orders — pending, overdue, received. "PO status", "overdue POs".',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'pending / overdue / received / all' },
    }, required: [] },
  },

  { name: 'vendor_summary',
    description: 'Vendor details aur order history. "Ali Glass summary", "vendors list".',
    input_schema: { type: 'object', properties: {
      vendor_name: { type: 'string', description: 'Vendor name (blank = all)' },
    }, required: [] },
  },

  { name: 'delivery_status',
    description: 'Dispatch aur delivery — ready orders, aaj kya gaya, gate passes.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  { name: 'requisition_overview',
    description: 'Requisitions overview — pending, urgent, stale, approved awaiting PO.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  { name: 'ops_snapshot',
    description: 'Full ops snapshot — stock + PO + delivery + reqs ek saath. "ops ka kya hal hai".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ── ACTIONS ─────────────────────────────────────────────────────
  { name: 'create_quotation',
    description: 'GlassCo quotation banana. Client, glass details collect karo pehle.',
    input_schema: { type: 'object', properties: {
      client_name:   { type: 'string' },
      project_name:  { type: 'string' },
      validity_days: { type: 'number', description: 'Default 3' },
      discount_pkr:  { type: 'number', description: 'Default 0' },
      notes:         { type: 'string' },
      items: { type: 'array', items: { type: 'object', properties: {
        description: { type: 'string' },
        glass_type:  { type: 'string', enum: ['Plain','Color','Mirror','Fluted'] },
        thickness:   { type: 'string' },
        width_inch:  { type: 'number' },
        height_inch: { type: 'number' },
        qty:         { type: 'number' },
        services:    { type: 'array', items: { type: 'string' } },
        rate:        { type: 'number', description: '0 = auto' },
      }, required: ['glass_type','thickness','width_inch','height_inch','qty'] } },
    }, required: ['client_name','items'] },
  },

  { name: 'create_requisition',
    description: 'Procurement requisition banana. Details confirm karo pehle.',
    input_schema: { type: 'object', properties: {
      category:    { type: 'string', description: 'Logistics, Store, Maintenance, Office' },
      description: { type: 'string' },
      qty:         { type: 'number' },
      unit:        { type: 'string', description: 'Nos, Ltr, Kg, Mtr' },
      priority:    { type: 'string', enum: ['Normal','Urgent'] },
      reason:      { type: 'string' },
    }, required: ['category','description','qty','unit','priority'] },
  },

  { name: 'update_order_status',
    description: 'Quotation, sales order, ya job order ka status update karo.',
    input_schema: { type: 'object', properties: {
      doc_type: { type: 'string', enum: ['quotation','sales_order','job_order'] },
      doc_id:   { type: 'string' },
      status:   { type: 'string', description: 'Approved, Dispatched, Completed, Cancelled' },
      notes:    { type: 'string' },
    }, required: ['doc_type','doc_id','status'] },
  },

  { name: 'create_task',
    description: 'Task create karo aur assign karo.',
    input_schema: { type: 'object', properties: {
      title:       { type: 'string' },
      assigned_to: { type: 'string' },
      priority:    { type: 'string', enum: ['Low','Medium','High','Urgent'] },
      due_date:    { type: 'string', description: 'YYYY-MM-DD' },
      description: { type: 'string' },
    }, required: ['title','priority'] },
  },

  { name: 'draft_payment_voucher',
    description: 'Payment voucher draft banao (posted nahi hoga — Finance se manual approval chahiye).',
    input_schema: { type: 'object', properties: {
      vendor:      { type: 'string' },
      amount:      { type: 'number' },
      description: { type: 'string' },
      category:    { type: 'string' },
    }, required: ['vendor','amount','description'] },
  },

  { name: 'log_factory_event',
    description: 'Factory event log karo — maintenance, production issue etc.',
    input_schema: { type: 'object', properties: {
      sector:     { type: 'string', enum: ['Production','Store','Maintenance','HR','Logistics','Office'] },
      event_type: { type: 'string' },
      detail:     { type: 'string' },
      priority:   { type: 'string', enum: ['Low','Medium','Urgent'] },
    }, required: ['sector','event_type','detail','priority'] },
  },

  // ── PRINT / PDF ─────────────────────────────────────────────────
  { name: 'print_document',
    description: 'Document ka print/PDF window kholo. Pehle find_order se ID lo.',
    input_schema: { type: 'object', properties: {
      doc_type: { type: 'string', enum: ['quotation','sales_order','job_order','requisition'] },
      doc_id:   { type: 'string' },
    }, required: ['doc_type','doc_id'] },
  },

  { name: 'send_whatsapp',
    description: 'WhatsApp notification bhejo.',
    input_schema: { type: 'object', properties: {
      message:  { type: 'string' },
      type:     { type: 'string', enum: ['alert','report','task','custom'] },
      priority: { type: 'string', enum: ['Normal','Urgent'] },
    }, required: ['message','type'] },
  },

  // ── NEW: DASHBOARD / SUMMARY ────────────────────────────────────
  { name: 'get_today_summary',
    description: 'Aaj ka complete ERP snapshot — revenue, orders, pieces, attendance, events sab ek jagah. "aaj ka summary", "dashboard dikhao".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  { name: 'get_overdue_alerts',
    description: 'Sab overdue items ek jagah — payments, POs, stuck jobs, stale reqs. "kya overdue hai", "alerts dikhao".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  { name: 'search_everything',
    description: 'Universal search — client, order, vendor, product, employee kuch bhi dhoondo. "XYZ dhoondo", "search karo".',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Search term' },
    }, required: ['query'] },
  },

  // ── NEW: FINANCE / ACCOUNTING ───────────────────────────────────
  { name: 'search_invoice',
    description: 'Invoice dhoondo by number, client, date, ya status. "invoice dikhao", "Saad Builders ki invoices".',
    input_schema: { type: 'object', properties: {
      client_name: { type: 'string' },
      invoice_id:  { type: 'string' },
      status:      { type: 'string', description: 'Outstanding, Paid, Overdue, all' },
      days:        { type: 'number', description: 'Last N days (default 30)' },
    }, required: [] },
  },

  { name: 'get_cash_balance',
    description: 'Cash balance — petty cash + bank. "cash kitna hai", "balance dikhao".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  { name: 'get_monthly_pl',
    description: 'Monthly profit & loss — revenue minus expenses. "is mahine ka profit", "P&L dikhao".',
    input_schema: { type: 'object', properties: {
      month: { type: 'string', description: 'YYYY-MM format (default current)' },
    }, required: [] },
  },

  { name: 'get_trial_balance',
    description: 'Trial balance — sab accounts ka debit/credit summary. "trial balance", "TB dikhao".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  { name: 'get_vendor_balance',
    description: 'Vendor ko kitna dena hai — pending POs aur payments. "vendor balance", "kitna dena hai".',
    input_schema: { type: 'object', properties: {
      vendor_name: { type: 'string', description: 'Specific vendor (blank = all)' },
    }, required: [] },
  },

  { name: 'create_invoice',
    description: 'Invoice generate karo client ke liye. Quotation approved honi chahiye pehle.',
    input_schema: { type: 'object', properties: {
      quotation_id: { type: 'string' },
      notes:        { type: 'string' },
    }, required: ['quotation_id'] },
  },

  { name: 'create_payment_receipt',
    description: 'Payment receipt record karo — client ne payment ki.',
    input_schema: { type: 'object', properties: {
      invoice_id: { type: 'string' },
      amount:     { type: 'number' },
      method:     { type: 'string', description: 'Cash, Bank, Cheque, Online' },
      reference:  { type: 'string', description: 'Cheque no ya reference' },
    }, required: ['invoice_id','amount','method'] },
  },

  // ── NEW: HR / ATTENDANCE ────────────────────────────────────────
  { name: 'get_employee_attendance',
    description: 'Attendance report — aaj kaun aaya, kaun nahi, late, leave. "attendance dikhao", "kaun absent hai".',
    input_schema: { type: 'object', properties: {
      date:          { type: 'string', description: 'YYYY-MM-DD (default today)' },
      employee_name: { type: 'string' },
    }, required: [] },
  },

  { name: 'get_payroll_summary',
    description: 'Payroll summary — salary, deductions, net pay. "salary report", "payroll dikhao".',
    input_schema: { type: 'object', properties: {
      month: { type: 'string', description: 'YYYY-MM (default current)' },
    }, required: [] },
  },

  // ── NEW: PRODUCTION ─────────────────────────────────────────────
  { name: 'get_quotation_details',
    description: 'Single quotation ki full detail — items, amounts, status. "quotation 2367 dikhao".',
    input_schema: { type: 'object', properties: {
      quotation_id: { type: 'string' },
      client_name:  { type: 'string' },
    }, required: [] },
  },

  { name: 'get_job_order_status',
    description: 'Job order ka status with pieces detail. "job order dikhao", "production status".',
    input_schema: { type: 'object', properties: {
      order_id: { type: 'string' },
    }, required: [] },
  },

  { name: 'get_production_kpi',
    description: 'Production KPIs — breakage rate, cutting efficiency, dispatch rate. "production performance", "KPI dikhao".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  { name: 'get_remnant_inventory',
    description: 'Remnant glass inventory — available sizes, aging, scrap candidates. "remnants dikhao", "bacha hua glass".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ── NEW: INTERCOMPANY ───────────────────────────────────────────
  { name: 'get_intercompany_balance',
    description: 'Intercompany balances — GTK, GTI, GlassCo ke beech hisab. "intercompany balance".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ── NEW: TASK SCHEDULING ────────────────────────────────────────
  { name: 'schedule_task',
    description: 'Future task schedule karo with due date. "kal yeh karna hai", "next week reminder".',
    input_schema: { type: 'object', properties: {
      title:       { type: 'string' },
      assigned_to: { type: 'string' },
      priority:    { type: 'string', enum: ['Low','Medium','High','Urgent'] },
      due_date:    { type: 'string', description: 'YYYY-MM-DD' },
      description: { type: 'string' },
    }, required: ['title','due_date'] },
  },

  { name: 'run_uat_test',
    description: 'Run UAT (User Acceptance Testing) on ERP workflows. Can test a single workflow (by ID like WF-S01), a module (finance/hr/sales/store/masters), or full suite. Returns pass/fail per workflow with per-check detail.',
    input_schema: { type: 'object', properties: {
      scope:  { type: 'string', enum: ['full','module','single'], description: 'Test scope: full=all workflows, module=one department, single=one workflow' },
      target: { type: 'string', description: 'Workflow ID (e.g. WF-S01) for single, or module name (finance/hr/sales/store/masters) for module scope' },
    }, required: ['scope'] },
  },
];

// ════════════════════════════════════════════════════════════════════
// TOOL LABELS
// ════════════════════════════════════════════════════════════════════
export const TOOL_LABELS: Record<string, { label: string; icon: string; risk: 'low'|'medium'|'high' }> = {
  find_order:            { label: 'Find Order',            icon: '🔍', risk: 'low'    },
  search_client:         { label: 'Search Client',         icon: '👤', risk: 'low'    },
  get_glass_rate:        { label: 'Get Glass Rate',        icon: '💎', risk: 'low'    },
  petty_cash_report:     { label: 'Petty Cash Report',     icon: '💵', risk: 'low'    },
  outstanding_payments:  { label: 'Outstanding Payments',  icon: '⏰', risk: 'low'    },
  expense_summary:       { label: 'Expense Summary',       icon: '📊', risk: 'low'    },
  get_client_balance:    { label: 'Client Balance',        icon: '💰', risk: 'low'    },
  floor_status:          { label: 'Floor Status',          icon: '🏭', risk: 'low'    },
  ncr_report:            { label: 'NCR Report',            icon: '🔴', risk: 'low'    },
  cutting_report:        { label: 'Cutting Report',        icon: '✂️',  risk: 'low'    },
  stuck_jobs:            { label: 'Stuck Jobs',            icon: '⚠️',  risk: 'low'    },
  stock_status:          { label: 'Stock Status',          icon: '📦', risk: 'low'    },
  purchase_order_status: { label: 'PO Status',             icon: '🛒', risk: 'low'    },
  vendor_summary:        { label: 'Vendor Summary',        icon: '🤝', risk: 'low'    },
  delivery_status:       { label: 'Delivery Status',       icon: '🚚', risk: 'low'    },
  requisition_overview:  { label: 'Requisition Overview',  icon: '📋', risk: 'low'    },
  ops_snapshot:          { label: 'Ops Snapshot',          icon: '🔭', risk: 'low'    },
  create_quotation:      { label: 'Create Quotation',      icon: '📄', risk: 'medium' },
  create_requisition:    { label: 'Create Requisition',    icon: '📋', risk: 'medium' },
  update_order_status:   { label: 'Update Order Status',   icon: '🔄', risk: 'medium' },
  create_task:           { label: 'Create Task',           icon: '✅', risk: 'low'    },
  draft_payment_voucher: { label: 'Draft Payment Voucher', icon: '💳', risk: 'high'   },
  log_factory_event:     { label: 'Log Factory Event',     icon: '🏭', risk: 'low'    },
  print_document:        { label: 'Print / PDF',           icon: '🖨️',  risk: 'low'    },
  send_whatsapp:         { label: 'Send WhatsApp',         icon: '💬', risk: 'low'    },
  // NEW TOOLS
  get_today_summary:     { label: 'Today Summary',         icon: '📋', risk: 'low'    },
  get_overdue_alerts:    { label: 'Overdue Alerts',        icon: '🚨', risk: 'low'    },
  search_everything:     { label: 'Universal Search',      icon: '🔎', risk: 'low'    },
  search_invoice:        { label: 'Search Invoice',        icon: '📃', risk: 'low'    },
  get_cash_balance:      { label: 'Cash Balance',          icon: '🏦', risk: 'low'    },
  get_monthly_pl:        { label: 'Monthly P&L',           icon: '📈', risk: 'low'    },
  get_trial_balance:     { label: 'Trial Balance',         icon: '⚖️',  risk: 'low'    },
  get_vendor_balance:    { label: 'Vendor Balance',        icon: '🤝', risk: 'low'    },
  create_invoice:        { label: 'Create Invoice',        icon: '📄', risk: 'medium' },
  create_payment_receipt:{ label: 'Record Payment',        icon: '💳', risk: 'medium' },
  get_employee_attendance:{ label: 'Attendance Report',    icon: '👥', risk: 'low'    },
  get_payroll_summary:   { label: 'Payroll Summary',       icon: '💰', risk: 'low'    },
  get_quotation_details: { label: 'Quotation Details',     icon: '📝', risk: 'low'    },
  get_job_order_status:  { label: 'Job Order Status',      icon: '🏭', risk: 'low'    },
  get_production_kpi:    { label: 'Production KPI',        icon: '📊', risk: 'low'    },
  get_remnant_inventory: { label: 'Remnant Inventory',     icon: '🔷', risk: 'low'    },
  get_intercompany_balance:{ label: 'Intercompany Balance',icon: '🔄', risk: 'low'    },
  schedule_task:         { label: 'Schedule Task',         icon: '📅', risk: 'low'    },
  run_uat_test:          { label: 'Run UAT Test',          icon: '🧪', risk: 'low'    },
};

// ════════════════════════════════════════════════════════════════════
// TOOL EXECUTOR
// ════════════════════════════════════════════════════════════════════
export const executeTool = async (
  toolName: string,
  params: Record<string, any>,
  approvedBy: string
): Promise<{ success: boolean; result?: any; error?: string }> => {

  const { data: action } = await supabase.from('agent_actions').insert({
    tool_name: toolName, tool_params: params, status: 'executed',
    approved_by: approvedBy, executed_at: new Date().toISOString(), created_at: new Date().toISOString(),
  }).select('id').single();

  try {
    let result: any = null;

    // ── FINANCE AGENT ──────────────────────────────────────────────
    if (toolName === 'petty_cash_report') {
      const report = FinanceAgent.generatePettyCashReport(params.query);
      if (params.print_pdf) { (report as any).action = 'OPEN_PRINT'; (report as any).print_type = 'petty_cash'; }
      result = report;
    }
    else if (toolName === 'outstanding_payments') {
      const data = FinanceAgent.outstandingPayments();
      result = params.client_name
        ? { ...data, top_5: data.all.filter((q: any) => q.client?.toLowerCase().includes(params.client_name.toLowerCase())) }
        : params.overdue_only ? { ...data, top_5: data.overdue_30plus } : data;
    }
    else if (toolName === 'expense_summary') {
      result = FinanceAgent.expenseSummary(params.query);
    }
    else if (toolName === 'get_client_balance') {
      result = FinanceAgent.outstandingPayments();
      const all = result.all.filter((q: any) => q.client?.toLowerCase().includes(params.client_name.toLowerCase()));
      result = { client: params.client_name, outstanding_orders: all, total_outstanding: all.reduce((s: number, q: any) => s + q.outstanding, 0) };
    }

    // ── PRODUCTION AGENT ───────────────────────────────────────────
    else if (toolName === 'floor_status')   { result = ProductionAgent.floorStatus(); }
    else if (toolName === 'ncr_report')     { result = ProductionAgent.ncrSummary(params.query); }
    else if (toolName === 'cutting_report') { result = ProductionAgent.cuttingSessions(params.query); }
    else if (toolName === 'stuck_jobs')     { result = ProductionAgent.stuckJobs(params.min_days || 3); }

    // ── OPS AGENT ──────────────────────────────────────────────────
    else if (toolName === 'stock_status')          { result = OpsAgent.stockStatus(params.query); }
    else if (toolName === 'purchase_order_status') { result = OpsAgent.purchaseOrderStatus(params.query); }
    else if (toolName === 'vendor_summary')        { result = OpsAgent.vendorSummary(params.vendor_name); }
    else if (toolName === 'delivery_status')       { result = OpsAgent.deliveryStatus(); }
    else if (toolName === 'requisition_overview')  { result = OpsAgent.requisitionOverview(); }
    else if (toolName === 'ops_snapshot')          { result = OpsAgent.opsSnapshot(); }

    // ── SEARCH ─────────────────────────────────────────────────────
    else if (toolName === 'search_client') {
      const clients = ls('gtk_erp_clients');
      result = { clients: clients.filter((c: any) => c.name?.toLowerCase().includes(params.name.toLowerCase()) && c.company === 'Glassco').slice(0,5) };
    }
    else if (toolName === 'get_glass_rate') {
      const products = ls('gtk_erp_products');
      const match = products.find((p: any) => p.company === 'Glassco' && p.category === 'Glass' && p.glassType?.toLowerCase() === params.glass_type?.toLowerCase() && p.thickness === params.thickness);
      result = match ? { found: true, rate: match.salePrice || match.price || 0, product: match.name } : { found: false, rate: 0 };
    }
    else if (toolName === 'find_order') {
      const lsKey = params.doc_type === 'job_order' ? 'gtk_erp_job_orders' : params.doc_type === 'requisition' ? 'gtk_erp_requisitions' : 'gtk_erp_quotations';
      let docs = ls(lsKey);
      if (params.search_id) { const s = params.search_id.toLowerCase(); docs = docs.filter((d: any) => d.id?.toLowerCase().includes(s) || d.orderNo?.toLowerCase().includes(s)); }
      if (params.client_name) { const s = params.client_name.toLowerCase(); docs = docs.filter((d: any) => d.clientName?.toLowerCase().includes(s)); }
      if (params.month) {
        const months: Record<string,number> = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
        const mm = months[params.month.toLowerCase()]; const yy = params.year ? parseInt(params.year) : new Date().getFullYear();
        if (mm) docs = docs.filter((d: any) => { const dt = new Date(d.date || d.createdAt || ''); return dt.getMonth()+1 === mm && dt.getFullYear() === yy; });
      }
      result = { found: docs.length, documents: docs.slice(0,10).map((d: any) => ({ id: d.id, order_no: d.orderNo || d.id, client: d.clientName, project: d.projectName, status: d.status, amount: d.totalAmount, date: d.date || d.createdAt?.split('T')[0] })) };
    }

    // ── CREATE QUOTATION ───────────────────────────────────────────
    else if (toolName === 'create_quotation') {
      const products = ls('gtk_erp_products');
      const clients  = ls('gtk_erp_clients');
      const client   = clients.find((c: any) => c.name?.toLowerCase().includes(params.client_name.toLowerCase()) && c.company === 'Glassco');
      const items = (params.items || []).map((item: any, idx: number) => {
        const sqFt = (item.width_inch * item.height_inch * item.qty) / 144;
        const product = products.find((p: any) => p.company === 'Glassco' && p.category === 'Glass' && p.glassType?.toLowerCase() === item.glass_type?.toLowerCase() && p.thickness === item.thickness);
        const rate = item.rate > 0 ? item.rate : (product?.salePrice || product?.price || 0);
        return { id: `ITM-${Date.now()}-${idx}`, description: item.description || `${item.glass_type} ${item.thickness}`, glassType: item.glass_type, subCategory: 'Standard', glassSize: item.thickness, glassColor: 'Clear', inchW: item.width_inch, sootW: 0, inchH: item.height_inch, sootH: 0, width: item.width_inch, height: item.height_inch, qty: item.qty, totalSqFt: Math.round(sqFt*100)/100, pricePerUnit: rate, amount: Math.round(sqFt*rate), selectedServices: item.services || [], isSection: false, locationCode: '', glazingSpecs: '', inputUnit: 'Inch' };
      });
      const totalAmount = items.reduce((s: number, i: any) => s + i.amount, 0);
      const discount = params.discount_pkr || 0;
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + (params.validity_days||3)*86400000).toISOString().split('T')[0];
      const newQ = { id: `QT-AGENT-${Date.now()}`, company: 'Glassco', date: today, dueDate, clientId: client?.id||'', clientName: params.client_name, projectName: params.project_name||'AGENT ORDER', items, status: 'Draft', discountAmount: discount, discountPercent: 0, isAlreadyDispatched: false, notes: params.notes||`Created by Agent — approved by ${approvedBy}`, totalAmount: totalAmount-discount, createdBy: `Agent (${approvedBy})`, createdAt: new Date().toISOString() };
      const allQ = ls('gtk_erp_quotations'); allQ.push(newQ); lsSet('gtk_erp_quotations', allQ);
      await supabase.from('quotations').insert({ id: newQ.id, company: 'Glassco', date: today, due_date: dueDate, client_id: client?.id||null, client_name: params.client_name, project_name: newQ.projectName, items, status: 'Draft', discount_amount: discount, total_amount: totalAmount-discount, notes: newQ.notes, created_by: newQ.createdBy, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      result = { quotation_id: newQ.id, client: params.client_name, items_count: items.length, total_amount: totalAmount-discount, status: 'Draft — Quotations mein nazar aayegi' };
    }

    // ── CREATE REQUISITION ─────────────────────────────────────────
    else if (toolName === 'create_requisition') {
      const reqId = `REQ-AGENT-${Date.now()}`;
      const today = new Date().toISOString().split('T')[0];
      const { data: reqData, error: reqErr } = await supabase.from('requisitions').insert({ id: reqId, company: 'Glassco', date: today, header_text: `[AGENT] ${params.description}`, requisitioner: approvedBy, priority: params.priority, status: 'Pending', category: params.category, req_type: 'Agent Created', reason: params.reason||'', total_value: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select('id').single();
      if (!reqErr) { await supabase.from('requisition_items').insert({ requisition_id: reqData?.id||reqId, item_category: params.category, material_desc: params.description, qty: params.qty, unit: params.unit, estimated_rate: 0, delivery_date: new Date(Date.now()+86400000).toISOString().split('T')[0], cost_center: params.category.toUpperCase(), created_at: new Date().toISOString() }); }
      const reqs = ls('gtk_erp_requisitions'); reqs.push({ id: reqId, company: 'Glassco', date: today, headerText: `[AGENT] ${params.description}`, requisitioner: approvedBy, priority: params.priority, status: 'Pending', category: params.category, items: [{ materialDesc: params.description, qty: params.qty, unit: params.unit }], createdAt: new Date().toISOString() }); lsSet('gtk_erp_requisitions', reqs);
      result = { req_id: reqData?.id||reqId, saved: reqErr?'localStorage':'Supabase', message: 'Procurement → Requisitions mein nazar aayegi' };
    }

    // ── UPDATE ORDER STATUS ────────────────────────────────────────
    else if (toolName === 'update_order_status') {
      const key = params.doc_type === 'job_order' ? 'gtk_erp_job_orders' : 'gtk_erp_quotations';
      const docs = ls(key); const idx = docs.findIndex((d: any) => d.id === params.doc_id);
      if (idx !== -1) { docs[idx].status = params.status; docs[idx].updatedAt = new Date().toISOString(); if (params.notes) docs[idx].statusNotes = params.notes; lsSet(key, docs); }
      result = { updated: idx !== -1, doc_id: params.doc_id, new_status: params.status };
    }

    // ── CREATE TASK ────────────────────────────────────────────────
    else if (toolName === 'create_task') {
      const { data, error } = await supabase.from('agent_tasks').insert({ title: params.title, description: params.description||null, assigned_to: params.assigned_to||null, priority: params.priority, due_date: params.due_date||null, status: 'Open', created_by: approvedBy, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select('id').single();
      if (error) throw error;
      result = { task_id: data?.id };
    }

    // ── DRAFT PV ───────────────────────────────────────────────────
    else if (toolName === 'draft_payment_voucher') {
      result = { draft: true, vendor: params.vendor, amount: params.amount, message: 'Finance → Payment Vouchers mein manually post karo' };
    }

    // ── LOG EVENT ──────────────────────────────────────────────────
    else if (toolName === 'log_factory_event') {
      const { data, error } = await supabase.from('factory_events').insert({ sector: params.sector, event_type: params.event_type, detail: params.detail, priority: params.priority, status: 'Open', logged_by: `Agent (${approvedBy})`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select('id').single();
      if (error) throw error;
      result = { event_id: data?.id };
    }

    // ── PRINT ──────────────────────────────────────────────────────
    else if (toolName === 'print_document') {
      result = { action: 'OPEN_PRINT', doc_type: params.doc_type, doc_id: params.doc_id, message: 'Print window khul rahi hai...' };
    }

    // ── WHATSAPP ───────────────────────────────────────────────────
    else if (toolName === 'send_whatsapp') {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-notify`, { method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: params.message, type: params.type, priority: params.priority }) });
      result = { sent: res.ok };
    }

    // ══════════════════════════════════════════════════════════════
    // NEW TOOLS (18)
    // ══════════════════════════════════════════════════════════════

    // ── TODAY SUMMARY ─────────────────────────────────────────────
    else if (toolName === 'get_today_summary') {
      const today = new Date().toISOString().split('T')[0];
      const month = today.slice(0, 7);
      const quotations = ls('gtk_erp_quotations').filter((q: any) => q.company === 'Glassco');
      const monthQuotes = quotations.filter((q: any) => q.date?.startsWith(month));
      const todayQuotes = quotations.filter((q: any) => q.date === today);
      const invoices = ls('gtk_erp_invoices').filter((i: any) => i.company === 'Glassco' || i.company === 'Glassco');
      const monthRev = invoices.filter((i: any) => i.date?.startsWith(month)).reduce((s: number, i: any) => s + (i.totalAmount || i.amount || 0), 0);
      const pieces = ls('gtk_erp_production_pieces');
      const active = pieces.filter((p: any) => !['Delivered', 'Broken'].includes(p.status));
      const employees = ls('gtk_erp_employees').filter((e: any) => e.company === 'Glassco' || e.company === 'Glassco');
      const attendance = ls('gtk_erp_attendance').filter((a: any) => a.date === today);
      const present = attendance.filter((a: any) => a.status === 'Present').length;
      const absent = attendance.filter((a: any) => a.status === 'Absent').length;
      const pendingReqs = ls('gtk_erp_requisitions').filter((r: any) => r.status === 'Pending').length;
      result = { date: today, month_quotations: monthQuotes.length, today_quotations: todayQuotes.length, month_revenue: monthRev, month_revenue_formatted: `PKR ${monthRev.toLocaleString()}`, active_pieces: active.length, total_employees: employees.length, present_today: present, absent_today: absent, pending_requisitions: pendingReqs };
    }

    // ── OVERDUE ALERTS ────────────────────────────────────────────
    else if (toolName === 'get_overdue_alerts') {
      const now = Date.now();
      const today = new Date().toISOString().split('T')[0];
      const overdueInv = ls('gtk_erp_invoices').filter((i: any) => (i.status === 'Outstanding' || i.status === 'Overdue') && i.dueDate && i.dueDate < today);
      const overduePO = ls('gtk_erp_purchase_orders').filter((p: any) => p.status === 'Approved' && p.deliveryDate && p.deliveryDate < today);
      const stuckJobs = ls('gtk_erp_job_orders').filter((j: any) => j.status === 'In Production' && (now - new Date(j.createdAt || j.date).getTime()) > 3 * 86400000);
      const staleReqs = ls('gtk_erp_requisitions').filter((r: any) => r.status === 'Pending' && (now - new Date(r.createdAt || r.date).getTime()) > 5 * 86400000);
      result = { overdue_invoices: overdueInv.length, overdue_invoice_total: overdueInv.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0), overdue_pos: overduePO.length, stuck_jobs: stuckJobs.length, stale_requisitions: staleReqs.length, details: { invoices: overdueInv.slice(0, 5).map((i: any) => ({ id: i.id, client: i.clientName, amount: i.totalAmount, due: i.dueDate })), pos: overduePO.slice(0, 5).map((p: any) => ({ id: p.id, vendor: p.vendorName, due: p.deliveryDate })) } };
    }

    // ── UNIVERSAL SEARCH ──────────────────────────────────────────
    else if (toolName === 'search_everything') {
      const q = (params.query || '').toLowerCase();
      const found: any[] = [];
      const searchIn = (key: string, type: string, nameField: string) => {
        ls(key).filter((d: any) => JSON.stringify(d).toLowerCase().includes(q)).slice(0, 3).forEach((d: any) => found.push({ type, id: d.id, name: d[nameField] || d.name || d.id, status: d.status }));
      };
      searchIn('gtk_erp_clients', 'Client', 'name');
      searchIn('gtk_erp_quotations', 'Quotation', 'clientName');
      searchIn('gtk_erp_invoices', 'Invoice', 'clientName');
      searchIn('gtk_erp_vendors', 'Vendor', 'name');
      searchIn('gtk_erp_products', 'Product', 'name');
      searchIn('gtk_erp_employees', 'Employee', 'name');
      searchIn('gtk_erp_purchase_orders', 'PO', 'vendorName');
      searchIn('gtk_erp_requisitions', 'Requisition', 'headerText');
      result = { query: params.query, found: found.length, results: found.slice(0, 15) };
    }

    // ── SEARCH INVOICE ────────────────────────────────────────────
    else if (toolName === 'search_invoice') {
      let invoices = ls('gtk_erp_invoices');
      if (params.client_name) { const s = params.client_name.toLowerCase(); invoices = invoices.filter((i: any) => i.clientName?.toLowerCase().includes(s)); }
      if (params.invoice_id) { const s = params.invoice_id.toLowerCase(); invoices = invoices.filter((i: any) => i.id?.toLowerCase().includes(s)); }
      if (params.status && params.status !== 'all') { invoices = invoices.filter((i: any) => i.status === params.status); }
      if (params.days) { const cutoff = new Date(Date.now() - params.days * 86400000).toISOString().split('T')[0]; invoices = invoices.filter((i: any) => (i.date || '') >= cutoff); }
      result = { count: invoices.length, invoices: invoices.slice(0, 10).map((i: any) => ({ id: i.id, client: i.clientName, amount: i.totalAmount, date: i.date, status: i.status, balance: (i.totalAmount || 0) - (i.receivedAmount || 0) })) };
    }

    // ── CASH BALANCE ──────────────────────────────────────────────
    else if (toolName === 'get_cash_balance') {
      const petty = ls('gtk_erp_petty_cash').filter((e: any) => e.status !== 'Ignored');
      const lastEntry = petty.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      const pettyCashBal = lastEntry?.balance || 0;
      const accounts = ls('gtk_erp_accounts').filter((a: any) => a.company === 'Glassco' && (a.code?.startsWith('111') || a.code?.startsWith('105')));
      result = { petty_cash_balance: pettyCashBal, petty_cash_formatted: `PKR ${pettyCashBal.toLocaleString()}`, cash_accounts: accounts.map((a: any) => ({ code: a.code, name: a.name })) };
    }

    // ── MONTHLY P&L ───────────────────────────────────────────────
    else if (toolName === 'get_monthly_pl') {
      const month = params.month || new Date().toISOString().slice(0, 7);
      const accounts = ls('gtk_erp_accounts').filter((a: any) => a.company === 'Glassco');
      const ledger = ls('gtk_erp_ledger').filter((t: any) => t.company === 'Glassco' && t.date?.startsWith(month) && t.status === 'Posted');
      const balances: Record<string, number> = {};
      accounts.forEach((a: any) => { balances[a.id] = 0; });
      ledger.forEach((tx: any) => tx.details?.forEach((d: any) => { if (balances[d.accountId] !== undefined) balances[d.accountId] += (d.debit || 0) - (d.credit || 0); }));
      const revenue = Math.abs(accounts.filter((a: any) => a.type === 'Revenue').reduce((s: number, a: any) => s + (balances[a.id] || 0), 0));
      const expenses = Math.abs(accounts.filter((a: any) => a.type === 'Expense').reduce((s: number, a: any) => s + (balances[a.id] || 0), 0));
      result = { month, revenue, expenses, net_profit: revenue - expenses, revenue_formatted: `PKR ${revenue.toLocaleString()}`, expenses_formatted: `PKR ${expenses.toLocaleString()}`, profit_formatted: `PKR ${(revenue - expenses).toLocaleString()}`, transactions: ledger.length };
    }

    // ── TRIAL BALANCE ─────────────────────────────────────────────
    else if (toolName === 'get_trial_balance') {
      const accounts = ls('gtk_erp_accounts').filter((a: any) => a.company === 'Glassco');
      const ledger = ls('gtk_erp_ledger').filter((t: any) => t.company === 'Glassco' && t.status === 'Posted');
      const balances: Record<string, number> = {};
      accounts.forEach((a: any) => { balances[a.id] = 0; });
      ledger.forEach((tx: any) => tx.details?.forEach((d: any) => { if (balances[d.accountId] !== undefined) balances[d.accountId] += (d.debit || 0) - (d.credit || 0); }));
      const tb = accounts.filter((a: any) => Math.abs(balances[a.id] || 0) > 0.01).map((a: any) => ({ code: a.code, name: a.name, type: a.type, debit: balances[a.id] > 0 ? balances[a.id] : 0, credit: balances[a.id] < 0 ? Math.abs(balances[a.id]) : 0 }));
      const totalDebit = tb.reduce((s: number, a: { debit: number; credit: number }) => s + a.debit, 0);
      const totalCredit = tb.reduce((s: number, a: { debit: number; credit: number }) => s + a.credit, 0);
      result = { accounts_with_balance: tb.length, total_debit: totalDebit, total_credit: totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 1, top_accounts: tb.sort((a: { debit: number; credit: number }, b: { debit: number; credit: number }) => (b.debit + b.credit) - (a.debit + a.credit)).slice(0, 10) };
    }

    // ── VENDOR BALANCE ────────────────────────────────────────────
    else if (toolName === 'get_vendor_balance') {
      const pos = ls('gtk_erp_purchase_orders').filter((p: any) => !['Paid', 'Cancelled'].includes(p.status));
      let filtered = pos;
      if (params.vendor_name) { const s = params.vendor_name.toLowerCase(); filtered = pos.filter((p: any) => p.vendorName?.toLowerCase().includes(s)); }
      const byVendor: Record<string, { total: number; count: number }> = {};
      filtered.forEach((p: any) => { const v = p.vendorName || 'Unknown'; if (!byVendor[v]) byVendor[v] = { total: 0, count: 0 }; byVendor[v].total += p.total || p.totalAmount || 0; byVendor[v].count++; });
      const vendors = Object.entries(byVendor).map(([name, d]) => ({ vendor: name, pending_amount: d.total, pending_pos: d.count, formatted: `PKR ${d.total.toLocaleString()}` })).sort((a, b) => b.pending_amount - a.pending_amount);
      result = { total_vendors: vendors.length, total_pending: vendors.reduce((s, v) => s + v.pending_amount, 0), vendors: vendors.slice(0, 10) };
    }

    // ── CREATE INVOICE ────────────────────────────────────────────
    else if (toolName === 'create_invoice') {
      const quotations = ls('gtk_erp_quotations');
      const q = quotations.find((qt: any) => qt.id === params.quotation_id);
      if (!q) { result = { error: `Quotation ${params.quotation_id} nahi mili` }; }
      else {
        const invId = `INV-AGENT-${Date.now()}`;
        const inv = { id: invId, company: q.company || 'Glassco', orderId: q.id, orderNo: q.orderNo || q.id, clientId: q.clientId, clientName: q.clientName, date: new Date().toISOString().split('T')[0], dueDate: new Date(Date.now() + 30*86400000).toISOString().split('T')[0], totalAmount: q.totalAmount, receivedAmount: 0, balance: q.totalAmount, status: 'Outstanding', notes: params.notes || `Invoice by Agent — ${approvedBy}`, createdAt: new Date().toISOString() };
        const allInv = ls('gtk_erp_invoices'); allInv.push(inv); lsSet('gtk_erp_invoices', allInv);
        await supabase.from('invoices').insert({ id: invId, company: inv.company, order_id: q.id, client_name: q.clientName, date: inv.date, due_date: inv.dueDate, total_amount: q.totalAmount, status: 'Outstanding', created_by: `Agent (${approvedBy})`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).then(() => {}, () => {});
        result = { invoice_id: invId, client: q.clientName, amount: q.totalAmount, status: 'Outstanding' };
      }
    }

    // ── CREATE PAYMENT RECEIPT ─────────────────────────────────────
    else if (toolName === 'create_payment_receipt') {
      const rcptId = `RCPT-AGENT-${Date.now()}`;
      const today = new Date().toISOString().split('T')[0];
      const rcpt = { id: rcptId, invoiceId: params.invoice_id, date: today, amount: params.amount, method: params.method, reference: params.reference || '', createdAt: new Date().toISOString() };
      const allRcpt = ls('gtk_erp_payment_receipts'); allRcpt.push(rcpt); lsSet('gtk_erp_payment_receipts', allRcpt);
      await supabase.from('payment_receipts').insert({ id: rcptId, invoice_id: params.invoice_id, date: today, amount: params.amount, method: params.method, reference: params.reference || '', created_by: `Agent (${approvedBy})`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).then(() => {}, () => {});
      result = { receipt_id: rcptId, invoice: params.invoice_id, amount: params.amount, method: params.method };
    }

    // ── EMPLOYEE ATTENDANCE ────────────────────────────────────────
    else if (toolName === 'get_employee_attendance') {
      const date = params.date || new Date().toISOString().split('T')[0];
      const employees = ls('gtk_erp_employees').filter((e: any) => (e.company === 'Glassco' || e.company === 'Glassco') && e.work?.status !== 'resigned' && e.work?.status !== 'terminated');
      const attendance = ls('gtk_erp_attendance').filter((a: any) => a.date === date);
      let filtered = employees;
      if (params.employee_name) { const s = params.employee_name.toLowerCase(); filtered = employees.filter((e: any) => (e.personal?.name || e.name || '').toLowerCase().includes(s)); }
      const present = attendance.filter((a: any) => a.status === 'Present').length;
      const absent = attendance.filter((a: any) => a.status === 'Absent').length;
      const late = attendance.filter((a: any) => a.lateMinutes > 0).length;
      result = { date, total_employees: filtered.length, present, absent, late, attendance_rate: filtered.length > 0 ? Math.round((present / filtered.length) * 100) : 0, absent_names: attendance.filter((a: any) => a.status === 'Absent').slice(0, 10).map((a: any) => { const emp = employees.find((e: any) => e.id === a.employeeId); return emp?.personal?.name || emp?.name || a.employeeId; }) };
    }

    // ── PAYROLL SUMMARY ───────────────────────────────────────────
    else if (toolName === 'get_payroll_summary') {
      const month = params.month || new Date().toISOString().slice(0, 7);
      const payroll = ls('gtk_erp_payroll').filter((p: any) => p.month === month);
      const totalBasic = payroll.reduce((s: number, p: any) => s + (p.basicPay || 0), 0);
      const totalAllowances = payroll.reduce((s: number, p: any) => s + (p.allowances || 0), 0);
      const totalDeductions = payroll.reduce((s: number, p: any) => s + (p.lateDeduction || 0) + (p.absentDeduction || 0) + (p.loanDeduction || 0), 0);
      const totalNet = payroll.reduce((s: number, p: any) => s + (p.netSalary || 0), 0);
      const paid = payroll.filter((p: any) => p.isSalaryPaid).length;
      result = { month, employees: payroll.length, total_basic: totalBasic, total_allowances: totalAllowances, total_deductions: totalDeductions, total_net_salary: totalNet, paid_count: paid, unpaid_count: payroll.length - paid, formatted_total: `PKR ${totalNet.toLocaleString()}` };
    }

    // ── QUOTATION DETAILS ─────────────────────────────────────────
    else if (toolName === 'get_quotation_details') {
      let quotations = ls('gtk_erp_quotations');
      let q = null;
      if (params.quotation_id) { q = quotations.find((qt: any) => qt.id === params.quotation_id || qt.orderNo === params.quotation_id); }
      else if (params.client_name) { const s = params.client_name.toLowerCase(); q = quotations.filter((qt: any) => qt.clientName?.toLowerCase().includes(s)).sort((a: any, b: any) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime())[0]; }
      if (!q) { result = { found: false, message: 'Quotation nahi mili' }; }
      else { result = { found: true, id: q.id, order_no: q.orderNo, client: q.clientName, project: q.projectName, date: q.date, status: q.status, total_amount: q.totalAmount, items_count: (q.items || []).length, items: (q.items || []).slice(0, 10).map((i: any) => ({ description: i.description, glass: i.glassType, thickness: i.glassSize || i.thickness, sqft: i.totalSqFt, amount: i.amount })) }; }
    }

    // ── JOB ORDER STATUS ──────────────────────────────────────────
    else if (toolName === 'get_job_order_status') {
      const jobs = ls('gtk_erp_job_orders');
      const pieces = ls('gtk_erp_production_pieces');
      let job = params.order_id ? jobs.find((j: any) => j.id === params.order_id || j.orderNo === params.order_id) : jobs.sort((a: any, b: any) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())[0];
      if (!job) { result = { found: false, message: 'Job order nahi mila' }; }
      else {
        const jobPieces = pieces.filter((p: any) => p.orderId === job.id);
        const statusCounts: Record<string, number> = {};
        jobPieces.forEach((p: any) => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1; });
        result = { found: true, id: job.id, client: job.clientName, status: job.status, total_pieces: jobPieces.length, piece_status: statusCounts, date: job.date || job.createdAt };
      }
    }

    // ── PRODUCTION KPI ────────────────────────────────────────────
    else if (toolName === 'get_production_kpi') {
      const pieces = ls('gtk_erp_production_pieces');
      const total = pieces.length || 1;
      const broken = pieces.filter((p: any) => p.status === 'Broken').length;
      const delivered = pieces.filter((p: any) => p.status === 'Delivered').length;
      const active = pieces.filter((p: any) => !['Delivered', 'Broken'].includes(p.status)).length;
      const ncrs = ls('gtk_erp_ncr_events');
      const monthNCR = ncrs.filter((n: any) => n.reportedAt?.startsWith(new Date().toISOString().slice(0, 7))).length;
      const cutting = ls('gtk_erp_cutting_sessions');
      const todayCut = cutting.filter((c: any) => c.date === new Date().toISOString().split('T')[0]);
      const todaySqft = todayCut.reduce((s: number, c: any) => s + (c.totalSqft || 0), 0);
      result = { breakage_rate: `${((broken / total) * 100).toFixed(1)}%`, delivery_rate: `${((delivered / total) * 100).toFixed(1)}%`, active_pieces: active, total_pieces: pieces.length, month_ncrs: monthNCR, today_cutting_sqft: todaySqft, today_sessions: todayCut.length };
    }

    // ── REMNANT INVENTORY ─────────────────────────────────────────
    else if (toolName === 'get_remnant_inventory') {
      const remnants = ls('gtk_erp_remnants').filter((r: any) => r.status === 'Available');
      const now = Date.now();
      const aged = remnants.filter((r: any) => (now - new Date(r.createdAt).getTime()) > 45 * 86400000);
      const byThickness: Record<string, number> = {};
      remnants.forEach((r: any) => { byThickness[r.thickness || 'Unknown'] = (byThickness[r.thickness || 'Unknown'] || 0) + 1; });
      result = { total_available: remnants.length, aged_45plus: aged.length, total_sqft: remnants.reduce((s: number, r: any) => s + (r.sqft || 0), 0), by_thickness: byThickness, aged_details: aged.slice(0, 5).map((r: any) => ({ id: r.id, thickness: r.thickness, sqft: r.sqft, days: Math.floor((now - new Date(r.createdAt).getTime()) / 86400000) })) };
    }

    // ── INTERCOMPANY BALANCE ──────────────────────────────────────
    else if (toolName === 'get_intercompany_balance') {
      const ledger = ls('gtk_erp_ledger').filter((t: any) => t.status === 'Posted');
      const icoEntries = ledger.filter((t: any) => t.description?.includes('[ICO]') || t.docType === 'AGT-JV');
      const companies = ['Glassco', 'GTK', 'GTI', 'Nippon', 'Factory'];
      const balances = companies.map(c => {
        const compEntries = ledger.filter((t: any) => t.company === c);
        const icoRecv = compEntries.filter((t: any) => t.details?.some((d: any) => d.accountCode?.startsWith('122'))).reduce((s: number, t: any) => s + (t.details?.filter((d: any) => d.accountCode?.startsWith('122')).reduce((ss: number, d: any) => ss + (d.debit || 0) - (d.credit || 0), 0) || 0), 0);
        return { company: c, ico_receivable: icoRecv };
      });
      result = { companies: balances, ico_transactions: icoEntries.length };
    }

    // ── SCHEDULE TASK ─────────────────────────────────────────────
    else if (toolName === 'schedule_task') {
      const { data, error } = await supabase.from('agent_tasks').insert({ title: params.title, description: params.description || null, assigned_to: params.assigned_to || null, priority: params.priority || 'Medium', due_date: params.due_date, status: 'Open', created_by: approvedBy, source: 'EventOS', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select('id').single();
      if (error) throw error;
      result = { task_id: data?.id, title: params.title, due_date: params.due_date, message: 'Task scheduled — Tasks mein nazar aayegi' };
    }

    // ── RUN UAT TEST ─────────────────────────────────────────────
    else if (toolName === 'run_uat_test') {
      const { runTests } = await import('./TestRunnerAgent');
      const scope = params.scope || 'full';
      const target = params.target || '';
      const message = `run ${scope} test ${target}`;
      const testResult = await runTests(message);
      result = { summary: testResult.summary, detail: testResult.detail, emoji: testResult.emoji };
    }

    if (action?.id) { await supabase.from('agent_actions').update({ result, status: 'executed' }).eq('id', action.id); }

    // Silent audit log (never blocks execution)
    logAudit({
      action_type: 'tool_execution',
      module: toolName.startsWith('get_') || toolName.startsWith('search_') ? 'read' : 'write',
      user_id: approvedBy,
      agent_id: 'agentTools',
      tool_name: toolName,
      data_before: {},
      data_after: result || {},
      approval_chain: [{ user: approvedBy, at: new Date().toISOString() }],
    }, { amount: params.amount || result?.total_amount || result?.amount || 0 });

    return { success: true, result };

  } catch (err) {
    const error = String(err);
    if (action?.id) { await supabase.from('agent_actions').update({ error, status: 'failed' }).eq('id', action.id); }

    logAudit({
      action_type: 'tool_failure',
      module: 'error',
      user_id: approvedBy,
      agent_id: 'agentTools',
      tool_name: toolName,
      data_after: { error },
    });

    return { success: false, error };
  }
};
