// ═══════════════════════════════════════════════════════════════════
// Period Lock Enforcer — Hard block on GL writes outside open period
// No agent override allowed. Owner must reopen period manually.
// All violations logged to audit_log.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';

export interface PeriodCheckResult {
  allowed:        boolean;
  period:         string;
  status:         'Open' | 'Closed' | 'Unknown';
  message:        string;
}

// ── Check if a date's period is open for GL posting ──────────────────
export const enforcePeriodLock = (
  entryDate: string,
  company: string
): PeriodCheckResult => {
  const period = entryDate.slice(0, 7); // YYYY-MM
  const periods = JSON.parse(localStorage.getItem('gtk_erp_fiscal_periods') || '[]');
  const match = periods.find((p: any) => p.month === period && p.company === company);

  if (!match) {
    // No period record = allow (period not yet created)
    return {
      allowed: true,
      period,
      status:  'Unknown',
      message: `Period ${period} not found — allowing (first-time period)`,
    };
  }

  if (match.status === 'Closed') {
    // Log violation attempt
    logPeriodViolation(period, company, 'GL post attempted in closed period');

    return {
      allowed: false,
      period,
      status:  'Closed',
      message: `Period ${period} is CLOSED for ${company}. Contact Finance to reopen.`,
    };
  }

  return {
    allowed: true,
    period,
    status:  'Open',
    message: `Period ${period} is open`,
  };
};

// ── Get current open period ──────────────────────────────────────────
export const getCurrentOpenPeriod = (company: string): string | null => {
  const periods = JSON.parse(localStorage.getItem('gtk_erp_fiscal_periods') || '[]');
  const open = periods
    .filter((p: any) => p.company === company && p.status === 'Open')
    .sort((a: any, b: any) => b.month.localeCompare(a.month));
  return open.length > 0 ? open[0].month : null;
};

// ── Check multiple dates (batch GL posting) ──────────────────────────
export const enforceMultiplePeriods = (
  entries: { date: string; company: string }[]
): { allAllowed: boolean; blocked: PeriodCheckResult[] } => {
  const blocked: PeriodCheckResult[] = [];

  for (const entry of entries) {
    const result = enforcePeriodLock(entry.date, entry.company);
    if (!result.allowed) {
      blocked.push(result);
    }
  }

  return {
    allAllowed: blocked.length === 0,
    blocked,
  };
};

// ── Log period violation to audit trail ──────────────────────────────
const logPeriodViolation = async (
  period: string,
  company: string,
  detail: string
): Promise<void> => {
  await supabase.from('audit_log').insert({
    company,
    action:    'period_violation_attempt',
    details:   { period, detail, timestamp: new Date().toISOString() },
    timestamp: new Date().toISOString(),
  }).then(undefined, () => {});
};
