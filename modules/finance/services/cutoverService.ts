/**
 * cutoverService.ts — Sprint 30
 *
 * Manages the go-live cutover snapshot per company:
 *   - Get/save snapshot
 *   - Flip individual checklist booleans
 *   - Lock the snapshot (prevents back-dating)
 *
 * Used by CutoverWizard.tsx and the bulk-import wizards.
 */

import { supabase } from '@/src/services/supabaseClient';

export type CutoverStatus = 'pending' | 'in_progress' | 'completed' | 'locked';

export interface CutoverSnapshot {
  id?:               string;
  company:           string;
  cutover_date:      string | null;       // YYYY-MM-DD
  status:            CutoverStatus;
  masters_loaded:    boolean;
  stock_ob_done:     boolean;
  gl_ob_done:        boolean;
  ar_ob_done:        boolean;
  ap_ob_done:        boolean;
  notes:             string | null;
  locked_at:         string | null;
  locked_by:         string | null;
  created_at?:       string;
  updated_at?:       string;
}

export interface ImportLogRow {
  company:        string;
  import_type:    'clients' | 'products' | 'ar_opening' | 'ap_opening';
  file_name:      string;
  rows_attempted: number;
  rows_succeeded: number;
  rows_failed:    number;
  error_details:  Array<{ row: number; error: string }>;
  imported_by?:   string;
  imported_at?:   string;   // set server-side
}

interface Result<T> { data?: T; error?: string }

// ── 1. Load snapshot (create blank if missing) ────────────────────────────────
export const loadCutoverSnapshot = async (company: string): Promise<Result<CutoverSnapshot>> => {
  try {
    const { data, error } = await supabase
      .from('cutover_snapshot')
      .select('*')
      .eq('company', company)
      .maybeSingle();

    if (error) return { error: error.message };

    if (data) return { data: data as CutoverSnapshot };

    // No snapshot yet — return blank skeleton (not persisted)
    const blank: CutoverSnapshot = {
      company,
      cutover_date:   null,
      status:         'pending',
      masters_loaded: false,
      stock_ob_done:  false,
      gl_ob_done:     false,
      ar_ob_done:     false,
      ap_ob_done:     false,
      notes:          null,
      locked_at:      null,
      locked_by:      null,
    };
    return { data: blank };
  } catch (e) {
    return { error: (e as Error).message };
  }
};

// ── 2. Save (upsert) snapshot ────────────────────────────────────────────────
export const saveCutoverSnapshot = async (
  snapshot: CutoverSnapshot,
): Promise<Result<CutoverSnapshot>> => {
  try {
    const payload = {
      ...snapshot,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('cutover_snapshot')
      .upsert(payload, { onConflict: 'company' })
      .select()
      .single();

    if (error) return { error: error.message };
    return { data: data as CutoverSnapshot };
  } catch (e) {
    return { error: (e as Error).message };
  }
};

// ── 3. Mark a single checklist item complete ─────────────────────────────────
export const markChecklistItem = async (
  company:  string,
  key:      'masters_loaded' | 'stock_ob_done' | 'gl_ob_done' | 'ar_ob_done' | 'ap_ob_done',
  done:     boolean,
): Promise<Result<CutoverSnapshot>> => {
  const cur = await loadCutoverSnapshot(company);
  if (cur.error || !cur.data) return { error: cur.error || 'no snapshot' };

  const next: CutoverSnapshot = {
    ...cur.data,
    [key]: done,
    status: cur.data.status === 'locked' ? 'locked' : 'in_progress',
  };
  return saveCutoverSnapshot(next);
};

// ── 4. Lock the snapshot (prevents back-dating via assert_cutover_open RPC) ──
export const lockCutover = async (
  company:   string,
  lockedBy:  string,
): Promise<Result<CutoverSnapshot>> => {
  const cur = await loadCutoverSnapshot(company);
  if (cur.error || !cur.data) return { error: cur.error || 'no snapshot' };

  if (!cur.data.cutover_date) {
    return { error: 'Set a cutover date before locking.' };
  }

  // Require all 5 checklist items
  const checklist: Array<keyof CutoverSnapshot> = [
    'masters_loaded', 'stock_ob_done', 'gl_ob_done', 'ar_ob_done', 'ap_ob_done',
  ];
  const incomplete = checklist.filter(k => !cur.data![k]);
  if (incomplete.length > 0) {
    return { error: `Incomplete checklist: ${incomplete.join(', ')}` };
  }

  const next: CutoverSnapshot = {
    ...cur.data,
    status:    'locked',
    locked_at: new Date().toISOString(),
    locked_by: lockedBy,
  };
  return saveCutoverSnapshot(next);
};

// ── 5. Log a CSV import (audit) ──────────────────────────────────────────────
export const logImport = async (row: ImportLogRow): Promise<Result<{ id: string }>> => {
  try {
    const { data, error } = await supabase
      .from('csv_import_logs')
      .insert({
        ...row,
        imported_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) return { error: error.message };
    return { data: { id: data.id as string } };
  } catch (e) {
    return { error: (e as Error).message };
  }
};

// ── 6. Recent imports for a company (latest 10) ──────────────────────────────
export const recentImports = async (
  company: string,
  limit:   number = 10,
): Promise<Result<ImportLogRow[]>> => {
  try {
    const { data, error } = await supabase
      .from('csv_import_logs')
      .select('*')
      .eq('company', company)
      .order('imported_at', { ascending: false })
      .limit(limit);

    if (error) return { error: error.message };
    return { data: (data ?? []) as ImportLogRow[] };
  } catch (e) {
    return { error: (e as Error).message };
  }
};
