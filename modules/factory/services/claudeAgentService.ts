// ═══════════════════════════════════════════════════════════════════════
// Claude Agent Service — Centralized AI gateway for GlassTech ERP
// All Claude API calls route through Supabase claude-proxy Edge Function
// API key stays server-side (Supabase secrets) — never exposed to browser
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';

// ── Types ────────────────────────────────────────────────────────────────
export interface ClaudeMessage {
  role:    'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?:   string;
  name?: string;
  input?: Record<string, any>;
  tool_use_id?: string;
  content?: string;
}

export interface ClaudeToolDef {
  name:         string;
  description:  string;
  input_schema: Record<string, any>;
}

export interface ClaudeRequestOptions {
  model?:      string;
  maxTokens?:  number;
  system?:     string;
  messages:    ClaudeMessage[];
  tools?:      ClaudeToolDef[];
  stream?:     boolean;
  agentId?:    string;  // for token tracking: 'finance', 'production', 'ops', 'master', 'adversarial', etc.
}

export interface ClaudeResponse {
  content:       ContentBlock[];
  model:         string;
  stop_reason:   string;
  usage: {
    input_tokens:  number;
    output_tokens: number;
  };
}

export interface TokenUsageEntry {
  agentId:       string;
  model:         string;
  inputTokens:   number;
  outputTokens:  number;
  totalTokens:   number;
  costUsd:       number;
  costPkr:       number;
  timestamp:     string;
}

// ── Token pricing (USD per 1M tokens) + PKR conversion ───────────────────
const USD_TO_PKR = 278; // Update as rate changes

const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
};

// ── In-memory token usage tracker ────────────────────────────────────────
const usageLog: TokenUsageEntry[] = [];
const SESSION_USAGE = { input: 0, output: 0, costUsd: 0, costPkr: 0, calls: 0 };

const trackUsage = (agentId: string, model: string, input: number, output: number) => {
  const pricing = PRICING[model] || PRICING['claude-haiku-4-5-20251001'];
  const costUsd = (input * pricing.input + output * pricing.output) / 1_000_000;
  const costPkr = costUsd * USD_TO_PKR;

  const entry: TokenUsageEntry = {
    agentId,
    model,
    inputTokens:   input,
    outputTokens:  output,
    totalTokens:   input + output,
    costUsd,
    costPkr,
    timestamp:     new Date().toISOString(),
  };
  usageLog.push(entry);

  SESSION_USAGE.input   += input;
  SESSION_USAGE.output  += output;
  SESSION_USAGE.costUsd += costUsd;
  SESSION_USAGE.costPkr += costPkr;
  SESSION_USAGE.calls   += 1;

  // Persist to Supabase (fire-and-forget)
  supabase.from('agent_api_calls').insert({
    agent_name:     agentId,
    model,
    input_tokens:   input,
    output_tokens:  output,
    tokens_used:    input + output,
    cost_usd:       Math.round(costUsd * 1_000_000) / 1_000_000,
    cost_pkr:       Math.round(costPkr * 100) / 100,
    created_at:     entry.timestamp,
  }).then(() => {}).catch(() => {});
};

// ── Retry with exponential backoff ───────────────────────────────────────
const fetchWithRetry = async (
  url: string,
  opts: RequestInit,
  maxRetries = 3
): Promise<Response> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, opts);
      if ((response.status === 429 || response.status === 529) && attempt < maxRetries) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (netErr) {
      if (attempt === maxRetries) throw netErr;
      await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error('Max retries reached');
};

// ── Get auth header ──────────────────────────────────────────────────────
const getAuthHeader = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? `Bearer ${session.access_token}`
    : `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`;
};

// ── Core: Send message to Claude via proxy ───────────────────────────────
// ── Direct Anthropic API call (fallback when proxy not deployed) ─────────
const callClaudeDirect = async (
  _body: Record<string, any>,
  _agentId: string,
  _model: string,
): Promise<ClaudeResponse> => {
  // SECURITY (go-live fix): direct browser -> Anthropic calls are DISABLED.
  // A VITE_* API key is inlined into the public JS bundle and is readable by
  // anyone, leading to key theft and unbounded billing. All Claude traffic
  // MUST flow through the claude-proxy Edge Function (server-side key only).
  throw new Error(
    'Claude proxy unavailable. Direct browser API calls are disabled for security. ' +
    'Deploy or repair the claude-proxy Edge Function in Supabase.'
  );
};

