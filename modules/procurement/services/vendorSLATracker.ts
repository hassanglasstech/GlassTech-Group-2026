/**
 * vendorSLATracker.ts — Sprint 13
 *
 * Detects vendor SLA breaches and persists them to sla_breaches.
 * Two entry points:
 *   1. checkAllOpenDispatches() — run on app boot + every login (manual cron)
 *   2. detectLicenseExpiries()  — driver license / permit expiring < 30 days
 *
 * Uses the log_sla_breach RPC (idempotent — re-running won't create
 * duplicates for the same dispatch + breach_type).
 */

import { supabase } from '@/src/services/supabaseClient';
import { ProductionService } from '@/modules/production/services/productionService';
import type { Company } from '@/modules/shared/types';

// ── Types ─────────────────────────────────────────────────────────────

export type BreachType =
  | 'LATE_RETURN'
  | 'DAMAGED'
  | 'LOST'
  | 'INVOICE_MISMATCH'
  | 'LICENSE_EXPIRY';

export interface SlaBreach {
  id:             number;
  company:        string;
  vendor_name:    string;
  dispatch_id:    string | null;
  breach_type:    BreachType;
  expected_date:  string | null;
  actual_date:    string | null;
  delay_days:     number | null;
  detected_at:    string;
  notes:          string | null;
  resolved:       boolean;
  resolved_at:    string | null;
  resolved_by:    string | null;
}

export interface DriverLicense {
  id:              number;
  company:         string;
  driver_name:     string;
  driver_phone:    string | null;
  cnic:            string | null;
  license_no:      string | null;
  license_expiry:  string | null;
  permit_no:       string | null;
  permit_expiry:   string | null;
  is_active:       boolean;
}

interface ServiceResult<T = void> {
  data?:  T;
  error?: string;
}

// ── Internals ─────────────────────────────────────────────────────────

function asError(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return 'Unknown error';
}

function daysBetween(a: string | Date, b: string | Date): number {
  const A = typeof a === 'string' ? new Date(a) : a;
  const B = typeof b === 'string' ? new Date(b) : b;
  return Math.floor((B.getTime() - A.getTime()) / 86_400_000);
}

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Public API ────────────────────────────────────────────────────────

export const VendorSLATracker = {
  /**
   * Scan all dispatches for the active company. Logs LATE_RETURN
   * for any not-yet-returned tempering dispatch where today >
   * expectedReturnDate.
   *
   * @returns count of new breaches logged (existing ones aren't double-counted)
   */
  async checkAllOpenDispatches(company: Company): Promise<ServiceResult<number>> {
    try {
      const dispatches = ProductionService.getTemperingDispatches()
        .filter((d: { company: string; serviceType?: string; status?: string }) =>
          d.company === company
            && d.serviceType === 'Tempering'
            && d.status !== 'Received'
            && d.status !== 'Cancelled');

      const today = todayISO();
      let newCount = 0;

      for (const d of dispatches as Array<{
        id: string; plantName?: string; expectedReturnDate?: string;
      }>) {
        const expected = d.expectedReturnDate;
        if (!expected) continue;
        if (expected >= today) continue;   // not yet overdue

        const r = await supabase.rpc('log_sla_breach', {
          p_company:       company,
          p_vendor_name:   d.plantName ?? 'Unknown',
          p_dispatch_id:   d.id,
          p_breach_type:   'LATE_RETURN',
          p_expected_date: expected,
          p_actual_date:   today,
          p_notes:         `Auto-detected: dispatch overdue by ${daysBetween(expected, today)} days`,
        });
        if (!r.error && r.data) newCount += 1;
      }

      return { data: newCount };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Find drivers whose licence or permit expires within `days` days.
   * Logs LICENSE_EXPIRY breach (one per driver per breach type).
   */
  async detectLicenseExpiries(
    company: Company,
    days:    number = 30,
  ): Promise<ServiceResult<DriverLicense[]>> {
    try {
      const cutoff = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('driver_licenses')
        .select('*')
        .eq('company', company)
        .eq('is_active', true)
        .or(`license_expiry.lte.${cutoff},permit_expiry.lte.${cutoff}`);

      if (error) return { error: error.message };
      const expiring = (data ?? []) as DriverLicense[];

      // Persist breach rows so the supervisor inbox surfaces them
      for (const dl of expiring) {
        const expirySoonest =
          dl.license_expiry && (!dl.permit_expiry || dl.license_expiry < dl.permit_expiry)
            ? dl.license_expiry
            : dl.permit_expiry;
        if (!expirySoonest) continue;

        await supabase.rpc('log_sla_breach', {
          p_company:       company,
          p_vendor_name:   dl.driver_name,           // re-use vendor_name slot for driver
          p_dispatch_id:   null,
          p_breach_type:   'LICENSE_EXPIRY',
          p_expected_date: expirySoonest,
          p_actual_date:   todayISO(),
          p_notes:         `Driver document expiring on ${expirySoonest}`,
        });
      }

      return { data: expiring };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * List unresolved breaches for the supervisor inbox.
   */
  async getOpenBreaches(company: Company): Promise<ServiceResult<SlaBreach[]>> {
    try {
      const { data, error } = await supabase
        .from('sla_breaches')
        .select('*')
        .eq('company', company)
        .eq('resolved', false)
        .order('detected_at', { ascending: false })
        .limit(100);
      if (error) return { error: error.message };
      return { data: (data ?? []) as SlaBreach[] };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Mark a breach as resolved (vendor delivered late but did deliver,
   * etc.). Manual action from supervisor UI.
   */
  async resolveBreach(
    breachId:  number,
    resolvedBy: string,
  ): Promise<ServiceResult<void>> {
    try {
      const { error } = await supabase
        .from('sla_breaches')
        .update({
          resolved:    true,
          resolved_at: new Date().toISOString(),
          resolved_by: resolvedBy,
        })
        .eq('id', breachId);
      if (error) return { error: error.message };
      return {};
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * One-shot daily scan — call this from app boot or a daily cron.
   * Combines late-return + license expiry checks into one pass.
   */
  async runDailyScan(company: Company): Promise<ServiceResult<{
    lateReturns:        number;
    expiringDrivers:    number;
  }>> {
    const a = await this.checkAllOpenDispatches(company);
    const b = await this.detectLicenseExpiries(company);
    return {
      data: {
        lateReturns:     a.data ?? 0,
        expiringDrivers: b.data?.length ?? 0,
      },
      error: a.error ?? b.error,
    };
  },
};
