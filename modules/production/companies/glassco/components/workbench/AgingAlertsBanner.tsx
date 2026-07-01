/**
 * AgingAlertsBanner — Sprint 18
 *
 * Top-of-page alert banner for supervisors:
 *   - Aging pieces (lastUpdated > 7 days, not Delivered/Broken/Returned)
 *   - Open vendor SLA breaches (from Sprint 13 sla_breaches table)
 *
 * Three colour states:
 *   - emerald  — all clear (optionally hidden via `hideWhenClear`)
 *   - amber    — at-risk (3–7 day pieces, expiring driver docs)
 *   - rose     — critical (>7 day pieces, late returns, license expired)
 *
 * Polls every 60s. Cheap — two indexed queries.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, ChevronRight, X } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { useAppStore } from '@/modules/shared/store/appStore';
import type { ProductionPiece } from '@/modules/shared/types';

interface AgingAlertsBannerProps {
  pieces: ProductionPiece[];
  /** Hide entirely when nothing's wrong. Default false (show emerald state). */
  hideWhenClear?: boolean;
}

const TERMINAL_STATES = new Set(['Delivered', 'Broken', 'Returned', 'Cancelled']);

interface SlaBreachRow {
  id: number;
  vendor_name: string;
  breach_type: string;
  delay_days:  number | null;
  detected_at: string;
}

const AgingAlertsBanner: React.FC<AgingAlertsBannerProps> = ({ pieces, hideWhenClear = false }) => {
  const company = useAppStore(s => s.selectedCompany);
  const [breaches, setBreaches]   = useState<SlaBreachRow[]>([]);
  const [dismissed, setDismissed] = useState(false);

  // ── Compute piece-aging buckets ────────────────────────────────
  const { red, amber } = useMemo(() => {
    const now = Date.now();
    let red = 0, amber = 0;
    for (const p of pieces) {
      if (TERMINAL_STATES.has(p.status)) continue;
      if (!p.lastUpdated) continue;
      const days = (now - new Date(p.lastUpdated).getTime()) / 86_400_000;
      if (days > 7)      red += 1;
      else if (days >= 3) amber += 1;
    }
    return { red, amber };
  }, [pieces]);

  // ── Fetch open SLA breaches every 60s ─────────────────────────
  useEffect(() => {
    let alive = true;
    const fetchBreaches = async () => {
      const { data, error } = await supabase
        .from('sla_breaches')
        .select('id, vendor_name, breach_type, delay_days, detected_at')
        .eq('company', company)
        .eq('resolved', false)
        .order('detected_at', { ascending: false })
        .limit(20);
      if (!alive) return;
      if (!error) setBreaches((data ?? []) as SlaBreachRow[]);
    };
    fetchBreaches();
    const id = setInterval(fetchBreaches, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [company]);

  if (dismissed) return null;

  const lateReturns = breaches.filter(b => b.breach_type === 'LATE_RETURN').length;
  const licenseExp  = breaches.filter(b => b.breach_type === 'LICENSE_EXPIRY').length;
  const totalCritical = red + lateReturns;
  const totalAtRisk   = amber + licenseExp;

  if (hideWhenClear && totalCritical === 0 && totalAtRisk === 0) return null;

  // ── Severity colour ─────────────────────────────────────────────
  const tone = totalCritical > 0 ? 'rose' : totalAtRisk > 0 ? 'amber' : 'emerald';
  const toneClass = {
    rose:    'bg-rose-50    border-rose-200    text-rose-800',
    amber:   'bg-amber-50   border-amber-200   text-amber-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }[tone];
  const Icon = tone === 'emerald' ? Clock : AlertTriangle;

  return (
    <div className={`border-b ${toneClass} px-4 py-2 flex items-center gap-3 text-xs`}>
      <Icon size={14} className="shrink-0"/>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
        {tone === 'emerald' && (
          <span className="font-bold">All clear — no aging pieces or open SLA breaches.</span>
        )}

        {red > 0 && (
          <Link
            to="/production/workbench?lens=overdue"
            className="font-bold underline hover:opacity-80 flex items-center gap-1"
          >
            <span className="bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center font-black text-2xs">{red}</span>
            piece{red === 1 ? '' : 's'} overdue (&gt;7d)
            <ChevronRight size={11}/>
          </Link>
        )}

        {amber > 0 && (
          <span className="flex items-center gap-1">
            <span className="bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-black text-2xs">{amber}</span>
            at-risk (3–7d)
          </span>
        )}

        {lateReturns > 0 && (
          <Link
            to="/dispatch"
            className="font-bold underline hover:opacity-80 flex items-center gap-1"
          >
            <span className="bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center font-black text-2xs">{lateReturns}</span>
            late tempering return{lateReturns === 1 ? '' : 's'}
            <ChevronRight size={11}/>
          </Link>
        )}

        {licenseExp > 0 && (
          <span className="flex items-center gap-1">
            <span className="bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-black text-2xs">{licenseExp}</span>
            driver doc{licenseExp === 1 ? '' : 's'} expiring
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="opacity-50 hover:opacity-100 p-0.5 rounded"
        aria-label="Dismiss banner"
      >
        <X size={14}/>
      </button>
    </div>
  );
};

export default AgingAlertsBanner;