export const callClaude = async (opts: ClaudeRequestOptions): Promise<ClaudeResponse> => {
  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-proxy`;
  const auth     = await getAuthHeader();
  const model    = opts.model || 'claude-haiku-4-5-20251001';
  const agentId  = opts.agentId || 'default';

  const body: Record<string, any> = {
    model,
    max_tokens: opts.maxTokens || 1000,
    messages:   opts.messages,
  };
  if (opts.system) body.system = opts.system;
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools.map(t => ({ type: 'custom' as const, ...t }));
  }

  // ── Try proxy first ───────────────────────────────────────────────────
  try {
    const res = await fetchWithRetry(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': auth,
      },
      body: JSON.stringify(body),
    });

    // 401/405 = proxy not deployed or anon key rejected → fall through to direct
    if (res.status === 401 || res.status === 405) {
      console.warn(`[Claude] Proxy returned ${res.status} — falling back to direct API`);
      return callClaudeDirect(body, agentId, model);
    }

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Claude API error (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    if (data.usage) {
      trackUsage(agentId, model, data.usage.input_tokens || 0, data.usage.output_tokens || 0);
    }
    return data as ClaudeResponse;

  } catch (err: any) {
    // Network error (proxy unreachable) → try direct
    if (err?.message?.includes('fetch') || err?.name === 'TypeError') {
      console.warn('[Claude] Proxy unreachable — falling back to direct API');
      return callClaudeDirect(body, agentId, model);
    }
    throw err;
  }
};

// ── Convenience: Get text response ───────────────────────────────────────
export const askClaude = async (
  prompt: string,
  opts?: Partial<ClaudeRequestOptions>
): Promise<string> => {
  const response = await callClaude({
    messages: [{ role: 'user', content: prompt }],
    ...opts,
  });
  const textBlock = response.content?.find(b => b.type === 'text');
  return textBlock?.text || '';
};

// ── Convenience: Chat with tool use ──────────────────────────────────────
export const chatWithTools = async (
  opts: ClaudeRequestOptions
): Promise<{
  text:      string;
  toolCalls: { id: string; name: string; params: Record<string, any> }[];
  response:  ClaudeResponse;
}> => {
  const response = await callClaude(opts);

  const toolBlocks = response.content?.filter(b => b.type === 'tool_use') || [];
  const textBlock  = response.content?.find(b => b.type === 'text');

  return {
    text:      textBlock?.text || '',
    toolCalls: toolBlocks.map(b => ({
      id:     b.id!,
      name:   b.name!,
      params: b.input || {},
    })),
    response,
  };
};

// ── Streaming support ────────────────────────────────────────────────────
export const streamClaude = async (
  opts: ClaudeRequestOptions,
  onChunk: (text: string) => void,
  onDone?: (fullText: string, response: any) => void
): Promise<void> => {
  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-proxy`;
  const auth     = await getAuthHeader();
  const model    = opts.model || 'claude-haiku-4-5-20251001';
  const agentId  = opts.agentId || 'default';

  const body: Record<string, any> = {
    model,
    max_tokens: opts.maxTokens || 1000,
    messages:   opts.messages,
    stream:     true,
  };
  if (opts.system) body.system = opts.system;

  const res = await fetchWithRetry(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': auth,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude streaming error (${res.status}): ${errBody}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body for streaming');

  const decoder  = new TextDecoder();
  let fullText   = '';
  let inputTokens  = 0;
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullText += event.delta.text;
          onChunk(event.delta.text);
        }
        if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens || 0;
        }
        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
        }
      } catch {}
    }
  }

  trackUsage(agentId, model, inputTokens, outputTokens);
  onDone?.(fullText, { inputTokens, outputTokens });
};

