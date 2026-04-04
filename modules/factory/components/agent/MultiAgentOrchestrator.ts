import { supabase } from '@/src/services/supabaseClient';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { HRService } from '@/modules/hr/services/hrService';

// ── Agent response type ───────────────────────────────────────────────
export interface AgentResponse {
  agent:    string;
  emoji:    string;
  findings: string;
  alerts:   string[];
  duration: number;
}

// ── Keywords that trigger multi-agent mode ────────────────────────────
const MULTI_AGENT_KEYWORDS = [
  'order accept', 'accept karo', 'order lein', 'delivery',
  'vendor', 'payment', 'client', 'employee', 'worker',
  'profit', 'margin', 'capacity', 'stock', 'dispatch',
  'kya karo', 'suggest', 'recommend', 'decide', 'kya lagta',
];

export const shouldUseMultiAgent = (query: string): boolean => {
  const q = query.toLowerCase();
  return MULTI_AGENT_KEYWORDS.some(kw => q.includes(kw));
};

// ── Build data slice for each agent ──────────────────────────────────
const buildFactoryContext = async (): Promise<string> => {
  const [{ count: urgent }, { count: open }, { data: recent }] = await Promise.all([
    supabase.from('factory_events').select('id', { count: 'exact', head: true }).eq('priority', 'Urgent').in('status', ['Open', 'Pending']),
    supabase.from('factory_events').select('id', { count: 'exact', head: true }).in('status', ['Open', 'Pending']),
    supabase.from('factory_events').select('sector,event_type,priority,status').order('created_at', { ascending: false }).limit(5),
  ]);
  const pieces  = ProductionService.getProductionPieces();
  const ready   = pieces.filter(p => p.status === 'Ready to Dispatch' || p.status === 'QC-Passed').length;
  const active  = pieces.filter(p => !['Delivered', 'Broken'].includes(p.status)).length;
  return `FACTORY STATUS:
- Urgent events: ${urgent ?? 0} | Open events: ${open ?? 0}
- Production pieces active: ${active} | Ready to dispatch: ${ready}
- Recent events: ${(recent || []).map((e: any) => `${e.event_type}(${e.sector}/${e.priority})`).join(', ') || 'none'}`;
};

const buildFinanceContext = (): string => {
  const accounts = FinanceService.getAccounts().filter((a: any) => a.company === 'GlassCo');
  const ledger   = FinanceService.getLedger().filter((t: any) => t.company === 'GlassCo');
  const month    = new Date().toISOString().slice(0, 7);
  const balances: Record<string, number> = {};
  accounts.forEach((a: any) => { balances[a.id] = 0; });
  ledger.forEach((tx: any) => tx.details?.forEach((d: any) => { if (balances[d.accountId] !== undefined) balances[d.accountId] += (d.debit - d.credit); }));
  const rev = Math.abs(accounts.filter((a: any) => a.type === 'Revenue').reduce((s: number, a: any) => s + (balances[a.id] || 0), 0));
  const exp = Math.abs(accounts.filter((a: any) => a.type === 'Expense').reduce((s: number, a: any) => s + (balances[a.id] || 0), 0));
  const monthLedger = ledger.filter((t: any) => t.date?.startsWith(month));
  const invoices = SalesService.getInvoices().filter((i: any) => i.company === 'GlassCo');
  const overdue  = invoices.filter((i: any) => (i.status === 'Outstanding' || i.status === 'Overdue') && i.dueDate < new Date().toISOString().split('T')[0]);
  return `FINANCE STATUS:
- Revenue (all time): PKR ${rev.toLocaleString()} | Expenses: PKR ${exp.toLocaleString()}
- Net profit: PKR ${(rev - exp).toLocaleString()}
- Month transactions: ${monthLedger.length}
- Overdue invoices: ${overdue.length} (PKR ${overdue.reduce((s: number, i: any) => s + (i.amount || i.totalAmount || 0), 0).toLocaleString()})`;
};

const buildVendorContext = async (): Promise<string> => {
  const [{ data: sla }, { data: pos }] = await Promise.all([
    supabase.from('vendor_sla').select('vendor_name,breach_count,total_orders,active').eq('active', true).order('breach_count', { ascending: false }).limit(5),
    supabase.from('gtk_erp_purchase_orders').select('vendor_name,status,total').in('status', ['Approved', 'Pending', 'Partial GRN']).limit(10),
  ]);
  const highRisk = (sla || []).filter((v: any) => v.total_orders > 0 && (v.breach_count / v.total_orders) > 0.4);
  return `VENDOR STATUS:
- High-risk vendors: ${highRisk.map((v: any) => `${v.vendor_name}(${Math.round(v.breach_count / v.total_orders * 100)}% breach)`).join(', ') || 'none'}
- Open POs: ${(pos || []).length} (PKR ${(pos || []).reduce((s: number, p: any) => s + (p.total || 0), 0).toLocaleString()})`;
};

