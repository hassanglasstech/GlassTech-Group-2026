import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  MessageSquare, Send, Loader2, Bot, User,
  RefreshCw, X, Sparkles, ChevronDown
} from 'lucide-react';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { HRService } from '@/modules/hr/services/hrService';
import { TOOL_DEFINITIONS } from '../agent/agentTools';
import ConfirmationCard from '../agent/ConfirmationCard';
import { runMultiAgent, shouldUseMultiAgent, AgentResponse } from '../agent/MultiAgentOrchestrator';
import { runAdversarial, needsAdversarial, generateUncomfortableTruths } from '../agent/adversarialIntelligence';
import { logDecision } from '../agent/decisionLearning';
import { supabase } from '@/src/services/supabaseClient';
import { chatWithTools, getSessionUsage } from '@/modules/factory/services/claudeAgentService';
import { sanitizeUserInput } from '@/modules/factory/services/promptSanitizer';
import { GlassCoQuotationPrint } from '@/modules/glassco/core/prints/GlassCoQuotationPrint';
import { createRoot } from 'react-dom/client';

// ── Types ─────────────────────────────────────────────────────────────
interface Message {
  role:        'user' | 'assistant';
  content:     string;
  ts:          number;
  tool_calls?: { id: string; name: string; params: Record<string, any> }[];
  tool_done?:      boolean;
  multi_agent?:    { agents: AgentResponse[]; synthesis: string };
  agents_loading?: boolean;
  adversarial?:    { challenges: string[]; revisedAnswer: string; wasRevised: boolean };
  notifiedAt?:     Date;
}

// ── Quick prompts ─────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  'Aaj ke urgent events kya hain?',
  'Is month ka revenue kitna hai?',
  'Koi overdue escalation hai?',
  'Top performing vendor kaun hai?',
  'Kitne pieces ready to dispatch hain?',
  'Open tasks kitne hain?',
  'QC fail pieces dikhao',
  'This month ka net profit estimate karo',
];

