/**
 * concurrencyService.ts — Phase 4 (SA-05)
 *
 * Lightweight optimistic concurrency for critical Supabase records.
 *
 * Pattern: before saving a record, check if server updated_at
 * is newer than the version the user loaded. If yes → conflict.
 *
 * Usage:
 *   const guard = useConcurrencyGuard();
 *   const ok = await guard.check('quotations', record.id, record.updatedAt);
 *   if (!ok) return; // user dismissed or chose to overwrite
 *   // proceed with save
 */

import { supabase } from '@/src/services/supabaseClient';
import { toast }    from 'sonner';

export interface ConflictResult {
  hasConflict:       boolean;
  serverUpdatedAt:   string | null;
  serverUpdatedBy?:  string;
}

// ── Tables that support concurrency checks ────────────────────────────────────
type GuardedTable = 'quotations' | 'invoices' | 'ledger' | 'payroll' | 'employees';

// ── Check if server record is newer than client's loaded version ──────────────
export async function checkConcurrency(
  table:           GuardedTable,
  recordId:        string,
  localUpdatedAt?: string
): Promise<ConflictResult> {
  if (!localUpdatedAt) {
    // No baseline — new record, no conflict possible
    return { hasConflict: false, serverUpdatedAt: null };
  }

  try {
    const { data, error } = await supabase
      .from(table)
      .select('updated_at, updated_by')
      .eq('id', recordId)
      .maybeSingle();

    if (error || !data) {
      // Record not in Supabase yet (still localStorage-only) — safe to proceed
      return { hasConflict: false, serverUpdatedAt: null };
    }

    const serverTs = data.updated_at as string | null;
    if (!serverTs) return { hasConflict: false, serverUpdatedAt: null };

    const serverTime = new Date(serverTs).getTime();
    const localTime  = new Date(localUpdatedAt).getTime();

    if (serverTime > localTime + 2000) {
      // Server is >2s newer — genuine concurrent edit
      return {
        hasConflict:      true,
        serverUpdatedAt:  serverTs,
        serverUpdatedBy:  (data as any).updated_by || 'Another user',
      };
    }

    return { hasConflict: false, serverUpdatedAt: serverTs };
  } catch {
    // Network/Supabase unavailable — let the save proceed (offline mode)
    return { hasConflict: false, serverUpdatedAt: null };
  }
}

// ── Show conflict toast + return user decision ────────────────────────────────
export async function resolveConflict(result: ConflictResult): Promise<'overwrite' | 'cancel'> {
  return new Promise(resolve => {
    const serverDate = result.serverUpdatedAt
      ? new Date(result.serverUpdatedAt).toLocaleTimeString('en-PK')
      : 'unknown time';
    const who = result.serverUpdatedBy || 'Another user';

    toast.warning(
      `⚠️ Conflict: ${who} saved this record at ${serverDate}. Your changes will overwrite theirs.`,
      {
        duration:    10000,
        action: {
          label:   'Overwrite',
          onClick: () => resolve('overwrite'),
        },
        cancel: {
          label:   'Cancel',
          onClick: () => resolve('cancel'),
        },
        onDismiss: () => resolve('cancel'),
      }
    );
  });
}

// ── Combined: check + prompt ──────────────────────────────────────────────────
export async function guardedSave(
  table:           GuardedTable,
  recordId:        string,
  localUpdatedAt?: string,
  skipPrompt?:     boolean   // true = overwrite silently (background saves)
): Promise<boolean> {
  const result = await checkConcurrency(table, recordId, localUpdatedAt);

  if (!result.hasConflict) return true;   // safe to save

  if (skipPrompt) {
    // Background sync — warn but don't block
    console.warn(`[Concurrency] ${table}/${recordId} — server newer but saving anyway (background).`);
    return true;
  }

  const decision = await resolveConflict(result);
  return decision === 'overwrite';
}

// ── Hook for components ───────────────────────────────────────────────────────
export function useConcurrencyGuard() {
  return {
    /**
     * Returns true if save should proceed.
     * Returns false if user cancelled after a conflict warning.
     */
    check: (
      table:          GuardedTable,
      recordId:       string,
      localUpdatedAt?: string
    ) => guardedSave(table, recordId, localUpdatedAt),
  };
}

// ── Inject updated_at into upsert payloads ────────────────────────────────────
export function withTimestamp<T extends Record<string, any>>(record: T): T & { updated_at: string } {
  return { ...record, updated_at: new Date().toISOString() };
}
