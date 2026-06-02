/**
 * FinanceInbox — Sprint 25
 *
 * Single page that shows everything awaiting accountant action:
 *   - Parked JVs needing review
 *   - Parked PVs from approved requisitions
 *   - 3-way matching pending (Sprint 11 sla_breaches)
 *   - Bank recon discrepancies (placeholder — wired when feature lands)
 *   - Aging > 90 days flagged
 *
 * URL: /#/finance/inbox
 *
 * No new RPCs / migrations — pulls everything from existing services
 * + the sla_breaches table from Sprint 13.
 *
 * Filtering: per-company. Honors useAppStore.selectedCompany.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/modules/shared/store/appStore';
import { FinanceService } from '@/modules/finance/services/financeService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { supabase } from '@/src/services/supabaseClient';
import EntityLink from '@/modules/shared/components/EntityLink';
import {
  Inbox, FileText, ClipboardList, Truck, Banknote, AlertTriangle, Clock,
  ChevronRight, RefreshCw, Loader2, CheckCircle2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

interface InboxBucket {
  id:        string;
  label:     string;
  icon:      React.ReactNode;
  /** Total count across this bucket. */
  count:     number;
  tone:      'rose' | 'amber' | 'blue' | 'slate';
  /** Optional CTA route. */
  ctaTo?:    string;
  ctaLabel?: string;
  rows:      Array<{ id: string; title: string; subtitle?: string; meta?: string; href?: string; entityType?: 'invoice' | 'quotation' | 'client' | 'vendor' | 'piece' | 'order' | 'dispatch' }>;
}

const TONE_CLASS: Record<InboxBucket['tone'], string> = {
  rose:  'border-rose-200 bg-rose-50 text-rose-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  blue:  'border-blue-200  bg-blue-50  text-blue-800',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
};

// ── Helpers ───────────────────────────────────────────────────────────

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysSince = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

const fmtPkr = (n: number): string => `PKR ${Math.round(n).toLocaleString()}`;

// ── Component ─────────────────────────────────────────────────────────

const FinanceInbox: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [buckets, setBuckets] = useState<InboxBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  // ── Load all buckets in parallel ───────────────────────────────
  useEffect(() => {
    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const [parkedJVs, parkedPVs, slaBreaches, agingInvoices] = await Promise.all([
          loadParkedJVs(company),
          loadParkedPVs(company),
          loadSlaBreaches(company),
          loadAgingInvoices(company),
        ]);

        if (!alive) return;

        const next: InboxBucket[] = [
          parkedJVs, parkedPVs, slaBreaches, agingInvoices,
          loadBankRecon(),   // synchronous placeholder
        ];

        setBuckets(next);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [company, refreshTick]);

  const totalActions = useMemo(
    () => buckets.reduce((s, b) => s + b.count, 0),
    [buckets],
  );

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Inbox size={20} className="text-blue-600"/>
            Finance Inbox
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Everything awaiting your action — {company} ·{' '}
            <strong className={totalActions > 0 ? 'text-rose-700' : 'text-emerald-700'}>
              {totalActions} item{totalActions === 1 ? '' : 's'}
            </strong>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshTick(t => t + 1)}
          className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-blue-400 text-xs font-bold flex items-center gap-1.5"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/> Refresh
        </button>
      </header>

      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center justify-center text-slate-500">
          <Loader2 className="animate-spin mr-2" size={16}/>
          <span className="text-sm">Loading inbox…</span>
        </div>
      )}

      {!loading && totalActions === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
          <CheckCircle2 className="text-emerald-500 mx-auto mb-2" size={40}/>
          <h2 className="text-base font-black text-emerald-800 mb-1">All caught up</h2>
          <p className="text-sm text-emerald-700">
            No parked JVs, no pending matches, no aging items needing review.
          </p>
        </div>
      )}

      {/* Buckets */}
      {!loading && buckets.filter(b => b.count > 0).map(bucket => (
        <BucketCard key={bucket.id} bucket={bucket}/>
      ))}

      {/* Quick links to related dashboards */}
      <footer className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink to="/accounts/trial-balance"      icon={<FileText size={14}/>}   label="Trial Balance"/>
        <QuickLink to="/accounts/ar-aging"           icon={<Clock size={14}/>}      label="AR Aging"/>
        <QuickLink to="/accounts/bank-reconciliation" icon={<Banknote size={14}/>}  label="Bank Recon"/>
        <QuickLink to="/accounts"                     icon={<Inbox size={14}/>}     label="Finance Home"/>
      </footer>
    </div>
  );
};

