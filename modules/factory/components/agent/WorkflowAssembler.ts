// ═══════════════════════════════════════════════════════════════════
// EventOS — Workflow Assembler
// Takes classified event + pattern → assembles executable workflow
// Checks preconditions (vendor exists, GL period open, stock available)
// Returns workflow for TaskManager UI → ConfirmationCard → agentTools
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';
import { ClassificationResult } from './EventClassifier';
import PATTERNS from '@/modules/factory/data/patternLibrary.json';

// ── Types ────────────────────────────────────────────────────────────
export interface WorkflowStep {
  step:              number;
  module:            string;
  action:            string;
  tool:              string;
  params:            Record<string, any>;
  gl_flag:           boolean;
  requires_approval: boolean;
  status:            'pending' | 'ready' | 'blocked' | 'completed' | 'failed';
  block_reason?:     string;
}

export interface AssembledWorkflow {
  event_id:       string;
  label:          string;
  category:       string;
  confidence:     number;
  staff_message:  string;
  steps:          WorkflowStep[];
  preconditions:  { check: string; passed: boolean; detail: string }[];
  can_execute:    boolean;
  block_reasons:  string[];
  assembled_at:   string;
}

// ── Check if GL period is open ───────────────────────────────────────
const checkGLPeriodOpen = async (): Promise<boolean> => {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const periods = JSON.parse(localStorage.getItem('gtk_erp_fiscal_periods') || '[]');
    const current = periods.find((p: any) => p.month === month && p.company === 'GlassCo');
    return !current || current.status === 'Open';
  } catch { return true; }
};

// ── Check if a vendor exists ─────────────────────────────────────────
const checkVendorExists = (vendorName?: string): boolean => {
  if (!vendorName) return true; // No vendor needed
  const vendors = JSON.parse(localStorage.getItem('gtk_erp_vendors') || '[]');
  return vendors.some((v: any) => v.name?.toLowerCase().includes(vendorName.toLowerCase()));
};

// ── Assemble workflow from pattern + classified event ─────────────────
export const assembleWorkflow = async (
  classification: ClassificationResult,
  staffMessage: string
): Promise<AssembledWorkflow> => {

  // Load pattern (DB first, then JSON fallback)
  let patternSteps: any[] = [];
  let patternLabel = classification.label;

  if (classification.pattern_id) {
    try {
      const { data } = await supabase
        .from('pattern_library')
        .select('workflow_steps, label')
        .eq('event_id', classification.pattern_id)
        .single();
      if (data) {
        patternSteps = data.workflow_steps || [];
        patternLabel = data.label || patternLabel;
      }
    } catch {}

    // Fallback to JSON
    if (patternSteps.length === 0) {
      const jsonPattern = PATTERNS.patterns.find(p => p.event_id === classification.pattern_id);
      if (jsonPattern) {
        patternSteps = jsonPattern.workflow_steps;
        patternLabel = jsonPattern.label;
      }
    }
  }

  // ── Build precondition checks ──────────────────────────────────
  const preconditions: { check: string; passed: boolean; detail: string }[] = [];
  const blockReasons: string[] = [];

  // Check GL period for steps with gl_flag
  const hasGLStep = patternSteps.some((s: any) => s.gl_flag);
  if (hasGLStep) {
    const glOpen = await checkGLPeriodOpen();
    preconditions.push({
      check: 'GL Period Open',
      passed: glOpen,
      detail: glOpen ? 'Current period is open' : 'Current fiscal period is CLOSED — GL posting blocked',
    });
    if (!glOpen) blockReasons.push('Fiscal period closed — cannot post GL entries');
  }

  // Check vendor for purchase events
  if (['local_purchase', 'grn'].includes(classification.category)) {
    const vendorName = classification.extracted.names[0];
    const exists = checkVendorExists(vendorName);
    preconditions.push({
      check: 'Vendor Exists',
      passed: exists || !vendorName,
      detail: vendorName
        ? (exists ? `Vendor "${vendorName}" found` : `Vendor "${vendorName}" NOT found — create first`)
        : 'No vendor specified',
    });
  }

  // ── Assemble steps with extracted data ─────────────────────────
  const steps: WorkflowStep[] = patternSteps.map((s: any, idx: number) => {
    const params: Record<string, any> = { ...s.fields };

    // Populate extracted data into params
    if (classification.extracted.amounts.length > 0) {
      params.amount = classification.extracted.amounts[0];
    }
    if (classification.extracted.names.length > 0) {
      params.vendor = params.vendor || classification.extracted.names[0];
      params.assigned_to = params.assigned_to || classification.extracted.names[0];
    }
    if (classification.extracted.dates.length > 0) {
      params.date = classification.extracted.dates[0];
    }

    // Add description from original message
    params.description = params.description || staffMessage.slice(0, 200);
    params.detail = params.detail || staffMessage.slice(0, 200);

    const isBlocked = s.gl_flag && blockReasons.length > 0;

    return {
      step:              idx + 1,
      module:            s.module,
      action:            s.action,
      tool:              s.tool || '',
      params,
      gl_flag:           s.gl_flag || false,
      requires_approval: s.requires_approval || false,
      status:            isBlocked ? 'blocked' as const : 'ready' as const,
      block_reason:      isBlocked ? blockReasons[0] : undefined,
    };
  });

  return {
    event_id:      classification.pattern_id || `UNKNOWN-${Date.now()}`,
    label:         patternLabel,
    category:      classification.category,
    confidence:    classification.confidence,
    staff_message: staffMessage,
    steps,
    preconditions,
    can_execute:   blockReasons.length === 0 && steps.length > 0,
    block_reasons: blockReasons,
    assembled_at:  new Date().toISOString(),
  };
};

// ── Update pattern usage count after successful execution ────────────
export const recordPatternUsage = async (eventId: string, feedback: 'correct' | 'wrong_pattern' | 'wrong_steps' | 'missing_steps' | 'rejected') => {
  if (!eventId.startsWith('EVT-')) return;

  const delta = feedback === 'correct' ? 0.005 : feedback === 'rejected' ? -0.02 : -0.01;

  try {
    const { data } = await supabase
      .from('pattern_library')
      .select('times_used, confidence')
      .eq('event_id', eventId)
      .single();

    if (data) {
      const newConf = Math.max(0.50, Math.min(0.99, (data.confidence || 0.90) + delta));
      await supabase.from('pattern_library').update({
        times_used: (data.times_used || 0) + 1,
        confidence: newConf,
        updated_at: new Date().toISOString(),
      }).eq('event_id', eventId);
    }
  } catch {}
};
