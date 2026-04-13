// ═══════════════════════════════════════════════════════════════════
// EventOS Service — Main orchestration layer
// Staff message → Classify → Assemble workflow → Execute → Learn
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';
import { classifyEvent, ClassificationResult } from '../components/agent/EventClassifier';
import { assembleWorkflow, recordPatternUsage, AssembledWorkflow } from '../components/agent/WorkflowAssembler';
import { executeTool } from '../components/agent/agentTools';

// ── Types ────────────────────────────────────────────────────────────
export interface EventOSResult {
  classification: ClassificationResult;
  workflow:       AssembledWorkflow;
  execution?:     { success: boolean; results: any[]; errors: string[] };
}

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
  }).catch(() => {});

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
    .catch(() => {});

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
  }).catch(() => {});

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
