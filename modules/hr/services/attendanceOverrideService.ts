/**
 * attendanceOverrideService.ts — Phase 8 (DB-Primary Refactor)
 * Supabase-ONLY service for attendance manual overrides.
 * Replaces direct localStorage access in AttendanceRegister + PayrollManagement.
 *
 * Shape mirrors existing localStorage format:
 *   { [employeeId]: { absent, allowedAbsent, lates, sunday, ot, manualLoanDeduction, reqRef } }
 *
 * Requires migration 008_attendance_overrides_config.sql
 *
 * ARCHITECTURE: DB-primary. No localStorage. All reads/writes go through Supabase.
 * On Supabase error, load() throws — callers must handle and surface the error to the user.
 * save() and clear() are atomic: failure throws, no silent fire-and-forget.
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

  /**
   * Load all overrides for company+month as { [employeeId]: OverrideData }
   * Throws on Supabase error — callers must catch and surface to UI.
   */
  load: async (company: string, month: string): Promise<OverrideMap> => {
    const { data, error } = await supabase
      .from('attendance_overrides')
      .select('*')
      .eq('company', company)
      .eq('month', month);

    if (error) {
      Logger.warn('AttendanceOverride', 'Supabase load failed', error);
      throw new Error(`Failed to load attendance overrides: ${error.message}`);
    }

    const result: OverrideMap = {};
    (data ?? []).forEach((r: any) => { result[r.employee_id] = rowToOverride(r); });
    return result;
  },

  /**
   * Save one employee's override — atomic Supabase write.
   * Throws on failure; caller must catch and show UI error / rollback optimistic state.
   */
  save: async (
    company: string,
    month: string,
    employeeId: string,
    data: OverrideData
  ): Promise<void> => {
    const id = `${company}_${employeeId}_${month}`;
    const { error } = await supabase.from('attendance_overrides').upsert([{
      id,
      company,
      employee_id:           employeeId,
      month,
      absent:                data.absent,
      allowed_absent:        data.allowedAbsent,
      lates:                 data.lates,
      sunday:                data.sunday,
      ot:                    data.ot,
      manual_loan_deduction: data.manualLoanDeduction,
      req_ref:               data.reqRef || null,
      updated_at:            new Date().toISOString(),
    }], { onConflict: 'id' });

    if (error) {
      Logger.warn('AttendanceOverride', 'Supabase save failed', error);
      throw new Error(`Failed to save attendance override for ${employeeId}: ${error.message}`);
    }
  },

  /**
   * Clear all overrides for company+month — atomic Supabase delete.
   * Throws on failure.
   */
  clear: async (company: string, month: string): Promise<void> => {
    const { error } = await supabase
      .from('attendance_overrides')
      .delete()
      .eq('company', company)
      .eq('month', month);

    if (error) {
      Logger.warn('AttendanceOverride', 'Supabase clear failed', error);
      throw new Error(`Failed to clear attendance overrides for ${month}: ${error.message}`);
    }
  },
};
