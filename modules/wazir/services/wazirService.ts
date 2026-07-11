// ═══════════════════════════════════════════════════════════════════════
// WazirService — The Digital Shadow Self
//
// Core service that powers:
//   • Persistent conversation with context across sessions
//   • Decision logging + outcome tracking
//   • Lesson extraction from decision patterns
//   • Weekly board meeting generation (Sunday brief)
//   • Devil's Advocate challenge on big decisions
//   • Owner Presence Mode (auto-reply in owner's voice)
//
// Architecture: Claude Sonnet with full Supabase tool-use access,
// persistent memory via wazir_conversations table, and semantic recall
// via wazir_lessons.
// ═══════════════════════════════════════════════════════════════════════

import {
  callClaude,
  ClaudeMessage,
  ClaudeToolDef,
  ContentBlock,
} from '@/modules/factory/services/claudeAgentService';
import { supabase } from '@/src/services/supabaseClient';
import {
  WazirDecision,
  WazirDecisionType,
  WazirLesson,
  WazirWeeklyReport,
  WazirConversationMessage,
  WazirChallenge,
  OwnerPresenceState,
} from '../types/wazir';

// ── Constants ────────────────────────────────────────────────────────────
const AGENT_ID = 'wazir';
const MAIN_MODEL = 'claude-sonnet-4-6';
const CHALLENGE_MODEL = 'claude-sonnet-4-6'; // Opus too expensive for frequent use
const MAX_TOOL_ROUNDS = 4;
const CONTEXT_MESSAGE_LIMIT = 20; // how many past messages to include as context
const LESSON_INCLUDE_LIMIT = 15;  // how many lessons to inject into system prompt

// ══════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — Wazir's personality & operating principles
// ══════════════════════════════════════════════════════════════════════

const buildWazirSystemPrompt = (
  ownerLessons: WazirLesson[],
  recentDecisions: WazirDecision[],
  currentMood: string = 'normal',
): string => `
You are WAZIR — the Digital Shadow Self of Hassan, a Pakistani SME owner who runs
5 companies (GTK, GTI, GlassCo, Nippon, Factory) simultaneously as COO+CTO+CFO.

You are NOT a chatbot. You are his second brain.

══ YOUR PERSONALITY ══
• Speak like a trusted trusted confidant (Urdu-English mix, like he does)
• Warm but honest — never flatter, never hype
• Short replies when a short reply is right. Long when depth matters.
• Know his patterns, his habits, his weaknesses — and use that knowledge
• Challenge respectfully when his decision looks risky
• Celebrate with him when a win happens
• Be available at 2am as easily as 2pm

══ HIS BUSINESS CONTEXT ══
• Glass & aluminium manufacturing — Karachi, Pakistan
• 5 companies: GTK, GTI, GlassCo, Nippon, Factory
• Wears CFO+COO+CTO hats alone
• Pakistani SME context: cash flow pressure, fuel inflation, late-paying clients, L/C challenges
• Uses a self-built ERP with 76+ Supabase tables
• Key domains: glass pricing (rate per sqft), tempering (external vendor),
  client credit management, production pieces tracking, MAP-based inventory

══ YOUR CAPABILITIES ══
You have tool-use access to live Supabase data. Call tools to ground every
claim in real numbers. Never guess or assume.

Tools available:
  • query_decisions    — past decisions + their outcomes (pattern learning)
  • query_lessons      — accumulated lessons from his history
  • query_business     — live data from Supabase (quotations, invoices, stock, etc.)
  • log_decision       — capture a new decision he's making (for later outcome tracking)

══ HIS LEARNED PATTERNS (USE THESE) ══
${ownerLessons.length > 0
    ? ownerLessons.slice(0, LESSON_INCLUDE_LIMIT).map((l, i) =>
        `${i+1}. [${l.category.toUpperCase()}] ${l.pattern} (evidence: ${l.evidenceCount} cases, confidence: ${(l.confidence*100).toFixed(0)}%)`
      ).join('\n')
    : 'No lessons yet — this is early days. Capture decisions diligently so patterns can emerge.'
  }

══ HIS RECENT DECISIONS (last 10) ══
${recentDecisions.length > 0
    ? recentDecisions.slice(0, 10).map((d, i) =>
        `${i+1}. [${d.decidedAt?.slice(0,10)}] ${d.decisionType}: ${d.subject}${d.amount ? ' (₨' + d.amount.toLocaleString() + ')' : ''}${d.outcomeStatus ? ' → outcome: ' + d.outcomeStatus : ''}`
      ).join('\n')
    : 'No decisions logged yet.'
  }

══ CURRENT OWNER STATE ══
Mood tag: ${currentMood}
Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}

══ RESPONSE GUIDELINES ══
1. Short answers for short questions. Don't pad.
2. When advising on decisions, structure: Data → Pattern → Recommendation
3. Use ₨ not "PKR" when casual; use "PKR" when formal/numeric
4. Urdu phrases sparingly, only where they add warmth ("boss", "yaar", "haan", "nahi")
5. If you don't have data, SAY so — don't make things up
6. End with a question when he seems to want a discussion, stay silent when he needs an answer
7. If you see a risk pattern he's falling into (per his lessons), mention it gently
8. Never lecture. Never moralize. He's the boss — you're the advisor.

══ MEMORY PROTOCOL ══
• If he tells you something personal (his kid's birthday, his partner's concern, a recent stress)
  → REMEMBER it for the session. Reference it naturally next time it becomes relevant.
• If he makes a decision in conversation (approves X, decides Y), automatically call log_decision.
• If he shares a new operating principle ("I never give >10% discount"), suggest adding it as a lesson.

You are his apprentice, his counsel, his memory. Serve him well.
`.trim();