// ── Bucket card ───────────────────────────────────────────────────────

const BucketCard: React.FC<{ bucket: InboxBucket }> = ({ bucket }) => (
  <section className={`bg-white rounded-xl border-l-4 ${TONE_CLASS[bucket.tone]} border-y border-r border-slate-200 overflow-hidden`}>
    <header className="px-4 py-2.5 flex items-center justify-between gap-3 bg-white border-b border-slate-100">
      <div className="flex items-center gap-2">
        {bucket.icon}
        <h2 className="text-sm font-black text-slate-800">{bucket.label}</h2>
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${TONE_CLASS[bucket.tone]}`}>
          {bucket.count}
        </span>
      </div>
      {bucket.ctaTo && (
        <Link
          to={bucket.ctaTo}
          className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          {bucket.ctaLabel ?? 'View all'} <ChevronRight size={11}/>
        </Link>
      )}
    </header>
    {bucket.rows.length > 0 ? (
      <ul className="divide-y divide-slate-100">
        {bucket.rows.slice(0, 8).map((row, i) => (
          <li key={i} className="px-4 py-2 hover:bg-slate-50 flex items-center gap-3 text-xs">
            {row.entityType ? (
              <EntityLink type={row.entityType} id={row.id} className="font-mono shrink-0"/>
            ) : row.href ? (
              <Link to={row.href} className="font-mono font-bold text-blue-700 hover:underline shrink-0">{row.id}</Link>
            ) : (
              <span className="font-mono font-bold text-slate-700 shrink-0">{row.id}</span>
            )}
            <span className="text-slate-700 flex-1 truncate">{row.title}</span>
            {row.subtitle && (
              <span className="text-slate-400 hidden md:inline truncate max-w-xs">{row.subtitle}</span>
            )}
            {row.meta && (
              <span className="text-[10px] font-bold text-slate-500 shrink-0">{row.meta}</span>
            )}
          </li>
        ))}
        {bucket.rows.length > 8 && (
          <li className="px-4 py-2 text-[11px] text-slate-500 italic text-center bg-slate-50">
            + {bucket.rows.length - 8} more
          </li>
        )}
      </ul>
    ) : (
      <div className="px-4 py-3 text-xs text-slate-400 italic">Nothing to show</div>
    )}
  </section>
);

const QuickLink: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => (
  <Link
    to={to}
    className="bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 p-3 flex items-center gap-2 transition-colors"
  >
    <span className="text-blue-600">{icon}</span>
    <span className="text-xs font-bold text-slate-700">{label}</span>
    <ChevronRight size={11} className="ml-auto text-slate-300"/>
  </Link>
);

// ── Bucket loaders ────────────────────────────────────────────────────

async function loadParkedJVs(company: string): Promise<InboxBucket> {
  const ledger = FinanceService.getLedger();
  const parked = ledger
    .filter((tx: { company?: string; status?: string }) =>
      tx.company === company && (tx.status ?? 'Parked') === 'Parked')
    .slice(0, 50) as Array<{
      id: string; date?: string; description?: string; details?: Array<{ debit?: number; credit?: number }>; createdBy?: string;
    }>;

  const rows = parked.map(tx => {
    const total = (tx.details ?? []).reduce(
      (s: number, d: { debit?: number; credit?: number }) => s + (d.debit ?? d.credit ?? 0), 0,
    );
    return {
      id:       tx.id,
      title:    tx.description ?? 'Journal voucher',
      subtitle: tx.createdBy ? `by ${tx.createdBy}` : undefined,
      meta:     fmtPkr(total),
      href:     '/accounts',
    };
  });

  return {
    id:       'parked_jvs',
    label:    'Parked JVs — needs review',
    icon:     <FileText size={14} className="text-rose-600"/>,
    count:    rows.length,
    tone:     'rose',
    ctaTo:    '/accounts',
    ctaLabel: 'Open General Ledger',
    rows,
  };
}

async function loadParkedPVs(company: string): Promise<InboxBucket> {
  const reqs = InventoryService.getRequisitions()
    .filter((r: { company?: string; status?: string }) =>
      r.company === company && (r.status === 'Approved' || r.status === 'Approved-Awaiting-PV'));

  const rows = reqs.slice(0, 50).map((r: unknown) => {
    const req = r as { id: string; headerText?: string; date?: string; requisitioner?: string; items?: Array<{ amount?: number }> };
    const total = (req.items ?? []).reduce((s: number, it: { amount?: number }) => s + (it.amount ?? 0), 0);
    return {
      id:       req.id,
      title:    req.headerText ?? 'Approved requisition',
      subtitle: req.requisitioner,
      meta:     total > 0 ? fmtPkr(total) : (req.date ?? ''),
      href:     '/requisitions',
    };
  });

  return {
    id:       'parked_pvs',
    label:    'Parked PVs — approved requisitions awaiting payment voucher',
    icon:     <ClipboardList size={14} className="text-amber-600"/>,
    count:    rows.length,
    tone:     'amber',
    ctaTo:    '/requisitions',
    ctaLabel: 'Open Requisitions',
    rows,
  };
}

async function loadSlaBreaches(company: string): Promise<InboxBucket> {
  try {
    const { data } = await supabase
      .from('sla_breaches')
      .select('id, vendor_name, breach_type, dispatch_id, delay_days, expected_date')
      .eq('company', company)
      .eq('resolved', false)
      .in('breach_type', ['INVOICE_MISMATCH', 'LATE_RETURN', 'DAMAGED'])
      .order('detected_at', { ascending: false })
      .limit(50);

    type Row = { id: number; vendor_name: string; breach_type: string; dispatch_id: string | null; delay_days: number | null; expected_date: string | null };
    const list = (data ?? []) as Row[];

    const rows = list.map(b => ({
      id:       String(b.id),
      title:    `${b.breach_type.replace(/_/g, ' ')} — ${b.vendor_name}`,
      subtitle: b.dispatch_id ? `Dispatch ${b.dispatch_id}` : undefined,
      meta:     b.delay_days != null ? `${b.delay_days}d` : (b.expected_date ?? ''),
      href:     '/dispatch',
    }));

    return {
      id:       'three_way_match',
      label:    '3-way match + vendor SLA breaches',
      icon:     <Truck size={14} className="text-amber-600"/>,
      count:    rows.length,
      tone:     'amber',
      ctaTo:    '/dispatch',
      ctaLabel: 'Open Dispatch',
      rows,
    };
  } catch {
    return {
      id:    'three_way_match',
      label: '3-way match + vendor SLA breaches',
      icon:  <Truck size={14} className="text-amber-600"/>,
      count: 0,
      tone:  'amber',
      rows:  [],
    };
  }
}

async function loadAgingInvoices(company: string): Promise<InboxBucket> {
  const invoices = SalesService.getInvoices()
    .filter((inv: { company?: string }) => inv.company === company);

  type InvRow = { id: string; invoiceNumber?: string; clientName?: string; date?: string; balance?: number; grandTotal?: number; status?: string };
  const aged = (invoices as InvRow[])
    .filter(i => (i.balance ?? 0) > 0 && i.status !== 'Cancelled')
    .map(i => ({ ...i, daysOld: i.date ? daysSince(i.date) : 0 }))
    .filter(i => i.daysOld > 90)
    .sort((a, b) => b.daysOld - a.daysOld)
    .slice(0, 50);

  const rows = aged.map(i => ({
    id:        i.invoiceNumber ?? i.id,
    title:     i.clientName ?? '—',
    subtitle:  `${i.daysOld} days old`,
    meta:      fmtPkr(i.balance ?? 0),
    entityType: 'invoice' as const,
  }));

  return {
    id:       'aging_invoices',
    label:    'Invoices aging > 90 days',
    icon:     <Clock size={14} className="text-rose-600"/>,
    count:    rows.length,
    tone:     'rose',
    ctaTo:    '/accounts/ar-aging',
    ctaLabel: 'View AR Aging',
    rows,
  };
}

function loadBankRecon(): InboxBucket {
  // Placeholder — Sprint 26+ will surface live recon discrepancies.
  // For now show 0 so the bucket only appears once feature ships.
  return {
    id:    'bank_recon',
    label: 'Bank reconciliation discrepancies',
    icon:  <Banknote size={14} className="text-blue-600"/>,
    count: 0,
    tone:  'blue',
    ctaTo: '/accounts/bank-reconciliation',
    rows:  [],
  };
}

export default FinanceInbox;
