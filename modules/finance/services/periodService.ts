/**
 * periodService.ts — Phase 4
 * Fiscal period management: open/close months, prevent back-posting.
 * Storage: localStorage (gtk_erp_fiscal_periods) + Supabase sync via SyncService.
 */

import { safeParse, safeSave } from '../../shared/services/utils';
import { supabase } from '@/src/services/supabaseClient';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';
import { Company } from '../../shared/types/core';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';

export interface FiscalPeriod {
  id:         string;   // company-YYYY-MM
  company:    Company;
  month:      string;   // YYYY-MM
  status:     'Open' | 'Closed';
  openedBy?:  string;
  openedAt?:  string;
  closedBy?:  string;
  closedAt?:  string;
}

const KEY = 'gtk_erp_fiscal_periods';

const _load = (): FiscalPeriod[] => safeParse(KEY);
const _save = async (periods: FiscalPeriod[]): Promise<void> => {
  safeSave(KEY, periods);
  try {
    const rows = periods.map(p => ({
      id: p.id, company: p.company, month: p.month, status: p.status,
      opened_by: p.openedBy ?? null, opened_at: p.openedAt ?? null,
      closed_by: p.closedBy ?? null, closed_at: p.closedAt ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('fiscal_periods').upsert(rows);
    if (error) Logger.warn('Period', 'Supabase upsert failed', error);
  } catch (e) {
    Logger.warn('Period', 'Supabase unavailable — saved locally', e);
  }
};

// ── Auto-seed: ensure current month is open if no periods exist ───────
const _autoSeedCurrentMonth = (company: Company, actor: string): void => {
  const periods = _load().filter(p => p.company === company);
  if (periods.length === 0) {
    const month = new Date().toISOString().slice(0, 7);
    const id = `${company}-${month}`;
    const all = _load();
    all.push({ id, company, month, status: 'Open', openedBy: actor, openedAt: new Date().toISOString() });
    safeSave(KEY, all);
  }
};

export const PeriodService = {

  // ── List all periods for a company ────────────────────────────────
  listPeriods: (company: Company): FiscalPeriod[] => {
    return _load()
      .filter(p => p.company === company)
      .sort((a, b) => b.month.localeCompare(a.month));
  },

  // ── Check if a date's period is open ─────────────────────────────
  isPeriodOpen: (company: Company, date: string): boolean => {
    const month = date.slice(0, 7); // YYYY-MM
    const periods = _load().filter(p => p.company === company);

    // If no periods exist at all → allow (system not yet configured)
    if (periods.length === 0) return true;

    const period = periods.find(p => p.month === month);

    // If period not registered → check if it's current or future month (allow)
    if (!period) {
      const now = new Date().toISOString().slice(0, 7);
      return month >= now;
    }

    return period.status === 'Open';
  },

  // ── Open a period ─────────────────────────────────────────────────
  openPeriod: async (company: Company, month: string, actor: string): Promise<void> => {
    const all = _load();
    const id = `${company}-${month}`;
    const idx = all.findIndex(p => p.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], status: 'Open', openedBy: actor, openedAt: new Date().toISOString() };
    } else {
      all.push({ id, company, month, status: 'Open', openedBy: actor, openedAt: new Date().toISOString() });
    }
    await _save(all);
    toast.success(`Period ${month} opened.`);
  },

  // ── Close a period ────────────────────────────────────────────────
  closePeriod: async (company: Company, month: string, actor: string): Promise<void> => {
    const all = _load();
    const id = `${company}-${month}`;
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) {
      toast.error(`Period ${month} not found.`);
      return;
    }
    // Warn if trying to close current month
    const now = new Date().toISOString().slice(0, 7);
    if (month === now) {
      if (!await confirmModal(`Closing the CURRENT period (${month}) will prevent any new GL entries for this month. Continue?`)) return;
    }
    all[idx] = { ...all[idx], status: 'Closed', closedBy: actor, closedAt: new Date().toISOString() };
    await _save(all);
    toast.success(`Period ${month} closed by ${actor}.`);
  },

  // ── Ensure current month period exists ────────────────────────────
  ensureCurrentPeriod: (company: Company, actor: string): void => {
    _autoSeedCurrentMonth(company, actor);
  },

  // ── Get current open period ───────────────────────────────────────
  getCurrentOpenPeriod: (company: Company): string | null => {
    const now = new Date().toISOString().slice(0, 7);
    const periods = _load().filter(p => p.company === company);
    if (periods.length === 0) return now;
    const open = periods.find(p => p.month === now && p.status === 'Open');
    return open ? open.month : null;
  },

  // ── Load from Supabase on init ────────────────────────────────────
  loadFromSupabase: async (company: Company): Promise<void> => {
    try {
      const { data } = await supabase
        .from('fiscal_periods')
        .select('*')
        .eq('company', company);
      if (data?.length) {
        const mapped: FiscalPeriod[] = data.map((r: any) => ({
          id: r.id, company: r.company, month: r.month,
          status: r.status, openedBy: r.opened_by, openedAt: r.opened_at,
          closedBy: r.closed_by, closedAt: r.closed_at,
        }));
        const all = _load().filter(p => p.company !== company);
        safeSave(KEY, [...all, ...mapped]);
      }
    } catch (e) {
      Logger.warn('Period', 'Supabase load failed', e);
    }
  },

  // ─────────────────────────────────────────────────────────────────────
  // Sprint 31 — 4-state period model + Year-End Close wrappers.
  //
  // The legacy 2-state methods above (openPeriod / closePeriod) keep
  // working — `status` column is preserved. The new column
  // `fiscal_periods.period_state` carries the richer 4-state value used
  // by the Sprint-31 trigger + UIs.
  // ─────────────────────────────────────────────────────────────────────

  /** Read the 4-state period_state directly from Supabase. */
  getPeriodState: async (company: Company, month: string): Promise<PeriodState> => {
    try {
      const { data } = await supabase
        .from('fiscal_periods')
        .select('period_state, status')
        .eq('company', company)
        .eq('month', month)
        .limit(1)
        .single();
      if (!data) return 'Open';
      const ps = (data as any).period_state as PeriodState | null;
      if (ps) return ps;
      // Fallback for legacy rows where period_state hasn't been backfilled
      const legacy = (data as any).status as string | null;
      if (legacy === 'Closed') return 'Hard-Close';
      return 'Open';
    } catch {
      return 'Open';                           // fail open — local writes still queue
    }
  },

  /** Move a period into a new 4-state value. Caller is responsible for
   * confirming with the user before transitioning to Hard-Close / Locked. */
  setPeriodState: async (
    company: Company,
    month:   string,
    next:    PeriodState,
    actor:   string,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const id = `${company}-${month}`;
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        period_state: next,
        // Mirror into legacy `status` so PeriodManager continues to work
        status: next === 'Open' ? 'Open' : 'Closed',
        updated_at: now,
      };
      if (next === 'Soft-Close') { patch.soft_closed_at = now; patch.soft_closed_by = actor; }
      if (next === 'Hard-Close') { patch.hard_closed_at = now; patch.hard_closed_by = actor; }
      if (next === 'Locked')     { patch.locked_at      = now; patch.locked_by      = actor; }
      // Make sure the row exists first (use upsert with insert defaults).
      const { error } = await supabase
        .from('fiscal_periods')
        .upsert({
          id, company, month,
          opened_by: actor,
          opened_at: now,
          ...patch,
        }, { onConflict: 'id' });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'unknown' };
    }
  },

  /**
   * Sprint 31 Year-End Close wizard backend call. Posts the consolidated
   * P&L → Retained Earnings JV and locks all 12 months. Idempotent on the
   * server (re-running returns the existing JV id without re-posting).
   */
  runYearEndClose: async (
    company: Company,
    year:    number,
    actor:   string,
  ): Promise<{
    ok:                       boolean;
    jvId?:                    string;
    status?:                  'posted' | 'already_posted';
    accountsZeroed?:          number;
    retainedEarningsDelta?:   number;
    periodsLocked?:           number;
    error?:                   string;
  }> => {
    try {
      const { data, error } = await supabase.rpc('year_end_close', {
        p_company: company,
        p_year:    year,
        p_actor:   actor,
      });
      if (error) return { ok: false, error: error.message };
      const r: any = data || {};
      return {
        ok:                       true,
        jvId:                     r.jv_id,
        status:                   r.status,
        accountsZeroed:           Number(r.accounts_zeroed || 0),
        retainedEarningsDelta:    Number(r.retained_earnings_delta || 0),
        periodsLocked:            Number(r.periods_locked || 0),
      };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'unknown' };
    }
  },
};

/** Sprint 31 — 4-state period model. */
export type PeriodState = 'Open' | 'Soft-Close' | 'Hard-Close' | 'Locked';