const buildHRContext = (): string => {
  const emps       = HRService.getEmployees().filter((e: any) => e.company === 'GlassCo' && !['resigned', 'terminated'].includes(e.work?.status || ''));
  const today      = new Date().toISOString().split('T')[0];
  const attendance = HRService.getAttendance().filter((a: any) => a.date === today);
  const absent     = attendance.filter((a: any) => a.status === 'Absent').length;
  const loans      = HRService.getLoans().filter((l: any) => l.status === 'Active');
  return `HR STATUS:
- Active employees (GlassCo): ${emps.length}
- Absent today: ${absent}
- Active loans/advances: ${loans.length} (PKR ${loans.reduce((s: number, l: any) => s + (l.amount || 0), 0).toLocaleString()})`;
};

const buildSalesContext = (): string => {
  const quotes   = SalesService.getQuotations().filter((q: any) => q.company === 'Glassco' && q.status !== 'Draft');
  const month    = new Date().toISOString().slice(0, 7);
  const mQuotes  = quotes.filter((q: any) => q.date?.startsWith(month));
  const pending  = quotes.filter((q: any) => ['Approved', 'In Production'].includes(q.status));
  const invoices = SalesService.getInvoices().filter((i: any) => i.company === 'Glassco' && i.date?.startsWith(month));
  const revenue  = invoices.reduce((s: number, i: any) => s + (i.amount || i.totalAmount || 0), 0);
  return `SALES STATUS:
- Month quotations: ${mQuotes.length} | Month revenue: PKR ${revenue.toLocaleString()}
- Pending orders (in production): ${pending.length}
- Total active orders: ${quotes.length}`;
};

// ── Call Claude for each agent ────────────────────────────────────────
const callAgent = async (
  agentName: string,
  emoji: string,
  systemPrompt: string,
  context: string,
  query: string
): Promise<AgentResponse> => {
  const start = Date.now();
  try {
    const _proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-proxy`;
    const res = await fetch(_proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system:     `${systemPrompt}\n\n${context}\n\nRespond in 2-3 bullet points max. Be specific with numbers. Flag risks with ⚠️. Language: mix English/Urdu ok.`,
        messages:   [{ role: 'user', content: query }],
      }),
    });
    const data     = await res.json();
    const text     = data.content?.[0]?.text || 'Data unavailable.';
    const alerts   = text.match(/⚠️[^\n]*/g) || [];
    const findings = text.replace(/⚠️[^\n]*/g, '').trim();
    return { agent: agentName, emoji, findings, alerts, duration: Date.now() - start };
  } catch {
    return { agent: agentName, emoji, findings: 'Agent unavailable.', alerts: [], duration: Date.now() - start };
  }
};

// ── Main orchestrator ─────────────────────────────────────────────────
export const runMultiAgent = async (
  query: string,
  onAgentComplete?: (agent: AgentResponse) => void
): Promise<{ agents: AgentResponse[]; synthesis: string }> => {

  // Build all context in parallel
  const [factoryCtx, vendorCtx] = await Promise.all([
    buildFactoryContext(),
    buildVendorContext(),
  ]);
  const financeCtx = buildFinanceContext();
  const hrCtx      = buildHRContext();
  const salesCtx   = buildSalesContext();

  // Run all 5 agents in parallel
  const agentPromises = [
    callAgent('Factory', '🏭', 'You are GlassTech Factory Agent. Analyze factory capacity, production status, and operational risks.', factoryCtx, query),
    callAgent('Finance', '💰', 'You are GlassTech Finance Agent. Analyze cash position, margins, receivables, and financial risks.', financeCtx, query),
    callAgent('Vendor',  '🤝', 'You are GlassTech Vendor Agent. Analyze vendor reliability, open POs, supply risks, and SLA performance.', vendorCtx, query),
    callAgent('HR',      '👥', 'You are GlassTech HR Agent. Analyze workforce availability, attendance, and employee issues.', hrCtx, query),
    callAgent('Sales',   '📈', 'You are GlassTech Sales Agent. Analyze order pipeline, revenue, client relationships, and delivery commitments.', salesCtx, query),
  ];

  // Collect as they complete
  const agents: AgentResponse[] = [];
  const settled = await Promise.allSettled(agentPromises);
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      agents.push(result.value);
      onAgentComplete?.(result.value);
    }
  }

  // Master synthesis
  const allFindings = agents.map(a => `${a.emoji} ${a.agent}:\n${a.findings}\n${a.alerts.join('\n')}`).join('\n\n');

  const masterRes = await fetch('PROXY_PLACEHOLDER', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 400,
      system:     `You are GlassTech Master Agent. You receive analysis from 5 specialized agents and synthesize into ONE clear recommendation for the business owner Hassan.

Rules:
- Start with bottom-line recommendation (yes/no/what to do)
- Support with top 2-3 key factors from agents
- Flag any critical risks
- Be direct and actionable
- Mix English/Urdu is fine
- Max 5 sentences`,
      messages: [{
        role:    'user',
        content: `Query: "${query}"\n\nAgent findings:\n${allFindings}\n\nProvide master synthesis:`,
      }],
    }),
  });

  const masterData  = await masterRes.json();
  const synthesis   = masterData.content?.[0]?.text || 'Synthesis unavailable.';

  return { agents, synthesis };
};
