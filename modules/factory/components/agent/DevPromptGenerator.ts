// ═══════════════════════════════════════════════════════════════════
// EventOS — Dev Prompt Generator
// When owner flags a gap ("GL entry missing", "step wrong"):
// 1. Captures gap description
// 2. Maps to relevant source files
// 3. Generates structured dev prompt for Claude Code
// 4. Saves to gap_log table
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';

// ── Types ────────────────────────────────────────────────────────────
export interface DevPrompt {
  gap_id:             string;
  detected_at:        string;
  event_type:         string;
  gap_description:    string;
  current_behavior:   string;
  expected_behavior:  string;
  files_to_modify:    string[];
  supabase_changes:   string;
  gl_impact:          string;
  test_criteria:      string;
  priority:           string;
}

// ── File mapping by module ───────────────────────────────────────────
const MODULE_FILE_MAP: Record<string, string[]> = {
  Finance: [
    '/modules/finance/services/financeService.ts',
    '/modules/factory/components/agent/FinanceAgent.ts',
  ],
  Purchase: [
    '/modules/procurement/services/inventoryService.ts',
    '/modules/procurement/services/grnService.ts',
  ],
  Production: [
    '/modules/production/services/productionService.ts',
    '/modules/production/services/ncrService.ts',
  ],
  HR: [
    '/modules/hr/services/hrService.ts',
  ],
  Sales: [
    '/modules/sales/services/salesService.ts',
    '/modules/sales/services/deliveryInvoiceService.ts',
  ],
  Store: [
    '/modules/procurement/services/inventoryService.ts',
  ],
  QC: [
    '/modules/production/services/ncrService.ts',
  ],
  Logistics: [
    '/modules/production/services/productionService.ts',
  ],
  Ops: [
    '/modules/factory/components/agent/OpsAgent.ts',
  ],
  Agent: [
    '/modules/factory/services/claudeAgentService.ts',
    '/modules/factory/components/agent/agentTools.ts',
  ],
};

// ── Detect GL impact from description ────────────────────────────────
const detectGLImpact = (description: string, modules: string[]): string => {
  const lower = description.toLowerCase();
  if (lower.includes('gl') || lower.includes('posting') || lower.includes('ledger') || lower.includes('entry')) {
    return 'GL posting logic needs modification — verify double-entry balance preserved';
  }
  if (modules.includes('Finance')) {
    return 'Finance module involved — check GL posting rules and period validation';
  }
  return 'None — no GL impact detected';
};

// ── Generate dev prompt ──────────────────────────────────────────────
export const generateDevPrompt = async (params: {
  event_type:        string;
  gap_description:   string;
  current_behavior:  string;
  expected_behavior: string;
  modules_involved:  string[];
  priority?:         string;
  reported_by?:      string;
}): Promise<DevPrompt> => {

  const gapId = `GAP-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`;
  const now   = new Date().toISOString();

  // Map modules to files
  const files = new Set<string>();
  for (const mod of params.modules_involved) {
    const mapped = MODULE_FILE_MAP[mod] || MODULE_FILE_MAP.Agent;
    mapped.forEach(f => files.add(f));
  }

  // Add EventOS files if pattern/workflow related
  if (params.gap_description.toLowerCase().includes('pattern') || params.gap_description.toLowerCase().includes('workflow')) {
    files.add('/modules/factory/components/agent/WorkflowAssembler.ts');
    files.add('/modules/factory/data/patternLibrary.json');
  }

  const prompt: DevPrompt = {
    gap_id:            gapId,
    detected_at:       now,
    event_type:        params.event_type,
    gap_description:   params.gap_description,
    current_behavior:  params.current_behavior,
    expected_behavior: params.expected_behavior,
    files_to_modify:   [...files],
    supabase_changes:  'Review if migration needed for new columns/tables',
    gl_impact:         detectGLImpact(params.gap_description, params.modules_involved),
    test_criteria:     `Trigger "${params.event_type}" event → verify expected behavior: ${params.expected_behavior}`,
    priority:          params.priority || 'Medium',
  };

  // Save to Supabase
  await supabase.from('gap_log').insert({
    gap_id:            prompt.gap_id,
    event_type:        prompt.event_type,
    gap_description:   prompt.gap_description,
    current_behavior:  prompt.current_behavior,
    expected_behavior: prompt.expected_behavior,
    dev_prompt:        prompt,
    status:            'Open',
    priority:          prompt.priority,
    reported_by:       params.reported_by || 'Owner',
    created_at:        now,
  }).then(undefined, () => {});

  return prompt;
};
