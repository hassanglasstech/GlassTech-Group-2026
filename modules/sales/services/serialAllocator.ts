/**
 * serialAllocator.ts — Phase-2 atomic serial allocator wrapper
 *
 * Wraps the Postgres `allocate_serial(company, doc_type, year, min_seed)` RPC
 * (migration 033) with a localStorage fallback so single-user/offline mode
 * still issues monotonic numbers when the RPC is unreachable.
 *
 * Used by:
 *   - useGlasscoQuotations  → 'GT-SO', 'GT-QUT', 'DRF'
 *   - deliveryInvoiceService → 'INV'
 *   - creditNoteService      → 'CN'
 *
 * Usage:
 *   const seq = await allocateSerial('Glassco', 'GT-SO', 2026, 2523);
 *   const finalId = `GT-SO-GLS-${mmyy}-${String(seq).padStart(4,'0')}`;
 */

import { supabase } from '../../../src/services/supabaseClient';
import { errMsg } from '@/modules/shared/services/utils';
import { Logger } from '@/modules/shared/services/logger';

const localKey = (company: string, docType: string, year: number) =>
  `gtk_erp_serial_${company}_${docType}_${year}`;

/** Local fallback — used when Supabase RPC is unreachable (offline). */
const allocateLocal = (company: string, docType: string, year: number, minSeed: number): number => {
  const key = localKey(company, docType, year);
  // localStorage can throw (private-mode / quota exceeded). Read and write
  // are guarded independently so a persistence failure still returns a usable
  // serial rather than crashing the caller mid-document-creation.
  let current = 0;
  try {
    current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
  } catch (err: unknown) {
    Logger.warn('Sales', `serialAllocator local read failed for ${key} — assuming 0`, err);
  }
  const next = Math.max(current + 1, minSeed);
  try {
    localStorage.setItem(key, String(next));
  } catch (err: unknown) {
    // Degrade gracefully: the in-memory `next` is still returned and used.
    Logger.error('Sales', `serialAllocator local persist failed for ${key} — serial ${next} not cached`, err);
  }
  return next;
};

/**
 * Allocate the next monotonic serial for (company, doc_type, year).
 * Always returns a positive integer. Never throws — falls back to local
 * counter if the RPC is unavailable.
 */
export async function allocateSerial(
  company: string,
  docType: string,
  year: number,
  minSeed: number = 1
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('allocate_serial', {
      p_company:  company,
      p_doc_type: docType,
      p_year:     year,
      p_min_seed: minSeed,
    });
    if (error) {
      // Logger instead of console.warn
      Logger.warn('Sales', `serialAllocator RPC error for ${company}/${docType}/${year} — falling back to local counter`, error.message);
      return allocateLocal(company, docType, year, minSeed);
    }
    // Postgres `bigint` results arrive as strings via PostgREST (precision-safe),
    // so a raw `typeof data === 'number'` guard would reject a valid cloud serial
    // and silently fall back to the local counter — risking a duplicate that only
    // surfaces as a unique-constraint violation when the offline row later syncs.
    // Coerce defensively and accept any finite, positive value.
    const seq = typeof data === 'number' ? data : Number(data);
    if (Number.isFinite(seq) && seq > 0) {
      // Mirror the allocated number into local cache so subsequent
      // local fallback calls don't regress below the cloud value.
      // guard localStorage — a quota/private-mode failure must not lose
      // the cloud-allocated serial (it's already authoritative, just return it).
      try {
        const key = localKey(company, docType, year);
        const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
        if (seq > current) localStorage.setItem(key, String(seq));
      } catch (err: unknown) {
        Logger.warn('Sales', `serialAllocator failed to mirror cloud serial ${seq} to local cache`, err);
      }
      return seq;
    }
    return allocateLocal(company, docType, year, minSeed);
  } catch (err: unknown) {
    // Logger instead of console.warn
    Logger.warn('Sales', `serialAllocator RPC exception for ${company}/${docType}/${year} — falling back to local counter`, errMsg(err));
    return allocateLocal(company, docType, year, minSeed);
  }
}
