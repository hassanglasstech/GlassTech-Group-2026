/**
 * ProjectConsumption.tsx — Session 3
 * Project-wise material consumption dashboard
 * Shows: which project consumed how much material (from GoodsIssue / stock ledger)
 * Data source: MaterialLedgerEntry with mvmntCode 201/261 that have projectId
 */

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { MaterialLedgerEntry, StoreItem } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProjectService } from '@/modules/projects/services/projectService';
import {
  Folder, Package, TrendingUp, Calendar, Search, Download, BarChart3
} from 'lucide-react';

const ProjectConsumption: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  // ── Load data ───────────────────────────────────────────────────────
  const ledger = useMemo(() => InventoryService.getStockLedger().filter(l => l.company === company), [company]);
  const store = useMemo(() => InventoryService.getStore().filter(s => s.company === company), [company]);
  const projects = useMemo(() => {
    try { return ProjectService.getProjects().filter(p => p.company === company); } catch { return []; }
  }, [company]);

  // ── Filter consumption entries (mvmnt 201 = issue to cost center, 261 = issue to production) ──
  const consumptionEntries = useMemo(() => {
    return ledger.filter(e => {
      if (e.mvmntCode !== '201' && e.mvmntCode !== '261') return false;
      if (e.timestamp < dateFrom || e.timestamp > dateTo + 'T23:59:59') return false;
      return true;
    });
  }, [ledger, dateFrom, dateTo]);

  // ── Group by project ────────────────────────────────────────────────
  const projectData = useMemo(() => {
    const map: Record<string, {
      projectId: string;
      projectName: string;
      totalValue: number;
      totalItems: number;
      entries: MaterialLedgerEntry[];
      byCategory: Record<string, number>;
    }> = {};

    for (const entry of consumptionEntries) {
      // Extract project name from remarks or projectId
      let projKey = entry.projectId || 'UNLINKED';
      let projName = 'Unlinked / General';

      if (entry.projectId) {
        const proj = projects.find(p => p.id === entry.projectId);
        projName = proj?.title || entry.projectId;
      } else if (entry.remarks) {
        // Try to extract project from remarks like "[Prj: Project ABC]"
        const match = entry.remarks.match(/\[Prj:\s*([^\]]+)\]/);
        if (match) {
          projName = match[1].trim();
          projKey = projName.toUpperCase().replace(/\s+/g, '_');
        }
      }

      if (!map[projKey]) {
        map[projKey] = {
          projectId: projKey,
          projectName: projName,
          totalValue: 0,
          totalItems: 0,
          entries: [],
          byCategory: {},
        };
      }

      const value = Math.abs(entry.qty) * (entry.valuation || 0);
      map[projKey].totalValue += value;
      map[projKey].totalItems += 1;
      map[projKey].entries.push(entry);

      // Categorize by store item category
      const storeItem = store.find(s => s.id === entry.materialId);
      const cat = storeItem?.category || 'Other';
      map[projKey].byCategory[cat] = (map[projKey].byCategory[cat] || 0) + value;
    }

    return Object.values(map)
      .filter(p => {
        if (!searchTerm) return true;
        return p.projectName.toLowerCase().includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [consumptionEntries, projects, store, searchTerm]);

  // ── Grand total ─────────────────────────────────────────────────────
  const grandTotal = projectData.reduce((s, p) => s + p.totalValue, 0);
  const totalEntries = projectData.reduce((s, p) => s + p.totalItems, 0);

  // ── Export to CSV ───────────────────────────────────────────────────
  const handleExport = () => {
    const rows = ['Project,Category,Material,Qty,Unit,Rate,Value,Date,Issued By'];
    for (const proj of projectData) {
      for (const entry of proj.entries) {
        const storeItem = store.find(s => s.id === entry.materialId);
        rows.push([
          `"${proj.projectName}"`,
          storeItem?.category || 'Other',
          `"${storeItem?.name || entry.materialId}"`,
          Math.abs(entry.qty),
          entry.uom,
          entry.valuation || 0,
          Math.round(Math.abs(entry.qty) * (entry.valuation || 0)),
          entry.timestamp?.split('T')[0] || '',
          entry.user || '',
        ].join(','));
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Project-Consumption-${company}-${dateFrom}-to-${dateTo}.csv`;
    a.click(); URL.revokeObjectURL(url);
    // no toast needed — download starts
  };

  // ── Category color ──────────────────────────────────────────────────
  const catColor = (cat: string) => {
    switch (cat) {
      case 'Hardware': return 'bg-blue-100 text-blue-700';
      case 'Profile': return 'bg-purple-100 text-purple-700';
      case 'Consumable': return 'bg-amber-100 text-amber-700';
      case 'Raw': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Header + Filters ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-50 rounded-xl"><BarChart3 size={20} className="text-indigo-600" /></div>
            <div>
              <h2 className="text-lg font-black uppercase text-slate-800">Project Consumption Report</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Material issued per project — from store issue records</p>
            </div>
          </div>
          <button onClick={handleExport}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors">
            <Download size={14} /><span>Export CSV</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search project..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex items-center space-x-2">
            <Calendar size={14} className="text-slate-400" />
            <input type="date" className="flex-1 py-2.5 px-3 bg-slate-50 border rounded-xl text-sm font-bold"
              value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 text-xs font-bold">to</span>
            <input type="date" className="flex-1 py-2.5 px-3 bg-slate-50 border rounded-xl text-sm font-bold"
              value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-slate-400">Total Consumption</p>
          <p className="text-2xl font-black text-slate-800">PKR {Math.round(grandTotal).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-slate-400">Projects</p>
          <p className="text-2xl font-black text-indigo-600">{projectData.length}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-slate-400">Total Issues</p>
          <p className="text-2xl font-black text-slate-800">{totalEntries}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-[10px] font-black uppercase text-slate-400">Unlinked</p>
          <p className="text-2xl font-black text-amber-600">
            {projectData.find(p => p.projectId === 'UNLINKED')?.totalItems || 0}
          </p>
        </div>
      </div>

      {/* ── Project List ──────────────────────────────────────────── */}
      {projectData.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <Package size={40} className="mx-auto text-slate-200 mb-3" />
          <p className="text-sm font-bold text-slate-400">No consumption data found for this period</p>
          <p className="text-xs text-slate-300 mt-1">Issue materials from Goods Issue tab with a project linked</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projectData.map(proj => (
            <div key={proj.projectId} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

              {/* ── Project Header ──────────────────────────────── */}
              <button
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                onClick={() => setExpandedProject(expandedProject === proj.projectId ? null : proj.projectId)}
              >
                <div className="flex items-center space-x-4">
                  <div className={`p-2.5 rounded-xl ${proj.projectId === 'UNLINKED' ? 'bg-amber-50' : 'bg-indigo-50'}`}>
                    <Folder size={18} className={proj.projectId === 'UNLINKED' ? 'text-amber-500' : 'text-indigo-600'} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-black uppercase text-slate-800">{proj.projectName}</h3>
                    <p className="text-[10px] font-bold text-slate-400">{proj.totalItems} issues</p>
                  </div>
                </div>
                <div className="flex items-center space-x-6">
                  {/* Category pills */}
                  <div className="hidden md:flex items-center space-x-2">
                    {Object.entries(proj.byCategory).slice(0, 3).map(([cat, val]) => (
                      <span key={cat} className={`px-2 py-0.5 rounded-full text-[9px] font-black ${catColor(cat)}`}>
                        {cat}: PKR {Math.round(val).toLocaleString()}
                      </span>
                    ))}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-800">PKR {Math.round(proj.totalValue).toLocaleString()}</p>
                    <p className="text-[9px] font-bold text-slate-400">
                      {grandTotal > 0 ? `${Math.round((proj.totalValue / grandTotal) * 100)}%` : '—'} of total
                    </p>
                  </div>
                </div>
              </button>

              {/* ── Expanded: line-by-line detail ───────────────── */}
              {expandedProject === proj.projectId && (
                <div className="border-t border-slate-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Material</th>
                        <th className="px-4 py-2 text-left">Category</th>
                        <th className="px-4 py-2 text-center">Qty</th>
                        <th className="px-4 py-2 text-right">Rate</th>
                        <th className="px-4 py-2 text-right">Value</th>
                        <th className="px-4 py-2 text-left">Issued By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proj.entries
                        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                        .map(entry => {
                          const storeItem = store.find(s => s.id === entry.materialId);
                          const value = Math.abs(entry.qty) * (entry.valuation || 0);
                          return (
                            <tr key={entry.id} className="border-b border-slate-50 hover:bg-indigo-50/30">
                              <td className="px-4 py-2 font-bold text-slate-500">{entry.timestamp?.split('T')[0]}</td>
                              <td className="px-4 py-2 font-bold text-slate-800">{storeItem?.name || entry.materialId}</td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${catColor(storeItem?.category || 'Other')}`}>
                                  {storeItem?.category || 'Other'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center font-black">{Math.abs(entry.qty)}</td>
                              <td className="px-4 py-2 text-right font-bold">{(entry.valuation || 0).toLocaleString()}</td>
                              <td className="px-4 py-2 text-right font-black text-slate-800">PKR {Math.round(value).toLocaleString()}</td>
                              <td className="px-4 py-2 font-bold text-slate-500">{entry.user || '—'}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-black">
                        <td colSpan={5} className="px-4 py-2 text-right text-[10px] uppercase text-slate-500">Project Total</td>
                        <td className="px-4 py-2 text-right text-sm text-slate-800">PKR {Math.round(proj.totalValue).toLocaleString()}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectConsumption;
