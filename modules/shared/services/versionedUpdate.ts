/**
 * versionedUpdate.ts — Sprint 1 / Sprint 2 helper
 *
 * Wraps the `update_with_version` Postgres RPC for optimistic concurrency
 * on shared records. When two users edit the same quotation/invoice/etc.
 * the second save throws `version_conflict` so the UI can prompt a reload
 * instead of silently overwriting User A's changes.
 *
 * Usage:
 *   const result = await updateWithVersion(
 *     'quotations',
 *     quotation.id,
 *     { status: 'Approved', approvedBy: user.email },
 *     quotation.version || 1,
 *   );
 *   if (result.error === 'version_conflict') {
 *     toast.error('Someone else edited this record. Reload to see latest.');
 *     return;
 *   }
 *
 * Sprint 2 will add `version` column to the affected tables and seed all
 * rows to v=1. Until then, every row reads as v=1 by default (RPC handles
 * missing field gracefully).
 */

import { supabase } from '../../../src/services/supabaseClient';

export type VersionedTable =
  | 'quotations'
  | 'invoices'
  | 'products'
  | 'store_items'
  | 'clients'
  | 'production_pieces';

export interface VersionedUpdateResult<T = unknown> {
  data: { id: string; version: number; data: T } | null;
  error: 'version_conflict' | 'row_not_found' | 'invalid_table' | string | null;
}

export async function updateWithVersion<T = unknown>(
  table: VersionedTable,
  id: string,
  patch: Record<string, unknown>,
  expectedVersion: number,
): Promise<VersionedUpdateResult<T>> {
  try {
    const { data, error } = await supabase.rpc('update_with_version', {
      p_table:             table,
      p_id:                id,
      p_patch:             patch,
      p_expected_version:  expectedVersion,
    });
    if (error) {
      const msg = error.message || '';
      if (msg.startsWith('version_conflict')) return { data: null, error: 'version_conflict' };
      if (msg.startsWith('row_not_found'))    return { data: null, error: 'row_not_found' };
      if (msg.startsWith('invalid_table'))    return { data: null, error: 'invalid_table' };
      return { data: null, error: msg };
    }
    return { data: data as VersionedUpdateResult<T>['data'], error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'rpc_failed';
    return { data: null, error: msg };
  }
}
