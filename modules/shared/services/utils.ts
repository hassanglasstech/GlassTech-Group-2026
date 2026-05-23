import { initDB } from './db';
import { toast } from 'sonner';
import { dbRead, dbWrite } from './supabaseDB';

// ── Phase 0 type-safety: narrow unknown errors to readable strings ────
// Use this instead of `(e as any).message` after `catch (e: unknown)`.
export const errMsg = (e: unknown, fallback: string = 'unknown error'): string => {
  if (e === null || e === undefined) return fallback;
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === 'string') return e || fallback;
  if (typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message;
    return m ? String(m) : fallback;
  }
  try { return JSON.stringify(e) || fallback; } catch { return fallback; }
};

// ── ASYNC: Fetch fresh data from Supabase, update cache ───────────────
// Use this in useEffect / component mount for live data
export const safeFetch = async (key: string): Promise<any[]> => {
  try {
    return await dbRead(key);
  } catch (err: any) {
    console.warn(`[safeFetch] Failed for ${key}:`, err.message);
    return safeParse(key);
  }
};

// ── Background IDB save ───────────────────────────────────────────────
export const bgSaveToIDB = async (storeName: string, items: any[]) => {
  try {
    const db = await initDB();
    const tx = db.transaction(storeName, 'readwrite');
    await Promise.all([
      tx.store.clear(),
      ...items.map(item => tx.store.put(item))
    ]);
    await tx.done;
  } catch (e) {
    console.warn(`[IDB] Background write failed for ${storeName}:`, e);
  }
};

// ── Safe localStorage read ────────────────────────────────────────────
export const safeParse = (key: string, defaultValue: string = '[]') => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return JSON.parse(defaultValue);
    const parsed = JSON.parse(item);
    // Must be array for collection keys — silent reset, no console.warn spam
    if (defaultValue === '[]' && !Array.isArray(parsed)) {
      localStorage.removeItem(key);
      return [];
    }
    return parsed;
  } catch (e) {
    try { localStorage.removeItem(key); } catch {}
    return JSON.parse(defaultValue);
  }
};

// ── Estimate current localStorage usage in bytes ──────────────────────
const getLocalStorageBytes = (): number => {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key) || '';
    // Each char ≈ 2 bytes in UTF-16 (browser internal)
    total += (key.length + value.length) * 2;
  }
  return total;
};

// Soft cap — well below the 5 MB hard limit so we never block writes
// to small/critical tables (auth tokens, settings, audit logs).
const LOCAL_STORAGE_SOFT_CAP = 3.5 * 1024 * 1024;

// Tables that grow large and are FINE to skip locally. Supabase is the
// source of truth; an in-memory cache (e.g. financeService._cache,
// products store) handles per-session reads. On offline reload these
// tables refetch from IndexedDB / Supabase, not localStorage.
const HEAVY_TABLES = new Set([
  'gtk_erp_products',
  'gtk_erp_store_items',
  'gtk_erp_ledger',
  'gtk_erp_quotations',
  'gtk_erp_invoices',
  'gtk_erp_stock_ledger',
  'gtk_erp_production_pieces',
  'gtk_erp_activity_logs',
]);

// ── Safe write: auto-sync pattern (Sprint 41) ─────────────────────────
//
// Two-mode behavior:
//
//  HEAVY tables (products, ledger, store_items, etc):
//    1. Write to localStorage as temporary offline queue
//    2. Async push to Supabase
//    3. On success → DELETE the localStorage entry (data lives in Supabase
//       + in-memory service cache; reads on boot fetch from Supabase)
//    4. On failure → entry stays as offline queue, retried later by SyncService
//
//  LIGHT tables (settings, audit log, branding):
//    Unchanged — write to localStorage + async Supabase push, no deletion.
//    These are small and useful as persistent local cache.
//
//  Why this matters: heavy tables were growing localStorage past the 5 MB
//  browser quota. Auto-deleting on successful sync keeps localStorage as a
//  true offline buffer, not an unbounded mirror of the database.
export const safeSave = (key: string, data: any): boolean => {
  try {
    let toSave = data;
    if (Array.isArray(data) && key.startsWith('gtk_erp')) {
      const now = new Date().toISOString();
      toSave = data.map((item: any) => {
        if (item && typeof item === 'object' && item.id) {
          return {
            ...item,
            updated_at: now,
            _updatedAt: now,
            _version: (item._version || 0) + 1,
            _createdAt: item._createdAt || now,
          };
        }
        return item;
      });
    }

    const isHeavy = HEAVY_TABLES.has(key);

    // ── 1. Write to localStorage as the offline queue / temp buffer ──
    let wroteLocal = false;
    try {
      localStorage.setItem(key, JSON.stringify(toSave));
      wroteLocal = true;
    } catch (quotaErr: unknown) {
      const isQuota = (quotaErr instanceof Error)
        && (quotaErr.name === 'QuotaExceededError' || /quota/i.test(quotaErr.message));
      if (isQuota && Array.isArray(toSave)) {
        // Strip heavy fields and retry once
        const HEAVY_FIELD: Record<string, string> = {
          gtk_erp_products: 'imageUrl',
          gtk_erp_clients:  'attachments',
        };
        const heavy = HEAVY_FIELD[key];
        if (heavy) {
          const slim = (toSave as Array<Record<string, unknown>>).map(item => {
            const { [heavy]: _drop, ...rest } = item || {};
            return rest;
          });
          try {
            localStorage.setItem(key, JSON.stringify(slim));
            wroteLocal = true;
            console.warn(`[safeSave] ${key}: quota — dropped "${heavy}" from local queue (${(toSave as unknown[]).length} rows).`);
          } catch {
            try { localStorage.removeItem(key); } catch { /* ignore */ }
          }
        } else {
          try { localStorage.removeItem(key); } catch { /* ignore */ }
          console.warn(`[safeSave] ${key}: quota — local queue skipped. Supabase still handles save.`);
        }
      }
      // Non-quota failures: Supabase is primary, swallow silently
    }

    // ── 2. Push to Supabase. For heavy tables, DELETE the local queue
    //       entry on success — that's what keeps localStorage bounded.
    if (Array.isArray(toSave)) {
      dbWrite(key, toSave)
        .then(() => {
          if (isHeavy && wroteLocal) {
            try {
              localStorage.removeItem(key);
              // Log only occasionally to avoid console spam
              if (Math.random() < 0.05) {
                console.debug(`[safeSave] ${key}: synced → local queue cleared.`);
              }
            } catch { /* ignore */ }
          }
        })
        .catch(err => {
          // Supabase push failed — keep the localStorage entry as offline
          // queue, SyncService will retry. We don't toast here because the
          // app may legitimately be offline.
          console.warn(`[safeSave] Supabase push pending for ${key} — kept in local queue:`, err?.message);
        });
    }

    // Heads-up when storage is getting heavy
    const currentBytes = getLocalStorageBytes();
    if (currentBytes > LOCAL_STORAGE_SOFT_CAP) {
      console.warn(`[safeSave] localStorage at ${(currentBytes/1024/1024).toFixed(2)} MB. Pending sync queue may be backed up — check network.`);
    }

    return true;
  } catch (err: any) {
    toast.error(`Save failed: ${err?.message || 'Unknown error'}`, { duration: 4000 });
    console.error(`[Storage] Save failed for ${key}:`, err);
    return false;
  }
};