// ═══════════════════════════════════════════════════════════════════════
// BUILT-IN SUPABASE QUERY TOOLS — Direct data access for Claude
// These query Supabase via the authenticated client (respects RLS).
// ═══════════════════════════════════════════════════════════════════════

const ls = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };

export const QUERY_TOOL_DEFS: ClaudeToolDef[] = [
  { name: 'get_quotations',
    description: 'Get quotations list — count, total amount, by status/date/company. "kitni quotations hain", "aaj ki quotations".',
    input_schema: { type: 'object', properties: {
      status:    { type: 'string', description: 'Draft, Sent, Approved, all' },
      date_from: { type: 'string', description: 'YYYY-MM-DD' },
      date_to:   { type: 'string', description: 'YYYY-MM-DD' },
      company:   { type: 'string', description: 'GlassCo, GTK, etc.' },
    }, required: [] },
  },
  { name: 'get_sales_orders',
    description: 'Sales orders / approved quotations with production status.',
    input_schema: { type: 'object', properties: {
      status:  { type: 'string', description: 'Approved, In Production, Dispatched, all' },
      company: { type: 'string' },
    }, required: [] },
  },
  { name: 'get_attendance_today',
    description: 'Today ki attendance — kaun aaya, kaun nahi, late. "attendance dikhao".',
    input_schema: { type: 'object', properties: {
      company: { type: 'string' },
    }, required: [] },
  },
  { name: 'get_stock_level',
    description: 'Stock levels — glass type, thickness, available qty. "stock kya hai", "8mm kitna hai".',
    input_schema: { type: 'object', properties: {
      item_type: { type: 'string', description: 'Glass, Store, etc.' },
      thickness: { type: 'string', description: '5mm, 6mm, 8mm, etc.' },
    }, required: [] },
  },
  { name: 'get_pending_grns',
    description: 'Pending GRN / material receipts awaiting processing.',
    input_schema: { type: 'object', properties: {
      company: { type: 'string' },
    }, required: [] },
  },
  { name: 'get_ar_aging',
    description: 'Accounts receivable aging — kiski payment baaki hai, kitne din se. "AR aging", "receivables".',
    input_schema: { type: 'object', properties: {
      company: { type: 'string' },
    }, required: [] },
  },
  { name: 'get_production_status',
    description: 'Production floor status — active pieces, cutting, tempering, dispatch ready.',
    input_schema: { type: 'object', properties: {
      company: { type: 'string' },
    }, required: [] },
  },
];

