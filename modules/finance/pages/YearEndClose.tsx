/**
 * YearEndClose.tsx — Sprint 31
 *
 * Year-end close wizard. Drives the year_end_close(p_company, p_year)
 * RPC from migration 057. Three-step UI:
 *
 *   1. Select fiscal year + read-only checklist of open periods.
 *   2. Pre-flight summary: imbalanced JVs, parked entries, missing
 *      Retained Earnings account warning.
 *   3. Confirm + run.
 *
 * After success: shows the consolidated JV id, the P&L delta moved
 * to Retained Earnings, and the count of months locked.
 *
 * Mounted at /accounts/year-end (lazy route).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { Company } from '@/modules/shared/types';
import { PeriodService, FiscalPeriod, PeriodState } from '@/modules/finance/services/periodService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { supabase } from '@/src/services/supabaseClient';
import { toast } from 'sonner';
import {
  Calendar, Lock, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft,
  TrendingUp, Loader2, Info, FileText, Banknote,
} from 'lucide-react';

type WizardStep = 'year' | 'preflight' | 'confirm' | 'done';

interface PreflightReport {
  imbalancedJVs:        { id: string; date: string; diff: number }[];
  parkedJVs:            number;
  pAndLAccounts:        number;
  retainedEarningsId:   string | null;
  unclosedMonths:       string[];        // months in target year still 'Open'
}

const fmtPKR = (n: number) =>
  n.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const YearEndClose: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany) as Company;
  const user    = useAuthStore(s => s.user);
  const profile = useAuthStore(s => s.profile);
  const actor   = profile?.fullName || user?.email || 'system';

  const [step, setStep] = useState<WizardStep>('year');
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear - 1);
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [statesByMonth, setStatesByMonth] = useState<Record<string, PeriodState>>({});
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState<Awaited<ReturnType<typeof PeriodService.runYearEndClose>> | null>(null);

  // Year picker options — last 5 + this year
  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  // Load periods for the chosen year + their 4-state values
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const allPeriods = PeriodService.listPeriods(company);
      const yearPeriods = allPeriods.filter(p => p.month.startsWith(`${year}-`));
      if (cancelled) return;
      setPeriods(yearPeriods);
      // Pull live 4-state values
      const next: Record<string, PeriodState> = {};
      for (const p of yearPeriods) {
        next[p.month] = await PeriodService.getPeriodState(company, p.month);
      }
      if (cancelled) return;
      setStatesByMonth(next);
    })();
    return () => { cancelled = true; };
  }, [company, year]);

  // Build pre-flight report once user moves to step 2
  const buildPreflight = async (): Promise<PreflightReport> => {
    const ledger  = FinanceService.getLedger().filter((t: any) => t.company === company);
    const accounts = FinanceService.getAccounts().filter((a: any) => a.company === company);
    const yearLedger = ledger.filter((t: any) => {
      const d = (t.date || t.docDate || '').slice(0, 4);
      return d === String(year);
    });
    const imbalancedJVs: PreflightReport['imbalancedJVs'] = [];
    yearLedger.forEach((t: any) => {
      const dr = (t.details || []).reduce((s: number, d: any) => s + (Number(d.debit) || 0), 0);
      const cr = (t.details || []).reduce((s: number, d: any) => s + (Number(d.credit) || 0), 0);
      if (Math.abs(dr - cr) >= 0.01) {
        imbalancedJVs.push({ id: t.id, date: t.date || t.docDate, diff: dr - cr });
      }
    });
    const parked = yearLedger.filter((t: any) => t.status === 'Parked').length;
    const pAndL = accounts.filter((a: any) => a.type === 'Revenue' || a.type === 'Expense').length;
    const re = accounts.find((a: any) => a.code === '30100');

    // Compute unclosed months from server-side state
    const unclosed: string[] = Object.entries(statesByMonth)
      .filter(([_, s]) => s !== 'Locked' && s !== 'Hard-Close')
      .map(([m]) => m)
      .sort();

    return {
      imbalancedJVs,
      parkedJVs:           parked,
      pAndLAccounts:       pAndL,
      retainedEarningsId:  re?.id || null,
      unclosedMonths:      unclosed,
    };
  };

  const handleNextToPreflight = async () => {
    const r = await buildPreflight();
    setPreflight(r);
    setStep('preflight');
  };

  const handleRun = async () => {
    setRunning(true);
    const res = await PeriodService.runYearEndClose(company, year, actor);
    setRunning(false);
    setResult(res);
    if (res.ok) {
      toast.success(`Year ${year} closed — ${res.periodsLocked} periods locked.`);
      setStep('done');
    } else {
      toast.error(`Year-end close failed: ${res.error}`);
    }
  };

  // ── Render helpers ───────────────────────────────────────────────────
  const stateBadge = (s: PeriodState) => {
    const cls = {
      Open:         'bg-emerald-100 text-emerald-700',
      'Soft-Close': 'bg-amber-100 text-amber-700',
      'Hard-Close': 'bg-rose-100 text-rose-700',
      Locked:       'bg-slate-900 text-white',
    }[s];
    return <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${cls}`}>{s}</span>;
  };

  return (
    <div className="space-y-5 p-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-800 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lock size={24}/>
          <div>
            <h1 className="text-xl font-black uppercase">Year-End Close</h1>
            <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest mt-0.5">
              {company} · Roll P&amp;L → Retained Earnings · Lock all periods
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-indigo-200 font-bold uppercase">Step</p>
          <p className="text-2xl font-black">
            {step === 'year' ? '1' : step === 'preflight' ? '2' : step === 'confirm' ? '3' : '✓'} <span className="text-sm opacity-60">/ 3</span>
          </p>
        </div>
      </div>

      {/* Step 1 — Year picker */}
      {step === 'year' && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 space-y-5">
          <div>
            <h2 className="text-base font-black uppercase mb-1 flex items-center gap-2"><Calendar size={16}/> Choose Fiscal Year to Close</h2>
            <p className="text-xs text-slate-500 font-bold">Year-end close is irreversible — pick carefully.</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {yearOptions.map(y => (
              <button
                key={y}
                onClick={() => setYear(y)}
                disabled={y === currentYear}
                className={`min-h-[60px] rounded-xl border-2 font-black text-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  year === y ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 font-bold italic">
            Current year ({currentYear}) cannot be closed mid-year. Wait until 1 Jan of the following year.
          </p>

          {/* Period state grid */}
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{year} period states</p>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => {
                const m = `${year}-${String(i + 1).padStart(2, '0')}`;
                const s = statesByMonth[m] || 'Open';
                return (
                  <div key={m} className="text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase">{m.slice(5)}</p>
                    <div className="mt-1">{stateBadge(s)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleNextToPreflight}
              className="min-h-[48px] px-6 bg-indigo-700 text-white rounded-xl text-sm font-black uppercase hover:bg-indigo-800 flex items-center gap-2"
            >
              Next: Pre-flight <ChevronRight size={16}/>
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Pre-flight report */}
      {step === 'preflight' && preflight && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 space-y-4">
            <h2 className="text-base font-black uppercase mb-1 flex items-center gap-2"><Info size={16}/> Pre-flight checks for {year}</h2>

            {/* Blocking: imbalanced JVs */}
            <CheckRow
              ok={preflight.imbalancedJVs.length === 0}
              label={`Ledger entries balanced (Dr = Cr): ${preflight.imbalancedJVs.length === 0 ? 'pass' : `${preflight.imbalancedJVs.length} imbalanced`}`}
              detail={preflight.imbalancedJVs.length > 0
                ? preflight.imbalancedJVs.slice(0, 5).map(j => `${j.id} (${j.date}, Δ ${fmtPKR(j.diff)})`).join('; ')
                : 'All JVs in this year balance to within PKR 0.01.'}
              blocking
            />
            <CheckRow
              ok={preflight.retainedEarningsId !== null}
              label={`Retained Earnings account exists: ${preflight.retainedEarningsId ? 'pass' : 'will be auto-created'}`}
              detail={preflight.retainedEarningsId ? `Account ${preflight.retainedEarningsId}` : 'AC-RE-' + company + ' will be created at close time.'}
            />
            <CheckRow
              ok={preflight.pAndLAccounts > 0}
              label={`P&L accounts found: ${preflight.pAndLAccounts}`}
              detail={preflight.pAndLAccounts === 0 ? 'Nothing to close — wizard will only Lock the periods.' : 'Revenue + Expense accounts will be zeroed.'}
            />
            <CheckRow
              ok={preflight.parkedJVs === 0}
              label={`Parked (un-posted) JVs: ${preflight.parkedJVs}`}
              detail={preflight.parkedJVs > 0 ? 'Parked entries are NOT included in the rollup. Post or void them first.' : 'No parked entries in this year.'}
            />
            <CheckRow
              ok={preflight.unclosedMonths.length === 0}
              label={`Months still Open / Soft-Close: ${preflight.unclosedMonths.length}`}
              detail={preflight.unclosedMonths.length > 0
                ? `Will be force-Locked: ${preflight.unclosedMonths.join(', ')}`
                : 'All 12 months are already Hard-Close or Locked.'}
            />
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('year')} className="min-h-[48px] px-5 border-2 border-slate-200 rounded-xl text-sm font-black uppercase text-slate-500 flex items-center gap-2"><ChevronLeft size={16}/> Back</button>
            <button
              onClick={() => setStep('confirm')}
              disabled={preflight.imbalancedJVs.length > 0}
              className="min-h-[48px] px-6 bg-indigo-700 text-white rounded-xl text-sm font-black uppercase hover:bg-indigo-800 flex items-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              Next: Confirm <ChevronRight size={16}/>
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Confirm */}
      {step === 'confirm' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border-2 border-rose-200 p-5 space-y-4">
            <div className="flex items-center gap-3 text-rose-700">
              <AlertTriangle size={24}/>
              <h2 className="text-base font-black uppercase">Final Confirmation</h2>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              You are about to close <strong>fiscal year {year}</strong> for <strong>{company}</strong>.
              This will:
            </p>
            <ul className="text-sm text-slate-700 space-y-1.5 ml-4 list-disc">
              <li>Post a consolidated JV (<code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs">JV-YEC-{company}-{year}</code>) rolling all P&amp;L balances into Retained Earnings.</li>
              <li>Mark all 12 months of {year} as <strong>Locked</strong>. No new entries dated in {year} can be posted, even by admins, without explicit override.</li>
              <li>Stamp every period row with <code className="text-xs">year_end_run_at</code> + <code className="text-xs">locked_by = {actor}</code>.</li>
            </ul>
            <p className="text-xs text-rose-600 font-bold">Operation is idempotent — re-running returns the same JV id without re-posting. But unlocking requires a separate admin action.</p>

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep('preflight')} className="min-h-[48px] px-5 border-2 border-slate-200 rounded-xl text-sm font-black uppercase text-slate-500 flex items-center gap-2"><ChevronLeft size={16}/> Back</button>
              <button
                onClick={handleRun}
                disabled={running}
                className="min-h-[48px] px-6 bg-rose-700 text-white rounded-xl text-sm font-black uppercase hover:bg-rose-800 flex items-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                {running ? <><Loader2 size={16} className="animate-spin"/> Closing…</> : <><Lock size={16}/> Run Year-End Close</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Done */}
      {step === 'done' && result && (
        <div className="bg-white rounded-2xl border-2 border-emerald-300 p-6 space-y-4">
          <div className="flex items-center gap-3 text-emerald-700">
            <CheckCircle2 size={28}/>
            <h2 className="text-lg font-black uppercase">Year {year} Closed</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiTile label="JV ID"                value={result.jvId || '—'} icon={<FileText size={12}/>} mono/>
            <KpiTile label="Status"               value={result.status === 'already_posted' ? 'Already posted' : 'Posted'}/>
            <KpiTile label="Accounts zeroed"      value={String(result.accountsZeroed ?? 0)} icon={<TrendingUp size={12}/>}/>
            <KpiTile label="Periods locked"       value={String(result.periodsLocked ?? 0)}  icon={<Lock size={12}/>}/>
            <KpiTile label="Profit / (Loss)"      value={`PKR ${fmtPKR(result.retainedEarningsDelta || 0)}`} wide icon={<Banknote size={12}/>}/>
          </div>
          <div className="flex justify-end">
            <button onClick={() => { setStep('year'); setResult(null); setPreflight(null); }} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase hover:bg-slate-800">
              Close another year
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const CheckRow: React.FC<{
  ok:        boolean;
  label:     string;
  detail:    string;
  blocking?: boolean;
}> = ({ ok, label, detail, blocking }) => (
  <div className={`flex items-start gap-3 p-3 rounded-xl border-2 ${ok ? 'bg-emerald-50 border-emerald-200' : blocking ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
    {ok
      ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5"/>
      : <AlertTriangle size={18} className={`shrink-0 mt-0.5 ${blocking ? 'text-rose-600' : 'text-amber-600'}`}/>
    }
    <div className="min-w-0 flex-1">
      <p className={`text-xs font-black ${ok ? 'text-emerald-800' : blocking ? 'text-rose-800' : 'text-amber-800'}`}>
        {label}{blocking && !ok && <span className="ml-2 text-[9px] uppercase tracking-widest text-rose-700 bg-rose-200 px-1.5 py-0.5 rounded">Blocking</span>}
      </p>
      <p className="text-[11px] text-slate-600 mt-0.5">{detail}</p>
    </div>
  </div>
);

const KpiTile: React.FC<{ label: string; value: string; icon?: React.ReactNode; mono?: boolean; wide?: boolean }> = ({ label, value, icon, mono, wide }) => (
  <div className={`bg-slate-50 rounded-xl p-3 ${wide ? 'col-span-2 sm:col-span-2' : ''}`}>
    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">{icon}{label}</p>
    <p className={`text-base font-black text-slate-900 mt-1 ${mono ? 'font-mono' : ''} truncate`}>{value}</p>
  </div>
);

export default YearEndClose;
