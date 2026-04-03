import { supabase } from '@/src/services/supabaseClient';
import { FinanceAgent } from './FinanceAgent';
import { ProductionAgent } from './ProductionAgent';

// ── Helpers ───────────────────────────────────────────────────────────
const ls = (key: string) => {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
};
const lsSet = (key: string, val: any) => localStorage.setItem(key, JSON.stringify(val));

// ── Tool Definitions ──────────────────────────────────────────────────
export const TOOL_DEFINITIONS = [

  // ── FIND / SEARCH ──
  {
    name: 'find_order',
    description: 'Find any document (quotation, sales order, job order, requisition) by ID, order number, client name, or month/year. Always call this before print_document.',
    input_schema: {
      type: 'object',
      properties: {
        doc_type:    { type: 'string', enum: ['quotation','sales_order','job_order','requisition'], description: 'Document type' },
        search_id:   { type: 'string', description: 'ID or order number e.g. 2367, QT-123' },
        client_name: { type: 'string', description: 'Client name' },
        month:       { type: 'string', description: 'Month name e.g. November' },
        year:        { type: 'string', description: 'Year e.g. 2024' },
      },
      required: ['doc_type'],
    },
  },

  {
    name: 'check_stock',
    description: 'Check current stock level for a glass type, thickness, or any store item.',
    input_schema: {
      type: 'object',
      properties: {
        item_name:  { type: 'string', description: 'Item name or description' },
        glass_type: { type: 'string', description: 'Plain, Color, Mirror etc.' },
        thickness:  { type: 'string', description: '5mm, 6mm, 8mm etc.' },
      },
      required: [],
    },
  },

  {
    name: 'get_client_balance',
    description: 'Get a client outstanding balance, total orders, and payment history.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string', description: 'Client name' },
      },
      required: ['client_name'],
    },
  },

  {
    name: 'search_client',
    description: 'Search for a client by name to get their ID.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Client name' },
      },
      required: ['name'],
    },
  },

  {
    name: 'get_glass_rate',
    description: 'Get current selling rate for a glass type and thickness from product master.',
    input_schema: {
      type: 'object',
      properties: {
        glass_type: { type: 'string', description: 'Plain, Color, Mirror, Fluted' },
        thickness:  { type: 'string', description: '5mm, 6mm, 8mm etc.' },
      },
      required: ['glass_type', 'thickness'],
    },
  },

  // ── CREATE ──
  {
    name: 'create_quotation',
    description: 'Create a GlassCo sales quotation. Collect all item details before calling. Always confirm with user first.',
    input_schema: {
      type: 'object',
      properties: {
        client_name:   { type: 'string', description: 'Client name' },
        project_name:  { type: 'string', description: 'Project ref e.g. MAIN, SHOP, PHASE-1' },
        validity_days: { type: 'number', description: 'Validity days (default 3)' },
        discount_pkr:  { type: 'number', description: 'Discount in PKR (default 0)' },
        notes:         { type: 'string', description: 'Special notes' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              glass_type:  { type: 'string', enum: ['Plain','Color','Mirror','Fluted'] },
              thickness:   { type: 'string', description: '5mm, 6mm, 8mm, 10mm, 12mm' },
              width_inch:  { type: 'number' },
              height_inch: { type: 'number' },
              qty:         { type: 'number' },
              services:    { type: 'array', items: { type: 'string' }, description: 'T/G, P/E, Notch, R/D, D/G' },
              rate:        { type: 'number', description: 'Rate per sqft (0 = auto from product master)' },
            },
            required: ['glass_type','thickness','width_inch','height_inch','qty'],
          },
        },
      },
      required: ['client_name','items'],
    },
  },

  {
    name: 'create_requisition',
    description: 'Create a procurement requisition. Collect all details and confirm before calling.',
    input_schema: {
      type: 'object',
      properties: {
        category:    { type: 'string', description: 'Logistics, Store, Maintenance, Office' },
        description: { type: 'string', description: 'What is needed' },
        qty:         { type: 'number' },
        unit:        { type: 'string', description: 'Nos, Ltr, Kg, Mtr' },
        priority:    { type: 'string', enum: ['Normal','Urgent'] },
        reason:      { type: 'string', description: 'Why needed' },
      },
      required: ['category','description','qty','unit','priority'],
    },
  },

  {
    name: 'update_order_status',
    description: 'Update status of a quotation, sales order, or job order.',
    input_schema: {
      type: 'object',
      properties: {
        doc_type: { type: 'string', enum: ['quotation','sales_order','job_order'] },
        doc_id:   { type: 'string', description: 'Document ID' },
        status:   { type: 'string', description: 'New status e.g. Approved, Dispatched, Completed, Cancelled' },
        notes:    { type: 'string', description: 'Optional notes' },
      },
      required: ['doc_type','doc_id','status'],
    },
  },

  {
    name: 'create_task',
    description: 'Create a task and assign it to someone.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string' },
        assigned_to: { type: 'string' },
        priority:    { type: 'string', enum: ['Low','Medium','High','Urgent'] },
        due_date:    { type: 'string', description: 'YYYY-MM-DD' },
        description: { type: 'string' },
      },
      required: ['title','priority'],
    },
  },

  {
    name: 'draft_payment_voucher',
    description: 'Draft a payment voucher (NOT posted — requires manual approval in Finance).',
    input_schema: {
      type: 'object',
      properties: {
        vendor:      { type: 'string' },
        amount:      { type: 'number', description: 'Amount in PKR' },
        description: { type: 'string' },
        category:    { type: 'string' },
      },
      required: ['vendor','amount','description'],
    },
  },

  {
    name: 'log_factory_event',
    description: 'Log a factory event — maintenance issue, production problem, etc.',
    input_schema: {
      type: 'object',
      properties: {
        sector:     { type: 'string', enum: ['Production','Store','Maintenance','HR','Logistics','Office'] },
        event_type: { type: 'string' },
        detail:     { type: 'string' },
        priority:   { type: 'string', enum: ['Low','Medium','Urgent'] },
      },
      required: ['sector','event_type','detail','priority'],
    },
  },

  // ── PRINT / PDF ──
  // ── FINANCE AGENT TOOLS ──
  {
    name: 'petty_cash_report',
    description: 'Petty cash ka hisab do — kisi bhi period ka. PDF bhi generate kar sakta hai. Examples: "is hafte petty cash", "November ka petty cash", "aaj kitna kharch hua".',
    input_schema: {
      type: 'object',
      properties: {
        query:      { type: 'string', description: 'Period query e.g. "is hafte", "last month", "November"' },
        print_pdf:  { type: 'boolean', description: 'true = PDF bhi generate karo' },
      },
      required: ['query'],
    },
  },
  {
    name: 'outstanding_payments',
    description: 'Clients ke outstanding payments — kiski kitni baaki hai, kitne din se.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string', description: 'Specific client (optional — blank = sab)' },
        overdue_only: { type: 'boolean', description: 'true = sirf 30+ din wale' },
      },
      required: [],
    },
  },
  {
    name: 'expense_summary',
    description: 'Expense summary by category — kaun se kharche zyada hain.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Period e.g. "is mahine", "last week"' },
      },
      required: ['query'],
    },
  },

  // ── PRODUCTION AGENT TOOLS ──
  {
    name: 'floor_status',
    description: 'Production floor ka full status — active jobs, stuck orders, aaj ki cutting, pending dispatch. Owner ke liye morning briefing.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'ncr_report',
    description: 'NCR aur breakage report — kitna glass tuta, kis cutter ne, kya reason tha.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Period e.g. "aaj", "is hafte", "is mahine"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'cutting_report',
    description: 'Cutting sessions report — aaj kitna kita gaya, kaun sa cutter, kaun si table.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Period e.g. "aaj", "is hafte"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'dispatch_status',
    description: 'Dispatch status — kya ready hai, kya bheji gai, kya pending hai.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'stuck_jobs',
    description: 'Jobs jo zyada din se stuck hain — immediate attention chahiye.',
    input_schema: {
      type: 'object',
      properties: {
        min_days: { type: 'number', description: 'Minimum days stuck (default 3)' },
      },
      required: [],
    },
  },

  {
    name: 'print_document',
    description: 'Open print/PDF window for a document. Always call find_order first to get the doc_id.',
    input_schema: {
      type: 'object',
      properties: {
        doc_type: { type: 'string', enum: ['quotation','sales_order','job_order','requisition'] },
        doc_id:   { type: 'string', description: 'Document ID from find_order' },
      },
      required: ['doc_type','doc_id'],
    },
  },

  {
    name: 'send_whatsapp',
    description: 'Send a WhatsApp notification.',
    input_schema: {
      type: 'object',
      properties: {
        message:  { type: 'string' },
        type:     { type: 'string', enum: ['alert','report','task','custom'] },
        priority: { type: 'string', enum: ['Normal','Urgent'] },
      },
      required: ['message','type'],
    },
  },
];

