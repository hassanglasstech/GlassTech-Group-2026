import { initDB } from './db';
import { toast } from 'sonner';

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
    // Must be array for collection keys
    if (defaultValue === '[]' && !Array.isArray(parsed)) {
      console.warn(`[Storage] Corrupted data in ${key} — not an array. Resetting.`);
      localStorage.removeItem(key);
      return [];
    }
    return parsed;
  } catch (e) {
    console.error(`[Storage] Corrupted data in ${key}. Resetting.`, e);
    try { localStorage.removeItem(key); } catch {}
    return JSON.parse(defaultValue);
  }
};

// ── Safe localStorage write ───────────────────────────────────────────
export const safeSave = (key: string, data: any): boolean => {
  try {
    const serialized = JSON.stringify(data);
    // Check storage quota (rough estimate: 5MB typical)
    const currentUsage = Object.keys(localStorage)
      .reduce((sum, k) => sum + (localStorage.getItem(k)?.length || 0), 0);
    if (currentUsage + serialized.length > 4.5 * 1024 * 1024) {
      toast.error('Storage nearly full — please backup and clear old data.', { duration: 6000 });
      console.error(`[Storage] Quota warning: ${Math.round(currentUsage/1024)}KB used`);
      return false;
    }
    localStorage.setItem(key, serialized);
    return true;
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError') {
      toast.error('Storage full — cannot save. Please backup data from Admin panel.', { duration: 8000, id: 'storage-full' });
    } else {
      toast.error(`Save failed: ${err?.message || 'Unknown error'}`, { duration: 4000 });
    }
    console.error(`[Storage] Save failed for ${key}:`, err);
    return false;
  }
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
      isHealthy:  totalBytes < 4 * 1024 * 1024,
    };
  } catch {
    return { totalKeys: 0, erpKeys: 0, totalKB: 0, erpKB: 0, usedPercent: 0, isHealthy: true };
  }
};

// ── Schema version management ─────────────────────────────────────────
const SCHEMA_VERSION_KEY = 'gt_schema_version';
const CURRENT_SCHEMA_VERSION = 3; // increment when data shape changes

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
