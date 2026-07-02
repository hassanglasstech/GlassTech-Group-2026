/**
 * GLASSTECH ERP — Crash Report Service (Audit finding #14, P1)
 *
 * Fatal render crashes were only captured to browser localStorage
 * (ErrorBoundary → gt_error_log) — invisible server-side. This service
 * makes them durable by reusing the existing Logger → activity_logs sink:
 * Logger pushes every 'error'-level entry to the Supabase activity_logs
 * table fire-and-forget, so a crash report survives the browser.
 *
 * Guarantees:
 * - NEVER throws (a crash reporter must not crash the app)
 * - NEVER blocks render (the Supabase push is fire-and-forget inside Logger)
 * - Storm protection: max 1 report per (scope + message) per 60 seconds
 * - No PII beyond the signed-in user's email
 */

import { Logger } from './logger';
import { useAppStore } from '../store/appStore';
import { useAuthStore } from '../../auth/authStore';

// ── Compact crash record (serialised into activity_logs.description) ──
interface CrashRecord {
  scope:           string;
  message:         string;
  stack?:          string;
  componentStack?: string;
  url:             string;
  company?:        string;
  user?:           string;
  appVersion?:     string;
  created_at:      string;
}

// ── Truncation limits — keep the row compact ─────────────────────────
const MAX_MESSAGE_LEN         = 500;
const MAX_STACK_LEN           = 2000;
const MAX_COMPONENT_STACK_LEN = 1500;

// ── Dedupe storm protection: 1 report per (scope+message) per 60s ────
const DEDUPE_WINDOW_MS = 60_000;
const _recentReports = new Map<string, number>();

const shouldReport = (key: string): boolean => {
  const now  = Date.now();
  const last = _recentReports.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
  _recentReports.set(key, now);
  // Prune expired entries so the map stays bounded during long sessions
  if (_recentReports.size > 100) {
    for (const [k, t] of _recentReports) {
      if (now - t >= DEDUPE_WINDOW_MS) _recentReports.delete(k);
    }
  }
  return true;
};

// ── Narrowing: unknown → { message, stack } without `any` ────────────
const toErrorParts = (error: unknown): { message: string; stack?: string } => {
  if (error instanceof Error) {
    return { message: error.message || 'Unknown error', stack: error.stack };
  }
  if (typeof error === 'string') return { message: error || 'Unknown error' };
  if (error !== null && typeof error === 'object') {
    const maybe = error as { message?: unknown; stack?: unknown };
    if (typeof maybe.message === 'string') {
      return {
        message: maybe.message,
        stack:   typeof maybe.stack === 'string' ? maybe.stack : undefined,
      };
    }
    try { return { message: JSON.stringify(error).slice(0, MAX_MESSAGE_LEN) }; }
    catch { return { message: 'Unserialisable error object' }; }
  }
  return { message: String(error) };
};

// ── Guarded context readers — a crash may happen before stores exist ──
const safeCompany = (): string | undefined => {
  try { return useAppStore.getState().selectedCompany; } catch { return undefined; }
};

const safeUserEmail = (): string | undefined => {
  try { return useAuthStore.getState().user?.email || undefined; } catch { return undefined; }
};

const safeUrl = (): string => {
  try { return window.location.hash || window.location.pathname || ''; } catch { return ''; }
};

const safeAppVersion = (): string | undefined => {
  try {
    const env: Record<string, unknown> = import.meta.env;
    const v = env['VITE_APP_VERSION'];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  } catch { return undefined; }
};

/**
 * Report a fatal crash to the server-side activity_logs sink.
 * Fire-and-forget, deduped, never throws, never blocks render.
 * Called from all ErrorBoundary tiers + the global window handlers —
 * IN ADDITION to their existing localStorage logging (offline fallback).
 */
export const reportCrash = (scope: string, error: unknown, componentStack?: string): void => {
  try {
    const { message, stack } = toErrorParts(error);
    if (!shouldReport(`${scope}::${message}`)) return;

    const record: CrashRecord = {
      scope,
      message:        message.slice(0, MAX_MESSAGE_LEN),
      stack:          stack ? stack.slice(0, MAX_STACK_LEN) : undefined,
      componentStack: componentStack ? componentStack.slice(0, MAX_COMPONENT_STACK_LEN) : undefined,
      url:            safeUrl(),
      company:        safeCompany(),
      user:           safeUserEmail(),
      appVersion:     safeAppVersion(),
      created_at:     new Date().toISOString(),
    };

    // Logger.fatal → writeLog(level 'error', action FATAL_CRASH) →
    // localStorage + fire-and-forget INSERT into Supabase activity_logs.
    Logger.fatal(scope, JSON.stringify(record), record.url.slice(0, 100));
  } catch {
    // A crash reporter must never crash — swallow everything.
  }
};

// ── Global handlers — errors that never reach a React boundary ───────
let _handlersInstalled = false;

/**
 * Install window-level crash handlers (script errors + unhandled Promise
 * rejections). Call once from app init — idempotent, never throws.
 */
export const installGlobalCrashHandlers = (): void => {
  if (_handlersInstalled) return;
  _handlersInstalled = true;

  try {
    window.addEventListener('error', (event: ErrorEvent) => {
      try {
        const err: unknown = event.error ?? event.message;
        reportCrash('window.error', err);
      } catch { /* never throw from a crash handler */ }
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      try {
        const reason: unknown = event.reason;
        const { message } = toErrorParts(reason);
        // Benign Supabase auth misses (normal on first load) — skip
        if (message.includes('Auth session missing') || message.includes('JWT')) return;
        reportCrash('unhandledrejection', reason);
      } catch { /* never throw from a crash handler */ }
    });
  } catch {
    // addEventListener failing (non-browser env) must not break boot
  }
};
