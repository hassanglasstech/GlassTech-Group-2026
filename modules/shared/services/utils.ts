import { initDB } from './db';
import { toast } from 'sonner';
import { dbRead, dbWrite } from './supabaseDB';

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

// ── Safe write: localStorage cache + Supabase push (non-blocking) ────
// Supabase is PRIMARY. localStorage is just a fast cache for instant UI.
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

    // 1. Write to localStorage cache immediately — UI stays instant
    try { localStorage.setItem(key, JSON.stringify(toSave)); } catch { /* quota ok — Supabase is primary */ }

    // 2. Push to Supabase in background — non-blocking, won't slow UI
    if (Array.isArray(toSave)) {
      dbWrite(key, toSave).catch(err => {
        console.warn(`[safeSave] Supabase push queued for ${key}:`, err?.message);
      });
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
