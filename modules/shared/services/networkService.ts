/**
 * GLASSTECH ERP — Network & Supabase Error Handler (EH-Phase 4)
 *
 * Features:
 * 1. Supabase error code → user-friendly message
 * 2. Retry logic with exponential backoff
 * 3. Offline queue for failed writes
 * 4. Network state management
 */

import { toast } from 'sonner';

// ── Supabase error code mapping ───────────────────────────────────────
const SUPABASE_ERRORS: Record<string, string> = {
  // Auth errors
  'invalid_credentials':     'Invalid email or password.',
  'email_not_confirmed':     'Please confirm your email first.',
  'user_not_found':          'Account not found.',
  'session_expired':         'Session expired — please login again.',
  'invalid_token':           'Session invalid — please login again.',
  'token_expired':           'Session expired — please login again.',
  'JWT expired':             'Session expired — please login again.',

  // RLS / permissions
  '42501':                   'Access denied — insufficient permissions.',
  'PGRST301':                'Access denied — Row Level Security blocked this request.',
  'PGRST116':                'Record not found.',

  // Constraint errors
  '23505':                   'Duplicate record — this entry already exists.',
  '23503':                   'Cannot delete — this record is referenced elsewhere.',
  '23514':                   'Invalid value — check required fields.',
  '23502':                   'Required field missing — fill in all mandatory fields.',

  // Connection errors
  'ECONNREFUSED':            'Cannot connect to server. Check internet connection.',
  'ETIMEDOUT':               'Connection timed out. Check internet connection.',
  'NetworkError':            'Network error — check internet connection.',
  'Failed to fetch':         'Cannot reach server — check internet connection.',
  'Load failed':             'Cannot reach server — check internet connection.',

  // Storage errors
  'Bucket not found':        'File storage not configured.',
  'The object exceeded':     'File too large — maximum 5MB allowed.',
  'mime type':               'Invalid file type.',
};

// ── Translate any Supabase/network error to friendly message ─────────
export const translateError = (error: any): string => {
  if (!error) return 'Unknown error occurred.';

  const code    = error?.code    || '';
  const message = error?.message || String(error) || '';
  const hint    = error?.hint    || '';

  // Check code first
  if (SUPABASE_ERRORS[code]) return SUPABASE_ERRORS[code];

  // Check message fragments
  for (const [key, friendly] of Object.entries(SUPABASE_ERRORS)) {
    if (message.includes(key) || hint.includes(key)) return friendly;
  }

  // RLS hint
  if (message.includes('row-level security') || message.includes('RLS')) {
    return 'Access denied — contact administrator.';
  }

  // Network
  if (message.includes('fetch') || message.includes('network') || message.includes('connect')) {
    return 'Network error — check internet connection.';
  }

  // Auth
  if (message.includes('JWT') || message.includes('token') || message.includes('session')) {
    return 'Session expired — please login again.';
  }

  // Fallback — show technical but truncated
  return message.slice(0, 100) || 'Operation failed. Please try again.';
};

// ── Retry with exponential backoff ────────────────────────────────────
export const withRetry = async <T>(
  fn:          () => Promise<T>,
  opts: {
    maxRetries?:   number;   // default 3
    delayMs?:      number;   // base delay, default 1000ms
    retryOn?:      (err: any) => boolean;  // custom retry condition
    onRetry?:      (attempt: number, err: any) => void;
    context?:      string;
  } = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    delayMs    = 1000,
    retryOn    = isRetryableError,
    onRetry,
    context    = 'Operation',
  } = opts;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      const shouldRetry = attempt < maxRetries && retryOn(err);
      if (!shouldRetry) break;

      const wait = delayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.warn(`[${context}] Attempt ${attempt} failed. Retrying in ${wait}ms...`, err?.message);

      if (onRetry) onRetry(attempt, err);
      await sleep(wait);
    }
  }

  throw lastError;
};