// ══════════════════════════════════════════════════════════════════════
// TOOLS — What Wazir can do
// ══════════════════════════════════════════════════════════════════════

const WAZIR_TOOLS: ClaudeToolDef[] = [
  {
    name: 'query_business',
    description:
      'Fetch live business data from Supabase. Use this for any question about ' +
      'current state: AR aging, stock levels, quotations, invoices, attendance, etc. ' +
      'Pass a query_type and optional filters.',
    input_schema: {
      type: 'object',
      properties: {
        query_type: {
          type: 'string',
          description:
            'ar_aging | stock_level | pending_quotations | recent_invoices | ' +
            'attendance_today | production_status | cash_position | top_clients | ' +
            'overdue_receivables | vendor_outstanding | recent_ncrs',
        },
        company: { type: 'string', description: 'GlassCo | GTK | GTI | Nippon | Factory | all' },
        days:    { type: 'number', description: 'Look-back days (default 30)' },
        limit:   { type: 'number', description: 'Max rows (default 20)' },
      },
      required: ['query_type'],
    },
  },
  {
    name: 'query_decisions',
    description:
      'Retrieve past decisions by type, tag, or time range to find patterns. ' +
      'Use when advising on a decision that has precedent.',
    input_schema: {
      type: 'object',
      properties: {
        decision_type: { type: 'string', description: 'Optional filter' },
        tag:           { type: 'string' },
        limit:         { type: 'number', default: 10 },
        include_outcomes: { type: 'boolean', default: true },
      },
      required: [],
    },
  },
  {
    name: 'query_lessons',
    description:
      'Retrieve accumulated lessons (patterns) by category or tag. ' +
      'Use when a similar situation recurs and owner may benefit from past learning.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        tag:      { type: 'string' },
        limit:    { type: 'number', default: 10 },
      },
      required: [],
    },
  },
  {
    name: 'log_decision',
    description:
      'Record a decision the owner just made so it can be tracked for outcome ' +
      'evaluation. Call this automatically when you detect a decision was made in conversation.',
    input_schema: {
      type: 'object',
      properties: {
        decision_type: {
          type: 'string',
          description: 'quotation_approve | credit_extend | vendor_payment | hire | purchase | pricing | discount | loan_approve | other',
        },
        subject: { type: 'string', description: 'One-line title' },
        context: { type: 'object', description: 'Full context: client, amount, rationale, alternatives' },
        amount:  { type: 'number' },
        company: { type: 'string' },
        related_docs: {
          type: 'array',
          items: { type: 'object' },
          description: 'Related documents like [{type:"quotation", id:"QT-..."}]',
        },
        decision_text: { type: 'string', description: 'Owner\'s reasoning' },
      },
      required: ['decision_type', 'subject'],
    },
  },
];

