import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { supabase } from '@/src/services/supabaseClient';
import {
  Users, TrendingUp, TrendingDown, AlertTriangle,
  RefreshCw, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import ReportExport from '@/modules/finance/components/ReportExport';

interface VendorRow {
  vendorId:    string;
  vendorName:  string;
  totalPOs:    number;
  totalValue:  number;
  receivedPOs: number;
  onTimePOs:   number;
  onTimePct:   number;
  latePOs:     number;
  avgLeadDays: number;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-PK');

const VendorScorecard: React.FC = () => {
  const { user, profile } = useAuthStore();
  const company           = useAppStore(s => s.selectedCompany) ?? profile?.company ?? user?.company ?? 'Glassco';

  const [rows,    setRows]    = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort,    setSort]    = useState<keyof VendorRow>('totalValue');
  const [from,    setFrom]    = useState(`${new Date().getFullYear()}-01-01`);
  const [to,      setTo]      = useState(new Date().toISOString().slice(0, 10));

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, vendor_id, total_amount, status, order_date, expected_delivery_date, actual_delivery_date, vendors(name)')
        .eq('company', company)
        .gte('order_date', from)
        .lte('order_date', to);

      if (error) throw error;

      const map = new Map<string, VendorRow>();
      (data ?? []).forEach((po: any) => {
        const vId   = po.vendor_id ?? 'unknown';
        const vName = po.vendors?.name ?? po.vendor_id ?? '—';
        const cur   = map.get(vId) ?? {
          vendorId: vId, vendorName: vName,
          totalPOs: 0, totalValue: 0, receivedPOs: 0,
          onTimePOs: 0, latePOs: 0, onTimePct: 0, avgLeadDays: 0,
        };

        cur.totalPOs++;
        cur.totalValue += Number(po.total_amount) || 0;

        if (po.status === 'received') {
          cur.receivedPOs++;
          const expected = po.expected_delivery_date ? new Date(po.expected_delivery_date) : null;
          const actual   = po.actual_delivery_date   ? new Date(po.actual_delivery_date)   : null;
          const ordered  = po.order_date             ? new Date(po.order_date)              : null;

          if (expected && actual) {
            if (actual <= expected) cur.onTimePOs++;
            else cur.latePOs++;
          }
          if (ordered && actual) {
            const lead = Math.floor((actual.getTime() - ordered.getTime()) / 86400000);
            cur.avgLeadDays = ((cur.avgLeadDays * (cur.receivedPOs - 1)) + lead) / cur.receivedPOs;
          }
        }

        cur.onTimePct = cur.receivedPOs > 0
          ? Math.round((cur.onTimePOs / cur.receivedPOs) * 100)
          : 0;

        map.set(vId, cur);
      });

      setRows(Array.from(map.values()));
    } catch (e) {
      toast.error('Failed to load vendor data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [company, from, to]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b[sort] as number) - (a[sort] as number)),
    [rows, sort],
  );

  const totals = rows.reduce(
    (t, r) => ({ pos: t.pos + r.totalPOs, value: t.value + r.totalValue }),
    { pos: 0, value: 0 },
  );

  const avgOnTime = rows.length
    ? Math.round(rows.reduce((s, r) => s + r.onTimePct, 0) / rows.length)
    : 0;

  const exportRows = sorted.map(r => ({
    'Vendor':         r.vendorName,
    'Total POs':      r.totalPOs,
    'Total Value (₨)':Math.round(r.totalValue),
    'Received POs':   r.receivedPOs,
    'On-Time POs':    r.onTimePOs,
    'On-Time %':      r.onTimePct,
    'Late POs':       r.latePOs,
    'Avg Lead Days':  Math.round(r.avgLeadDays),
  }));

  const scoreBadge = (pct: number) => {
    if (pct >= 90) return { cls: 'bg-emerald-100 text-emerald-700', label: 'Excellent' };
    if (pct >= 70) return { cls: 'bg-amber-100 text-amber-700',    label: 'Good' };
    if (pct >= 50) return { cls: 'bg-orange-100 text-orange-700',  label: 'Fair' };
    return            { cls: 'bg-rose-100 text-rose-700',          label: 'Poor' };
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-purple-900 text-white p-6 rounded-[2rem] shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Users size={20}/> Vendor Scorecard
            </h2>
            <p className="text-[10px] text-purple-300 font-bold uppercase tracking-widest mt-0.5">
              {company} · On-time % · Lead time · PO volume
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/20">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-black text-slate-400 uppercase">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-black text-slate-400 uppercase">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400" />
        </div>
        <button onClick={load} disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Loading…' : 'Run'}
        </button>
        <div className="ml-auto">
          <ReportExport title="Vendor_Scorecard" rows={exportRows} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { l: 'Total Vendors',   v: rows.length,         c: 'border-slate-200 bg-slate-50 text-slate-700' },
          { l: 'Total POs',       v: totals.pos,          c: 'border-blue-200 bg-blue-50 text-blue-700' },
          { l: 'Total Value',     v: `₨ ${fmt(totals.value)}`, c: 'border-purple-200 bg-purple-50 text-purple-700' },
          { l: 'Avg On-Time %',   v: `${avgOnTime}%`,     c: avgOnTime >= 80 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700' },
        ].map(k => (
          <div key={k.l} className={`border rounded-2xl p-4 ${k.c}`}>
            <p className="text-[9px] font-black uppercase opacity-70">{k.l}</p>
            <p className="text-xl font-black mt-1">{k.v}</p>
          </div>
        ))}
      </div>

      {/* Sort selector */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black text-slate-400 uppercase">Sort by:</span>
        {(['totalValue', 'onTimePct', 'totalPOs', 'avgLeadDays'] as const).map(s => (
          <button key={s} onClick={() => setSort(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${sort === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
            {s === 'totalValue' ? 'Value' : s === 'onTimePct' ? 'On-Time %' : s === 'totalPOs' ? 'PO Count' : 'Lead Days'}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-slate-300 text-xs font-bold">Loading vendor data…</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-white">
              <tr>
                {['Vendor','Total POs','Value (₨)','Received','On-Time','On-Time %','Late','Avg Lead','Rating'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-black text-[10px] uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((r, i) => {
                const badge = scoreBadge(r.onTimePct);
                return (
                  <tr key={r.vendorId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                    <td className="px-4 py-2.5 font-bold text-slate-800">{r.vendorName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.totalPOs}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">₨ {fmt(r.totalValue)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.receivedPOs}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 size={11}/> {r.onTimePOs}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-12 bg-slate-100 rounded-full h-1.5">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${r.onTimePct}%` }}/>
                        </div>
                        <span className="font-black text-slate-800">{r.onTimePct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.latePOs > 0 ? (
                        <span className="flex items-center gap-1 text-rose-600">
                          <XCircle size={11}/> {r.latePOs}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1 text-slate-500">
                        <Clock size={11}/> {Math.round(r.avgLeadDays)}d
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${badge.cls}`}>{badge.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div className="py-16 text-center text-slate-300 text-xs font-bold uppercase">
              No purchase orders found for this period
            </div>
          )}
        </div>
      )}

      <style>{`@media print { .no-print { display: none !important; } }`}</style>
    </div>
  );
};

export default VendorScorecard;
