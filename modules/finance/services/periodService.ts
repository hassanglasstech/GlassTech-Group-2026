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
};