// ── Execute a built-in query tool ────────────────────────────────────────
const executeQueryTool = async (name: string, params: Record<string, any>): Promise<any> => {
  const today = new Date().toISOString().split('T')[0];
  const month = today.slice(0, 7);

  switch (name) {
    case 'get_quotations': {
      let q = ls('gtk_erp_quotations');
      if (params.company) q = q.filter((x: any) => x.company === params.company);
      if (params.status && params.status !== 'all') q = q.filter((x: any) => x.status === params.status);
      if (params.date_from) q = q.filter((x: any) => (x.date || '') >= params.date_from);
      if (params.date_to) q = q.filter((x: any) => (x.date || '') <= params.date_to);
      const todayQ = q.filter((x: any) => x.date === today);
      const monthQ = q.filter((x: any) => x.date?.startsWith(month));
      return { total: q.length, today: todayQ.length, this_month: monthQ.length, total_value: q.reduce((s: number, x: any) => s + (x.totalAmount || 0), 0), by_status: q.reduce((acc: any, x: any) => { acc[x.status || 'Unknown'] = (acc[x.status || 'Unknown'] || 0) + 1; return acc; }, {}), recent: q.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || '')).slice(0, 5).map((x: any) => ({ id: x.id, client: x.clientName, amount: x.totalAmount, date: x.date, status: x.status })) };
    }
    case 'get_sales_orders': {
      let q = ls('gtk_erp_quotations').filter((x: any) => ['Approved', 'In Production', 'Dispatched', 'Sent', 'Partial Payment'].includes(x.status));
      if (params.company) q = q.filter((x: any) => x.company === params.company);
      if (params.status && params.status !== 'all') q = q.filter((x: any) => x.status === params.status);
      return { total: q.length, total_value: q.reduce((s: number, x: any) => s + (x.totalAmount || 0), 0), by_status: q.reduce((acc: any, x: any) => { acc[x.status] = (acc[x.status] || 0) + 1; return acc; }, {}), orders: q.slice(0, 8).map((x: any) => ({ id: x.id, client: x.clientName, amount: x.totalAmount, status: x.status })) };
    }
    case 'get_attendance_today': {
      const emps = ls('gtk_erp_employees').filter((e: any) => !['resigned', 'terminated'].includes(e.work?.status || ''));
      const att = ls('gtk_erp_attendance').filter((a: any) => a.date === today);
      const present = att.filter((a: any) => a.status === 'Present').length;
      const absent = att.filter((a: any) => a.status === 'Absent').length;
      const late = att.filter((a: any) => (a.lateMinutes || 0) > 0).length;
      return { date: today, total_employees: emps.length, present, absent, late, attendance_rate: emps.length > 0 ? Math.round((present / emps.length) * 100) + '%' : 'N/A' };
    }
    case 'get_stock_level': {
      let items = ls('gtk_erp_store');
      if (params.item_type) items = items.filter((x: any) => (x.category || x.glassType || '').toLowerCase().includes(params.item_type.toLowerCase()));
      if (params.thickness) items = items.filter((x: any) => (x.thickness || x.size || '').includes(params.thickness));
      return { total_items: items.length, items: items.slice(0, 10).map((x: any) => ({ name: x.name || x.description, category: x.category, thickness: x.thickness, qty: x.quantity || x.qty || 0, unit: x.unit || 'pcs' })) };
    }
    case 'get_pending_grns': {
      const grns = ls('gtk_erp_grn_sheet_entries').filter((g: any) => g.status === 'Pending' || !g.status);
      return { pending_count: grns.length, grns: grns.slice(0, 5).map((g: any) => ({ id: g.id, vendor: g.vendorName, date: g.date })) };
    }
    case 'get_ar_aging': {
      const invoices = ls('gtk_erp_invoices').filter((i: any) => i.status === 'Outstanding' || i.status === 'Overdue');
      const now = Date.now();
      const aging = invoices.map((i: any) => ({ id: i.id, client: i.clientName, amount: i.totalAmount || 0, due: i.dueDate, days_overdue: i.dueDate ? Math.max(0, Math.floor((now - new Date(i.dueDate).getTime()) / 86400000)) : 0 }));
      const total = aging.reduce((s: number, a: any) => s + a.amount, 0);
      return { total_outstanding: total, total_formatted: `PKR ${total.toLocaleString()}`, count: aging.length, over_30_days: aging.filter((a: any) => a.days_overdue > 30).length, over_60_days: aging.filter((a: any) => a.days_overdue > 60).length, top_5: aging.sort((a: any, b: any) => b.amount - a.amount).slice(0, 5) };
    }
    case 'get_production_status': {
      const pieces = ls('gtk_erp_production_pieces');
      const statusCounts: Record<string, number> = {};
      pieces.forEach((p: any) => { statusCounts[p.status || 'Unknown'] = (statusCounts[p.status || 'Unknown'] || 0) + 1; });
      return { total_pieces: pieces.length, active: pieces.filter((p: any) => !['Delivered', 'Broken'].includes(p.status)).length, by_status: statusCounts };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
};

// ── Record Expense write tool ────────────────────────────────────────
const EXPENSE_TOOL: ClaudeToolDef = {
  name: 'record_expense',
  description: 'Record a new expense / kharcha. "5000 ka rent record karo", "diesel 3000 likh do".',
  input_schema: { type: 'object', properties: {
    description: { type: 'string', description: 'What was the expense for' },
    amount:      { type: 'number', description: 'Amount in PKR' },
    category:    { type: 'string', description: 'Rent, Fuel, Utilities, Misc, etc.' },
    company:     { type: 'string', description: 'GlassCo, GTK, etc.' },
    paid_by:     { type: 'string', description: 'Who paid (optional)' },
    notes:       { type: 'string', description: 'Any notes (optional)' },
  }, required: ['description', 'amount', 'category'] },
};

