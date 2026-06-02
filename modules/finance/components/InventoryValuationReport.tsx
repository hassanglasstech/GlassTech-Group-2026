/**
 * InventoryValuationReport.tsx — FC-05
 * Formal inventory valuation statement: Qty × MAP per item.
 * Categories: Raw | Hardware | Consumable | Profile | Service
 * Export: XLSX
 */

import React, { useMemo, useState } from 'react';
import { Company } from '@/modules/shared/types/core';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Package, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface Props { company: Company; }

type Category = 'All' | 'Raw' | 'Hardware' | 'Consumable' | 'Profile' | 'Service';

const CATS: Category[] = ['All', 'Raw', 'Hardware', 'Consumable', 'Profile', 'Service'];

const CAT_COLORS: Record<string, string> = {
  Raw:         'bg-blue-100 text-blue-800',
  Hardware:    'bg-purple-100 text-purple-800',
  Consumable:  'bg-amber-100 text-amber-800',
  Profile:     'bg-emerald-100 text-emerald-800',
  Service:     'bg-rose-100 text-rose-800',
};

const InventoryValuationReport: React.FC<Props> = ({ company }) => {
  const [filterCat, setFilterCat]   = useState<Category>('All');
  const [refreshKey, setRefreshKey] = useState(0);

  const allItems = useMemo(() => {
    return InventoryService.getStore().filter(i => i.company === company);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, refreshKey]);

  const rows = useMemo(() => {
    return allItems
      .filter(i => filterCat === 'All' || i.category === filterCat)
      .filter(i => i.quantity > 0 || i.movingAveragePrice > 0)
      .sort((a, b) => (b.quantity * b.movingAveragePrice) - (a.quantity * a.movingAveragePrice));
  }, [allItems, filterCat]);

  // Grand totals per category
  const totals = useMemo(() => {
    const out: Record<string, { qty: number; value: number; count: number }> = {};
    allItems.forEach(i => {
      if (!out[i.category]) out[i.category] = { qty: 0, value: 0, count: 0 };
      out[i.category].qty   += i.quantity;
      out[i.category].value += i.quantity * i.movingAveragePrice;
      out[i.category].count += 1;
    });
    return out;
  }, [allItems]);

  const grandTotal = Object.values(totals).reduce((s, t) => s + t.value, 0);

  const exportXLSX = () => {
    const data = rows.map((i, idx) => ({
      '#':          idx + 1,
      'Item Name':  i.name,
      'Category':   i.category,
      'Unit':       i.unit,
      'Bin':        i.storageBin || '—',
      'Qty':        i.quantity,
      'Unrestricted Qty': i.unrestrictedQty || i.quantity,
      'MAP (PKR)':  i.movingAveragePrice,
      'Total Value (PKR)': +(i.quantity * i.movingAveragePrice).toFixed(2),
      'Last Movement': i.lastMovementDate || '—',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Valuation');
    XLSX.writeFile(wb, `InventoryValuation_${company}_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success('Inventory Valuation exported');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {CATS.filter(c => c !== 'All').map(cat => {
          const t = totals[cat] || { qty:0, value:0, count:0 };
          return (
            <button
              key={cat}
              onClick={() => setFilterCat(filterCat === cat ? 'All' : cat as Category)}
              className={`p-4 rounded-2xl border text-left transition-all shadow-sm ${
                filterCat === cat ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white hover:bg-slate-50'
              }`}
            >
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{cat}</p>
              <p className="text-xl font-black text-slate-800 mt-1">PKR {(t.value/1000).toFixed(0)}K</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{t.count} items</p>
            </button>
          );
        })}
      </div>

      {/* Header bar */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Package size={20} />
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {company} — {filterCat === 'All' ? 'All Categories' : filterCat}
            </p>
            <p className="text-2xl font-black">PKR {grandTotal.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setRefreshKey(k => k+1)}
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={exportXLSX}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg"
          >
            <Download size={14} /> Export XLSX
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full sap-table">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-left">Bin</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">MAP (PKR)</th>
                <th className="px-4 py-3 text-right">Total Value</th>
                <th className="px-4 py-3 text-left">Last Movement</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-300 italic text-sm">
                    No items found for {filterCat === 'All' ? company : filterCat}.
                  </td>
                </tr>
              )}
              {rows.map((item, idx) => {
                const val = item.quantity * item.movingAveragePrice;
                const pct = grandTotal > 0 ? (val / grandTotal) * 100 : 0;
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                      {pct >= 5 && (
                        <div className="mt-1 h-1 rounded-full bg-slate-100 w-24">
                          <div
                            className="h-1 rounded-full bg-blue-400"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${CAT_COLORS[item.category] || 'bg-slate-100 text-slate-600'}`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.unit}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.storageBin || '—'}</td>
                    <td className="px-4 py-3 text-right font-black text-slate-800">
                      {item.quantity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-600">
                      {item.movingAveragePrice > 0 ? item.movingAveragePrice.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-black text-sm ${val > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                        PKR {val.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{item.lastMovementDate || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 text-white">
                  <td colSpan={5} className="px-4 py-3 font-black uppercase text-xs tracking-widest">
                    Total — {filterCat === 'All' ? 'All Categories' : filterCat} ({rows.length} items)
                  </td>
                  <td className="px-4 py-3 text-right font-black text-sm">
                    {rows.reduce((s,i) => s + i.quantity, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right font-black text-lg">
                    PKR {rows.reduce((s,i) => s + i.quantity * i.movingAveragePrice, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 text-right font-mono">
        As at {new Date().toLocaleDateString('en-PK', {day:'2-digit',month:'short',year:'numeric'})}
        &nbsp;·&nbsp;Values at Moving Average Price (MAP) per IAS 2
      </p>
    </div>
  );
};

export default InventoryValuationReport;
