/**
 * RateChart.tsx — unified vendor rate comparison (Phase 3, feature: proc.rate_chart).
 *
 * One screen with a category selector (Raw Glass / Tempering / Lamination /
 * Double Glazing). Pivots every vendor's price list into an items(rows) ×
 * vendors(columns) matrix; per row the cheapest cell is green and the dearest
 * red. A business-volume footer (spend / sqft / batches per vendor) comes from
 * tempering_dispatches for the service categories.
 *
 * Reads the SAME vendor.rates the per-vendor rate modal edits (single source of
 * truth, now that the Phase-0a persistence fix makes rate edits round-trip).
 * Read-only. Feature-gated so it launches when the founder flips it on.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useFeature } from '@/modules/shared/hooks/useFeature';
import { SalesService } from '@/modules/sales/services/salesService';
import { ProductionService } from '@/modules/production/services/productionService';
import type { Vendor, VendorRate } from '@/modules/sales/types/crm';
import type { TemperingDispatch } from '@/modules/production/types/production';
import { GLASSCO_RATE_CHART_CATEGORIES, type VendorType } from '@/modules/shared/constants';
import { BarChart3, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';

const CATEGORY_LABEL: Record<string, string> = {
  Tempering: 'Tempering',
  Lamination: 'Lamination',
  'Double Glazing': 'Double Glazing',
  Glass: 'Raw Glass (Supply)',
};

const fmtPkr = (n: number): string => 'PKR ' + Math.round(n || 0).toLocaleString('en-US');
const itemKey = (r: VendorRate): string => `${r.thickness} · ${r.type}`;

const latestRateFor = (rates: VendorRate[], item: string): number | null => {
  const matches = rates.filter(r => itemKey(r) === item);
  if (matches.length === 0) return null;
  const latest = matches.reduce((a, b) => ((a.effectiveDate || '') >= (b.effectiveDate || '') ? a : b));
  return typeof latest.rate === 'number' ? latest.rate : null;
};

const RateChart: React.FC = () => {
  const enabled = useFeature('proc.rate_chart');
  const company = useAppStore(s => s.selectedCompany);
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);
  const [dispatches, setDispatches] = useState<TemperingDispatch[]>([]);
  const [category, setCategory] = useState<VendorType>('Tempering');

  const refresh = (): void => {
    setAllVendors(SalesService.getVendors());
    setDispatches(ProductionService.getTemperingDispatches());
  };
  useEffect(() => { refresh(); }, [company]);

  const vendors = useMemo(
    () => allVendors.filter(v => v.type === category && (!v.company || v.company === company)),
    [allVendors, category, company],
  );

  // Rows = union of every item (thickness · type) across the category's price lists.
  const items = useMemo(() => {
    const set = new Set<string>();
    vendors.forEach(v => (v.rates || []).forEach(r => set.add(itemKey(r))));
    return Array.from(set).sort((a, b) => {
      const na = parseFloat(a), nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return a.localeCompare(b);
    });
  }, [vendors]);

  // Per-vendor business volume from dispatches (service categories only).
  const volume = useMemo(() => {
    const map: Record<string, { charges: number; sqft: number; trips: number }> = {};
    dispatches
      .filter(d => d.company === company && d.serviceType === category)
      .forEach(d => {
        const key = (d.plantName || '').toUpperCase();
        (map[key] ??= { charges: 0, sqft: 0, trips: 0 });
        map[key].charges += d.totalCharges || 0;
        map[key].sqft += d.totalSqFt || 0;
        map[key].trips += 1;
      });
    return map;
  }, [dispatches, company, category]);

  if (!enabled) {
    return (
      <div className="p-12 text-center">
        <BarChart3 className="mx-auto text-slate-300" size={44} />
        <p className="mt-3 text-sm font-bold text-slate-500">Vendor rate chart is not enabled</p>
        <p className="text-xs text-slate-400">Turn it on in Admin → Security → Feature Flags (<code>proc.rate_chart</code>).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-[#1A3A6B] to-[#2a5298] p-5 text-white shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <BarChart3 size={20} /> Vendor Rate Comparison
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              {company} · cheapest <span className="text-emerald-300">green</span> · dearest <span className="text-red-300">red</span> per item
            </p>
          </div>
          <button onClick={refresh} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20 transition">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {GLASSCO_RATE_CHART_CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
                category === c ? 'bg-white text-[#1A3A6B]' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}
            >
              {CATEGORY_LABEL[c] || c}
            </button>
          ))}
        </div>
      </div>

      {vendors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <BarChart3 className="mx-auto text-slate-300" size={36} />
          <p className="mt-2 text-sm font-bold text-slate-500">No {CATEGORY_LABEL[category] || category} vendors yet</p>
          <p className="text-xs text-slate-400">Add vendors of this category and enter their price lists to compare.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Item (mm · type)</th>
                {vendors.map(v => (
                  <th key={v.id} className="px-4 py-3 text-right">{v.nickName || v.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={vendors.length + 1} className="px-4 py-8 text-center text-slate-400">
                    No price-list rows yet — open a vendor’s rate card and add rates.
                  </td>
                </tr>
              ) : items.map(item => {
                const cells = vendors.map(v => latestRateFor(v.rates || [], item));
                const present = cells.filter((r): r is number => r != null);
                const min = present.length ? Math.min(...present) : null;
                const max = present.length ? Math.max(...present) : null;
                const compare = present.length > 1 && min !== max;
                return (
                  <tr key={item} className="hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-bold text-slate-700">{item}</td>
                    {cells.map((rate, i) => {
                      const isMin = compare && rate === min;
                      const isMax = compare && rate === max;
                      return (
                        <td
                          key={vendors[i].id}
                          className={`px-4 py-2.5 text-right tabular-nums font-bold ${
                            rate == null ? 'text-slate-300'
                            : isMin ? 'bg-emerald-50 text-emerald-700'
                            : isMax ? 'bg-red-50 text-red-700'
                            : 'text-slate-700'}`}
                        >
                          {rate == null ? '—' : (
                            <span className="inline-flex items-center gap-1 justify-end">
                              {isMin && <TrendingDown size={11} />}{isMax && <TrendingUp size={11} />}
                              {fmtPkr(rate).replace('PKR ', '')}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            {/* Business-volume footer (service categories) */}
            <tfoot className="border-t-2 border-slate-200 bg-slate-50/70 text-[11px]">
              {[
                { label: 'Spend', pick: (v: { charges: number; sqft: number; trips: number }) => fmtPkr(v.charges) },
                { label: 'SqFt sent', pick: (v: { charges: number; sqft: number; trips: number }) => Math.round(v.sqft).toLocaleString('en-US') },
                { label: 'Batches', pick: (v: { charges: number; sqft: number; trips: number }) => String(v.trips) },
              ].map(row => (
                <tr key={row.label}>
                  <td className="sticky left-0 z-10 bg-slate-50/70 px-4 py-2 font-black uppercase tracking-widest text-slate-400">{row.label}</td>
                  {vendors.map(v => {
                    const vol = volume[(v.nickName || v.name).toUpperCase()] || volume[(v.name || '').toUpperCase()];
                    return (
                      <td key={v.id} className="px-4 py-2 text-right tabular-nums font-bold text-slate-600">
                        {vol ? row.pick(vol) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}

      <p className="px-1 text-[11px] text-slate-400">
        Volume is per-vendor business from dispatches (Tempering / Lamination / Double-Glazing). Raw-Glass purchase volume (PO/GRN) lands in a later pass.
      </p>
    </div>
  );
};

export default RateChart;
