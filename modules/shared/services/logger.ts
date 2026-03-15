/**
 * GLASSTECH ERP — Structured Logger (EH-Phase 6)
 *
 * Replaces console.log/error/warn with structured logging:
 * - Activity logs: user actions (save, delete, post, approve)
 * - Error logs: from ErrorBoundary (already done in Phase 1)
 * - Performance logs: slow operations
 * - Audit trail: who did what when
 *
 * All logs → localStorage + Supabase activity_logs table
 */

import { toast } from 'sonner';
import { safeSave, safeParse } from './utils';

// ── Log types ─────────────────────────────────────────────────────────
export type LogLevel   = 'info' | 'warn' | 'error' | 'success' | 'audit';
export type LogModule  =
  | 'HR' | 'Finance' | 'Sales' | 'Inventory' | 'Production'
  | 'Procurement' | 'Logistics' | 'Projects' | 'Admin' | 'Auth' | 'Sync' | 'System';

export interface LogEntry {
  id:          string;
  timestamp:   string;
  level:       LogLevel;
  module:      LogModule | string;
  action:      string;
  description: string;
  user?:       string;
  company?:    string;
  referenceId?: string;
  amount?:     number;
  meta?:       Record<string, any>;
  duration?:   number; // ms for performance logs
}

// ── Storage ───────────────────────────────────────────────────────────
const LOG_KEY     = 'gtk_erp_activity_logs';
const MAX_LOGS    = 500;
const MAX_ERRORS  = 100;

// ── Current user context (set on login) ──────────────────────────────
let _currentUser    = 'System';
let _currentCompany = 'GTK';

export const setLogContext = (user: string, company: string) => {
  _currentUser    = user;
  _currentCompany = company;
};

