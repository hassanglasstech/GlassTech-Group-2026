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

const localKey = (company: string, docType: string, year: number) =>
  `gtk_erp_serial_${company}_${docType}_${year}`;

/** Local fallback — used when Supabase RPC is unreachable (offline). */
const allocateLocal = (company: string, docType: string, year: number, minSeed: number): number => {
  const key = localKey(company, docType, year);
  const current = parseInt(localStorage.getItem(key) || '0', 10);
  const next = Math.max(current + 1, minSeed);
  localStorage.setItem(key, String(next));
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
      console.warn(`[serialAllocator] RPC error for ${company}/${docType}/${year}: ${error.message} — falling back to local counter`);
      return allocateLocal(company, docType, year, minSeed);
    }
    if (typeof data === 'number' && data > 0) {
      // Mirror the allocated number into local cache so subsequent
      // local fallback calls don't regress below the cloud value.
      const key = localKey(company, docType, year);
      const current = parseInt(localStorage.getItem(key) || '0', 10);
      if (data > current) localStorage.setItem(key, String(data));
      return data;
    }
    return allocateLocal(company, docType, year, minSeed);
  } catch (err: unknown) {
    console.warn(`[serialAllocator] RPC exception for ${company}/${docType}/${year}: ${errMsg(err)} — falling back to local counter`);
    return allocateLocal(company, docType, year, minSeed);
  }
}
