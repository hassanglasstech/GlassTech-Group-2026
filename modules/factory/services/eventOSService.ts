// ═══════════════════════════════════════════════════════════════════
// EventOS Service — Main orchestration layer
// Staff message → Classify → Assemble workflow → Execute → Learn
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';
import { classifyEvent, ClassificationResult } from '../components/agent/EventClassifier';
import { assembleWorkflow, recordPatternUsage, AssembledWorkflow } from '../components/agent/WorkflowAssembler';
import { executeTool, TOOL_DEFINITIONS } from '../components/agent/agentTools';
import { chatWithTools } from './claudeAgentService';
import { sanitizeUserInput } from './promptSanitizer';
import { SalesService } from '@/modules/sales/services/salesService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { ProductionService } from '@/modules/production/services/productionService';
import { HRService } from '@/modules/hr/services/hrService';

// ── Types ────────────────────────────────────────────────────────────
export interface EventOSResult {
  classification: ClassificationResult;
  workflow:       AssembledWorkflow;
  execution?:     { success: boolean; results: any[]; errors: string[] };
}

export interface QueryResult {
  type:    'query';
  answer:  string;
  toolsUsed: string[];
}

// ── Query detection keywords ─────────────────────────────────────────
const QUERY_KEYWORDS = [
  'kitni', 'kitna', 'kitne', 'how many', 'how much', 'total', 'count',
  'kya hai', 'kya hain', 'what is', 'what are', 'show', 'dikhao',
  'status', 'report', 'summary', 'hisab', 'balance', 'list',
  'pending', 'overdue', 'outstanding', 'stuck', 'ready',
  'aaj', 'today', 'is hafte', 'this week', 'is mahine', 'this month',
  'floor', 'stock', 'inventory', 'revenue', 'expense', 'payment',
  'quotation', 'invoice', 'order', 'piece', 'NCR', 'breakage',
  'vendor', 'client', 'employee', 'attendance', 'salary',
];

export const isDataQuery = (message: string): boolean => {
  const lower = message.toLowerCase();
  const matchCount = QUERY_KEYWORDS.filter(kw => lower.includes(kw)).length;
  // If 2+ query keywords hit, it's a data question — not an action event
  return matchCount >= 2;
};

// ── Build live ERP context for Claude ────────────────────────────────
const buildERPContext = (): string => {
  try {
    const now   = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = now.toISOString().split('T')[0];

    const quotations = SalesService.getQuotations().filter((q: any) => q.company === 'Glassco');
    const monthQuotes = quotations.filter((q: any) => q.date?.startsWith(month));
    const invoices = SalesService.getInvoices().filter((i: any) => i.company === 'Glassco');
    const revenue = invoices.filter((i: any) => i.date?.startsWith(month))
      .reduce((s: number, i: any) => s + (i.amount || i.totalAmount || 0), 0);

    const pieces = ProductionService.getProductionPieces();
    const active = pieces.filter(p => !['Delivered', 'Broken'].includes(p.status));

    return `
=== ERP SNAPSHOT (${today}) ===
Month quotations: ${monthQuotes.length} | Total quotations: ${quotations.length}
Month revenue: PKR ${revenue.toLocaleString()}
Active pieces: ${active.length}
Month: ${month}
===`;
  } catch { return '=== ERP data unavailable ==='; }
};

// ── Answer data queries via Claude + tool_use ────────────────────────
export const answerDataQuery = async (message: string): Promise<QueryResult> => {
  const safeMessage = sanitizeUserInput(message);
  const erpCtx = buildERPContext();

  const systemPrompt = `You are GlassTech ERP Assistant. Answer data questions using tools.

${erpCtx}

RULES:
- Use tools to fetch real data, then answer naturally
- Language: Roman Urdu + English mix
- Numbers: PKR format with commas
- Be direct, concise
- If tool returns data, summarize it conversationally`;

  // Only include READ tools (no create/update/delete)
  const readTools = TOOL_DEFINITIONS.filter(t =>
    !t.name.startsWith('create_') &&
    !t.name.startsWith('update_') &&
    !t.name.startsWith('draft_') &&
    !t.name.startsWith('log_') &&
    t.name !== 'send_whatsapp' &&
    t.name !== 'print_document'
  );

  const { text, toolCalls, response } = await chatWithTools({
    model:     'claude-haiku-4-5-20251001',
    maxTokens: 800,
    system:    systemPrompt,
    tools:     readTools,
    messages:  [{ role: 'user', content: safeMessage }],
    agentId:   'eventos-query',
  });

  // If Claude used tools, execute them and get data
  if (toolCalls.length > 0) {
    const toolResults: string[] = [];
    const toolsUsed: string[] = [];

    for (const tc of toolCalls) {
      try {
        const result = await executeTool(tc.name, tc.params, 'EventOS');
        toolsUsed.push(tc.name);
        toolResults.push(JSON.stringify(result.result || result, null, 2).slice(0, 1000));
      } catch (err) {
        toolResults.push(`Error: ${String(err)}`);
      }
    }

    // Send tool results back to Claude for natural response
    const { text: finalAnswer } = await chatWithTools({
      model:     'claude-haiku-4-5-20251001',
      maxTokens: 600,
      system:    systemPrompt,
      messages:  [
        { role: 'user', content: safeMessage },
        { role: 'assistant', content: response.content as any },
        { role: 'user', content: toolResults.map((r, i) =>
          `Tool ${toolCalls[i].name} result:\n${r}`
        ).join('\n\n') },
      ],
      agentId: 'eventos-query',
    });

    return { type: 'query', answer: finalAnswer || text || 'Data mil gayi lekin summarize nahi ho saki.', toolsUsed };
  }

  // No tools used — Claude answered directly from context
  return { type: 'query', answer: text || 'Jawab nahi mil saka.', toolsUsed: [] };
};