// ── Core logger ───────────────────────────────────────────────────────
const writeLog = (entry: Omit<LogEntry, 'id' | 'timestamp' | 'user' | 'company'>): LogEntry => {
  const full: LogEntry = {
    id:          `log_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
    timestamp:   new Date().toISOString(),
    user:        _currentUser,
    company:     _currentCompany,
    ...entry,
  };

  try {
    const existing: LogEntry[] = safeParse(LOG_KEY);
    const updated = [full, ...existing].slice(0, MAX_LOGS);
    safeSave(LOG_KEY, updated);
  } catch (err) {
    console.warn('[Logger] Failed to write log:', err);
  }

  // Also write to console in dev
  const prefix = `[${full.module}:${full.action}]`;
  switch (full.level) {
    case 'error': console.error(prefix, full.description, full.meta || ''); break;
    case 'warn':  console.warn(prefix, full.description, full.meta || ''); break;
    case 'audit': console.info(`🔒 ${prefix}`, full.description); break;
    default:      console.log(prefix, full.description); break;
  }

  return full;
};

// ── Public API ────────────────────────────────────────────────────────
export const Logger = {

  // User action: save, create, update, delete
  action: (module: LogModule | string, action: string, description: string, meta?: {
    referenceId?: string;
    amount?: number;
    extra?: Record<string, any>;
  }) => writeLog({
    level: 'audit',
    module, action, description,
    referenceId: meta?.referenceId,
    amount:      meta?.amount,
    meta:        meta?.extra,
  }),

  // Info log
  info: (module: LogModule | string, message: string, meta?: Record<string, any>) =>
    writeLog({ level: 'info', module, action: 'INFO', description: message, meta }),

  // Warning
  warn: (module: LogModule | string, message: string, meta?: Record<string, any>) =>
    writeLog({ level: 'warn', module, action: 'WARNING', description: message, meta }),

  // Error (with optional toast)
  error: (module: LogModule | string, message: string, err?: any, showToast = false) => {
    const entry = writeLog({
      level: 'error', module, action: 'ERROR',
      description: message,
      meta: { error: err?.message || String(err), stack: err?.stack?.slice(0,200) },
    });
    if (showToast) toast.error(message, { duration: 4000 });
    return entry;
  },

  // Success action
  success: (module: LogModule | string, action: string, description: string, referenceId?: string) =>
    writeLog({ level: 'success', module, action, description, referenceId }),

  // Performance: track slow operations
  perf: (module: LogModule | string, operation: string, durationMs: number) => {
    if (durationMs > 2000) { // only log if > 2 seconds
      writeLog({
        level: 'warn', module,
        action: 'SLOW_OPERATION',
        description: `${operation} took ${durationMs}ms`,
        duration: durationMs,
      });
    }
  },

  // Auth events
  auth: (action: 'LOGIN' | 'LOGOUT' | 'BLOCKED', email: string, detail?: string) =>
    writeLog({
      level: action === 'BLOCKED' ? 'warn' : 'audit',
      module: 'Auth', action,
      description: `${email}${detail ? ` — ${detail}` : ''}`,
    }),

  // Sync events
  sync: (action: 'PUSH' | 'PULL' | 'FAILED', tables: string[], detail?: string) =>
    writeLog({
      level: action === 'FAILED' ? 'error' : 'info',
      module: 'Sync', action,
      description: `${action} ${tables.join(', ')}${detail ? ` — ${detail}` : ''}`,
      meta: { tables },
    }),

  // Get logs
  getLogs: (filter?: {
    level?: LogLevel;
    module?: string;
    company?: string;
    limit?: number;
  }): LogEntry[] => {
    let logs: LogEntry[] = safeParse(LOG_KEY);
    if (filter?.level)   logs = logs.filter(l => l.level === filter.level);
    if (filter?.module)  logs = logs.filter(l => l.module === filter.module);
    if (filter?.company) logs = logs.filter(l => l.company === filter.company);
    return logs.slice(0, filter?.limit || 200);
  },

  // Clear logs
  clear: () => {
    safeSave(LOG_KEY, []);
    toast.success('Activity logs cleared.', { duration: 2000 });
  },

  // Export as CSV
  exportCSV: () => {
    const logs: LogEntry[] = safeParse(LOG_KEY);
    const header = 'Timestamp,Level,Module,Action,User,Company,Description,Reference,Amount\n';
    const rows = logs.map(l =>
      [
        l.timestamp, l.level, l.module, l.action,
        l.user || '', l.company || '',
        `"${(l.description || '').replace(/"/g, '""')}"`,
        l.referenceId || '', l.amount || '',
      ].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `activity_log_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Logs exported as CSV.', { duration: 2000 });
  },

  // Stats for dashboard
  getStats: () => {
    const logs: LogEntry[] = safeParse(LOG_KEY);
    const today = new Date().toISOString().slice(0, 10);
    return {
      total:       logs.length,
      todayCount:  logs.filter(l => l.timestamp.startsWith(today)).length,
      errors:      logs.filter(l => l.level === 'error').length,
      audits:      logs.filter(l => l.level === 'audit').length,
      byModule:    Object.fromEntries(
        [...new Set(logs.map(l => l.module))].map(m => [
          m, logs.filter(l => l.module === m).length
        ])
      ),
    };
  },
};

// ── Performance timer helper ──────────────────────────────────────────
export const perfTimer = (module: LogModule | string, operation: string) => {
  const start = Date.now();
  return {
    end: () => Logger.perf(module, operation, Date.now() - start),
  };
};

// ── Override console (optional — call in App.tsx) ─────────────────────
export const installConsoleOverride = () => {
  const originalError = console.error.bind(console);
  const originalWarn  = console.warn.bind(console);

  console.error = (...args: any[]) => {
    originalError(...args);
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    // Don't log React dev warnings (too noisy)
    if (msg.includes('Warning:') || msg.includes('ReactDOM')) return;
    try {
      writeLog({
        level: 'error', module: 'System',
        action: 'CONSOLE_ERROR',
        description: msg.slice(0, 200),
      });
    } catch {}
  };

  console.warn = (...args: any[]) => {
    originalWarn(...args);
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    if (msg.includes('[Fast Refresh]') || msg.includes('DevTools')) return;
    try {
      writeLog({
        level: 'warn', module: 'System',
        action: 'CONSOLE_WARN',
        description: msg.slice(0, 200),
      });
    } catch {}
  };
};
