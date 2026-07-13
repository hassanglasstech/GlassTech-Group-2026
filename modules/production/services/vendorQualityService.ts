/**
 * vendorQualityService.ts — plant-damage quality tracking (Phase 5).
 *
 * Pure quality ledger: which vendor damaged what glass, how. NO claim, NO GL —
 * the vendor_quality_defects table has no financial columns by design. Direct
 * Supabase read/write (company-scoped) — this is an occasional QC report, not a
 * high-frequency offline-critical flow, so it needs no two-tier sync plumbing.
 */

import { supabase } from '@/src/services/supabaseClient';
import { activeCompany } from '@/modules/shared/utils/activeCompany';
import { Logger } from '@/modules/shared/services/logger';

export const VENDOR_DEFECT_TYPES = ['Breakage', 'Bend', 'Bubble', 'Scratch', 'Chipping'] as const;
export type VendorDefectType = typeof VENDOR_DEFECT_TYPES[number];

export interface VendorDefect {
  id: string;
  company: string;
  pieceId?: string;
  dispatchId?: string;
  vendorName?: string;
  serviceType?: string;
  glassType?: string;
  thickness?: string;
  defectType: string;
  qty: number;
  notes?: string;
  reportedBy?: string;
  reportedAt?: string;
}

const toRow = (d: VendorDefect): Record<string, unknown> => ({
  id: d.id, company: d.company,
  piece_id: d.pieceId || null, dispatch_id: d.dispatchId || null,
  vendor_name: d.vendorName || null, service_type: d.serviceType || null,
  glass_type: d.glassType || null, thickness: d.thickness || null,
  defect_type: d.defectType, qty: d.qty || 1, notes: d.notes || null,
  reported_by: d.reportedBy || null,
});

const fromRow = (r: Record<string, unknown>): VendorDefect => ({
  id: String(r.id), company: String(r.company),
  pieceId: (r.piece_id as string) || undefined, dispatchId: (r.dispatch_id as string) || undefined,
  vendorName: (r.vendor_name as string) || undefined, serviceType: (r.service_type as string) || undefined,
  glassType: (r.glass_type as string) || undefined, thickness: (r.thickness as string) || undefined,
  defectType: String(r.defect_type), qty: Number(r.qty ?? 1), notes: (r.notes as string) || undefined,
  reportedBy: (r.reported_by as string) || undefined, reportedAt: (r.reported_at as string) || undefined,
});

export const VendorQualityService = {
  reportDefect: async (d: VendorDefect): Promise<{ error?: string }> => {
    try {
      const { error } = await supabase.from('vendor_quality_defects').insert(toRow(d));
      if (error) { Logger.error('VendorQuality', 'reportDefect failed', error); return { error: error.message }; }
      return {};
    } catch (e) {
      Logger.error('VendorQuality', 'reportDefect exception', e);
      return { error: (e as Error).message };
    }
  },

  getDefects: async (companyArg?: string): Promise<VendorDefect[]> => {
    const company = companyArg || activeCompany();
    try {
      const { data, error } = await supabase
        .from('vendor_quality_defects')
        .select('*')
        .eq('company', company)
        .order('reported_at', { ascending: false });
      if (error) { Logger.error('VendorQuality', 'getDefects failed', error); return []; }
      return ((data as Array<Record<string, unknown>>) ?? []).map(fromRow);
    } catch (e) {
      Logger.error('VendorQuality', 'getDefects exception', e);
      return [];
    }
  },
};