// ── Build ERP context snapshot for Claude ─────────────────────────────
const buildERPContext = async (): Promise<string> => {
  try {
    const now     = new Date();
    const month   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today   = now.toISOString().split('T')[0];

    // Sales
    const quotations = SalesService.getQuotations().filter((q: any) => q.company === 'Glassco');
    const monthQuotes = quotations.filter((q: any) => q.date?.startsWith(month));
    const revenue = SalesService.getInvoices()
      .filter((i: any) => i.company === 'Glassco' && i.date?.startsWith(month))
      .reduce((s: number, i: any) => s + (i.amount || i.totalAmount || 0), 0);

    // Production
    const pieces = ProductionService.getProductionPieces();
    const active  = pieces.filter(p => !['Delivered','Broken'].includes(p.status));
    const ready   = pieces.filter(p => p.status === 'Ready to Dispatch' || p.status === 'QC-Passed');
    const qcFail  = pieces.filter(p => p.status === 'QC-Failed');
    const broken  = pieces.filter(p => p.status === 'Broken');

    // Procurement
    const reqs = InventoryService.getRequisitions().filter((r: any) =>
      r.company === 'Glassco' && ['Pending','Draft'].includes(r.status)
    );
    const pos  = InventoryService.getPurchaseOrders().filter((p: any) =>
      p.fromCompany === 'Glassco' && !['GRN Done','Paid'].includes(p.status)
    );

    // Finance
    const petty = FinanceService.getPettyCashEntries()
      .filter((p: any) => p.company === 'Glassco' && p.date?.startsWith(month));
    const expenses = petty.reduce((s: number, p: any) => s + (p.amount || 0), 0);

    // HR
    const emps = HRService.getEmployees().filter(e =>
      e.company === 'Glassco' && !['resigned','terminated'].includes(e.work?.status as string ?? '')
    );

    // Agent data
    const [
      { count: urgentEvents },
      { count: openTasks },
      { count: escalations },
      { count: openHSE },
      { data: recentEvents },
      { data: recentTasks },
    ] = await Promise.all([
      supabase.from('factory_events').select('id', { count: 'exact', head: true }).eq('priority', 'Urgent').in('status', ['Open','Pending']),
      supabase.from('agent_tasks').select('id', { count: 'exact', head: true }).in('status', ['Open','In Progress']),
      supabase.from('factory_escalation_alerts').select('id', { count: 'exact', head: true }).eq('resolved', false),
      supabase.from('hse_incidents').select('id', { count: 'exact', head: true }).eq('closed', false),
      supabase.from('factory_events').select('event_type,sector,priority,status,created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('agent_tasks').select('title,priority,status,due_date').in('status', ['Open','In Progress']).order('due_date', { ascending: true }).limit(5),
    ]);

    return `
=== GLASSTECH ERP LIVE SNAPSHOT ===
Company: GlassCo | Date: ${today} | Month: ${month}

SALES & REVENUE
- Month quotations: ${monthQuotes.length}
- Month revenue: PKR ${revenue.toLocaleString()}
- Total quotations: ${quotations.length}

PRODUCTION FLOOR
- Active pieces: ${active.length}
- Ready to dispatch: ${ready.length}
- QC failed: ${qcFail.length}
- Broken: ${broken.length}

PROCUREMENT
- Pending requisitions: ${reqs.length}
- Open POs: ${pos.length}

FINANCE
- Month expenses (petty cash): PKR ${expenses.toLocaleString()}

HUMAN RESOURCES
- Active employees (GlassCo): ${emps.length}

FACTORY OPERATIONS
- Urgent open events: ${urgentEvents ?? 0}
- Overdue escalations: ${escalations ?? 0}
- Open tasks: ${openTasks ?? 0}
- Open HSE incidents: ${openHSE ?? 0}

RECENT FACTORY EVENTS (last 5):
${(recentEvents || []).map((e: any) => `- [${e.priority}] ${e.event_type} (${e.sector}) — ${e.status}`).join('\n') || 'None'}

OPEN TASKS:
${(recentTasks || []).map((t: any) => `- [${t.priority}] ${t.title} — Due: ${t.due_date || 'No date'}`).join('\n') || 'None'}
=== END SNAPSHOT ===
`;
  } catch {
    return '=== ERP SNAPSHOT: Data load failed ===';
  }
};

// ── Format assistant message ──────────────────────────────────────────
const formatMessage = (text: string) => {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="text-white font-bold">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
};

// ── Main Component ────────────────────────────────────────────────────
const AIChatInterface: React.FC = () => {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [erpCtx, setErpCtx]         = useState('');
  const [ctxLoading, setCtxLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => { loadCtx(); }, []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const loadCtx = async () => {
    setCtxLoading(true);
    const ctx = await buildERPContext();
    setErpCtx(ctx);
    setCtxLoading(false);
  };

  const send = async (userInput?: string) => {
    const text = (userInput ?? input).trim();
    if (!text || loading) return;
    const safeText = sanitizeUserInput(text);

    setInput('');
    const userMsg: Message = { role: 'user', content: text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const systemPrompt = `You are GlassTech ERP Assistant — a senior AI business agent for GlassTech Group, a glass & aluminium manufacturing company in Karachi, Pakistan. You are speaking with Hassan, the Owner.

You have TWO capabilities:
1. READ — Answer questions instantly using ERP data (no tool needed)
2. ACT — Execute actions using tools (requires user approval)

═══════════════════════════════════════
FINANCE AGENT — use these tools:
═══════════════════════════════════════
• petty_cash_report → "petty cash ka hisab do", "is hafte kitna kharch hua", "November ka petty cash"
• outstanding_payments → "kiski payment baaki hai", "overdue clients"
• expense_summary → "is mahine ke kharche", "category wise expenses"

═══════════════════════════════════════
OPS AGENT — use these tools:
═══════════════════════════════════════
• stock_status → "8mm ka stock kya hai", "kya khatam ho raha hai", "low stock"
• purchase_order_status → "PO status", "overdue POs", "pending orders"
• vendor_summary → "Ali Glass summary", "vendors list"
• delivery_status → "aaj kya dispatch hua", "ready for dispatch"
• requisition_overview → "pending reqs", "urgent requisitions"
• ops_snapshot → "ops ka kya hal hai", "operations summary"

═══════════════════════════════════════
PRODUCTION AGENT — use these tools:
═══════════════════════════════════════
• floor_status → "floor ka kya hal hai", "aaj kya chal raha hai", "morning briefing"
• ncr_report → "kitna glass tuta", "breakage report", "NCR"
• cutting_report → "aaj kitna kita", "cutting summary"
• dispatch_status → "kya dispatch hua", "delivery pending"
• stuck_jobs → "kaunse orders stuck hain", "pending jobs"

═══════════════════════════════════════
ACTION TOOLS — confirm karo pehle:
═══════════════════════════════════════
• find_order + print_document → "order 2367 ki PDF do"
• create_quotation → quotation banana
• create_requisition → req banana
• update_order_status → status change
• check_stock → stock check
• get_client_balance → client ka balance

TOOL USAGE RULES:
- READ queries (petty cash, NCR, floor status etc.) → ALWAYS use the relevant tool, answer with structured data
- ACTION queries (create, update, print) → explain first, then call tool
- If info missing → poochho pehle, phir tool chalao
- Numbers → PKR format with commas
- Language → Roman Urdu + English mix (match Hassan's style)
- Be direct, concise, actionable
- Alerts → ⚠️ 🔴 use karo

QUOTATION WORKFLOW:
1. search_client → client ID lo
2. get_glass_rate → rate lo
3. Missing info? → poochho
4. Summary dikhao → create_quotation

${erpCtx}`;

      const history = messages.slice(-10).map(m => ({
        role:    m.role,
        content: m.content,
      }));

    // ── Multi-agent mode ───────────────────────────────────────────
    if (shouldUseMultiAgent(safeText)) {
      const placeholderIdx = messages.length + 1;
      setMessages(prev => [...prev, {
        role:            'assistant',
        content:         '🤖 5 agents parallel mein analyze kar rahe hain...',
        ts:              Date.now(),
        agents_loading:  true,
      }]);
      setLoading(false);

      const { agents, synthesis } = await runMultiAgent(safeText);
      setMessages(prev => prev.map((m, i) =>
        m.agents_loading ? { ...m, content: synthesis, agents_loading: false, multi_agent: { agents, synthesis } } : m
      ));
      inputRef.current?.focus();
      return;
    }

    // ── Single agent mode (default) ───────────────────────────────
      const { text: reply, toolCalls, response: data } = await chatWithTools({
        model:     'claude-haiku-4-5-20251001',
        maxTokens: 1000,
        system:    systemPrompt,
        tools:     TOOL_DEFINITIONS,
        messages:  [...history, { role: 'user', content: safeText }],
        agentId:   'erp-chat',
      });

      const toolBlocks = toolCalls;

      if (toolBlocks.length > 0) {
        setMessages(prev => [...prev, {
          role: 'assistant', content: reply || `${toolBlocks.length} action${toolBlocks.length > 1 ? 's' : ''} propose kar raha hun:`,
          ts: Date.now(), tool_calls: toolBlocks, tool_done: false,
        }]);
      } else if (needsAdversarial(safeText) && reply.length > 50) {
        // Run adversarial check on decision queries
        const adv = await runAdversarial(text, reply, erpCtx);
        setMessages(prev => [...prev, {
          role:        'assistant',
          content:     adv.wasRevised ? adv.revisedAnswer : reply,
          ts:          Date.now(),
          adversarial: adv.challenges.length > 0 ? adv : undefined,
          notifiedAt:  new Date(),
        }]);
        // Log decision opportunity
        await logDecision({ type: 'chat_recommendation', decision: 'viewed', context: { query: text }, createdBy: 'Hassan' });
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: reply || 'Response nahi mili.', ts: Date.now() }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Connection error. API key check karo ya internet connection verify karo.',
        ts: Date.now(),
      }]);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  const clearChat = () => setMessages([]);

  const handlePrintDocument = async (docType: string, docId: string) => {
    try {
      // First try localStorage
      const lsKeyMap: Record<string,string> = {
        quotation:   'gtk_erp_quotations',
        sales_order: 'gtk_erp_quotations',
        job_order:   'gtk_erp_job_orders',
        requisition: 'gtk_erp_requisitions',
      };
      const lsKey = lsKeyMap[docType] || 'gtk_erp_quotations';
      const allDocs = JSON.parse(localStorage.getItem(lsKey) || '[]');
      let data = allDocs.find((d: any) => d.id === docId || d.orderNo === docId);

      // Fallback to Supabase
      if (!data) {
        const tableMap: Record<string,string> = {
          quotation: 'quotations', sales_order: 'quotations',
          job_order: 'job_orders', requisition: 'requisitions',
        };
        const { data: remote } = await supabase.from(tableMap[docType] || 'quotations').select('*').eq('id', docId).single();
        data = remote;
      }

      if (!data) {
        setMessages(prev => [...prev, { role: 'assistant', content: `❌ Document ${docId} nahi mila.`, ts: Date.now() }]);
        return;
      }

      // Trigger ERP print using existing print mechanism
      window.dispatchEvent(new CustomEvent('erp-print-request', {
        detail: { docType, docId, data }
      }));

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `🖨️ ${data.clientName || data.client_name || ''} — ${docId} ki print request bheji gai. Agar print window nahi khuli toh ERP mein manually print karo.`,
        ts: Date.now(),
      }]);

    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Print error: ${String(err)}`, ts: Date.now() }]);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[400px]">

      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
            <Sparkles size={15} className="text-white" />
          </div>
          <div>
            <div className="font-black text-white text-sm">ERP Assistant</div>
            <div className="text-[10px] text-slate-500">
              {ctxLoading ? 'Loading data...' : 'Live ERP data connected'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <span className="text-[9px] text-slate-600 font-mono">
              {getSessionUsage().calls}calls {getSessionUsage().input + getSessionUsage().output}tok ~${getSessionUsage().cost.toFixed(4)}
            </span>
          )}
          <button onClick={loadCtx} disabled={ctxLoading}
            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={ctxLoading ? 'animate-spin' : ''} />
          </button>
          {messages.length > 0 && (
            <button onClick={clearChat} className="text-slate-400 hover:text-white transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-4">
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Sparkles size={24} className="text-white" />
              </div>
              <div className="font-bold text-white text-sm">GlassTech ERP Assistant</div>
              <p className="text-xs text-slate-500 mt-1">
                Live data ke saath sawaal poochho — Urdu ya English mein
              </p>
            </div>

            {/* Quick prompts */}
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Quick Questions</div>
              <div className="grid grid-cols-1 gap-1.5">
                {QUICK_PROMPTS.map((p, i) => (
                  <button key={i} onClick={() => send(p)}
                    className="text-left bg-slate-800 hover:bg-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-300 transition-all">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={12} className="text-white" />
              </div>
            )}
            <div className="max-w-[85%] space-y-2">
              {msg.content && (
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-blue-500 text-white rounded-tr-sm'
                    : 'bg-slate-800 text-slate-300 rounded-tl-sm'}`}>
                  {msg.role === 'assistant'
                    ? <div className="space-y-1">{formatMessage(msg.content)}</div>
                    : msg.content}
                </div>
              )}
              {/* Adversarial challenges */}
              {msg.adversarial && msg.adversarial.challenges.length > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 space-y-2 mt-1">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                    <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">
                      Devil's Advocate — {msg.adversarial.challenges.length} counter-arguments
                    </span>
                  </div>
                  {msg.adversarial.challenges.map((c, j) => (
                    <p key={j} className="text-xs text-orange-300">⚠️ {c}</p>
                  ))}
                  {msg.adversarial.wasRevised && (
                    <div className="border-t border-orange-500/20 pt-2">
                      <span className="text-[10px] text-orange-400">↑ Answer revised considering above challenges</span>
                    </div>
                  )}
                </div>
              )}
              {msg.multi_agent && (
                <div className="space-y-2 mt-1">
                  {msg.multi_agent.agents.map(a => (
                    <div key={a.agent} className="bg-slate-800 rounded-xl px-3 py-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{a.emoji} {a.agent}</span>
                        <span className="text-slate-600">{a.duration}ms</span>
                      </div>
                      <p className="text-slate-400">{a.findings}</p>
                      {a.alerts.map((al, j) => (
                        <p key={j} className="text-orange-400">{al}</p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {msg.tool_calls && !msg.tool_done && (
                <ConfirmationCard
                  toolCalls={msg.tool_calls}
                  onAllDone={(results) => {
                    setMessages(prev => prev.map((m, idx) =>
                      idx === i ? { ...m, tool_done: true } : m
                    ));
                    // Check if any result is a OPEN_PRINT action
                    const printResult = Object.values(results).find((r: any) => r?.action === 'OPEN_PRINT');
                    if (printResult) {
                      const { doc_type, doc_id } = printResult as any;
                      handlePrintDocument(doc_type, doc_id);
                    }
                    setMessages(prev => [...prev, {
                      role: 'assistant',
                      content: `✅ ${Object.keys(results).length} action${Object.keys(results).length > 1 ? 's' : ''} executed successfully.`,
                      ts: Date.now(),
                    }]);
                  }}
                  onReject={() => {
                    setMessages(prev => prev.map((m, idx) =>
                      idx === i ? { ...m, tool_done: true } : m
                    ));
                    setMessages(prev => [...prev, {
                      role: 'assistant',
                      content: 'Actions cancelled.',
                      ts: Date.now(),
                    }]);
                  }}
                />
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <User size={12} className="text-slate-300" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center shrink-0">
              <Bot size={12} className="text-white" />
            </div>
            <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 bg-slate-800 rounded-2xl px-4 py-3 mt-3 shrink-0">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Kuch bhi poochho ERP ke baare mein..."
          className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none"
          disabled={loading}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="w-8 h-8 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 rounded-xl flex items-center justify-center transition-all shrink-0">
          <Send size={14} className="text-white" />
        </button>
      </div>
    </div>
  );
};

export default AIChatInterface;
