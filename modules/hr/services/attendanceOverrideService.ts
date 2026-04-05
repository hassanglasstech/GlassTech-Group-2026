/**
 * attendanceOverrideService.ts — Phase 8
 * Supabase-primary service for attendance manual overrides.
 * Replaces direct localStorage access in AttendanceRegister + PayrollManagement.
 *
 * Shape mirrors existing localStorage format:
 *   { [employeeId]: { absent, allowedAbsent, lates, sunday, ot, manualLoanDeduction, reqRef } }
 *
 * Requires migration 008_attendance_overrides_config.sql
 */

import { supabase } from '@/src/services/supabaseClient';
import { Logger } from '@/modules/shared/services/logger';

export type OverrideData = {
  absent:               number;
  manualAbsent?:        number;
  allowedAbsent:        number;
  lates:                number;
  sunday:               number;
  ot:                   number;
  manualLoanDeduction:  number;
  reqRef?:              string;
};

export type OverrideMap = Record<string, OverrideData>;

const LS_KEY = (month: string) => `gtk_erp_summary_overrides_${month}`;

// ── Local helpers ─────────────────────────────────────────────────────────────
const getLocal  = (month: string): OverrideMap => {
  try { return JSON.parse(localStorage.getItem(LS_KEY(month)) || '{}'); } catch { return {}; }
};
const saveLocal = (month: string, data: OverrideMap) => {
  try { localStorage.setItem(LS_KEY(month), JSON.stringify(data)); } catch {}
};

// ── Row mapper ────────────────────────────────────────────────────────────────
const rowToOverride = (r: any): OverrideData => ({
  absent:              Number(r.absent              || 0),
  manualAbsent:        Number(r.manual_absent       || 0),
  allowedAbsent:       Number(r.allowed_absent      || 0),
  lates:               Number(r.lates               || 0),
  sunday:              Number(r.sunday              || 0),
  ot:                  Number(r.ot                  || 0),
  manualLoanDeduction: Number(r.manual_loan_deduction ?? -1),
  reqRef:              r.req_ref || undefined,
});

// ── Public API ────────────────────────────────────────────────────────────────

export const AttendanceOverrideService = {

  /** Load all overrides for company+month as { [employeeId]: OverrideData } */
  load: async (company: string, month: string): Promise<OverrideMap> => {
    try {
      const { data, error } = await supabase
        .from('attendance_overrides')
        .select('*')
        .eq('company', company)
        .eq('month', month);

      if (error || !data) return getLocal(month);

      const result: OverrideMap = {};
      data.forEach((r: any) => { result[r.employee_id] = rowToOverride(r); });

      // Merge with localStorage (localStorage wins on conflicts — backwards compat)
      const local = getLocal(month);
      Object.keys(local).forEach(empId => {
        if (!result[empId]) result[empId] = local[empId];
      });

      // Update local cache
      saveLocal(month, result);
      return result;
    } catch {
      return getLocal(month);
    }
  },

  /** Save one employee's override */
  save: async (
    company: string,
    month: string,
    employeeId: string,
    data: OverrideData
  ): Promise<void> => {
    // Always update local immediately
    const current = getLocal(month);
    current[employeeId] = data;
    saveLocal(month, current);

    // Push to Supabase
    try {
      const id = `${company}_${employeeId}_${month}`;
      const { error } = await supabase.from('attendance_overrides').upsert([{
        id,
        company,
        employee_id:          employeeId,
        month,
        absent:               data.absent,
        allowed_absent:       data.allowedAbsent,
        lates:                data.lates,
        sunday:               data.sunday,
        ot:                   data.ot,
        manual_loan_deduction:data.manualLoanDeduction,
        req_ref:              data.reqRef || null,
        updated_at:           new Date().toISOString(),
      }], { onConflict: 'id' });
      if (error) Logger.warn('AttendanceOverride', 'Supabase save failed', error);
    } catch (e) {
      Logger.warn('AttendanceOverride', 'Supabase unavailable', e);
    }
  },

  /** Clear all overrides for company+month */
  clear: async (company: string, month: string): Promise<void> => {
    localStorage.removeItem(LS_KEY(month));
    try {
      await supabase
        .from('attendance_overrides')
        .delete()
        .eq('company', company)
        .eq('month', month);
    } catch (e) {
      Logger.warn('AttendanceOverride', 'Supabase clear failed', e);
    }
  },

  /** Sync localStorage → Supabase (call once on first load for data migration) */
  migrateFromLocalStorage: async (company: string, month: string): Promise<void> => {
    const local = getLocal(month);
    if (Object.keys(local).length === 0) return;

    const rows = Object.entries(local).map(([empId, d]) => ({
      id:                   `${company}_${empId}_${month}`,
      company,
      employee_id:          empId,
      month,
      absent:               d.absent,
      allowed_absent:       d.allowedAbsent,
      lates:                d.lates,
      sunday:               d.sunday,
      ot:                   d.ot,
      manual_loan_deduction:d.manualLoanDeduction,
      req_ref:              d.reqRef || null,
      updated_at:           new Date().toISOString(),
    }));

    try {
      await supabase.from('attendance_overrides').upsert(rows, { onConflict: 'id' });
      Logger.info('AttendanceOverride', `Migrated ${rows.length} overrides for ${company} ${month}`);
    } catch (e) {
      Logger.warn('AttendanceOverride', 'Migration failed', e);
    }
  },
};
