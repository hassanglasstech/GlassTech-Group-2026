/**
 * VendorQuality.tsx — QC → vendor quality tracking (Phase 5, feature: quality.vendor_defects).
 *
 * A flexible REPORT (not a blocking gate). QC searches a piece by number, marks
 * the defect (Breakage / Bend / Bubble / Scratch / Chipping) and it is attributed
 * to the vendor the piece was sent to — works for returned pieces AND pieces
 * site-delivered straight from the plant. No claim, no GL. The Scorecard tab
 * aggregates: which vendor damages what, how often.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { useFeature } from '@/modules/shared/hooks/useFeature';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { VendorQualityService, VENDOR_DEFECT_TYPES, type VendorDefect } from '@/modules/production/services/vendorQualityService';
import { GLASSCO_SERVICE_VENDOR_TYPES } from '@/modules/shared/constants';
import { ShieldAlert, ClipboardCheck, Search, Send, RefreshCw, BarChart3, Package } from 'lucide-react';

type Tab = 'report' | 'scorecard';

const VendorQuality: React.FC = () => {
  const enabled = useFeature('quality.vendor_defects');
  const company = useAppStore(s => s.selectedCompany);
  const { user, profile } = useAuthStore();
  const reporter = profile?.email || user?.email || 'qc';

  const [tab, setTab] = useState<Tab>('report');
  const [defects, setDefects] = useState<VendorDefect[]>([]);

  // form
  const [pieceQuery, setPieceQuery] = useState('');
  const [pieceId, setPieceId] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [glassType, setGlassType] = useState('');
  const [thickness, setThickness] = useState('');
  const [defectType, setDefectType] = useState<string>('Breakage');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const serviceVendors = useMemo(
    () => SalesService.getVendors().filter(v => GLASSCO_SERVICE_VENDOR_TYPES.includes(v.type) && (!v.company || v.company === company)),
    [company],
  );
  const dispatches = useMemo(() => ProductionService.getTemperingDispatches(), []);
  const pieces = useMemo(() => ProductionService.getProductionPieces(), []);

  const pieceSuggest = useMemo(() => {
    const q = pieceQuery.trim().toLowerCase();
    if (!q) return [];
    return pieces.filter(p => String(p.id).toLowerCase().includes(q)).slice(0, 8);
  }, [pieceQuery, pieces]);

  const loadDefects = (): void => { void VendorQualityService.getDefects(company).then(setDefects); };
  useEffect(() => { loadDefects(); }, [company]);

  const pickPiece = (pid: string): void => {
    setPieceId(pid);
    setPieceQuery('');
    const d = dispatches.find(x => (x.pieceIds || []).includes(pid) && x.company === company);
    if (d) { setVendorName(d.plantName || ''); setServiceType(d.serviceType || ''); }
  };

  const resetForm = (): void => {
    setPieceId(''); setPieceQuery(''); setVendorName(''); setServiceType('');
    setGlassType(''); setThickness(''); setDefectType('Breakage'); setQty(1); setNotes('');
  };

  const submit = async (): Promise<void> => {
    if (!defectType) { toast.error('Defect type select karein.'); return; }
    if (!vendorName.trim()) { toast.error('Vendor select karein.'); return; }
    setSaving(true);
    const id = `VQD-${company}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const { error } = await VendorQualityService.reportDefect({
      id, company: String(company), pieceId: pieceId || undefined, vendorName,
      serviceType: serviceType || undefined, glassType: glassType || undefined,
      thickness: thickness || undefined, defectType, qty: qty || 1, notes: notes || undefined, reportedBy: reporter,
    });
    setSaving(false);
    if (error) { toast.error(`Save failed: ${error}`); return; }
    toast.success(`Defect logged — ${vendorName} · ${defectType}`);
    resetForm();
    loadDefects();
  };

  const scorecard = useMemo(() => {
    const map: Record<string, { total: number; byType: Record<string, number> }> = {};
    defects.forEach(d => {
      const key = d.vendorName || '—';
      (map[key] ??= { total: 0, byType: {} });
      map[key].total += d.qty || 1;
      map[key].byType[d.defectType] = (map[key].byType[d.defectType] || 0) + (d.qty || 1);
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [defects]);

  if (!enabled) {
    return (
      <div className="p-12 text-center">
        <ShieldAlert className="mx-auto text-slate-300" size={44} />
        <p className="mt-3 text-sm font-bold text-slate-500">Vendor quality tracking is not enabled</p>
        <p className="text-xs text-slate-400">Turn it on in Admin → Security → Feature Flags (<code>quality.vendor_defects</code>).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header + tabs */}
      <div className="rounded-2xl bg-gradient-to-r from-[#1A3A6B] to-[#2a5298] p-5 text-white shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <ShieldAlert size={20} /> Vendor Quality — Plant Damage
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              {company} · which plant damages what glass — no claim, no GL
            </p>
          </div>
          <button onClick={loadDefects} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20 transition">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => setTab('report')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${tab === 'report' ? 'bg-white text-[#1A3A6B]' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}>
            <ClipboardCheck size={14} /> Report Defect
          </button>
          <button onClick={() => setTab('scorecard')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${tab === 'scorecard' ? 'bg-white text-[#1A3A6B]' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}>
            <BarChart3 size={14} /> Scorecard
          </button>
        </div>
      </div>

      {/* REPORT tab */}
      {tab === 'report' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {/* piece search */}
            <div className="relative">
              <label className="mb-1 block text-2xs font-bold uppercase text-slate-500">Piece No {pieceId && <span className="text-emerald-600">· {pieceId}</span>}</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  value={pieceQuery} onChange={e => setPieceQuery(e.target.value)}
                  placeholder="Search piece no…"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm font-bold focus:border-blue-500 focus:outline-none"
                />
              </div>
              {pieceSuggest.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {pieceSuggest.map(p => (
                    <button key={p.id} onClick={() => pickPiece(String(p.id))} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50">
                      <Package size={13} className="text-slate-400" /> {String(p.id)}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-0.5 text-2xs text-slate-400">Optional — picking a piece auto-fills its vendor. Or fill the vendor manually below.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-2xs font-bold uppercase text-slate-500">Vendor / Plant *</label>
                <select value={vendorName} onChange={e => setVendorName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-bold focus:border-blue-500 focus:outline-none">
                  <option value="">— Select vendor —</option>
                  {serviceVendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                  {vendorName && !serviceVendors.some(v => v.name === vendorName) && <option value={vendorName}>{vendorName}</option>}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-2xs font-bold uppercase text-slate-500">Defect *</label>
                <select value={defectType} onChange={e => setDefectType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-bold focus:border-blue-500 focus:outline-none">
                  {VENDOR_DEFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-2xs font-bold uppercase text-slate-500">Glass Type</label>
                <input value={glassType} onChange={e => setGlassType(e.target.value)} placeholder="e.g. Clear" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-2xs font-bold uppercase text-slate-500">Thickness</label>
                <input value={thickness} onChange={e => setThickness(e.target.value)} placeholder="e.g. 6mm" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-2xs font-bold uppercase text-slate-500">Qty</label>
                <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-bold focus:border-blue-500 focus:outline-none" />
              </div>
              {serviceType && (
                <div>
                  <label className="mb-1 block text-2xs font-bold uppercase text-slate-500">Service</label>
                  <div className="rounded-lg bg-slate-50 px-2 py-2 text-sm font-bold text-slate-600">{serviceType}</div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-2xs font-bold uppercase text-slate-500">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional…" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>

            <button onClick={submit} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1A3A6B] py-2.5 text-sm font-black uppercase text-white hover:bg-[#254e8f] disabled:opacity-50 transition">
              <Send size={16} /> {saving ? 'Logging…' : 'Log Defect'}
            </button>
          </div>

          {/* recent */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-500">Recent defects</h3>
            {defects.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">None logged yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {defects.slice(0, 12).map(d => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-black uppercase text-slate-700">{d.vendorName || '—'}</span>
                      <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-black uppercase text-red-700">{d.defectType}</span>
                      <div className="text-[10px] text-slate-400">{[d.glassType, d.thickness, d.pieceId].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    <span className="shrink-0 tabular-nums text-slate-400">×{d.qty}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* SCORECARD tab */}
      {tab === 'scorecard' && (
        scorecard.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <BarChart3 className="mx-auto text-slate-300" size={36} />
            <p className="mt-2 text-sm font-bold text-slate-500">No defects logged yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">Vendor / Plant</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  {VENDOR_DEFECT_TYPES.map(t => <th key={t} className="px-4 py-3 text-right">{t}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scorecard.map(([vendor, agg]) => (
                  <tr key={vendor} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-black uppercase text-slate-800">{vendor}</td>
                    <td className="px-4 py-2.5 text-right font-black tabular-nums text-red-700">{agg.total}</td>
                    {VENDOR_DEFECT_TYPES.map(t => (
                      <td key={t} className="px-4 py-2.5 text-right tabular-nums text-slate-600">{agg.byType[t] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
};

export default VendorQuality;
