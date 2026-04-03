import { supabase } from '@/src/services/supabaseClient';

// ── Tool Definitions ──────────────────────────────────────────────────
export const TOOL_DEFINITIONS = [
  {
    name: 'create_requisition',
    description: 'Create a procurement requisition in ERP',
    parameters: {
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
    parameters: {
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
    parameters: {
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
    parameters: {
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
    parameters: {
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
    name: 'update_event_status',
    description: 'Update a factory event status',
    parameters: {
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
  draft_payment_voucher:{ label: 'Draft Payment Voucher',icon: '💳', risk: 'high'   },
  log_factory_event:   { label: 'Log Factory Event',     icon: '🏭', risk: 'low'    },
  send_whatsapp:       { label: 'Send WhatsApp',         icon: '💬', risk: 'low'    },
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
      const { data, error } = await supabase.from('requisitions').insert({
        company:       'GlassCo',
        date:          new Date().toISOString().split('T')[0],
        header_text:   `[AGENT] ${params.description}`,
        requisitioner: approvedBy,
        priority:      params.priority,
        status:        'Pending',
        category:      params.category,
        req_type:      'Agent Created',
        items:         JSON.stringify([{
          id:            crypto.randomUUID(),
          itemCategory:  params.category,
          materialDesc:  params.description,
          qty:           params.qty,
          unit:          params.unit,
          estimatedRate: 0,
          deliveryDate:  new Date(Date.now() + 86400000).toISOString().split('T')[0],
          costCenter:    params.category.toUpperCase(),
        }]),
        total_value:   0,
        created_at:    new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      result = { req_id: data?.id };
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
