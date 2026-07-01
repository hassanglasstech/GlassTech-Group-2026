/**
 * AdvanceTracker.tsx — Session 5
 * Shows outstanding cash advances per purchaser
 * Settlement status: Unsettled / Settled (Exact/Under/Over)
 * Data from: FinanceService.getOutstandingAdvances()
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { FinanceService } from '@/modules/finance/services/financeService';
import {
  Banknote, CheckCircle2, AlertTriangle, Clock, Search,
  ChevronDown, TrendingDown, TrendingUp, Minus, Download
} from 'lucide-react';

const AdvanceTracker: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Unsettled' | 'Settled'>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const advances = useMemo(() => {
    try {
      return FinanceService.getOutstandingAdvances(company as any);
    } catch { return []; }
  }, [company]);

  // ── Filter ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return advances.filter(a => {
      if (filterStatus === 'Unsettled' && a.settled) return false;
      if (filterStatus === 'Settled' && !a.settled) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return a.purchaser.toLowerCase().includes(q) ||
               a.reqId.toLowerCase().includes(q) ||
               a.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [advances, searchTerm, filterStatus]);

  // ── Stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const unsettled = advances.filter(a => !a.settled);
    const settled = advances.filter(a => a.settled);
    return {
      totalAdvances: advances.length,
      unsettledCount: unsettled.length,
      unsettledAmount: unsettled.reduce((s, a) => s + a.amount, 0),
      settledCount: settled.length,
      totalGiven: advances.reduce((s, a) => s + a.amount, 0),
    };
  }, [advances]);

  // ── Purchaser-wise grouping ─────────────────────────────────────────
  const byPurchaser = useMemo(() => {
    const map: Record<string, { name: string; unsettled: number; total: number; count: number }> = {};
    for (const a of advances) {
      const key = a.purchaser || 'Unknown';
      if (!map[key]) map[key] = { name: key, unsettled: 0, total: 0, count: 0 };
      map[key].total += a.amount;
      map[key].count++;
      if (!a.settled) map[key].unsettled += a.amount;
    }
    return Object.values(map).sort((a, b) => b.unsettled - a.unsettled);
  }, [advances]);

  // ── Export CSV ──────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = ['Req ID,PV ID,Purchaser,Date,Amount,Status,Settled Amount,Variance'];
    for (const a of filtered) {
      rows.push([
        a.reqId, a.pvId, `"${a.purchaser}"`, a.date,
        a.amount, a.settled ? 'Settled' : 'Unsettled',
        a.settledAmount, (a as any).variance ?? '',
      ].join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `Advances-${company}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Stats Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-slate-400">Total Advances</p>
          <p className="text-2xl font-black text-slate-800">{stats.totalAdvances}</p>
          <p className="text-xs font-bold text-slate-400">PKR {stats.totalGiven.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5 border-l-4 border-l-amber-400">
          <p className="text-[10px] font-black uppercase text-amber-600">Unsettled</p>
          <p className="text-2xl font-black text-amber-600">{stats.unsettledCount}</p>
          <p className="text-xs font-bold text-amber-500">PKR {stats.unsettledAmount.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-emerald-600">Settled</p>
          <p className="text-2xl font-black text-emerald-600">{stats.settledCount}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-slate-400">Purchasers</p>
          <p className="text-2xl font-black text-slate-800">{byPurchaser.length}</p>
        </div>
      </div>

      {/* ── Purchaser-wise Summary ────────────────────────────────── */}
      {byPurchaser.some(p => p.unsettled > 0) && (
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Outstanding by Purchaser</p>
          <div className="flex flex-wrap gap-3">
            {byPurchaser.filter(p => p.unsettled > 0).map(p => (
              <div key={p.name} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex items-center space-x-3">
                <Banknote size={14} className="text-amber-600" />
                <div>
                  <p className="text-xs font-black text-amber-800">{p.name}</p>
                  <p className="text-[10px] font-bold text-amber-600">PKR {p.unsettled.toLocaleString()} unsettled ({p.count} advances)</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input type="text" placeholder="Search by purchaser, req ID..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select className="px-3 py-2.5 bg-slate-50 border rounded-xl text-xs font-bold"
          value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
          <option value="All">All</option>
          <option value="Unsettled">Unsettled Only</option>
          <option value="Settled">Settled Only</option>
        </select>
        <button onClick={handleExport}
          className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600">
          <Download size={14} /><span>Export</span>
        </button>
      </div>

      {/* ── Advance List ─────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <Banknote size={40} className="mx-auto text-slate-200 mb-3" />
          <p className="text-sm font-bold text-slate-400">No advances found</p>
          <p className="text-xs text-slate-300 mt-1">Advances are created when Store Purchase requisitions are approved</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                <th className="px-4 py-3 text-left">Req ID</th>
                <th className="px-4 py-3 text-left">Purchaser</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Advance</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(adv => (
                <tr key={adv.pvId}
                  className={`border-b border-slate-50 hover:bg-blue-50/30 cursor-pointer ${!adv.settled ? 'bg-amber-50/30' : ''}`}
                  onClick={() => setExpandedId(expandedId === adv.pvId ? null : adv.pvId)}>
                  <td className="px-4 py-3 font-black text-blue-600">{adv.reqId}</td>
                  <td className="px-4 py-3 font-bold text-slate-800">{adv.purchaser}</td>
                  <td className="px-4 py-3 font-medium text-slate-600 max-w-[200px] truncate">{adv.description}</td>
                  <td className="px-4 py-3 font-bold text-slate-500">{adv.date}</td>
                  <td className="px-4 py-3 text-right font-black text-slate-800">PKR {adv.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    {adv.settled ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black flex items-center gap-1 justify-center w-fit mx-auto">
                        <CheckCircle2 size={10} /> Settled
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-black flex items-center gap-1 justify-center w-fit mx-auto">
                        <Clock size={10} /> Unsettled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {adv.settled && (adv as any).variance != null ? (
                      <span className={`font-black flex items-center justify-end gap-1 ${
                        (adv as any).variance === 0 ? 'text-emerald-600' :
                        (adv as any).variance < 0 ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {(adv as any).variance === 0 ? <Minus size={12} /> :
                         (adv as any).variance < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                        {(adv as any).variance === 0 ? 'Exact' : `PKR ${Math.abs((adv as any).variance).toLocaleString()}`}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdvanceTracker;