// ── Tool Labels ───────────────────────────────────────────────────────
export const TOOL_LABELS: Record<string, { label: string; icon: string; risk: 'low'|'medium'|'high' }> = {
  petty_cash_report:    { label: 'Petty Cash Report',    icon: '💵', risk: 'low'    },
  outstanding_payments: { label: 'Outstanding Payments',  icon: '⏰', risk: 'low'    },
  expense_summary:      { label: 'Expense Summary',       icon: '📊', risk: 'low'    },
  floor_status:         { label: 'Floor Status',          icon: '🏭', risk: 'low'    },
  ncr_report:           { label: 'NCR Report',            icon: '🔴', risk: 'low'    },
  cutting_report:       { label: 'Cutting Report',        icon: '✂️',  risk: 'low'    },
  dispatch_status:      { label: 'Dispatch Status',       icon: '🚚', risk: 'low'    },
  stuck_jobs:           { label: 'Stuck Jobs',            icon: '⚠️',  risk: 'low'    },
  find_order:           { label: 'Find Order',            icon: '🔍', risk: 'low'    },
  check_stock:          { label: 'Check Stock',           icon: '📦', risk: 'low'    },
  get_client_balance:   { label: 'Client Balance',        icon: '💰', risk: 'low'    },
  search_client:        { label: 'Search Client',         icon: '👤', risk: 'low'    },
  get_glass_rate:       { label: 'Get Glass Rate',        icon: '💎', risk: 'low'    },
  create_quotation:     { label: 'Create Quotation',      icon: '📄', risk: 'medium' },
  create_requisition:   { label: 'Create Requisition',    icon: '📋', risk: 'medium' },
  update_order_status:  { label: 'Update Order Status',   icon: '🔄', risk: 'medium' },
  create_task:          { label: 'Create Task',           icon: '✅', risk: 'low'    },
  draft_payment_voucher:{ label: 'Draft Payment Voucher', icon: '💳', risk: 'high'   },
  log_factory_event:    { label: 'Log Factory Event',     icon: '🏭', risk: 'low'    },
  print_document:       { label: 'Print / PDF',           icon: '🖨️',  risk: 'low'    },
  send_whatsapp:        { label: 'Send WhatsApp',         icon: '💬', risk: 'low'    },
};