// ── Step 1-4: Classify + Assemble ────────────────────────────────────
export const processStaffMessage = async (
  message: string,
  source: 'text' | 'voice' | 'whatsapp' = 'text'
): Promise<EventOSResult> => {
  const start = Date.now();

  // Classify
  const classification = await classifyEvent(message);

  // Assemble workflow
  const workflow = await assembleWorkflow(classification, message);

  // Log to event_history
  await supabase.from('event_history').insert({
    staff_message:    message,
    message_source:   source,
    classified_as:    classification.category,
    matched_pattern:  classification.pattern_id,
    confidence:       classification.confidence,
    workflow_steps:   workflow.steps,
    execution_result: {},
    outcome:          null,
    execution_time_ms: Date.now() - start,
    created_at:       new Date().toISOString(),
  }).then(() => {}, () => {});

  return { classification, workflow };
};

// ── Step 5-8: Execute approved workflow ───────────────────────────────
export const executeWorkflow = async (
  workflow: AssembledWorkflow,
  approvedBy: string
): Promise<{ success: boolean; results: any[]; errors: string[] }> => {
  const results: any[] = [];
  const errors: string[] = [];

  for (const step of workflow.steps) {
    if (step.status === 'blocked') {
      errors.push(`Step ${step.step} blocked: ${step.block_reason}`);
      continue;
    }
    if (!step.tool) {
      results.push({ step: step.step, skipped: true, reason: 'No tool assigned' });
      continue;
    }

    try {
      const result = await executeTool(step.tool, step.params, approvedBy);
      results.push({ step: step.step, tool: step.tool, ...result });
      if (!result.success) {
        errors.push(`Step ${step.step} (${step.tool}) failed: ${result.error}`);
      }
    } catch (err) {
      errors.push(`Step ${step.step} (${step.tool}) threw: ${String(err)}`);
    }
  }

  const success = errors.length === 0;

  // Update event_history with execution result
  await supabase.from('event_history').update({
    execution_result: { results, errors },
    outcome:          success ? 'approved' : 'failed',
    executed_by:      approvedBy,
  }).eq('staff_message', workflow.staff_message)
    .order('created_at', { ascending: false })
    .limit(1)
    .then(() => {}, () => {});

  // Record pattern usage
  if (workflow.event_id.startsWith('EVT-')) {
    await recordPatternUsage(workflow.event_id, success ? 'correct' : 'wrong_steps');
  }

  return { success, results, errors };
};

// ── Record owner feedback for learning ───────────────────────────────
export const recordFeedback = async (
  eventId: string,
  staffMessage: string,
  classifiedAs: string,
  feedback: 'correct' | 'wrong_pattern' | 'wrong_steps' | 'missing_steps' | 'rejected',
  patternUpdate?: Record<string, any>
) => {
  await supabase.from('learning_log').insert({
    event_id:        eventId,
    staff_message:   staffMessage,
    classified_as:   classifiedAs,
    owner_feedback:  feedback,
    pattern_update:  patternUpdate || null,
    confidence_delta: feedback === 'correct' ? 0.005 : -0.01,
    created_at:      new Date().toISOString(),
  }).then(() => {}, () => {});

  // Update pattern confidence
  if (eventId.startsWith('EVT-')) {
    await recordPatternUsage(eventId, feedback);
  }
};

// ── Get EventOS stats ────────────────────────────────────────────────
export const getEventOSStats = async () => {
  const [
    { count: totalEvents },
    { count: totalPatterns },
    { count: openGaps },
    { data: recentEvents },
  ] = await Promise.all([
    supabase.from('event_history').select('id', { count: 'exact', head: true }),
    supabase.from('pattern_library').select('event_id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('gap_log').select('gap_id', { count: 'exact', head: true }).eq('status', 'Open'),
    supabase.from('event_history').select('classified_as, outcome, confidence').order('created_at', { ascending: false }).limit(20),
  ]);

  const avgConfidence = (recentEvents || []).reduce((s: number, e: any) => s + (e.confidence || 0), 0) / Math.max(1, (recentEvents || []).length);
  const successRate = (recentEvents || []).filter((e: any) => e.outcome === 'approved').length / Math.max(1, (recentEvents || []).length);

  return {
    totalEvents:    totalEvents ?? 0,
    totalPatterns:  totalPatterns ?? 0,
    openGaps:       openGaps ?? 0,
    avgConfidence:  Math.round(avgConfidence * 100) / 100,
    successRate:    Math.round(successRate * 100),
  };
};
