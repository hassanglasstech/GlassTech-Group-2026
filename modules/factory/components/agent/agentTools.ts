import { supabase } from '@/src/services/supabaseClient';

// ── Tool Definitions ──────────────────────────────────────────────────
export const TOOL_DEFINITIONS = [
  {
    name: 'create_requisition',
    description: 'Create a procurement requisition in ERP',
    input_schema: {
      type: 'object',
      properties: {
        category:    { type: 'string', description: 'Category e.g. Logistics, Store, Maintenance' },
        description: { type: 'string', description: 'What is needed' },
        qty:         { type: 'number', description: 'Quantity' },
        unit:        { type: 'string', description: 'Unit e.g. Nos, Ltr, Kg' },
        priority:    { type: 'string', enum: ['Normal', 'Urgent'], description: 'Priority level' },
        reason:      { type: 'string', description: 'Why needed' },
      },
      required: ['category', 'description', 'qty', 'unit', 'priority'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a task and assign it',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Task title' },
        assigned_to: { type: 'string', description: 'Who to assign to' },
        priority:    { type: 'string', enum: ['Low', 'Medium', 'High', 'Urgent'] },
        due_date:    { type: 'string', description: 'Due date YYYY-MM-DD' },
        description: { type: 'string', description: 'Task details' },
      },
      required: ['title', 'priority'],
    },
  },
  {
    name: 'draft_payment_voucher',
    description: 'Draft a payment voucher (NOT posted — requires manual approval in Finance)',
    input_schema: {
      type: 'object',
      properties: {
        vendor:      { type: 'string', description: 'Vendor or payee name' },
        amount:      { type: 'number', description: 'Amount in PKR' },
        description: { type: 'string', description: 'Payment description' },
        category:    { type: 'string', description: 'Expense category' },
      },
      required: ['vendor', 'amount', 'description'],
    },
  },
  {
    name: 'log_factory_event',
    description: 'Log a factory event (maintenance, production issue, etc.)',
    input_schema: {
      type: 'object',
      properties: {
        sector:     { type: 'string', enum: ['Production', 'Store', 'Maintenance', 'HR', 'Logistics', 'Office'] },
        event_type: { type: 'string', description: 'Type of event' },
        detail:     { type: 'string', description: 'Event details' },
        priority:   { type: 'string', enum: ['Low', 'Medium', 'Urgent'] },
      },
      required: ['sector', 'event_type', 'detail', 'priority'],
    },
  },
  {
    name: 'send_whatsapp',
    description: 'Send a WhatsApp notification message',
    input_schema: {
      type: 'object',
      properties: {
        message:  { type: 'string', description: 'Message to send' },
        type:     { type: 'string', enum: ['alert', 'report', 'task', 'custom'] },
        priority: { type: 'string', enum: ['Normal', 'Urgent'] },
      },
      required: ['message', 'type'],
    },
  },
  {
    name: 'create_quotation',
    description: 'Create a GlassCo sales quotation. Ask user for any missing info before calling this tool. Always confirm details first.',
    input_schema: {
      type: 'object',
      properties: {
        client_name:   { type: 'string', description: 'Client / customer name' },
        project_name:  { type: 'string', description: 'Project reference e.g. MAIN, PHASE-1, SHOP' },
        items: {
          type: 'array',
          description: 'List of glass line items',
          items: {
            type: 'object',
            properties: {
              description:  { type: 'string',  description: 'Item description e.g. Front door glass' },
              glass_type:   { type: 'string',  enum: ['Plain','Color','Mirror','Fluted'], description: 'Glass category' },
              thickness:    { type: 'string',  description: 'Thickness e.g. 5mm, 6mm, 8mm, 10mm, 12mm' },
              width_inch:   { type: 'number',  description: 'Width in inches' },
              height_inch:  { type: 'number',  description: 'Height in inches' },
              qty:          { type: 'number',  description: 'Quantity (pieces)' },
              services:     { type: 'array', items: { type: 'string' }, description: 'Services: T/G, P/E, Notch, R/D, D/G etc.' },
              rate:         { type: 'number',  description: 'Rate per sqft in PKR (optional — leave 0 if unknown)' },
            },
            required: ['glass_type', 'thickness', 'width_inch', 'height_inch', 'qty'],
          },
        },
        validity_days: { type: 'number', description: 'Validity in days (default 3)' },
        discount_pkr:  { type: 'number', description: 'Discount in PKR (default 0)' },
        notes:         { type: 'string', description: 'Any special notes' },
      },
      required: ['client_name', 'items'],
    },
  },
  {
    name: 'search_client',
    description: 'Search for a client by name in ERP to get their ID',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Client name to search' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_glass_rate',
    description: 'Get the current rate for a glass type and thickness from ERP product master',
    input_schema: {
      type: 'object',
      properties: {
        glass_type: { type: 'string', description: 'Plain, Color, Mirror, Fluted' },
        thickness:  { type: 'string', description: '5mm, 6mm, 8mm etc.' },
      },
      required: ['glass_type', 'thickness'],
    },
  },
  {
    name: 'find_order',
    description: 'Find a quotation, sales order, or job order by ID, order number, client name, or date range. Use this before print_document.',
    input_schema: {
      type: 'object',
      properties: {
        doc_type:   { type: 'string', enum: ['quotation', 'sales_order', 'job_order', 'requisition'], description: 'Type of document' },
        search_id:  { type: 'string', description: 'Order ID or number e.g. 2367, QT-123, SO-456' },
        client_name:{ type: 'string', description: 'Client name to search by' },
        month:      { type: 'string', description: 'Month name e.g. November, January' },
        year:       { type: 'string', description: 'Year e.g. 2024' },
      },
      required: ['doc_type'],
    },
  },
  {
    name: 'print_document',
    description: 'Open the print/PDF view for a document. Must call find_order first to get the document ID.',
    input_schema: {
      type: 'object',
      properties: {
        doc_type: { type: 'string', enum: ['quotation', 'sales_order', 'job_order', 'requisition'] },
        doc_id:   { type: 'string', description: 'Document ID from find_order result' },
      },
      required: ['doc_type', 'doc_id'],
    },
  },
  {
    name: 'update_event_status',
    description: 'Update a factory event status',
    input_schema: {
      type: 'object',
      properties: {
        event_id:  { type: 'string', description: 'Factory event ID' },
        status:    { type: 'string', enum: ['Open', 'Pending', 'In Progress', 'Resolved', 'Closed'] },
        notes:     { type: 'string', description: 'Optional notes' },
      },
      required: ['event_id', 'status'],
    },
  },
];