const executeRecordExpense = async (params: Record<string, any>): Promise<any> => {
  console.log('[record_expense] Recording:', params);
  const { data, error } = await supabase.from('expenses').insert({
    description: params.description,
    amount:      params.amount,
    category:    params.category,
    company:     params.company || 'GlassCo',
    paid_by:     params.paid_by || null,
    notes:       params.notes || null,
    recorded_by: 'EventOS Agent',
    created_at:  new Date().toISOString(),
  }).select('id').single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data?.id, message: `${params.description} — PKR ${(params.amount || 0).toLocaleString()} recorded for ${params.company || 'GlassCo'}` };
};

// ── Full query-with-tools loop (handles tool_use → execute → tool_result → answer) ──
export const queryWithTools = async (
  message: string,
  systemPrompt: string,
  agentId = 'query-agent'
): Promise<{ answer: string; toolsUsed: string[] }> => {
  // Merge: built-in tools + schema-generated tools + write tools
  let schemaTools: ClaudeToolDef[] = [];
  try {
    const { generateSchemaTools } = await import('./schemaIntrospector');
    schemaTools = await generateSchemaTools();
  } catch {}

  const allTools = [...QUERY_TOOL_DEFS, ...schemaTools, EXPENSE_TOOL];
  const toolsUsed: string[] = [];

  // First call — Claude decides which tools to use
  const firstResponse = await callClaude({
    model:     'claude-haiku-4-5-20251001',
    maxTokens: 800,
    system:    systemPrompt,
    tools:     allTools,
    messages:  [{ role: 'user', content: message }],
    agentId,
  });

  const toolBlocks = firstResponse.content?.filter(b => b.type === 'tool_use') || [];
  const textBlock  = firstResponse.content?.find(b => b.type === 'text');

  // If no tools used, return direct text answer
  if (toolBlocks.length === 0) {
    return { answer: textBlock?.text || 'Koi data nahi mila.', toolsUsed: [] };
  }

  // Execute each tool: built-in → schema → expense
  const toolResultBlocks: ContentBlock[] = [];
  for (const tb of toolBlocks) {
    try {
      let result: any;
      const name = tb.name!;
      const input = tb.input || {};

      console.log(`[queryWithTools] Executing tool: ${name}`, input);

      if (name === 'record_expense') {
        result = await executeRecordExpense(input);
      } else if (name.startsWith('db_')) {
        const { executeSchemaQuery } = await import('./schemaIntrospector');
        result = await executeSchemaQuery(name, input);
      } else {
        result = await executeQueryTool(name, input);
      }

      toolsUsed.push(name);
      toolResultBlocks.push({
        type:        'tool_result',
        tool_use_id: tb.id!,
        content:     JSON.stringify(result).slice(0, 2000),
      });
    } catch (err) {
      console.error(`[queryWithTools] Tool error: ${tb.name}`, err);
      toolResultBlocks.push({
        type:        'tool_result',
        tool_use_id: tb.id!,
        content:     JSON.stringify({ error: String(err) }),
      });
    }
  }

  // Second call — Claude summarizes tool results naturally
  const secondResponse = await callClaude({
    model:     'claude-haiku-4-5-20251001',
    maxTokens: 600,
    system:    systemPrompt,
    tools:     allTools,
    messages:  [
      { role: 'user', content: message },
      { role: 'assistant', content: firstResponse.content as any },
      { role: 'user', content: toolResultBlocks as any },
    ],
    agentId,
  });

  const finalText = secondResponse.content?.find(b => b.type === 'text');
  return { answer: finalText?.text || textBlock?.text || 'Data mil gayi lekin format nahi ho saki.', toolsUsed };
};

// ═══════════════════════════════════════════════════════════════════════
// PERSISTENT CONVERSATION SESSIONS
// Stores chat history per user/company/day in Supabase agent_sessions.
// Injects last 10 messages as context for continuity.
// Auto-summarizes and resets after 50 messages.
// ═══════════════════════════════════════════════════════════════════════

interface SessionMessage {
  role:    'user' | 'assistant';
  content: string;
  ts:      number;
}