// ── Tool Executor ─────────────────────────────────────────────────────
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

    // ── FINANCE AGENT ──
    if (toolName === 'petty_cash_report') {
      const report = FinanceAgent.generatePettyCashReport(params.query);
      if (params.print_pdf) {
        report.action = 'OPEN_PRINT';
        report.print_type = 'petty_cash';
      }
      result = report;
    }

    else if (toolName === 'outstanding_payments') {
      const data = FinanceAgent.outstandingPayments();
      const filtered = params.client_name
        ? { ...data, top_5: data.all.filter((q: any) => q.client?.toLowerCase().includes(params.client_name.toLowerCase())) }
        : params.overdue_only
          ? { ...data, top_5: data.overdue_30plus }
          : data;
      result = filtered;
    }

    else if (toolName === 'expense_summary') {
      result = FinanceAgent.expenseSummary(params.query);
    }

    // ── PRODUCTION AGENT ──
    else if (toolName === 'floor_status') {
      result = ProductionAgent.floorStatus();
    }

    else if (toolName === 'ncr_report') {
      result = ProductionAgent.ncrSummary(params.query);
    }

    else if (toolName === 'cutting_report') {
      result = ProductionAgent.cuttingSessions(params.query);
    }

    else if (toolName === 'dispatch_status') {
      result = ProductionAgent.dispatchStatus();
    }

    else if (toolName === 'stuck_jobs') {
      result = ProductionAgent.stuckJobs(params.min_days || 3);
    }

    // ── FIND ORDER ──
    else if (toolName === 'find_order') {
      const lsKeyMap: Record<string,string> = {
        quotation:   'gtk_erp_quotations',
        sales_order: 'gtk_erp_quotations',
        job_order:   'gtk_erp_job_orders',
        requisition: 'gtk_erp_requisitions',
      };
      const allDocs = ls(lsKeyMap[params.doc_type] || 'gtk_erp_quotations');
      let filtered = allDocs.filter((d: any) => {
        if (params.doc_type === 'sales_order') return d.status === 'Approved' || d.status === 'Sales Order';
        if (params.doc_type === 'quotation') return !d.status || d.status === 'Draft' || d.status === 'Quotation';
        return true;
      });
      if (params.search_id) {
        const s = params.search_id.toLowerCase();
        filtered = filtered.filter((d: any) =>
          d.id?.toLowerCase().includes(s) || d.orderNo?.toLowerCase().includes(s) || String(d.id).includes(s)
        );
      }
      if (params.client_name) {
        const s = params.client_name.toLowerCase();
        filtered = filtered.filter((d: any) => d.clientName?.toLowerCase().includes(s));
      }
      if (params.month) {
        const months: Record<string,number> = {
          january:1,february:2,march:3,april:4,may:5,june:6,
          july:7,august:8,september:9,october:10,november:11,december:12
        };
        const mm = months[params.month.toLowerCase()];
        const yy = params.year ? parseInt(params.year) : new Date().getFullYear();
        if (mm) filtered = filtered.filter((d: any) => {
          const dt = new Date(d.date || d.createdAt || '');
          return dt.getMonth() + 1 === mm && dt.getFullYear() === yy;
        });
      }
      result = {
        found: filtered.length,
        message: filtered.length === 0 ? 'Koi document nahi mila' : `${filtered.length} document mila`,
        documents: filtered.slice(0,10).map((d: any) => ({
          id: d.id, order_no: d.orderNo || d.id,
          client: d.clientName, project: d.projectName,
          status: d.status, amount: d.totalAmount,
          date: d.date || d.createdAt?.split('T')[0],
        })),
      };
    }

    // ── CHECK STOCK ──
    else if (toolName === 'check_stock') {
      const store = ls('gtk_erp_store');
      const products = ls('gtk_erp_products');
      let items = store.filter((s: any) => s.company === 'GlassCo' || !s.company);
      if (params.item_name) {
        const q = params.item_name.toLowerCase();
        items = items.filter((s: any) =>
          s.materialDesc?.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.name?.toLowerCase().includes(q)
        );
      }
      if (params.glass_type || params.thickness) {
        const glassProducts = products.filter((p: any) => {
          const matchType = params.glass_type ? p.glassType?.toLowerCase() === params.glass_type.toLowerCase() : true;
          const matchThick = params.thickness ? p.thickness === params.thickness : true;
          return p.category === 'Glass' && matchType && matchThick;
        });
        result = {
          type: 'glass_stock',
          items: glassProducts.map((p: any) => ({
            name: p.name, glass_type: p.glassType, thickness: p.thickness,
            stock_qty: p.stockQty || p.qty || 0, unit: p.unit || 'Sheets',
            rate: p.purchasePrice || 0,
          })),
        };
      } else {
        result = {
          type: 'store_stock',
          total_items: items.length,
          items: items.slice(0,15).map((s: any) => ({
            name: s.materialDesc || s.description || s.name,
            qty: s.currentQty || s.qty || 0, unit: s.unit,
          })),
        };
      }
    }

    // ── CLIENT BALANCE ──
    else if (toolName === 'get_client_balance') {
      const clients = ls('gtk_erp_clients');
      const quotations = ls('gtk_erp_quotations');
      const client = clients.find((c: any) =>
        c.name?.toLowerCase().includes(params.client_name.toLowerCase()) && c.company === 'GlassCo'
      );
      const clientOrders = quotations.filter((q: any) =>
        q.clientName?.toLowerCase().includes(params.client_name.toLowerCase())
      );
      const totalBilled = clientOrders.reduce((s: number, q: any) => s + (q.totalAmount || 0), 0);
      const totalPaid = clientOrders.reduce((s: number, q: any) => s + (q.paidAmount || 0), 0);
      result = {
        client_name: client?.name || params.client_name,
        phone: client?.phone || 'N/A',
        total_orders: clientOrders.length,
        total_billed: totalBilled,
        total_paid: totalPaid,
        outstanding: totalBilled - totalPaid,
        last_order: clientOrders.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date || 'N/A',
      };
    }

    // ── SEARCH CLIENT ──
    else if (toolName === 'search_client') {
      const clients = ls('gtk_erp_clients');
      const matches = clients.filter((c: any) =>
        c.name?.toLowerCase().includes(params.name.toLowerCase()) && c.company === 'GlassCo'
      ).slice(0,5);
      result = { clients: matches, count: matches.length };
    }

    // ── GET GLASS RATE ──
    else if (toolName === 'get_glass_rate') {
      const products = ls('gtk_erp_products');
      const match = products.find((p: any) =>
        p.company === 'GlassCo' && p.category === 'Glass' &&
        p.glassType?.toLowerCase() === params.glass_type?.toLowerCase() &&
        p.thickness === params.thickness
      );
      result = match
        ? { found: true, rate: match.salePrice || match.price || 0, product: match.name }
        : { found: false, rate: 0, message: 'Rate not found in product master' };
    }

    // ── CREATE QUOTATION ──
    else if (toolName === 'create_quotation') {
      const products = ls('gtk_erp_products');
      const clients = ls('gtk_erp_clients');
      const client = clients.find((c: any) =>
        c.name?.toLowerCase().includes(params.client_name.toLowerCase()) && c.company === 'GlassCo'
      );
      const items = (params.items || []).map((item: any, idx: number) => {
        const sqFt = (item.width_inch * item.height_inch * item.qty) / 144;
        const product = products.find((p: any) =>
          p.company === 'GlassCo' && p.category === 'Glass' &&
          p.glassType?.toLowerCase() === item.glass_type?.toLowerCase() && p.thickness === item.thickness
        );
        const rate = item.rate > 0 ? item.rate : (product?.salePrice || product?.price || 0);
        return {
          id: `ITM-${Date.now()}-${idx}`,
          description: item.description || `${item.glass_type} ${item.thickness}`,
          glassType: item.glass_type, subCategory: 'Standard', glassSize: item.thickness,
          glassColor: 'Clear', inchW: item.width_inch, sootW: 0, inchH: item.height_inch, sootH: 0,
          width: item.width_inch, height: item.height_inch, qty: item.qty,
          totalSqFt: Math.round(sqFt * 100) / 100, pricePerUnit: rate,
          amount: Math.round(sqFt * rate), selectedServices: item.services || [],
          isSection: false, locationCode: '', glazingSpecs: '', inputUnit: 'Inch',
        };
      });
      const totalAmount = items.reduce((s: number, i: any) => s + i.amount, 0);
      const discount = params.discount_pkr || 0;
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + (params.validity_days || 3) * 86400000).toISOString().split('T')[0];
      const newQ = {
        id: `QT-AGENT-${Date.now()}`, company: 'GlassCo', date: today, dueDate,
        clientId: client?.id || '', clientName: params.client_name,
        projectName: params.project_name || 'AGENT ORDER', items, status: 'Draft',
        discountAmount: discount, discountPercent: 0, isAlreadyDispatched: false,
        notes: params.notes || `Created by AI Agent — approved by ${approvedBy}`,
        totalAmount: totalAmount - discount, createdBy: `Agent (${approvedBy})`,
        createdAt: new Date().toISOString(),
      };
      // Save localStorage
      const allQ = ls('gtk_erp_quotations');
      allQ.push(newQ);
      lsSet('gtk_erp_quotations', allQ);
      // Save Supabase
      await supabase.from('quotations').insert({
        id: newQ.id, company: 'GlassCo', date: today, due_date: dueDate,
        client_id: client?.id || null, client_name: params.client_name,
        project_name: newQ.projectName, items, status: 'Draft',
        discount_amount: discount, total_amount: totalAmount - discount,
        notes: newQ.notes, created_by: newQ.createdBy,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      result = {
        quotation_id: newQ.id, client: params.client_name, project: newQ.projectName,
        items_count: items.length,
        total_sqft: Math.round(items.reduce((s: number, i: any) => s + i.totalSqFt, 0) * 100) / 100,
        total_amount: totalAmount - discount, status: 'Draft — Quotations mein nazar aayegi',
      };
    }

    // ── CREATE REQUISITION ──
    else if (toolName === 'create_requisition') {
      const reqId = `REQ-AGENT-${Date.now()}`;
      const today = new Date().toISOString().split('T')[0];
      const { data: reqData, error: reqErr } = await supabase.from('requisitions').insert({
        id: reqId, company: 'GlassCo', date: today,
        header_text: `[AGENT] ${params.description}`, requisitioner: approvedBy,
        priority: params.priority, status: 'Pending', category: params.category,
        req_type: 'Agent Created', reason: params.reason || '', total_value: 0,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).select('id').single();
      if (!reqErr) {
        await supabase.from('requisition_items').insert({
          requisition_id: reqData?.id || reqId,
          item_category: params.category, material_desc: params.description,
          qty: params.qty, unit: params.unit, estimated_rate: 0,
          delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          cost_center: params.category.toUpperCase(), created_at: new Date().toISOString(),
        });
      }
      // localStorage fallback
      const reqs = ls('gtk_erp_requisitions');
      reqs.push({
        id: reqId, company: 'GlassCo', date: today,
        headerText: `[AGENT] ${params.description}`, requisitioner: approvedBy,
        priority: params.priority, status: 'Pending', category: params.category,
        items: [{ materialDesc: params.description, qty: params.qty, unit: params.unit }],
        createdAt: new Date().toISOString(),
      });
      lsSet('gtk_erp_requisitions', reqs);
      result = { req_id: reqData?.id || reqId, saved: reqErr ? 'localStorage' : 'Supabase', message: 'Procurement → Requisitions mein nazar aayegi' };
    }

    // ── UPDATE ORDER STATUS ──
    else if (toolName === 'update_order_status') {
      const lsKeyMap: Record<string,string> = {
        quotation:   'gtk_erp_quotations',
        sales_order: 'gtk_erp_quotations',
        job_order:   'gtk_erp_job_orders',
      };
      const key = lsKeyMap[params.doc_type];
      const docs = ls(key);
      const idx = docs.findIndex((d: any) => d.id === params.doc_id);
      if (idx !== -1) {
        docs[idx].status = params.status;
        docs[idx].updatedAt = new Date().toISOString();
        if (params.notes) docs[idx].statusNotes = params.notes;
        lsSet(key, docs);
      }
      result = { updated: idx !== -1, doc_id: params.doc_id, new_status: params.status };
    }

    // ── CREATE TASK ──
    else if (toolName === 'create_task') {
      const { data, error } = await supabase.from('agent_tasks').insert({
        title: params.title, description: params.description || null,
        assigned_to: params.assigned_to || null, priority: params.priority,
        due_date: params.due_date || null, status: 'Open',
        created_by: approvedBy, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      result = { task_id: data?.id };
    }

    // ── DRAFT PAYMENT VOUCHER ──
    else if (toolName === 'draft_payment_voucher') {
      result = {
        draft: true, vendor: params.vendor, amount: params.amount,
        message: 'PV draft saved — Finance → Payment Vouchers mein manually post karo',
      };
    }

    // ── LOG FACTORY EVENT ──
    else if (toolName === 'log_factory_event') {
      const { data, error } = await supabase.from('factory_events').insert({
        sector: params.sector, event_type: params.event_type, detail: params.detail,
        priority: params.priority, status: 'Open',
        logged_by: `Agent (approved: ${approvedBy})`,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      result = { event_id: data?.id };
    }

    // ── PRINT DOCUMENT ──
    else if (toolName === 'print_document') {
      result = {
        action: 'OPEN_PRINT',
        doc_type: params.doc_type,
        doc_id: params.doc_id,
        message: 'Print window khul rahi hai...',
      };
    }

    // ── SEND WHATSAPP ──
    else if (toolName === 'send_whatsapp') {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-notify`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: params.message, type: params.type, priority: params.priority }),
        }
      );
      result = { sent: res.ok };
    }

    if (action?.id) {
      await supabase.from('agent_actions').update({ result, status: 'executed' }).eq('id', action.id);
    }
    return { success: true, result };

  } catch (err) {
    const error = String(err);
    if (action?.id) {
      await supabase.from('agent_actions').update({ error, status: 'failed' }).eq('id', action.id);
    }
    return { success: false, error };
  }
};
