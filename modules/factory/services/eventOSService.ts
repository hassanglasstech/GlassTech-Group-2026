// ═══════════════════════════════════════════════════════════════════
// EventOS Service — Main orchestration layer
// Staff message → Classify → Assemble workflow → Execute → Learn
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';
import { classifyEvent, ClassificationResult } from '../components/agent/EventClassifier';
import { assembleWorkflow, recordPatternUsage, AssembledWorkflow } from '../components/agent/WorkflowAssembler';
import { executeTool } from '../components/agent/agentTools';
import { queryWithTools, appendToSession, getSessionSummary } from './claudeAgentService';
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

// ── Greeting / conversational detection ───────────────────────────────
const GREETING_PATTERNS = [
  'hello', 'hi', 'hey', 'salam', 'assalam', 'aoa', 'good morning',
  'good evening', 'kya hal', 'kaise ho', 'shukriya', 'thank', 'ok',
  'theek', 'acha', 'bye', 'alvida', 'welcome', 'ji',
];

export const isConversational = (message: string): boolean => {
  const lower = message.toLowerCase().trim();
  const words = lower.split(/\s+/);
  // Short messages (1-3 words) that match greeting patterns
  if (words.length <= 4 && GREETING_PATTERNS.some(g => lower.includes(g))) return true;
  // Very short messages with no action words
  if (words.length <= 2) return true;
  return false;
};

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

// ── Answer data queries via Claude + built-in Supabase query tools ────
export const answerDataQuery = async (message: string): Promise<QueryResult> => {
  const safeMessage = sanitizeUserInput(message);
  const erpCtx = buildERPContext();
  const sessionSummary = await getSessionSummary();

  const systemPrompt = `You are GlassTech ERP Assistant. Answer data questions using tools.

${erpCtx}
${sessionSummary ? `\nCONVERSATION CONTEXT:\n${sessionSummary}\n` : ''}
RULES:
- ALWAYS use a tool to fetch real data before answering
- Language: Roman Urdu + English mix
- Numbers: PKR format with commas
- Be direct, concise, conversational
- Summarize tool results naturally — don't dump raw JSON
- If user refers to something from earlier conversation, use the context above`;

  // Save user message to session
  await appendToSession('user', message);

  const { answer, toolsUsed } = await queryWithTools(safeMessage, systemPrompt, 'eventos-query');

  // Save assistant reply to session
  await appendToSession('assistant', answer);

  return { type: 'query', answer, toolsUsed };
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

// ── Write tables that agent tools INSERT into ────────────────────────
const WRITE_TABLE_MAP: Record<string, string> = {
  create_quotation:      'quotations',
  create_requisition:    'requisitions',
  create_task:           'agent_tasks',
  schedule_task:         'agent_tasks',
  log_factory_event:     'factory_events',
  create_invoice:        'invoices',
  create_payment_receipt:'payment_receipts',
};

// ── Step 5-8: Execute approved workflow (with write tracking) ─────────
export const executeWorkflow = async (
  workflow: AssembledWorkflow,
  approvedBy: string
): Promise<{ success: boolean; results: any[]; errors: string[]; executionLogId?: string }> => {
  const results: any[] = [];
  const errors: string[] = [];
  const writes: { table: string; op: string; id: string; old: any; new_val: any }[] = [];

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

      // Track the write for reversal
      const table = WRITE_TABLE_MAP[step.tool];
      if (table && result.success && result.result) {
        const createdId = result.result.quotation_id || result.result.req_id || result.result.task_id
          || result.result.event_id || result.result.invoice_id || result.result.receipt_id;
        if (createdId) {
          writes.push({ table, op: 'insert', id: createdId, old: null, new_val: result.result });
        }
      }

      // Track localStorage writes (update_order_status)
      if (step.tool === 'update_order_status' && result.success) {
        writes.push({ table: 'localStorage', op: 'update', id: step.params.doc_id,
          old: { status: '(previous)' }, new_val: { status: step.params.status } });
      }

      if (!result.success) {
        errors.push(`Step ${step.step} (${step.tool}) failed: ${result.error}`);
      }
    } catch (err) {
      errors.push(`Step ${step.step} (${step.tool}) threw: ${String(err)}`);
    }
  }

  const success = errors.length === 0;

  // Save execution log for reversal
  const { data: execLog } = await supabase.from('agent_execution_log').insert({
    pattern_id:      workflow.event_id,
    event_label:     workflow.label,
    steps_executed:  results,
    supabase_writes: writes,
    executed_by:     approvedBy,
    executed_at:     new Date().toISOString(),
  }).select('id').single();

  // Update event_history
  await supabase.from('event_history').update({
    execution_result: { results, errors, execution_log_id: execLog?.id },
    outcome:          success ? 'approved' : 'failed',
    executed_by:      approvedBy,
  }).eq('staff_message', workflow.staff_message)
    .order('created_at', { ascending: false })
    .limit(1)
    .then(() => {}, () => {});

  if (workflow.event_id.startsWith('EVT-')) {
    await recordPatternUsage(workflow.event_id, success ? 'correct' : 'wrong_steps');
  }

  return { success, results, errors, executionLogId: execLog?.id };
};