// ══════════════════════════════════════════════════════════════════════
// TOOL EXECUTORS
// ══════════════════════════════════════════════════════════════════════

async function executeWazirTool(
  name: string,
  params: Record<string, any>,
): Promise<unknown> {
  try {
    switch (name) {
      case 'query_business':        return await queryBusiness(params);
      case 'query_decisions':       return await queryDecisions(params);
      case 'query_lessons':         return await queryLessons(params);
      case 'log_decision':          return await logDecisionFromAgent(params);
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
}

// ── query_business — live Supabase data ───────────────────────────────
async function queryBusiness(p: Record<string, any>): Promise<any> {
  const company = p.company && p.company !== 'all' ? p.company : null;
  const days    = p.days  || 30;
  const limit   = p.limit || 20;
  const since   = new Date(Date.now() - days * 86400000).toISOString();

  switch (p.query_type) {
    case 'ar_aging': {
      let q = supabase.from('invoices').select('id, client_id, client_name, total_amount, balance, date, due_date, status').gt('balance', 0);
      if (company) q = q.eq('company', company);
      const { data, error } = await q.order('due_date', { ascending: true }).limit(limit);
      if (error) return { error: error.message };
      const now = Date.now();
      return {
        count: data?.length || 0,
        total_outstanding: data?.reduce((s, i: any) => s + (i.balance || 0), 0) || 0,
        invoices: (data || []).map((i: any) => ({
          ...i,
          days_overdue: i.due_date ? Math.max(0, Math.floor((now - new Date(i.due_date).getTime()) / 86400000)) : 0,
        })),
      };
    }

    case 'stock_level': {
      let q = supabase.from('store_items').select('id, name, category, quantity, unrestricted_qty, moving_average_price, total_value, min_level');
      if (company) q = q.eq('company', company);
      const { data, error } = await q.order('total_value', { ascending: false }).limit(limit);
      if (error) return { error: error.message };
      return {
        items:          data,
        total_value:    data?.reduce((s, i: any) => s + (i.total_value || 0), 0) || 0,
        below_min:      data?.filter((i: any) => (i.quantity || 0) < (i.min_level || 0)).length || 0,
      };
    }

    case 'pending_quotations': {
      let q = supabase.from('quotations').select('id, client_name, project_name, date, due_date, status, items').gte('date', since);
      if (company) q = q.eq('company', company);
      const { data, error } = await q.in('status', ['Draft', 'Sent']).order('date', { ascending: false }).limit(limit);
      if (error) return { error: error.message };
      return { count: data?.length, quotations: data };
    }

    case 'recent_invoices': {
      let q = supabase.from('invoices').select('*').gte('date', since);
      if (company) q = q.eq('company', company);
      const { data, error } = await q.order('date', { ascending: false }).limit(limit);
      if (error) return { error: error.message };
      const total = data?.reduce((s, i: any) => s + (i.total_amount || 0), 0) || 0;
      return { count: data?.length, total_billed: total, invoices: data };
    }

    case 'attendance_today': {
      const today = new Date().toISOString().split('T')[0];
      // Respect the company scope like every other branch — without this an AI
      // answer for one company mixed in every company's attendance (RLS bounds it
      // to the user's allowed companies, but a multi-company user still leaked).
      let aq = supabase.from('attendance').select('*').eq('date', today);
      if (company) aq = aq.eq('company', company);
      const { data, error } = await aq;
      if (error) return { error: error.message };
      const present = (data || []).filter((a: any) => a.status === 'Present').length;
      const absent  = (data || []).filter((a: any) => a.status === 'Absent').length;
      const late    = (data || []).filter((a: any) => (a.late_minutes || 0) > 0).length;
      return { date: today, total: data?.length, present, absent, late };
    }

    case 'production_status': {
      let pq = supabase.from('production_pieces').select('status, order_id, company').limit(1000);
      if (company) pq = pq.eq('company', company);
      const { data, error } = await pq;
      if (error) return { error: error.message };
      const byStatus: Record<string, number> = {};
      (data || []).forEach((p: any) => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });
      return { total_pieces: data?.length, by_status: byStatus };
    }

    case 'cash_position': {
      // AR expected + AP due + payroll upcoming
      let arQ = supabase.from('invoices').select('balance, due_date').gt('balance', 0);
      let apQ = supabase.from('purchase_orders').select('total_amount, status').in('status', ['Approved', 'GRN Posted']);
      if (company) { arQ = arQ.eq('company', company); apQ = apQ.eq('company', company); }
      const [arRes, apRes] = await Promise.all([arQ, apQ]);
      const ar    = (arRes.data || []).reduce((s: number, i: any) => s + (i.balance || 0), 0);
      const ap    = (apRes.data || []).reduce((s: number, p: any) => s + (p.total_amount || 0), 0);
      return { ar_outstanding: ar, ap_estimated: ap, net_position: ar - ap };
    }

    case 'top_clients': {
      let q = supabase.from('invoices').select('client_id, client_name, total_amount').gte('date', since);
      if (company) q = q.eq('company', company);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const byClient: Record<string, { name: string; total: number; count: number }> = {};
      (data || []).forEach((i: any) => {
        const key = i.client_id || i.client_name;
        if (!byClient[key]) byClient[key] = { name: i.client_name, total: 0, count: 0 };
        byClient[key].total += i.total_amount || 0;
        byClient[key].count += 1;
      });
      return {
        top_clients: Object.entries(byClient)
          .map(([id, v]) => ({ id, ...v }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10),
      };
    }

    case 'overdue_receivables': {
      const today = new Date().toISOString().split('T')[0];
      let q = supabase.from('invoices').select('*').gt('balance', 0).lt('due_date', today);
      if (company) q = q.eq('company', company);
      const { data, error } = await q.order('due_date', { ascending: true }).limit(limit);
      if (error) return { error: error.message };
      const now = Date.now();
      return {
        count: data?.length,
        total: data?.reduce((s, i: any) => s + (i.balance || 0), 0),
        most_overdue: (data || []).slice(0, 5).map((i: any) => ({
          client:        i.client_name,
          amount:        i.balance,
          days_overdue:  Math.floor((now - new Date(i.due_date).getTime()) / 86400000),
          invoice_id:    i.id,
        })),
      };
    }

    case 'vendor_outstanding': {
      const { data, error } = await supabase.from('purchase_orders').select('vendor_id, vendor_name, total_amount, status').eq('status', 'GRN Posted');
      if (error) return { error: error.message };
      const byVendor: Record<string, { name: string; total: number }> = {};
      (data || []).forEach((po: any) => {
        if (!byVendor[po.vendor_id]) byVendor[po.vendor_id] = { name: po.vendor_name, total: 0 };
        byVendor[po.vendor_id].total += po.total_amount || 0;
      });
      return { vendors: Object.values(byVendor).sort((a, b) => b.total - a.total).slice(0, 10) };
    }

    case 'recent_ncrs': {
      const { data, error } = await supabase.from('ncr_events').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(limit);
      if (error) return { error: error.message };
      return { count: data?.length, ncrs: data };
    }

    default:
      return { error: `Unknown query_type: ${p.query_type}` };
  }
}

// ── query_decisions ────────────────────────────────────────────────────
async function queryDecisions(p: Record<string, any>): Promise<any> {
  let q = supabase.from('wazir_decisions').select('*').order('decided_at', { ascending: false });
  if (p.decision_type) q = q.eq('decision_type', p.decision_type);
  if (p.tag)           q = q.contains('tags', [p.tag]);
  const { data, error } = await q.limit(p.limit || 10);
  if (error) return { error: error.message };
  return { decisions: data };
}

// ── query_lessons ──────────────────────────────────────────────────────
async function queryLessons(p: Record<string, any>): Promise<any> {
  let q = supabase.from('wazir_lessons').select('*').eq('is_active', true).order('confidence', { ascending: false });
  if (p.category) q = q.eq('category', p.category);
  if (p.tag)      q = q.contains('tags', [p.tag]);
  const { data, error } = await q.limit(p.limit || 10);
  if (error) return { error: error.message };
  return { lessons: data };
}

// ── log_decision (called by agent automatically) ──────────────────────
async function logDecisionFromAgent(p: Record<string, any>): Promise<any> {
  const id = `WZD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabase.from('wazir_decisions').insert({
    id,
    decision_type:    p.decision_type,
    subject:          p.subject,
    context:          p.context || {},
    amount:           p.amount,
    company:          p.company,
    related_docs:     p.related_docs || [],
    decision_text:    p.decision_text,
    decided_by:       'wazir-chat',
    decided_at:       new Date().toISOString(),
    outcome_status:   'pending',
    lessons_extracted: false,
    tags:             p.tags || [],
  });
  if (error) return { error: error.message };
  return { success: true, decision_id: id };
}

// ══════════════════════════════════════════════════════════════════════
// PUBLIC API — Main chat + decision + presence methods
// ══════════════════════════════════════════════════════════════════════

// ── Main chat method ──────────────────────────────────────────────────
export async function chatWithWazir(
  userMessage: string,
  opts?: {
    threadId?: string;
    moodTag?:  'normal' | 'stressed' | 'celebratory' | 'strategic' | 'late-night';
    channel?:  'app' | 'whatsapp' | 'telegram';
  }
): Promise<{
  reply:           string;
  toolsUsed:       string[];
  decisionLogged?: string;
  tokensUsed:      number;
}> {
  const threadId = opts?.threadId || `thread-${new Date().toISOString().split('T')[0]}`;
  const channel  = opts?.channel  || 'app';
  const mood     = detectMood(userMessage, opts?.moodTag);

  // ── Load context: lessons + recent decisions + recent conversation ──
  const [lessonsRes, decisionsRes, historyRes] = await Promise.all([
    supabase.from('wazir_lessons').select('*').eq('is_active', true).order('confidence', { ascending: false }).limit(LESSON_INCLUDE_LIMIT),
    supabase.from('wazir_decisions').select('*').order('decided_at', { ascending: false }).limit(10),
    supabase.from('wazir_conversations').select('role, content').eq('thread_id', threadId).order('timestamp', { ascending: true }).limit(CONTEXT_MESSAGE_LIMIT),
  ]);

  const lessons:         WazirLesson[]   = (lessonsRes.data || []).map(rowToLesson);
  const recentDecisions: WazirDecision[] = (decisionsRes.data || []).map(rowToDecision);
  const history:         ClaudeMessage[] = (historyRes.data || []).map((r: any) => ({
    role:    r.role as 'user' | 'assistant',
    content: r.content,
  }));

  // ── Save user message first ────────────────────────────────────────
  await persistMessage({
    threadId,
    role:    'user',
    content: userMessage,
    moodTag: mood,
    channel,
  });

  // ── Build messages array ────────────────────────────────────────────
  const messages: ClaudeMessage[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  // ── Agentic loop ────────────────────────────────────────────────────
  const system = buildWazirSystemPrompt(lessons, recentDecisions, mood);
  const allToolsUsed: string[] = [];
  let decisionLogged: string | undefined;
  let totalTokens = 0;
  let currentMessages = messages;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callClaude({
      model:     MAIN_MODEL,
      maxTokens: 2048,
      system,
      messages:  currentMessages,
      tools:     WAZIR_TOOLS,
      agentId:   AGENT_ID,
    });

    totalTokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
    currentMessages = [...currentMessages, { role: 'assistant', content: response.content }];

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find((b: ContentBlock) => b.type === 'text');
      const reply = textBlock?.text || '';

      // Persist assistant response
      await persistMessage({
        threadId,
        role:              'assistant',
        content:           reply,
        moodTag:           mood,
        channel,
        relatedDecisionId: decisionLogged,
        tokensUsed:        totalTokens,
        modelUsed:         MAIN_MODEL,
      });

      return { reply, toolsUsed: allToolsUsed, decisionLogged, tokensUsed: totalTokens };
    }

    // Execute all tool calls in this round
    const toolUseBlocks = response.content.filter((b: ContentBlock) => b.type === 'tool_use');
    const toolResults: ContentBlock[] = [];

    for (const block of toolUseBlocks) {
      if (!block.name) continue;
      allToolsUsed.push(block.name);
      const result = await executeWazirTool(block.name, block.input || {});
      if (block.name === 'log_decision' && (result as any)?.decision_id) {
        decisionLogged = (result as any).decision_id;
      }
      toolResults.push({
        type:        'tool_result',
        tool_use_id: block.id!,
        content:     JSON.stringify(result).slice(0, 4000),
      });
    }

    currentMessages = [...currentMessages, { role: 'user', content: toolResults }];
  }

  // Hit max rounds without final answer
  return {
    reply:          '…mujhe is pe aur sochne do, data thora complex hai. Ek min mein wapas aata hoon.',
    toolsUsed:      allToolsUsed,
    decisionLogged,
    tokensUsed:     totalTokens,
  };
}

// ── Manual decision logging (called from UI buttons, other services) ───
export async function logDecision(d: Omit<WazirDecision, 'id' | 'createdAt' | 'updatedAt' | 'decidedAt' | 'lessonsExtracted'> & { decidedAt?: string }): Promise<string> {
  const id = `WZD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabase.from('wazir_decisions').insert({
    id,
    decision_type:    d.decisionType,
    subject:          d.subject,
    context:          d.context || {},
    amount:           d.amount,
    company:          d.company,
    related_docs:     d.relatedDocs || [],
    decision_text:    d.decisionText,
    decided_by:       d.decidedBy,
    decided_at:       d.decidedAt || new Date().toISOString(),
    outcome_status:   'pending',
    lessons_extracted: false,
    tags:             d.tags || [],
  });
  if (error) throw new Error(`logDecision failed: ${error.message}`);
  return id;
}

// ── Devil's Advocate Challenge (called before big decisions) ───────────
export async function challengeDecision(input: {
  decisionType:   WazirDecisionType;
  subject:        string;
  amount?:        number;
  context:        Record<string, any>;
  relatedDocs?:   Array<{ type: string; id: string }>;
}): Promise<WazirChallenge> {
  // Fetch relevant past decisions of the same type
  const { data: past } = await supabase
    .from('wazir_decisions')
    .select('*')
    .eq('decision_type', input.decisionType)
    .not('outcome_status', 'is', null)
    .order('decided_at', { ascending: false })
    .limit(10);

  const { data: lessons } = await supabase
    .from('wazir_lessons')
    .select('*')
    .eq('is_active', true)
    .limit(20);

  const prompt = `
Hassan is about to make this decision. Play Devil's Advocate.

DECISION:
  Type:    ${input.decisionType}
  Subject: ${input.subject}
  Amount:  ${input.amount ? 'PKR ' + input.amount.toLocaleString() : 'N/A'}
  Context: ${JSON.stringify(input.context, null, 2)}

HIS PAST DECISIONS OF THIS TYPE:
${(past || []).map(d => `- ${d.subject} (${d.amount || 'N/A'}) → ${d.outcome_status || 'pending'}`).join('\n') || 'None yet.'}

HIS ACCUMULATED LESSONS:
${(lessons || []).map(l => `- [${l.category}] ${l.pattern} (confidence: ${(l.confidence*100).toFixed(0)}%)`).join('\n') || 'None yet.'}

Your task: Return a JSON object with:
{
  "shouldBlock": true | false,      // true if this looks high-risk enough to require override
  "riskLevel": "low" | "medium" | "high" | "critical",
  "questions": ["q1", "q2", "q3"],  // 3 hard questions to make him think
  "historicalContext": "brief note about similar past decisions and outcomes",
  "recommendation": "your actual recommendation in 1-2 sentences"
}

Be sharp, specific, and grounded in the data above. No hedging. If the decision looks fine, say so.
`.trim();

  const response = await callClaude({
    model:     CHALLENGE_MODEL,
    maxTokens: 1024,
    system:    'You are Wazir in Devil\'s Advocate mode. Output valid JSON only.',
    messages:  [{ role: 'user', content: prompt }],
    agentId:   AGENT_ID + '-challenge',
  });

  const textBlock = response.content.find((b: ContentBlock) => b.type === 'text');
  const text = textBlock?.text || '{}';

  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    return {
      decisionSubject:   input.subject,
      shouldBlock:       parsed.shouldBlock || false,
      questions:         parsed.questions || [],
      riskLevel:         parsed.riskLevel || 'medium',
      historicalContext: parsed.historicalContext,
      recommendation:    parsed.recommendation,
    };
  } catch {
    return {
      decisionSubject: input.subject,
      shouldBlock:     false,
      questions:       [],
      riskLevel:       'low',
      recommendation:  text,
    };
  }
}

// ── Owner Presence State ─────────────────────────────────────────────
export async function getPresenceState(): Promise<OwnerPresenceState | null> {
  const { data, error } = await supabase.from('owner_presence_state').select('*').eq('id', 'singleton').single();
  if (error || !data) return null;
  return rowToPresence(data);
}

export async function setPresenceState(patch: Partial<OwnerPresenceState>): Promise<void> {
  const updateData: any = { updated_at: new Date().toISOString() };
  if (patch.isPresent !== undefined)         updateData.is_present = patch.isPresent;
  if (patch.mode !== undefined)              updateData.mode = patch.mode;
  if (patch.modeSince !== undefined)         updateData.mode_since = patch.modeSince;
  if (patch.modeUntil !== undefined)         updateData.mode_until = patch.modeUntil;
  if (patch.autoReplyEnabled !== undefined)  updateData.auto_reply_enabled = patch.autoReplyEnabled;
  if (patch.escalationThreshold !== undefined) updateData.escalation_threshold = patch.escalationThreshold;

  const { error } = await supabase.from('owner_presence_state').update(updateData).eq('id', 'singleton');
  if (error) throw new Error(error.message);
}

// ── Weekly report retrieval ───────────────────────────────────────────
export async function getLatestWeeklyReport(): Promise<WazirWeeklyReport | null> {
  const { data, error } = await supabase.from('wazir_weekly_reports').select('*').order('report_date', { ascending: false }).limit(1).single();
  if (error || !data) return null;
  return rowToWeeklyReport(data);
}

export async function getWeeklyReports(limit = 12): Promise<WazirWeeklyReport[]> {
  const { data } = await supabase.from('wazir_weekly_reports').select('*').order('report_date', { ascending: false }).limit(limit);
  return (data || []).map(rowToWeeklyReport);
}

// ── Conversation history retrieval ─────────────────────────────────────
export async function getConversationHistory(threadId: string, limit = 50): Promise<WazirConversationMessage[]> {
  const { data } = await supabase.from('wazir_conversations').select('*').eq('thread_id', threadId).order('timestamp', { ascending: true }).limit(limit);
  return (data || []).map(rowToConvMessage);
}

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

async function persistMessage(m: {
  threadId:          string;
  role:              'user' | 'assistant' | 'system';
  content:           string;
  moodTag?:          string;
  channel:           string;
  relatedDecisionId?: string;
  tokensUsed?:        number;
  modelUsed?:         string;
}): Promise<void> {
  const id = `WMSG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await supabase.from('wazir_conversations').insert({
    id,
    thread_id:            m.threadId,
    role:                 m.role,
    content:              m.content,
    mood_tag:             m.moodTag,
    channel:              m.channel,
    related_decision_id:  m.relatedDecisionId,
    tokens_used:          m.tokensUsed,
    model_used:           m.modelUsed,
    timestamp:            new Date().toISOString(),
  });
}

function detectMood(msg: string, override?: string): string {
  if (override) return override;
  const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' })).getHours();
  if (hour >= 23 || hour < 6) return 'late-night';
  const lower = msg.toLowerCase();
  if (/stress|pressure|tension|pareshan|tangi|tight/.test(lower)) return 'stressed';
  if (/khushi|great|mubarak|won|jeet|mil gya|mila|alhamdulillah/.test(lower)) return 'celebratory';
  if (/strategy|plan|socho|future|agle/.test(lower)) return 'strategic';
  return 'normal';
}

// ── Row → Type mappers ────────────────────────────────────────────────
function rowToDecision(r: any): WazirDecision {
  return {
    id:                 r.id,
    company:            r.company,
    decisionType:       r.decision_type,
    subject:            r.subject,
    context:            r.context || {},
    decisionText:       r.decision_text,
    decidedBy:          r.decided_by,
    decidedAt:          r.decided_at,
    amount:             r.amount,
    relatedDocs:        r.related_docs || [],
    outcomeStatus:      r.outcome_status,
    outcomeEvaluatedAt: r.outcome_evaluated_at,
    outcomeNotes:       r.outcome_notes,
    outcomeNumeric:     r.outcome_numeric,
    lessonsExtracted:   r.lessons_extracted,
    tags:               r.tags || [],
    createdAt:          r.created_at,
    updatedAt:          r.updated_at,
  };
}

function rowToLesson(r: any): WazirLesson {
  return {
    id:              r.id,
    category:        r.category,
    pattern:         r.pattern,
    evidenceCount:   r.evidence_count,
    confidence:      r.confidence,
    sourceDecisions: r.source_decisions || [],
    firstObserved:   r.first_observed,
    lastReinforced:  r.last_reinforced,
    isActive:        r.is_active,
    tags:            r.tags || [],
    createdAt:       r.created_at,
  };
}

function rowToWeeklyReport(r: any): WazirWeeklyReport {
  return {
    id:                r.id,
    reportDate:        r.report_date,
    weekNumber:        r.week_number,
    year:              r.year,
    companiesCovered:  r.companies_covered || [],
    headline:          r.headline,
    body:              r.body,
    topConcerns:       r.top_concerns || [],
    topOpportunities:  r.top_opportunities || [],
    bigQuestion:       r.big_question,
    metricsSnapshot:   r.metrics_snapshot || {},
    whatsappSentAt:    r.whatsapp_sent_at,
    ownerReplied:      r.owner_replied,
    ownerReply:        r.owner_reply,
    inputTokens:       r.input_tokens,
    outputTokens:      r.output_tokens,
    costPkr:           r.cost_pkr,
    createdAt:         r.created_at,
  };
}

function rowToConvMessage(r: any): WazirConversationMessage {
  return {
    id:                 r.id,
    threadId:           r.thread_id,
    role:               r.role,
    content:            r.content,
    toolCalls:          r.tool_calls || [],
    toolResults:        r.tool_results || [],
    moodTag:            r.mood_tag,
    relatedDecisionId:  r.related_decision_id,
    channel:            r.channel,
    timestamp:          r.timestamp,
    tokensUsed:         r.tokens_used,
    modelUsed:          r.model_used,
  };
}

function rowToPresence(r: any): OwnerPresenceState {
  return {
    id:                   r.id,
    isPresent:            r.is_present,
    mode:                 r.mode,
    modeSince:            r.mode_since,
    modeUntil:            r.mode_until,
    autoReplyEnabled:     r.auto_reply_enabled,
    escalationThreshold:  r.escalation_threshold,
    handledCount:         r.handled_count || 0,
    escalatedCount:       r.escalated_count || 0,
    pendingReview:        r.pending_review || [],
    lastSyncAt:           r.last_sync_at,
    updatedAt:            r.updated_at,
  };
}