// ── Stamp single record with audit fields ───────────────────────────
export const stampAudit = (record: any, userEmail?: string): any => {
  const now = new Date().toISOString();
  return {
    ...record,
    _createdAt: record._createdAt || now,
    _createdBy: record._createdBy || userEmail || 'system',
    _updatedAt: now,
    _updatedBy: userEmail || 'system',
    _version: (record._version || 0) + 1,
  };
};

// ── Optimistic lock check — true if safe to save ────────────────────
export const checkVersion = (existing: any, incoming: any): boolean => {
  if (!existing?._version || !incoming?._version) return true;
  return incoming._version >= existing._version;
};

// ── Async service wrapper ─────────────────────────────────────────────
// Wraps any async operation with standard error handling + toast
export const safeAsync = async <T>(
  operation: () => Promise<T>,
  opts: {
    errorMsg?:   string;
    fallback?:   T;
    silent?:     boolean;
    context?:    string;
  } = {}
): Promise<T | undefined> => {
  try {
    return await operation();
  } catch (err: any) {
    const msg = opts.errorMsg || err?.message || 'Operation failed';
    console.error(`[${opts.context || 'Service'}]`, msg, err);
    if (!opts.silent) {
      toast.error(msg, { duration: 4000 });
    }
    return opts.fallback;
  }
};

// ── Storage health check ──────────────────────────────────────────────
export const getStorageHealth = () => {
  try {
    const keys = Object.keys(localStorage);
    const erpKeys = keys.filter(k => k.startsWith('gtk_erp'));
    const totalBytes = keys.reduce((sum, k) => sum + (localStorage.getItem(k)?.length || 0), 0);
    const erpBytes   = erpKeys.reduce((sum, k) => sum + (localStorage.getItem(k)?.length || 0), 0);
    return {
      totalKeys:  keys.length,
      erpKeys:    erpKeys.length,
      totalKB:    Math.round(totalBytes / 1024),
      erpKB:      Math.round(erpBytes / 1024),
      usedPercent: Math.round((totalBytes / (5 * 1024 * 1024)) * 100),
      isHealthy:  true, // Supabase is primary — localStorage size no longer critical
      primaryDB:  'Supabase',
    };
  } catch {
    return { totalKeys: 0, erpKeys: 0, totalKB: 0, erpKB: 0, usedPercent: 0, isHealthy: true, primaryDB: 'Supabase' };
  }
};

// ── Prefetch multiple keys into cache (call on app start) ────────────
export const prefetchToCache = async (keys: string[]): Promise<void> => {
  await Promise.allSettled(keys.map(key => safeFetch(key)));
};

// ── Schema version management ─────────────────────────────────────────
const SCHEMA_VERSION_KEY = 'gt_schema_version';
const CURRENT_SCHEMA_VERSION = 4; // v4: added _updatedAt, _version, _createdAt audit fields

export const checkSchemaVersion = (): boolean => {
  try {
    const stored = parseInt(localStorage.getItem(SCHEMA_VERSION_KEY) || '0');
    if (stored < CURRENT_SCHEMA_VERSION) {
      console.log(`[Schema] Version mismatch: stored=${stored}, current=${CURRENT_SCHEMA_VERSION}`);
      localStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION));
      return false; // schema changed
    }
    return true;
  } catch {
    return true;
  }
};

// ── Null-safe deep get ────────────────────────────────────────────────
export const deepGet = (obj: any, path: string, fallback: any = null): any => {
  try {
    return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? fallback;
  } catch {
    return fallback;
  }
};

// ── Ensure array helper ───────────────────────────────────────────────
export const ensureArray = <T>(val: any): T[] => {
  if (Array.isArray(val)) return val;
  if (val === null || val === undefined) return [];
  return [val];
};

// ── Ensure number helper ──────────────────────────────────────────────
export const ensureNumber = (val: any, fallback = 0): number => {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
};

// ── Ensure string helper ──────────────────────────────────────────────
export const ensureString = (val: any, fallback = ''): string => {
  if (val === null || val === undefined) return fallback;
  return String(val);
};