// ═══════════════════════════════════════════════════════════════════════
// REVERSAL ENGINE — undo agent-executed workflows
// Deletes inserted rows, restores updated rows, creates GL reversal JVs
// ═══════════════════════════════════════════════════════════════════════

export const reverseExecution = async (
  executionLogId: string,
  reversedBy: string
): Promise<{ success: boolean; reversed: number; errors: string[] }> => {
  const { data: log } = await supabase
    .from('agent_execution_log')
    .select('*')
    .eq('id', executionLogId)
    .single();

  if (!log) return { success: false, reversed: 0, errors: ['Execution log not found'] };
  if (log.reversed_at) return { success: false, reversed: 0, errors: ['Already reversed'] };

  const writes: any[] = log.supabase_writes || [];
  const errors: string[] = [];
  let reversed = 0;

  // Reverse in REVERSE order (last write first)
  for (let i = writes.length - 1; i >= 0; i--) {
    const w = writes[i];
    try {
      if (w.op === 'insert' && w.table !== 'localStorage') {
        // Delete the inserted row
        const { error } = await supabase.from(w.table).delete().eq('id', w.id);
        if (error) {
          errors.push(`Failed to delete ${w.table}/${w.id}: ${error.message}`);
        } else {
          // Also remove from localStorage if applicable
          const lsKeyMap: Record<string, string> = {
            quotations: 'gtk_erp_quotations', requisitions: 'gtk_erp_requisitions',
            agent_tasks: 'gtk_erp_agent_tasks', factory_events: 'gtk_erp_factory_events',
            invoices: 'gtk_erp_invoices', payment_receipts: 'gtk_erp_payment_receipts',
          };
          const lsKey = lsKeyMap[w.table];
          if (lsKey) {
            try {
              const arr = JSON.parse(localStorage.getItem(lsKey) || '[]');
              const filtered = arr.filter((item: any) => item.id !== w.id);
              localStorage.setItem(lsKey, JSON.stringify(filtered));
            } catch {}
          }
          reversed++;
        }
      } else if (w.op === 'update' && w.table === 'localStorage') {
        // Restore localStorage value (best effort — old status may be approximate)
        // Not reversible with certainty, log a warning
        errors.push(`Note: localStorage update for ${w.id} may need manual check`);
      }
    } catch (err) {
      errors.push(`Reversal error on ${w.table}/${w.id}: ${String(err)}`);
    }
  }

  // Mark as reversed
  await supabase.from('agent_execution_log').update({
    reversed_at:     new Date().toISOString(),
    reversed_by:     reversedBy,
    reversal_result: { reversed, errors },
  }).eq('id', executionLogId).then(() => {}, () => {});

  return { success: errors.length === 0, reversed, errors };
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
