/**
 * GLASSTECH ERP — Error Boundary System (EH-Phase 1)
 *
 * 3 levels:
 * 1. GlobalErrorBoundary  — wraps entire app, catches fatal crashes
 * 2. ModuleErrorBoundary  — wraps each lazy-loaded module/route
 * 3. SectionErrorBoundary — wraps individual sections/cards (silent fallback)
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp, Bug } from 'lucide-react';
import { reportCrash } from '../services/crashReportService';

// ── Error log (in-memory + localStorage) ─────────────────────────────
interface ErrorLog {
  id:        string;
  message:   string;
  stack:     string;
  component: string;
  timestamp: string;
  level:     'fatal' | 'module' | 'section';
}

const ERROR_LOG_KEY = 'gt_error_log';
const MAX_LOGS = 50;

export const logError = (err: Error, info: ErrorInfo, level: ErrorLog['level'], component = '') => {
  try {
    const existing: ErrorLog[] = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]');
    const entry: ErrorLog = {
      id:        `ERR-${Date.now()}`,
      message:   err.message,
      stack:     err.stack?.slice(0, 500) || '',
      component: info.componentStack?.split('\n')[1]?.trim() || component,
      timestamp: new Date().toISOString(),
      level,
    };
    const updated = [entry, ...existing].slice(0, MAX_LOGS);
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(updated));
    console.error(`[EH-${level.toUpperCase()}]`, err.message, info.componentStack);
  } catch {
    // never let logging crash the app
  }
};

export const getErrorLogs = (): ErrorLog[] => {
  try { return JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]'); }
  catch { return []; }
};

export const clearErrorLogs = () => {
  localStorage.removeItem(ERROR_LOG_KEY);
};

// ── Shared props ──────────────────────────────────────────────────────
interface BoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;  // custom fallback UI
}

interface BoundaryState {
  hasError:    boolean;
  error:       Error | null;
  showDetails: boolean;
}

// ══════════════════════════════════════════════════════════════════════
// 1. GLOBAL ERROR BOUNDARY — entire app wrapper
// ══════════════════════════════════════════════════════════════════════
export class GlobalErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false, error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(error, info, 'fatal');
    // also push server-side (activity_logs). localStorage
    // logError above stays as the offline fallback.
    reportCrash('GlobalErrorBoundary', error, info.componentStack ?? undefined);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-[#0f1923] flex items-center justify-center p-6">
        <div className="max-w-lg w-full space-y-6">

          {/* Icon + Title */}
          <div className="text-center">
            <div className="w-20 h-20 bg-rose-500/20 border-2 border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <AlertTriangle size={36} className="text-rose-400"/>
            </div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">System Error</h1>
            <p className="text-slate-400 text-sm mt-2">
              Something went wrong. Your data is safe in localStorage.
            </p>
          </div>

          {/* Error message */}
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
            <p className="text-rose-300 text-sm font-mono break-all">
              {this.state.error?.message || 'Unknown error'}
            </p>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all"
            >
              <RefreshCw size={15}/><span>Reload App</span>
            </button>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.hash = '/'; }}
              className="flex items-center justify-center space-x-2 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all"
            >
              <Home size={15}/><span>Go Home</span>
            </button>
          </div>

          {/* Stack trace toggle */}
          <button
            onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
            className="flex items-center space-x-2 text-slate-500 hover:text-slate-300 text-xs font-bold uppercase transition-colors w-full justify-center"
          >
            <Bug size={12}/>
            <span>Technical Details</span>
            {this.state.showDetails ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          </button>

          {this.state.showDetails && (
            <pre className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-[10px] text-slate-400 overflow-auto max-h-48 font-mono">
              {this.state.error?.stack || 'No stack trace'}
            </pre>
          )}

          <p className="text-center text-[10px] text-slate-700 font-bold uppercase tracking-widest">
            Glasstech ERP 2026 — Error ID: ERR-{Date.now().toString().slice(-6)}
          </p>
        </div>
      </div>
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// 2. MODULE ERROR BOUNDARY — per route/module
// ══════════════════════════════════════════════════════════════════════
// Detect a stale-chunk error from a fresh deploy. After Vercel invalidates
// the old hashed chunk filenames, browser tabs still loaded with the old
// shell try to dynamically import chunks that no longer exist and throw
// one of these messages. The cure is a hard reload — gets the new shell
// with the new hash map.
const isStaleChunkError = (err: Error | null | undefined): boolean => {
  if (!err) return false;
  const m = err.message || '';
  return /Failed to fetch dynamically imported module/i.test(m)
      || /Loading chunk \d+ failed/i.test(m)
      || /error loading dynamically imported module/i.test(m)
      || /Importing a module script failed/i.test(m);
};

// Guard against reload loops: if we've already auto-reloaded once for
// this URL in this session, fall through to the manual error UI so the
// user isn't stuck in an infinite reload.
const STALE_RELOAD_KEY = 'gt_stale_chunk_reloaded';
const tryAutoReloadOnce = (): boolean => {
  try {
    const already = sessionStorage.getItem(STALE_RELOAD_KEY) === window.location.href;
    if (already) return false;
    sessionStorage.setItem(STALE_RELOAD_KEY, window.location.href);
    // Cache-bust the shell as well — some browsers (esp. Safari) hang on
    // to the html if it has a long max-age.
    window.location.reload();
    return true;
  } catch {
    return false;
  }
};

export class ModuleErrorBoundary extends Component<BoundaryProps & { moduleName?: string }, BoundaryState> {
  state: BoundaryState = { hasError: false, error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Stale-chunk errors are not real bugs — they're a deploy-cache
    // mismatch. Try one silent reload before logging or showing UI.
    if (isStaleChunkError(error)) {
      if (tryAutoReloadOnce()) return;
    }
    logError(error, info, 'module', this.props.moduleName);
    // server-side crash report in addition to localStorage.
    reportCrash(`Module:${this.props.moduleName || 'unknown'}`, error, info.componentStack ?? undefined);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // If we're inside the (sub-second) window between hasError firing and
    // the auto-reload taking effect, show a friendly updating message
    // instead of the angry red error UI.
    if (isStaleChunkError(this.state.error)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 space-y-4">
          <RefreshCw size={32} className="text-blue-500 animate-spin"/>
          <div className="text-center">
            <h3 className="font-black text-slate-800 uppercase text-sm">Updating to latest version…</h3>
            <p className="text-slate-400 text-xs mt-1.5">A new build is available — refreshing in a moment.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 space-y-5">

        <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center">
          <AlertTriangle size={28} className="text-amber-600"/>
        </div>

        <div className="text-center">
          <h3 className="font-black text-slate-800 uppercase text-base">
            {this.props.moduleName || 'Module'} Error
          </h3>
          <p className="text-slate-400 text-sm mt-1.5 max-w-sm">
            This module encountered an error. Other modules are unaffected.
          </p>
          <p className="text-rose-500 text-xs font-mono mt-2 bg-rose-50 px-3 py-1.5 rounded-lg inline-block">
            {this.state.error?.message?.slice(0, 100) || 'Unknown error'}
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest transition-all"
          >
            <RefreshCw size={13}/><span>Retry</span>
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center space-x-2 border border-slate-200 hover:bg-slate-50 text-slate-600 px-5 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest transition-all"
          >
            <Home size={13}/><span>Reload</span>
          </button>
        </div>

        <button
          onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
          className="text-[10px] text-slate-400 hover:text-slate-600 font-bold uppercase flex items-center space-x-1"
        >
          <Bug size={10}/><span>Details</span>
          {this.state.showDetails ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
        </button>

        {this.state.showDetails && (
          <pre className="bg-slate-100 rounded-xl p-3 text-[9px] text-slate-500 overflow-auto max-h-32 w-full font-mono">
            {this.state.error?.stack?.slice(0, 300) || 'No stack trace'}
          </pre>
        )}
      </div>
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// 3. SECTION ERROR BOUNDARY — cards, tables, widgets
//    Silent fallback — shows placeholder, doesn't disrupt page
// ══════════════════════════════════════════════════════════════════════
export class SectionErrorBoundary extends Component<BoundaryProps & { sectionName?: string }, BoundaryState> {
  state: BoundaryState = { hasError: false, error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(error, info, 'section', this.props.sectionName);
    // server-side crash report in addition to localStorage.
    reportCrash(`Section:${this.props.sectionName || 'unknown'}`, error, info.componentStack ?? undefined);
  }

  render() {
    if (this.props.fallback && this.state.hasError) return this.props.fallback;

    if (this.state.hasError) {
      return (
        <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex items-start space-x-3">
          <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5"/>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-rose-700 uppercase">
              {this.props.sectionName || 'Section'} failed to load
            </p>
            <p className="text-[10px] text-rose-500 mt-0.5 truncate">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-2 text-[10px] font-bold text-rose-600 hover:text-rose-800 uppercase flex items-center space-x-1"
            >
              <RefreshCw size={10}/><span>Retry</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ── Convenience HOC ───────────────────────────────────────────────────
export function withModuleBoundary<T extends object>(
  Component: React.ComponentType<T>,
  moduleName: string
) {
  return function WrappedWithBoundary(props: T) {
    return (
      <ModuleErrorBoundary moduleName={moduleName}>
        <Component {...props} />
      </ModuleErrorBoundary>
    );
  };
}

// ══════════════════════════════════════════════════════════════════════
// ERROR LOG VIEWER — for Admin panel (Basis Admin → Error Logs tab)
// ══════════════════════════════════════════════════════════════════════
export function ErrorLogViewer() {
  const [logs, setLogs] = React.useState<ErrorLog[]>([]);
  const [cleared, setCleared] = React.useState(false);

  React.useEffect(() => { setLogs(getErrorLogs()); }, []);

  const handleClear = () => {
    clearErrorLogs();
    setLogs([]);
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  };

  const levelColor = (level: string) => ({
    fatal:   'bg-rose-100 text-rose-700 border-rose-200',
    module:  'bg-amber-100 text-amber-700 border-amber-200',
    section: 'bg-blue-100 text-blue-700 border-blue-200',
  }[level] || 'bg-slate-100 text-slate-600');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-slate-800 uppercase text-sm">Error Log</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">{logs.length} entries stored locally</p>
        </div>
        <button onClick={handleClear}
          className="text-[10px] font-bold text-rose-600 hover:text-rose-800 border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors">
          {cleared ? '✓ Cleared' : 'Clear All'}
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 text-center">
          <p className="text-emerald-700 font-bold text-sm">✓ No errors logged</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {logs.map(log => (
            <div key={log.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${levelColor(log.level)}`}>
                  {log.level}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(log.timestamp).toLocaleString('en-PK')}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-800">{log.message}</p>
              {log.component && (
                <p className="text-[10px] text-slate-400 font-mono">{log.component}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
