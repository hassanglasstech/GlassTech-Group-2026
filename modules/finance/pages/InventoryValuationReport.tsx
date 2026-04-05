/**
 * InventoryValuationReport.tsx — Phase 8
 * Stock valuation report: material × qty-on-hand × MAP = total value.
 * Reads from Supabase stock_ledger.
 * Can be embedded in ReportsHub or used standalone.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Company } from '@/modules/shared/types';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { supabase } from '@/src/services/supabaseClient';
import { Package, Download, RefreshCw, Globe, TrendingUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

const COMPANIES: Company[] = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];
const fmt = (n: number) => Math.round(n).toLocaleString('en-PK');

interface StockLine {
  materialId:   string;
  description:  string;
  company:      string;
  uom:          string;
  qtyOnHand:    number;
  map:          number;   // Moving Average Price (PKR per unit)
  totalValue:   number;
  category:     string;
  lastMovement: string;
}

const InventoryValuationReport: React.FC<{ company: Company }> = ({ company }) => {
  const [lines,      setLines]      = useState<StockLine[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [groupMode,  setGroupMode]  = useState(false);
  const [asOfDate,   setAsOfDate]   = useState(new Date().toISOString().slice(0, 10));
  const [search,     setSearch]     = useState('');
  const [lastLoaded, setLastLoaded] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const targetCompanies = groupMode ? COMPANIES : [company];

      // Load stock_ledger from Supabase
      const { data, error } = await supabase
        .from('stock_ledger')
        .select('*')
        .in('company', targetCompanies)
        .order('timestamp', { ascending: false });

      if (error || !data || data.length === 0) {
        // Fallback to local cache
        const local = await InventoryService.getStockLedgerAsync();
        buildLines(local.filter((r: any) => targetCompanies.includes(r.company)));
        setLastLoaded(new Date().toLocaleTimeString('en-PK') + ' (cache)');
        return;
      }

      buildLines(data);
      setLastLoaded(new Date().toLocaleTimeString('en-PK'));
    } catch (e) {
      toast.error('Failed to load stock data');
    } finally {
      setLoading(false);
    }
  };

  const buildLines = (rows: any[]) => {
    // Group by company + materialId, take LATEST entry for qty and MAP
    const map: Record<string, any> = {};

    rows.forEach((r: any) => {
      const key = `${r.company}||${r.material_id || r.materialId || 'UNKNOWN'}`;
      const existing = map[key];
      const ts = r.timestamp || r.created_at || '';
      if (!existing || ts > existing.ts) {
        map[key] = {
          ts,
          materialId:   r.material_id  || r.materialId  || 'UNKNOWN',
          description:  r.glass_category || r.glassCategory || r.remarks || r.material_id || 'Material',
          company:      r.company,
          uom:          r.uom           || 'SqFt',
          qtyOnHand:    Number(r.balance_after || r.balanceAfter || r.qty || 0),
          map:          r.qty > 0 ? Number(r.valuation || 0) / Number(r.qty) : 0,
          category:     r.glass_category || r.glassCategory || 'General',
          lastMovement: (r.timestamp || r.created_at || '').slice(0, 10),
        };
      }
    });

    const result: StockLine[] = Object.values(map)
      .filter((r: any) => r.qtyOnHand > 0)
      .map((r: any) => ({
        ...r,
        totalValue: r.qtyOnHand * r.map,
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    setLines(result);
  };

  useEffect(() => { load(); }, [company, groupMode]);

  const filtered = useMemo(() =>
    lines.filter(l =>
      !search ||
      l.materialId.toLowerCase().includes(search.toLowerCase()) ||
      l.description.toLowerCase().includes(search.toLowerCase()) ||
      l.category.toLowerCase().includes(search.toLowerCase())
    ), [lines, search]);

  const totalValue = filtered.reduce((s, l) => s + l.totalValue, 0);

  // Group by category for summary
  const byCategory = useMemo(() => {
    const g: Record<string, number> = {};
    filtered.forEach(l => { g[l.category] = (g[l.category] || 0) + l.totalValue; });
    return Object.entries(g).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(l => ({
      'Material ID':    l.materialId,
      'Description':    l.description,
      'Category':       l.category,
      'Company':        l.company,
      'UOM':            l.uom,
      'Qty on Hand':    l.qtyOnHand,
      'MAP (PKR/unit)': Math.round(l.map),
      'Total Value':    Math.round(l.totalValue),
      'Last Movement':  l.lastMovement,
    })));

    // Summary sheet
    const summaryData = [
      { Item: 'Report Date', Value: asOfDate },
      { Item: 'Companies', Value: groupMode ? 'All 5' : company },
      { Item: 'Total Materials', Value: filtered.length },
      { Item: 'Total Inventory Value', Value: Math.round(totalValue) },
      { Item: '', Value: '' },
      { Item: 'By Category', Value: '' },
      ...byCategory.map(([cat, val]) => ({ Item: cat, Value: Math.round(val) })),
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Detail');
    XLSX.writeFile(wb, `InventoryValuation_${asOfDate}.xlsx`);
    toast.success('Inventory Valuation exported');
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-teal-900 text-white p-5 rounded-2xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-black uppercase tracking-tight flex items-center gap-2">
              <Package size={18}/> Inventory Valuation Report
            </h3>
            <p className="text-[10px] text-teal-300 font-bold uppercase mt-0.5">
              {groupMode ? 'All Companies' : company} · Stock at MAP · {lastLoaded || '—'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setGroupMode(!groupMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                groupMode ? 'bg-teal-500 text-white border-teal-400' : 'bg-white/10 text-white border-white/25 hover:bg-white/20'
              }`}>
              <Globe size={13}/> {groupMode ? 'Group ON' : 'Group'}
            </button>
            <button onClick={load} disabled={loading}
              className="p-2 bg-white/10 rounded-xl hover:bg-white/20">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
            </button>
          </div>
        </div>
      </div>

      {/* Total value strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-400 uppercase">Total Inventory Value</p>
          <p className="text-3xl font-black text-slate-900 mt-1">₨ {fmt(totalValue)}</p>
          <p className="text-[10px] text-slate-400 mt-1">{filtered.length} materials · as of {asOfDate}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5">
          <p className="text-[9px] font-black text-slate-400 uppercase mb-2">By Category</p>
          {byCategory.slice(0, 4).map(([cat, val]) => (
            <div key={cat} className="flex justify-between text-xs">
              <span className="text-slate-600 truncate mr-2">{cat}</span>
              <span className="font-bold text-slate-800 shrink-0">₨ {fmt(val)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search material, category..."
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs w-56 focus:outline-none focus:border-blue-400" />
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">
            <Download size={13}/> Export Excel
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white border rounded-2xl p-16 text-center text-slate-300 text-xs animate-pulse">
          Loading from Supabase…
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-white">
              <tr>
                {['Material ID','Description','Category','Company','UOM','Qty on Hand','MAP (₨/unit)','Total Value (₨)','Last Move'].map(h => (
                  <th key={h} className={`px-4 py-3 font-black text-[10px] uppercase whitespace-nowrap ${
                    ['Qty on Hand','MAP (₨/unit)','Total Value (₨)'].includes(h) ? 'text-right' : 'text-left'
                  }`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-300 text-xs font-bold uppercase">
                    No stock data found
                  </td>
                </tr>
              )}
              {filtered.map((l, i) => (
                <tr key={`${l.company}-${l.materialId}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                  <td className="px-4 py-2.5 font-mono text-slate-600 font-bold text-[10px]">{l.materialId}</td>
                  <td className="px-4 py-2.5 text-slate-800 font-medium max-w-[180px] truncate">{l.description}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[9px] font-black">{l.category}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{l.company}</td>
                  <td className="px-4 py-2.5 text-slate-500">{l.uom}</td>
                  <td className="px-4 py-2.5 text-right font-black text-slate-900">{fmt(l.qtyOnHand)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-700">{fmt(l.map)}</td>
                  <td className="px-4 py-2.5 text-right font-black text-blue-700">₨ {fmt(l.totalValue)}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-[10px]">{l.lastMovement}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-800 text-white">
              <tr>
                <td colSpan={7} className="px-4 py-3 font-black text-sm">TOTAL</td>
                <td className="px-4 py-3 text-right font-black text-lg">₨ {fmt(totalValue)}</td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default InventoryValuationReport;
