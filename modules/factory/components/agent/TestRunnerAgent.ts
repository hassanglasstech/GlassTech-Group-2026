// ═══════════════════════════════════════════════════════════════════
// TestRunnerAgent — AI Agent that auto-runs UAT test workflows
// Integrates with EventOS: "test karo", "run UAT", "system check"
// ═══════════════════════════════════════════════════════════════════

import { runWorkflow, runFullSuite, storeTestResults, type WorkflowResult, type SuiteResult } from '@/modules/factory/services/testRunnerService';
import { logAudit } from '@/modules/factory/services/auditService';

// ── Types ────────────────────────────────────────────────────────────
interface TestRunRequest {
  scope:   'full' | 'module' | 'single';
  target?: string; // wfId for single, dept name for module
}

interface TestRunResponse {
  type:    'test_result';
  summary: string;
  detail:  WorkflowResult | SuiteResult;
  emoji:   string;
}

// ── Workflow data accessor (lazy import to avoid circular deps) ──────
let _workflows: any[] | null = null;

function getWorkflows(): any[] {
  if (_workflows) return _workflows;
  try {
    // Dynamic import of workflows from TestSuite
    // The WORKFLOWS constant is exported from TestSuite
    const mod = require('@/modules/shared/pages/TestSuite');
    _workflows = mod.WORKFLOWS || [];
  } catch {
    _workflows = [];
  }
  return _workflows ?? [];
}

// Allow external injection of workflows (used by TestSuite UI)
export function setWorkflows(wfs: any[]): void {
  _workflows = wfs;
}

// ── Detect UAT test request from user message ───────────────────────
const UAT_KEYWORDS = [
  'test karo', 'run test', 'run uat', 'uat test', 'system test',
  'tests run', 'test suite', 'regression test', 'check karo system',
  'sab check karo', 'full test', 'validation run', 'test chalao',
];

export function isTestRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return UAT_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Extract scope from message ───────────────────────────────────────
function parseScope(message: string): TestRunRequest {
  const lower = message.toLowerCase();

  // Single workflow: "test WF-S01" or "test quotation workflow"
  const wfMatch = lower.match(/wf-[a-z]\d{2}/i);
  if (wfMatch) return { scope: 'single', target: wfMatch[0].toUpperCase() };

  // Module scope: "test finance" or "hr tests karo"
  const modules: Record<string, string> = {
    'finance': 'FINANCE', 'fico': 'FINANCE', 'gl': 'FINANCE', 'ledger': 'FINANCE',
    'sales': 'SALES', 'quotation': 'SALES', 'production': 'SALES', 'piece': 'SALES',
    'hr': 'HR', 'payroll': 'HR', 'attendance': 'HR', 'salary': 'HR',
    'store': 'STORE', 'inventory': 'STORE', 'grn': 'STORE', 'procurement': 'STORE',
    'master': 'MASTERS', 'client': 'MASTERS', 'vendor': 'MASTERS', 'employee': 'MASTERS',
  };
  for (const [kw, dept] of Object.entries(modules)) {
    if (lower.includes(kw)) return { scope: 'module', target: dept };
  }

  // Default: full suite
  return { scope: 'full' };
}

// ── Main entry point ─────────────────────────────────────────────────
export async function runTests(message: string): Promise<TestRunResponse> {
  const { scope, target } = parseScope(message);
  const allWorkflows = getWorkflows();

  let workflows: any[];
  let scopeLabel: string;

  switch (scope) {
    case 'single':
      workflows = allWorkflows.filter(w => w.id === target);
      scopeLabel = target || 'unknown';
      break;
    case 'module':
      workflows = allWorkflows.filter(w => w.dept === target);
      scopeLabel = `${target} module`;
      break;
    default:
      workflows = allWorkflows;
      scopeLabel = 'Full Suite';
  }

  if (workflows.length === 0) {
    return {
      type: 'test_result',
      summary: `Koi workflow nahi mila for "${target || 'all'}". Available: ${allWorkflows.map(w => w.id).join(', ')}`,
      detail: { workflows: [], total: 0, passed: 0, failed: 0, partial: 0, passRate: 0, duration: 0, timestamp: new Date().toISOString() },
      emoji: '⚠️'
    };
  }

  // Log the test run initiation
  logAudit({
    action_type: 'uat_test_initiated',
    module: 'test_runner',
    user_id: 'ai_agent',
    agent_id: 'TestRunnerAgent',
    tool_name: 'run_uat_test',
    data_before: {},
    data_after: { scope, target, workflowCount: workflows.length },
    approval_chain: []
  });

  // Execute tests
  if (scope === 'single' && workflows.length === 1) {
    const result = await runWorkflow(workflows[0]);
    await storeTestResults(result);

    const emoji = result.status === 'pass' ? '✅' : result.status === 'partial' ? '⚠️' : '❌';
    const failedChecks = result.steps
      .flatMap(s => s.checks.filter(c => !c.passed))
      .map(c => `  - ${c.checkText}: actual="${c.actual}"`)
      .join('\n');

    return {
      type: 'test_result',
      emoji,
      summary: `${emoji} ${result.wfName}: ${result.passRate}% passed (${result.steps.filter(s=>s.status==='pass').length}/${result.steps.length} steps)\n${failedChecks ? `\nFailed checks:\n${failedChecks}` : ''}`,
      detail: result
    };
  }

  // Multiple workflows or full suite
  const suiteResult = await runFullSuite(workflows);
  await storeTestResults(suiteResult);

  const emoji = suiteResult.passRate === 100 ? '✅' : suiteResult.passRate >= 70 ? '⚠️' : '❌';
  const failedWFs = suiteResult.workflows
    .filter(w => w.status !== 'pass')
    .map(w => `  ${w.status === 'fail' ? '❌' : '⚠️'} ${w.wfId}: ${w.wfName} (${w.passRate}%)`)
    .join('\n');

  return {
    type: 'test_result',
    emoji,
    summary: `${emoji} ${scopeLabel} UAT Results: ${suiteResult.passRate}% pass rate
📊 ${suiteResult.passed} passed | ${suiteResult.failed} failed | ${suiteResult.partial} partial
⏱️ ${(suiteResult.duration / 1000).toFixed(1)}s${failedWFs ? `\n\nFailed/Partial:\n${failedWFs}` : ''}`,
    detail: suiteResult
  };
}
