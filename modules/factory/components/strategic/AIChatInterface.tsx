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
import { supabase } from '@/src/services/supabaseClient';

// ── Types ─────────────────────────────────────────────────────────────
interface Message {
  role:        'user' | 'assistant';
  content:     string;
  ts:          number;
  tool_calls?: { id: string; name: string; params: Record<string, any> }[];
  tool_done?:  boolean;
  multi_agent?: { agents: AgentResponse[]; synthesis: string };
  agents_loading?: boolean;
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

    setInput('');
    const userMsg: Message = { role: 'user', content: text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const systemPrompt = `You are GlassTech ERP Assistant — an intelligent business assistant for GlassTech Group, a glass & aluminium manufacturing company in Karachi, Pakistan.

You have access to live ERP data AND can take actions using tools.

TOOL USAGE RULES:
- Use tools ONLY when user explicitly asks to CREATE, LOG, SEND, or UPDATE something
- ALWAYS explain what you are about to do BEFORE calling a tool
- For ambiguous requests, ask for clarification first
- Never use tools for read-only queries — just answer with data

Communication style:
- Mix of English and Urdu/Roman Urdu is fine (match user's language)
- Be concise and actionable
- Use bullet points for lists
- Highlight urgent items with ⚠️
- Format numbers in PKR with commas

${erpCtx}`;

      const history = messages.slice(-10).map(m => ({
        role:    m.role,
        content: m.content,
      }));

    // ── Multi-agent mode ───────────────────────────────────────────
    if (shouldUseMultiAgent(text)) {
      const placeholderIdx = messages.length + 1;
      setMessages(prev => [...prev, {
        role:            'assistant',
        content:         '🤖 5 agents parallel mein analyze kar rahe hain...',
        ts:              Date.now(),
        agents_loading:  true,
      }]);
      setLoading(false);

      const { agents, synthesis } = await runMultiAgent(text);
      setMessages(prev => prev.map((m, i) =>
        m.agents_loading ? { ...m, content: synthesis, agents_loading: false, multi_agent: { agents, synthesis } } : m
      ));
      inputRef.current?.focus();
      return;
    }

    // ── Single agent mode (default) ───────────────────────────────
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 1000,
          system:     systemPrompt,
          tools:      TOOL_DEFINITIONS,
          messages:   [...history, { role: 'user', content: text }],
        }),
      });

      const data = await res.json();

      // Check for tool_use blocks
      const toolBlocks = data.content?.filter((b: any) => b.type === 'tool_use') ?? [];
      const textBlock  = data.content?.find((b: any) => b.type === 'text');
      const reply      = textBlock?.text || '';

      if (toolBlocks.length > 0) {
        const toolCalls = toolBlocks.map((b: any) => ({
          id:     b.id,
          name:   b.name,
          params: b.input,
        }));
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: reply || `${toolCalls.length} action${toolCalls.length > 1 ? 's' : ''} propose kar raha hun — review karo:`,
          ts: Date.now(),
          tool_calls: toolCalls,
          tool_done:  false,
        }]);
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
              {/* Multi-agent breakdown */}
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
