/**
 * GoLiveDashboard.tsx — Sprint 36 (Final Sprint)
 *
 * Production readiness dashboard at /admin/go-live.
 *
 * Lets the owner / consultant verify that a given company is ready to
 * go live. Runs ~18 automated checks across database, data, config,
 * operations and security categories. Generates a printable
 * "Go-Live Certificate" once all checks pass.
 *
 * Workflow:
 *   1. Pick company
 *   2. Click "Run all checks"  → results appear, grouped by category
 *   3. Fix red/yellow items via "Open fix →" link
 *   4. Re-run, repeat until green
 *   5. Click "Print Certificate" → window.print() opens cert layout
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Rocket, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  Database, FileText, Settings, Activity, Lock, Award,
  Printer, ExternalLink, ChevronDown, ChevronRight, Eraser,
  CircleDashed, TrendingUp,
} from 'lucide-react';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore }  from '@/modules/shared/store/appStore';
import { GoLiveService, CheckResult, CheckCategory, CheckStatus, SummaryRow } from '@/modules/admin/services/goLiveService';

// ─────────────────────────────────────────────────────────────────────
const COMPANIES = ['Glassco', 'GTK', 'GTI', 'Nippon', 'Factory'] as const;
const ALLOWED   = new Set(['super_admin', 'owner', 'hassan', 'admin', 'glassco_admin']);

const CATEGORY_META: Record<CheckCategory, { label: string; icon: React.ReactNode; color: string }> = {
  database:   { label: 'Database',   icon: <Database     size={14} />, color: 'text-blue-600'    },
  data:       { label: 'Data',       icon: <FileText     size={14} />, color: 'text-emerald-600' },
  config:     { label: 'Config',     icon: <Settings     size={14} />, color: 'text-violet-600'  },
  operations: { label: 'Operations', icon: <Activity     size={14} />, color: 'text-orange-600'  },
  security:   { label: 'Security',   icon: <Lock         size={14} />, color: 'text-rose-600'    },
};

const STATUS_META: Record<CheckStatus, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  pass:    { color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: <CheckCircle2 size={16} className="text-emerald-600" />, label: 'PASS' },
  warning: { color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',     icon: <AlertTriangle size={16} className="text-amber-600" />,  label: 'WARN' },
  fail:    { color: 'text-rose-600',    bg: 'bg-rose-50 border-rose-200',       icon: <XCircle size={16} className="text-rose-600" />,        label: 'FAIL' },
  skipped: { color: 'text-slate-400',   bg: 'bg-slate-50 border-slate-200',     icon: <CircleDashed size={16} className="text-slate-400" />,  label: 'SKIP' },
};

// ─────────────────────────────────────────────────────────────────────
// Single check row
// ─────────────────────────────────────────────────────────────────────

interface CheckRowProps {
  check:    CheckResult;
  onFixNav: (link: string) => void;
}

const CheckRow: React.FC<CheckRowProps> = ({ check, onFixNav }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[check.status];
  const hasDetails = check.details && Object.keys(check.details).length > 0;

  return (
    <div className={`border-l-4 ${meta.bg} mb-1.5 rounded-r-lg overflow-hidden`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Status icon */}
        <div className="flex-shrink-0">{meta.icon}</div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-[11px] font-black text-slate-800 uppercase">{check.label}</p>
            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${meta.color}`}>
              {meta.label}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 leading-snug mt-0.5">{check.message}</p>
        </div>

        {/* Fix link */}
        {(check.status === 'fail' || check.status === 'warning') && (check as any).fix_link && (
          <button
            onClick={() => onFixNav((check as any).fix_link)}
            className="flex items-center gap-1 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-[9px] font-black text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors"
          >
            <ExternalLink size={9} />
            Fix
          </button>
        )}

        {/* Details toggle */}
        {hasDetails && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-slate-400 hover:text-slate-600"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="px-10 pb-2.5">
          <pre className="text-[8px] bg-white/60 rounded-lg p-2 text-slate-600 font-mono overflow-x-auto border border-slate-200">
            {JSON.stringify(check.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Certificate (printable)
// ─────────────────────────────────────────────────────────────────────

interface CertificateProps {
  company:  string;
  results:  CheckResult[];
  meta:     ReturnType<typeof GoLiveService.certificateMeta>;
}

const Certificate: React.FC<CertificateProps> = ({ company, results, meta }) => {
  const verdictText =
    meta.verdict === 'ready'                ? 'CERTIFIED READY FOR PRODUCTION' :
    meta.verdict === 'ready_with_warnings'  ? 'READY WITH WARNINGS'            :
                                              'NOT READY — RESOLVE FAILURES';

  const verdictColor =
    meta.verdict === 'ready'                ? '#059669' :
    meta.verdict === 'ready_with_warnings'  ? '#d97706' :
                                              '#dc2626';

  return (
    <div className="hidden print:block" style={{ pageBreakInside: 'avoid' }}>
      <div style={{ padding: '40px', fontFamily: 'Georgia, serif', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', borderBottom: '3px double #1e3a5f', paddingBottom: '20px', marginBottom: '30px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '4px', color: '#64748b', marginBottom: '8px' }}>
            GLASSTECH GROUP — ENTERPRISE RESOURCE PLANNING
          </p>
          <h1 style={{ fontSize: '32px', color: '#1e3a5f', margin: '0' }}>
            Go-Live Readiness Certificate
          </h1>
        </div>

        <p style={{ textAlign: 'center', fontSize: '14px', marginBottom: '8px' }}>
          This certifies that the system instance for
        </p>
        <p style={{ textAlign: 'center', fontSize: '28px', fontWeight: 'bold', color: '#1e3a5f', margin: '8px 0 24px' }}>
          {company}
        </p>

        <div style={{
          textAlign:       'center',
          padding:         '20px',
          border:          `2px solid ${verdictColor}`,
          borderRadius:    '8px',
          marginBottom:    '30px',
          backgroundColor: meta.verdict === 'ready' ? '#ecfdf5' : meta.verdict === 'ready_with_warnings' ? '#fffbeb' : '#fef2f2',
        }}>
          <p style={{ fontSize: '20px', fontWeight: 'bold', color: verdictColor, margin: '0' }}>
            {verdictText}
          </p>
          <p style={{ fontSize: '14px', color: '#475569', marginTop: '8px' }}>
            Readiness Score: <strong>{meta.readiness_pct}%</strong>
          </p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #1e3a5f' }}>
              <th style={{ textAlign: 'left',  padding: '8px', fontSize: '11px' }}>Check</th>
              <th style={{ textAlign: 'left',  padding: '8px', fontSize: '11px' }}>Category</th>
              <th style={{ textAlign: 'right', padding: '8px', fontSize: '11px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.key} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '6px 8px', fontSize: '10px' }}>{r.label}</td>
                <td style={{ padding: '6px 8px', fontSize: '10px', color: '#64748b' }}>{r.category}</td>
                <td style={{
                  padding:    '6px 8px',
                  textAlign:  'right',
                  fontSize:   '10px',
                  fontWeight: 'bold',
                  color:      r.status === 'pass'    ? '#059669'
                            : r.status === 'warning' ? '#d97706'
                            : r.status === 'fail'    ? '#dc2626'
                            :                          '#64748b',
                }}>
                  {r.status.toUpperCase()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '2px solid #1e3a5f', paddingTop: '20px' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '10px', color: '#64748b', marginBottom: '24px' }}>
              Issued at
            </p>
            <p style={{ fontSize: '11px', borderTop: '1px solid #1e3a5f', paddingTop: '4px' }}>
              {new Date(meta.issued_at).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '10px', color: '#64748b', marginBottom: '24px' }}>
              Authorised by
            </p>
            <p style={{ fontSize: '11px', borderTop: '1px solid #1e3a5f', paddingTop: '4px', minWidth: '180px' }}>
              GlassTech Group ERP Owner
            </p>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: '8px', color: '#94a3b8', marginTop: '40px' }}>
          Generated by GlassTech Group ERP 2026 · Sprint 36 Go-Live Readiness Engine
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────

const GoLiveDashboard: React.FC = () => {
  const user       = useAuthStore(s => s.user);
  const appCompany = useAppStore(s => s.selectedCompany);

  const [company, setCompany]   = useState<string>(appCompany || 'Glassco');
  const [results, setResults]   = useState<CheckResult[]>([]);
  const [summary, setSummary]   = useState<SummaryRow | null>(null);
  const [running, setRunning]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [lastRun, setLastRun]   = useState<string | null>(null);

  // Load latest from DB on company change
  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        GoLiveService.getLatest(company),
        GoLiveService.getSummary(company),
      ]);
      setResults(r);
      setSummary(s);
      if (r.length > 0) {
        const newest = r.reduce((a, b) => a.ran_at > b.ran_at ? a : b);
        setLastRun(newest.ran_at);
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [company]);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  // Guards placed after hooks to keep hook order stable (react-hooks/rules-of-hooks)
  if (!user) return <Navigate to="/" replace />;
  if (!ALLOWED.has(user.role || '')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center">
          <AlertTriangle size={36} className="mx-auto text-amber-500 mb-3" />
          <p className="text-sm font-bold text-slate-700">Go-Live Dashboard requires admin / owner role.</p>
        </div>
      </div>
    );
  }

  const handleRunChecks = async () => {
    setRunning(true);
    try {
      const r = await GoLiveService.runAllChecks(company, user.email || 'unknown');
      setResults(r);
      setLastRun(new Date().toISOString());
      // Re-fetch summary view (server-side aggregation)
      const s = await GoLiveService.getSummary(company);
      setSummary(s);
      const meta = GoLiveService.certificateMeta(company, r);
      const tone =
        meta.verdict === 'ready'                ? 'success'
        : meta.verdict === 'ready_with_warnings'? 'warning'
        :                                         'error';
      toast[tone](`${company}: ${meta.pass_count} pass · ${meta.warning_count} warn · ${meta.fail_count} fail`);
    } catch (e: any) {
      toast.error(e?.message || 'Check run failed');
    } finally {
      setRunning(false);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm(`Clear all readiness check history for ${company}? This cannot be undone.`)) return;
    await GoLiveService.clearLogs(company);
    setResults([]);
    setSummary(null);
    setLastRun(null);
    toast.success('History cleared');
  };

  const handleFixNav = (link: string) => {
    const path = link.replace(/^#/, '');
    window.location.hash = `#${path}`;
  };

  const handlePrintCert = () => {
    if (results.length === 0) {
      toast.error('Run checks first');
      return;
    }
    window.print();
  };

  // ── Group results by category ─────────────────────────────────────
  const grouped = results.reduce<Record<CheckCategory, CheckResult[]>>(
    (acc, r) => {
      (acc[r.category] = acc[r.category] || []).push(r);
      return acc;
    },
    { database: [], data: [], config: [], operations: [], security: [] }
  );

  const meta = results.length > 0 ? GoLiveService.certificateMeta(company, results) : null;
  const verdictBadge =
    !meta                                   ? { color: 'bg-slate-100 text-slate-500', label: 'NOT RUN'        } :
    meta.verdict === 'ready'                ? { color: 'bg-emerald-100 text-emerald-700', label: 'READY ✓'    } :
    meta.verdict === 'ready_with_warnings'  ? { color: 'bg-amber-100 text-amber-700', label: 'READY w/ WARN' } :
                                              { color: 'bg-rose-100 text-rose-700',     label: 'NOT READY'    };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">

      {/* ── Page header ── */}
      <div className="bg-gradient-to-r from-[#1e3a5f] via-[#2d4a6f] to-[#354a5f] text-white px-6 py-5 shadow-lg no-print">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Rocket size={24} className="text-amber-300" />
            <div>
              <h1 className="text-base font-black uppercase tracking-widest">Go-Live Readiness</h1>
              <p className="text-[10px] text-blue-200 font-bold">Sprint 36 — Production deployment checklist</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunChecks}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase transition-colors disabled:opacity-60"
            >
              {running ? <RefreshCw size={12} className="animate-spin" /> : <Rocket size={12} />}
              {running ? 'Running…' : 'Run all checks'}
            </button>

            <button
              onClick={handlePrintCert}
              disabled={results.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase transition-colors disabled:opacity-50"
            >
              <Printer size={12} />
              Print Cert
            </button>
          </div>
        </div>
      </div>

      {/* ── Main body ── */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5 no-print">

        {/* Company selector */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Target company</p>
          <div className="flex gap-2 flex-wrap">
            {COMPANIES.map(c => (
              <button
                key={c}
                onClick={() => setCompany(c)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-colors ${company === c ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Verdict */}
          <div className={`rounded-2xl shadow-sm border p-4 ${verdictBadge.color.includes('emerald') ? 'bg-emerald-50 border-emerald-200' : verdictBadge.color.includes('amber') ? 'bg-amber-50 border-amber-200' : verdictBadge.color.includes('rose') ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">Verdict</p>
            <p className={`text-base font-black uppercase tracking-tight ${meta?.verdict === 'ready' ? 'text-emerald-700' : meta?.verdict === 'ready_with_warnings' ? 'text-amber-700' : meta?.verdict === 'not_ready' ? 'text-rose-700' : 'text-slate-400'}`}>
              {verdictBadge.label}
            </p>
            {lastRun && <p className="text-[9px] text-slate-400 font-bold mt-1">Run {new Date(lastRun).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}</p>}
          </div>

          {/* Readiness % */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">Readiness</p>
            <div className="flex items-baseline gap-1">
              <p className="text-2xl font-black text-blue-600">{meta?.readiness_pct ?? 0}</p>
              <p className="text-sm font-black text-slate-400">%</p>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className={`h-full transition-all ${(meta?.readiness_pct || 0) >= 90 ? 'bg-emerald-500' : (meta?.readiness_pct || 0) >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${meta?.readiness_pct ?? 0}%` }}
              />
            </div>
          </div>

          {/* Pass count */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">Passing</p>
            <p className="text-2xl font-black text-emerald-600">{meta?.pass_count ?? 0}</p>
            <p className="text-[9px] text-slate-400 font-bold mt-1">of {results.length} checks</p>
          </div>

          {/* Issues */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">Issues</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-rose-600">{meta?.fail_count ?? 0}</p>
              <p className="text-sm font-black text-amber-600">+{meta?.warning_count ?? 0}</p>
            </div>
            <p className="text-[9px] text-slate-400 font-bold mt-1">fail · warn</p>
          </div>
        </div>

        {/* Empty state */}
        {!loading && results.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <Rocket size={36} className="mx-auto text-slate-200 mb-4" />
            <p className="text-sm font-black text-slate-700 mb-1 uppercase">Ready to launch?</p>
            <p className="text-[11px] text-slate-500 font-bold mb-5">
              Click "Run all checks" above to verify {company} is production-ready.
            </p>
            <button
              onClick={handleRunChecks}
              disabled={running}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black uppercase shadow-lg transition-colors"
            >
              <Rocket size={14} />
              Start Check Run
            </button>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <RefreshCw size={24} className="mx-auto text-slate-200 animate-spin mb-3" />
            <p className="text-[10px] font-bold text-slate-400 uppercase">Loading latest results…</p>
          </div>
        )}

        {/* ── Grouped check results ── */}
        {results.length > 0 && (
          <>
            {(Object.keys(CATEGORY_META) as CheckCategory[]).map(cat => {
              const items = grouped[cat] || [];
              if (items.length === 0) return null;
              const passed = items.filter(i => i.status === 'pass').length;
              const m = CATEGORY_META[cat];
              return (
                <div key={cat} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
                    <span className={m.color}>{m.icon}</span>
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider flex-1">{m.label}</span>
                    <span className="text-[9px] font-black text-slate-500">{passed} / {items.length} pass</span>
                  </div>
                  <div className="p-3">
                    {items.map(c => (
                      <CheckRow key={c.key} check={c} onFixNav={handleFixNav} />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Footer action bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
                <TrendingUp size={11} />
                <span>{summary ? `Historical: ${summary.total_count} runs logged` : 'Re-run after each fix'}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearLogs}
                  className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-500 rounded-xl text-[10px] font-bold uppercase transition-colors"
                >
                  <Eraser size={11} />
                  Clear history
                </button>
                <button
                  onClick={handleRunChecks}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={11} className={running ? 'animate-spin' : ''} />
                  Re-run all checks
                </button>
                {meta?.verdict === 'ready' && (
                  <button
                    onClick={handlePrintCert}
                    className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase transition-colors"
                  >
                    <Award size={11} />
                    Issue Certificate
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Print-only certificate ── */}
      {meta && (
        <Certificate company={company} results={results} meta={meta} />
      )}
    </div>
  );
};

export default GoLiveDashboard;
