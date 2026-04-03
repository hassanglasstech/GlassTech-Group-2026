import { supabase } from '@/src/services/supabaseClient';
import { FinanceAgent } from './FinanceAgent';
import { ProductionAgent } from './ProductionAgent';
import { OpsAgent } from './OpsAgent';

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
      result = { clients: clients.filter((c: any) => c.name?.toLowerCase().includes(params.name.toLowerCase()) && c.company === 'GlassCo').slice(0,5) };
    }
    else if (toolName === 'get_glass_rate') {
      const products = ls('gtk_erp_products');
      const match = products.find((p: any) => p.company === 'GlassCo' && p.category === 'Glass' && p.glassType?.toLowerCase() === params.glass_type?.toLowerCase() && p.thickness === params.thickness);
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
      const client   = clients.find((c: any) => c.name?.toLowerCase().includes(params.client_name.toLowerCase()) && c.company === 'GlassCo');
      const items = (params.items || []).map((item: any, idx: number) => {
        const sqFt = (item.width_inch * item.height_inch * item.qty) / 144;
        const product = products.find((p: any) => p.company === 'GlassCo' && p.category === 'Glass' && p.glassType?.toLowerCase() === item.glass_type?.toLowerCase() && p.thickness === item.thickness);
        const rate = item.rate > 0 ? item.rate : (product?.salePrice || product?.price || 0);
        return { id: `ITM-${Date.now()}-${idx}`, description: item.description || `${item.glass_type} ${item.thickness}`, glassType: item.glass_type, subCategory: 'Standard', glassSize: item.thickness, glassColor: 'Clear', inchW: item.width_inch, sootW: 0, inchH: item.height_inch, sootH: 0, width: item.width_inch, height: item.height_inch, qty: item.qty, totalSqFt: Math.round(sqFt*100)/100, pricePerUnit: rate, amount: Math.round(sqFt*rate), selectedServices: item.services || [], isSection: false, locationCode: '', glazingSpecs: '', inputUnit: 'Inch' };
      });
      const totalAmount = items.reduce((s: number, i: any) => s + i.amount, 0);
      const discount = params.discount_pkr || 0;
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + (params.validity_days||3)*86400000).toISOString().split('T')[0];
      const newQ = { id: `QT-AGENT-${Date.now()}`, company: 'GlassCo', date: today, dueDate, clientId: client?.id||'', clientName: params.client_name, projectName: params.project_name||'AGENT ORDER', items, status: 'Draft', discountAmount: discount, discountPercent: 0, isAlreadyDispatched: false, notes: params.notes||`Created by Agent — approved by ${approvedBy}`, totalAmount: totalAmount-discount, createdBy: `Agent (${approvedBy})`, createdAt: new Date().toISOString() };
      const allQ = ls('gtk_erp_quotations'); allQ.push(newQ); lsSet('gtk_erp_quotations', allQ);
      await supabase.from('quotations').insert({ id: newQ.id, company: 'GlassCo', date: today, due_date: dueDate, client_id: client?.id||null, client_name: params.client_name, project_name: newQ.projectName, items, status: 'Draft', discount_amount: discount, total_amount: totalAmount-discount, notes: newQ.notes, created_by: newQ.createdBy, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      result = { quotation_id: newQ.id, client: params.client_name, items_count: items.length, total_amount: totalAmount-discount, status: 'Draft — Quotations mein nazar aayegi' };
    }

    // ── CREATE REQUISITION ─────────────────────────────────────────
    else if (toolName === 'create_requisition') {
      const reqId = `REQ-AGENT-${Date.now()}`;
      const today = new Date().toISOString().split('T')[0];
      const { data: reqData, error: reqErr } = await supabase.from('requisitions').insert({ id: reqId, company: 'GlassCo', date: today, header_text: `[AGENT] ${params.description}`, requisitioner: approvedBy, priority: params.priority, status: 'Pending', category: params.category, req_type: 'Agent Created', reason: params.reason||'', total_value: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select('id').single();
      if (!reqErr) { await supabase.from('requisition_items').insert({ requisition_id: reqData?.id||reqId, item_category: params.category, material_desc: params.description, qty: params.qty, unit: params.unit, estimated_rate: 0, delivery_date: new Date(Date.now()+86400000).toISOString().split('T')[0], cost_center: params.category.toUpperCase(), created_at: new Date().toISOString() }); }
      const reqs = ls('gtk_erp_requisitions'); reqs.push({ id: reqId, company: 'GlassCo', date: today, headerText: `[AGENT] ${params.description}`, requisitioner: approvedBy, priority: params.priority, status: 'Pending', category: params.category, items: [{ materialDesc: params.description, qty: params.qty, unit: params.unit }], createdAt: new Date().toISOString() }); lsSet('gtk_erp_requisitions', reqs);
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

    if (action?.id) { await supabase.from('agent_actions').update({ result, status: 'executed' }).eq('id', action.id); }
    return { success: true, result };

  } catch (err) {
    const error = String(err);
    if (action?.id) { await supabase.from('agent_actions').update({ error, status: 'failed' }).eq('id', action.id); }
    return { success: false, error };
  }
};
