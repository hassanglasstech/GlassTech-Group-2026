/**
 * IntercompanyBoard — Intercompany P5 (group IC + project profitability).
 *
 * Read-only MD lens over the whole group's intercompany activity:
 *   • IC flows — how much each buyer→supplier leg is worth (order-time).
 *   • Project profitability — contract value − glass − hardware − other consumed,
 *     live as IC deliveries land (fed by IC-P4's consumed buckets).
 *   • Elimination summary — the total IC leg that consolidation must eliminate so
 *     group revenue/profit isn't double-counted (IFRS 10).
 * Mounted as a tab in the Intercompany Hub.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Quotation, Project } from '@/modules/shared/types';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { ProjectService } from '@/modules/projects/services/projectService';
import { ArrowRight, TrendingUp, Scale, Layers } from 'lucide-react';

const money = (n: number): string => `PKR ${Math.round(n).toLocaleString()}`;

const IntercompanyBoard: React.FC = () => {
  const [orders, setOrders] = useState<Quotation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    // Quotations live in the cloud/IDB (not localStorage) — read cloud-first.
    // Scoped to the active company's visibility (RLS); for super_admin that's the
    // whole group. IC orders are tagged intercompany.
    let alive = true;
    (async () => {
      const qs = await AsyncSalesService.getQuotations();
      if (alive) setOrders((qs as Quotation[]).filter(q => q.intercompany));
    })();
    setProjects(ProjectService.getProjects());
    return () => { alive = false; };
  }, []);

  const orderTotal = (o: Quotation) => (o.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);

  // IC flows — group by buyer→supplier leg.
  const flows = useMemo(() => {
    const map = new Map<string, { buyer: string; supplier: string; count: number; value: number }>();
    for (const o of orders) {
      const key = `${o.sourceCompany || '?'}→${o.company}`;
      const cur = map.get(key) || { buyer: o.sourceCompany || '?', supplier: o.company, count: 0, value: 0 };
      cur.count += 1; cur.value += orderTotal(o);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [orders]);

  const icTotal = flows.reduce((s, f) => s + f.value, 0);
  const delivered = orders.filter(o => o.status === 'Delivered' || o.status === 'Invoiced' || o.status === 'Paid');
  const deliveredValue = delivered.reduce((s, o) => s + orderTotal(o), 0);

  // Project profitability — only projects with a contract value or IC consumption.
  const projectRows = useMemo(() => projects
    .map(p => {
      const consumed = (p.glassConsumed || 0) + (p.hardwareConsumed || 0) + (p.aluminiumConsumed || 0) + (p.otherConsumed || 0);
      return { p, consumed, margin: (p.value || 0) - consumed };
    })
    .filter(r => (r.p.value || 0) > 0 || r.consumed > 0)
    .sort((a, b) => b.consumed - a.consumed), [projects]);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5"><Layers size={12}/> IC Orders</p>
          <p className="text-2xl font-black text-slate-800 mt-1 tabular-nums">{orders.length}</p>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5">{money(icTotal)} total value</p>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5"><TrendingUp size={12}/> Delivered</p>
          <p className="text-2xl font-black text-emerald-700 mt-1 tabular-nums">{delivered.length}</p>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5">{money(deliveredValue)} landed in projects</p>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5"><Scale size={12}/> To Eliminate</p>
          <p className="text-2xl font-black text-indigo-700 mt-1 tabular-nums">{money(icTotal)}</p>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5">IC revenue ↔ purchase (IFRS 10)</p>
        </div>
      </div>

      {/* IC flows */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">Intercompany flows</div>
        {flows.length === 0 ? (
          <div className="p-10 text-center text-slate-300 italic font-bold text-xs">No intercompany orders yet.</div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {flows.map(f => (
              <div key={`${f.buyer}-${f.supplier}`} className="border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black uppercase">
                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{f.buyer}</span>
                  <ArrowRight size={13} className="text-indigo-400"/>
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{f.supplier}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-800 tabular-nums">{money(f.value)}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">{f.count} order{f.count === 1 ? '' : 's'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Project profitability */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">Project profitability (live)</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-slate-100 text-[9px] font-black uppercase text-slate-400 tracking-widest"><tr>
              <th className="px-4 py-2">Project</th><th className="px-4 py-2">Co</th>
              <th className="px-4 py-2 text-right">Contract</th><th className="px-4 py-2 text-right">Glass</th>
              <th className="px-4 py-2 text-right">Hardware</th><th className="px-4 py-2 text-right">Other</th>
              <th className="px-4 py-2 text-right">Margin</th><th className="px-4 py-2 text-right">%</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {projectRows.length === 0 && (
                <tr><td colSpan={8} className="p-10 text-center text-slate-300 italic font-bold">No projects with cost yet.</td></tr>
              )}
              {projectRows.map(({ p, consumed, margin }) => {
                const pct = (p.value || 0) > 0 ? (margin / (p.value || 1)) * 100 : 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-bold text-slate-800 truncate max-w-[180px]">{p.title}</td>
                    <td className="px-4 py-2 text-slate-500 font-bold">{p.company}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(p.value || 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-700">{money(p.glassConsumed || 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-indigo-700">{money(p.hardwareConsumed || 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{money(p.otherConsumed || 0)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-black ${margin >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{money(margin)}</td>
                    <td className="px-4 py-2 text-right"><span className={`text-[9px] font-black px-2 py-0.5 rounded-full tabular-nums ${pct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{pct.toFixed(0)}%</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 bg-indigo-50 border-t border-indigo-100 text-[10px] font-bold text-indigo-800">
          Consumed = glass + hardware + other landed via intercompany deliveries. Unrealised IC profit in unsold project stock is tagged for group elimination.
        </div>
      </div>
    </div>
  );
};

export default IntercompanyBoard;