// ── Which errors are worth retrying ──────────────────────────────────
export const isRetryableError = (err: any): boolean => {
  const msg = err?.message || String(err) || '';
  // Retry on network/timeout, not on auth/validation
  return (
    msg.includes('fetch')    ||
    msg.includes('network')  ||
    msg.includes('timeout')  ||
    msg.includes('ETIMEDOUT')||
    msg.includes('connect')  ||
    err?.code === 'ECONNREFUSED'
  );
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Offline write queue ───────────────────────────────────────────────
const QUEUE_KEY = 'gt_offline_queue';

interface QueuedWrite {
  id:        string;
  table:     string;
  operation: 'upsert' | 'update' | 'insert' | 'delete';
  payload:   any;
  queuedAt:  string;
  attempts:  number;
}

export const OfflineQueue = {
  add: (table: string, operation: QueuedWrite['operation'], payload: any) => {
    const queue = OfflineQueue.get();
    const entry: QueuedWrite = {
      id:        `q_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      table, operation, payload,
      queuedAt:  new Date().toISOString(),
      attempts:  0,
    };
    queue.push(entry);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {}
    console.log(`[OfflineQueue] Queued ${operation} on ${table}`);
  },

  get: (): QueuedWrite[] => {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch { return []; }
  },

  remove: (id: string) => {
    const queue = OfflineQueue.get().filter(q => q.id !== id);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {}
  },

  count: (): number => OfflineQueue.get().length,

  flush: async (supabase: any): Promise<{ success: number; failed: number }> => {
    const queue = OfflineQueue.get();
    if (queue.length === 0) return { success: 0, failed: 0 };

    let success = 0, failed = 0;

    for (const item of queue) {
      try {
        let result;
        switch (item.operation) {
          case 'upsert':  result = await supabase.from(item.table).upsert(item.payload); break;
          case 'insert':  result = await supabase.from(item.table).insert(item.payload); break;
          case 'update':  result = await supabase.from(item.table).update(item.payload.data).eq('id', item.payload.id); break;
          case 'delete':  result = await supabase.from(item.table).delete().eq('id', item.payload.id); break;
        }
        if (result?.error) throw result.error;
        OfflineQueue.remove(item.id);
        success++;
      } catch (err) {
        console.warn(`[OfflineQueue] Flush failed for ${item.table}:`, err);
        failed++;
      }
    }

    if (success > 0) {
      console.log(`[OfflineQueue] Flushed ${success} queued operations`);
      toast.success(`${success} offline changes synced.`, { duration: 3000 });
    }
    if (failed > 0) {
      toast.warning(`${failed} operations still pending — will retry later.`, { duration: 4000 });
    }

    return { success, failed };
  },
};

// ── Safe Supabase call wrapper ────────────────────────────────────────
// Use this instead of raw supabase.from() calls
export const safeSupabase = async <T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  opts: {
    context?:     string;
    fallback?:    T;
    silent?:      boolean;
    retry?:       boolean;
    successMsg?:  string;
  } = {}
): Promise<T | null> => {
  const { context = 'DB', fallback = null, silent = false, retry = true } = opts;

  const run = async () => {
    const { data, error } = await operation();
    if (error) throw error;
    return data;
  };

  try {
    const result = retry
      ? await withRetry(run, { context, maxRetries: 2 })
      : await run();

    if (opts.successMsg) toast.success(opts.successMsg, { duration: 2500 });
    return result;

  } catch (err: any) {
    const friendly = translateError(err);
    console.error(`[${context}]`, err);

    if (!silent) {
      // Session errors → trigger re-login
      if (friendly.includes('Session expired') || friendly.includes('login again')) {
        toast.error(friendly + ' Redirecting...', { duration: 4000 });
        setTimeout(() => {
          localStorage.removeItem('glasstech-auth');
          window.location.reload();
        }, 3000);
      } else {
        toast.error(friendly, { duration: 4000, id: context });
      }
    }

    return fallback as T | null;
  }
};

// ── Network status hook helper ────────────────────────────────────────
export const getNetworkStatus = () => ({
  isOnline:      navigator.onLine,
  queuedWrites:  OfflineQueue.count(),
  connectionType: (navigator as any).connection?.effectiveType || 'unknown',
});