let _sessionCache: { id: string; messages: SessionMessage[]; summary: string | null } | null = null;
let _sessionKey = '';

const getSessionKey = async (): Promise<{ userId: string; company: string; date: string }> => {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    userId:  session?.user?.id || 'anonymous',
    company: 'GlassCo',
    date:    new Date().toISOString().split('T')[0],
  };
};

// ── Load today's session ─────────────────────────────────────────────────
export const loadSession = async (): Promise<SessionMessage[]> => {
  const { userId, company, date } = await getSessionKey();
  const key = `${userId}:${company}:${date}`;

  if (_sessionCache && _sessionKey === key) return _sessionCache.messages;

  const { data } = await supabase
    .from('agent_sessions')
    .select('id, messages, summary')
    .eq('user_id', userId)
    .eq('company', company)
    .eq('session_date', date)
    .single();

  if (data) {
    _sessionCache = { id: data.id, messages: data.messages || [], summary: data.summary };
    _sessionKey = key;
    return _sessionCache.messages;
  }

  // Create new session
  const { data: newSession } = await supabase
    .from('agent_sessions')
    .insert({ user_id: userId, company, session_date: date, messages: [], message_count: 0 })
    .select('id')
    .single();

  _sessionCache = { id: newSession?.id || '', messages: [], summary: null };
  _sessionKey = key;
  return [];
};

// ── Append message to session ────────────────────────────────────────────
export const appendToSession = async (role: 'user' | 'assistant', content: string) => {
  if (!_sessionCache) await loadSession();
  if (!_sessionCache) return;

  const msg: SessionMessage = { role, content: content.slice(0, 2000), ts: Date.now() };
  _sessionCache.messages.push(msg);

  // Auto-summarize at 50 messages
  if (_sessionCache.messages.length >= 50) {
    const summary = _sessionCache.messages
      .slice(0, 40)
      .filter(m => m.role === 'user')
      .map(m => m.content.slice(0, 80))
      .join('; ');
    _sessionCache.summary = `Earlier today: ${summary}`;
    _sessionCache.messages = _sessionCache.messages.slice(-10);
  }

  // Upsert to Supabase
  const { userId, company, date } = await getSessionKey();
  await supabase
    .from('agent_sessions')
    .upsert({
      user_id:       userId,
      company,
      session_date:  date,
      messages:      _sessionCache.messages,
      message_count: _sessionCache.messages.length,
      summary:       _sessionCache.summary,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'user_id,company,session_date' })
    .then(() => {}, () => {});
};

// ── Get conversation history for Claude (last 10 messages) ───────────────
export const getConversationHistory = async (): Promise<ClaudeMessage[]> => {
  const messages = await loadSession();
  return messages.slice(-10).map(m => ({
    role:    m.role,
    content: m.content,
  }));
};

// ── Get session summary for system prompt injection ──────────────────────
export const getSessionSummary = async (): Promise<string | null> => {
  if (!_sessionCache) await loadSession();
  return _sessionCache?.summary || null;
};

// ── Clear session cache (on logout or date change) ───────────────────────
export const clearSessionCache = () => {
  _sessionCache = null;
  _sessionKey = '';
};

// ── Token usage getters ──────────────────────────────────────────────────
export const getSessionUsage = () => ({ ...SESSION_USAGE });

export const getUsageLog = () => [...usageLog];

export const getUsageByAgent = () => {
  const byAgent: Record<string, { calls: number; tokens: number; costPkr: number }> = {};
  for (const entry of usageLog) {
    if (!byAgent[entry.agentId]) byAgent[entry.agentId] = { calls: 0, tokens: 0, costPkr: 0 };
    byAgent[entry.agentId].calls   += 1;
    byAgent[entry.agentId].tokens  += entry.totalTokens;
    byAgent[entry.agentId].costPkr += entry.costPkr;
  }
  return byAgent;
};

export const resetSessionUsage = () => {
  usageLog.length = 0;
  SESSION_USAGE.input   = 0;
  SESSION_USAGE.output  = 0;
  SESSION_USAGE.costUsd = 0;
  SESSION_USAGE.costPkr = 0;
  SESSION_USAGE.calls   = 0;
};