// ── Tool Labels ───────────────────────────────────────────────────────
export const TOOL_LABELS: Record<string, { label: string; icon: string; risk: 'low' | 'medium' | 'high' }> = {
  create_requisition:  { label: 'Create Requisition',    icon: '📋', risk: 'medium' },
  create_task:         { label: 'Create Task',           icon: '✅', risk: 'low'    },
  create_quotation:    { label: 'Create Quotation',      icon: '📄', risk: 'medium' },
  search_client:       { label: 'Search Client',         icon: '🔍', risk: 'low'    },
  get_glass_rate:      { label: 'Get Glass Rate',        icon: '💰', risk: 'low'    },
  draft_payment_voucher:{ label: 'Draft Payment Voucher',icon: '💳', risk: 'high'   },
  log_factory_event:   { label: 'Log Factory Event',     icon: '🏭', risk: 'low'    },
  send_whatsapp:       { label: 'Send WhatsApp',         icon: '💬', risk: 'low'    },
  find_order:          { label: 'Find Order',            icon: '🔍', risk: 'low'    },
  print_document:      { label: 'Print / PDF',           icon: '🖨️', risk: 'low'    },
  update_event_status: { label: 'Update Event Status',   icon: '🔄', risk: 'low'    },
};

// ── Tool Executor ─────────────────────────────────────────────────────
export const executeTool = async (
  toolName: string,
  params: Record<string, any>,
  approvedBy: string
): Promise<{ success: boolean; result?: any; error?: string }> => {

  // Log to audit trail first
  const { data: action } = await supabase.from('agent_actions').insert({
    tool_name:   toolName,
    tool_params: params,
    status:      'executed',
    approved_by: approvedBy,
    executed_at: new Date().toISOString(),
    created_at:  new Date().toISOString(),
  }).select('id').single();

  try {
    let result: any = null;

    if (toolName === 'create_requisition') {
      const reqId = `REQ-AGENT-${Date.now()}`;
      const today = new Date().toISOString().split('T')[0];
      const reqPayload = {
        id:            reqId,
        company:       'GlassCo',
        date:          today,
        header_text:   `[AGENT] ${params.description}`,
        requisitioner: approvedBy,
        priority:      params.priority,
        status:        'Pending',
        category:      params.category,
        req_type:      'Agent Created',
        reason:        params.reason || '',
        total_value:   0,
        created_at:    new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      };
      const { data: reqData, error: reqErr } = await supabase
        .from('requisitions')
        .insert(reqPayload)
        .select('id').single();
      if (reqErr) throw reqErr;

      // Save requisition item
      await supabase.from('requisition_items').insert({
        requisition_id: reqData?.id || reqId,
        item_category:  params.category,
        material_desc:  params.description,
        qty:            params.qty,
        unit:           params.unit,
        estimated_rate: 0,
        delivery_date:  new Date(Date.now() + 86400000).toISOString().split('T')[0],
        cost_center:    params.category.toUpperCase(),
        created_at:     new Date().toISOString(),
      });

      // Also save to localStorage for offline access
      const reqs = JSON.parse(localStorage.getItem('gtk_erp_requisitions') || '[]');
      reqs.push({ ...reqPayload, items: [{ materialDesc: params.description, qty: params.qty, unit: params.unit }] });
      localStorage.setItem('gtk_erp_requisitions', JSON.stringify(reqs));

      result = { req_id: reqData?.id || reqId, saved: 'Supabase + localStorage', message: 'Procurement → Requisitions mein nazar aayegi' };
    }

    else if (toolName === 'create_task') {
      const { data, error } = await supabase.from('agent_tasks').insert({
        title:       params.title,
        description: params.description || null,
        assigned_to: params.assigned_to || null,
        priority:    params.priority,
        due_date:    params.due_date || null,
        status:      'Open',
        created_by:  approvedBy,
        created_at:  new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      result = { task_id: data?.id };
    }

    else if (toolName === 'log_factory_event') {
      const { data, error } = await supabase.from('factory_events').insert({
        sector:     params.sector,
        event_type: params.event_type,
        detail:     params.detail,
        priority:   params.priority,
        status:     'Open',
        logged_by:  `Agent (approved: ${approvedBy})`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      result = { event_id: data?.id };
    }

    else if (toolName === 'update_event_status') {
      const { error } = await supabase.from('factory_events').update({
        status:     params.status,
        notes:      params.notes || null,
        updated_at: new Date().toISOString(),
      }).eq('id', params.event_id);
      if (error) throw error;
      result = { updated: true };
    }

    else if (toolName === 'draft_payment_voucher') {
      // Store as agent_actions — Finance module pe manually post karna hoga
      result = {
        draft: true,
        message: `PV draft saved — Finance → Payment Vouchers mein manually post karo`,
        vendor:  params.vendor,
        amount:  params.amount,
      };
    }

    else if (toolName === 'search_client') {
      // Search in Supabase clients table (correct table name)
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone, address')
        .ilike('name', `%${params.name}%`)
        .limit(5);
      // Also check localStorage
      const localClients = JSON.parse(localStorage.getItem('gtk_erp_clients') || '[]');
      const localMatch = localClients.filter((c: any) =>
        c.name?.toLowerCase().includes(params.name.toLowerCase()) && c.company === 'GlassCo'
      ).slice(0, 5);
      const all = [...(data || []), ...localMatch].slice(0, 5);
      result = { clients: all, count: all.length };
    }

    else if (toolName === 'get_glass_rate') {
      const localProducts = JSON.parse(localStorage.getItem('gtk_erp_products') || '[]');
      const match = localProducts.find((p: any) =>
        p.company === 'GlassCo' &&
        p.category === 'Glass' &&
        p.glassType?.toLowerCase() === params.glass_type?.toLowerCase() &&
        p.thickness === params.thickness
      );
      result = match
        ? { found: true, rate: match.salePrice || match.price || 0, product: match.name }
        : { found: false, rate: 0, message: 'Rate not found in product master' };
    }

    else if (toolName === 'create_quotation') {
      // Find client ID
      const localClients = JSON.parse(localStorage.getItem('gtk_erp_clients') || '[]');
      const client = localClients.find((c: any) =>
        c.name?.toLowerCase().includes(params.client_name.toLowerCase()) && c.company === 'GlassCo'
      );
      const clientId = client?.id || '';

      // Build quotation items
      const localProducts = JSON.parse(localStorage.getItem('gtk_erp_products') || '[]');
      const items = (params.items || []).map((item: any, idx: number) => {
        const sqFt = (item.width_inch * item.height_inch * item.qty) / 144;
        const product = localProducts.find((p: any) =>
          p.company === 'GlassCo' &&
          p.category === 'Glass' &&
          p.glassType?.toLowerCase() === item.glass_type?.toLowerCase() &&
          p.thickness === item.thickness
        );
        const rate = item.rate > 0 ? item.rate : (product?.salePrice || product?.price || 0);
        return {
          id:               `ITM-${Date.now()}-${idx}`,
          description:      item.description || `${item.glass_type} ${item.thickness}`,
          glassType:        item.glass_type,
          subCategory:      'Standard',
          glassSize:        item.thickness,
          glassColor:       'Clear',
          inchW:            item.width_inch,
          sootW:            0,
          inchH:            item.height_inch,
          sootH:            0,
          width:            item.width_inch,
          height:           item.height_inch,
          qty:              item.qty,
          totalSqFt:        Math.round(sqFt * 100) / 100,
          pricePerUnit:     rate,
          amount:           Math.round(sqFt * rate),
          selectedServices: item.services || [],
          isSection:        false,
          locationCode:     '',
          glazingSpecs:     '',
          inputUnit:        'Inch',
        };
      });

      const totalAmount = items.reduce((s: number, i: any) => s + i.amount, 0);
      const discount = params.discount_pkr || 0;
      const validityDays = params.validity_days || 3;
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + validityDays * 86400000).toISOString().split('T')[0];

      // Save to localStorage (same as manual quotation)
      const quotations = JSON.parse(localStorage.getItem('gtk_erp_quotations') || '[]');
      const newQuotation = {
        id:                 `QT-AGENT-${Date.now()}`,
        company:            'GlassCo',
        date:               today,
        dueDate,
        clientId,
        clientName:         params.client_name,
        projectName:        params.project_name || 'AGENT ORDER',
        items,
        status:             'Draft',
        discountAmount:     discount,
        discountPercent:    0,
        isAlreadyDispatched: false,
        notes:              params.notes || `Created by AI Agent — approved by ${approvedBy}`,
        totalAmount:        totalAmount - discount,
        createdBy:          `Agent (${approvedBy})`,
        createdAt:          new Date().toISOString(),
      };

      // Save to Supabase
      const { data: qtData, error: qtErr } = await supabase
        .from('quotations')
        .insert({
          id:              newQuotation.id,
          company:         'GlassCo',
          date:            newQuotation.date,
          due_date:        newQuotation.dueDate,
          client_id:       clientId || null,
          client_name:     params.client_name,
          project_name:    params.project_name || 'AGENT ORDER',
          items:           items,
          status:          'Draft',
          discount_amount: discount,
          total_amount:    totalAmount - discount,
          notes:           newQuotation.notes,
          created_by:      `Agent (${approvedBy})`,
          created_at:      new Date().toISOString(),
          updated_at:      new Date().toISOString(),
        })
        .select('id').single();

      // Also localStorage fallback
      quotations.push(newQuotation);
      localStorage.setItem('gtk_erp_quotations', JSON.stringify(quotations));

      result = {
        quotation_id:  qtData?.id || newQuotation.id,
        client:        params.client_name,
        project:       params.project_name || 'N/A',
        items_count:   items.length,
        total_sqft:    Math.round(items.reduce((s: number, i: any) => s + i.totalSqFt, 0) * 100) / 100,
        total_amount:  totalAmount - discount,
        status:        'Draft — Sales → GlassCo → Quotations mein nazar aayegi',
        saved:         qtErr ? 'localStorage only' : 'Supabase + localStorage',
      };
    }

    else if (toolName === 'find_order') {
      const docType = params.doc_type;
      let table = 'quotations';
      if (docType === 'sales_order') table = 'sales_orders';
      else if (docType === 'job_order') table = 'job_orders';
      else if (docType === 'requisition') table = 'requisitions';

      let query = supabase.from(table).select('id, created_at, client_name, project_name, status, total_amount, order_no').limit(10);

      if (params.search_id) {
        // Search by ID or order number
        const searchVal = params.search_id.trim();
        query = query.or(`id.ilike.%${searchVal}%,order_no.ilike.%${searchVal}%`);
      }
      if (params.client_name) {
        query = query.ilike('client_name', `%${params.client_name}%`);
      }
      if (params.month || params.year) {
        const months: Record<string,string> = {
          january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',
          july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'
        };
        const mm = params.month ? months[params.month.toLowerCase()] : null;
        const yy = params.year || new Date().getFullYear().toString();
        if (mm) {
          query = query.gte('created_at', `${yy}-${mm}-01`).lte('created_at', `${yy}-${mm}-31`);
        } else {
          query = query.gte('created_at', `${yy}-01-01`).lte('created_at', `${yy}-12-31`);
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      result = {
        found: (data || []).length,
        documents: (data || []).map((d: any) => ({
          id: d.id,
          order_no: d.order_no || d.id,
          client: d.client_name,
          project: d.project_name,
          status: d.status,
          amount: d.total_amount,
          date: d.created_at?.split('T')[0],
        })),
        message: (data || []).length === 0 ? 'Koi document nahi mila — search criteria check karo' : `${(data||[]).length} document mila`,
      };
    }

    else if (toolName === 'print_document') {
      // This tool triggers a custom event that AIChatInterface listens to
      // The actual print window opens in the browser
      result = {
        doc_type: params.doc_type,
        doc_id:   params.doc_id,
        action:   'OPEN_PRINT',
        message:  'Print window khul rahi hai...',
      };
    }

    else if (toolName === 'send_whatsapp') {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-notify`,
        {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ message: params.message, type: params.type, priority: params.priority }),
        }
      );
      result = { sent: res.ok };
    }

    // Update audit trail with result
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
