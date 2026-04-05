import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Copy, ChevronUp, ChevronDown,
  Printer, Settings, Eye, FileText, Package,
  X, GitBranch, BarChart2, Edit2, Check, Send, ListOrdered,
  Save, FolderOpen, AlertCircle, TrendingUp, RefreshCw,
  CheckCircle2, XCircle, Clock, Pencil, Percent,
} from 'lucide-react';
import {
  useGTKQuotation,
  listGTKQuotations,
  deleteGTKQuotation,
} from './useGTKQuotation';
import {
  WINDOW_TYPES, GLASS_SPECS, NETTING_TYPES, FLOORS,
  PROFILE_SYSTEMS, SECTION_SIZES, DEFAULT_RATE_CARD, RateCard,
} from './gtkQuotationConstants';
import { GTKQuoteItem, GTKQuoteOption, GTKQuotation } from './gtkQuotationTypes';
import WindowSVG from './WindowSVG';
import PrintQuotation from './PrintQuotation';
import JobOrderPage from './JobOrderPage';
import { convertQuotationToJobOrder } from '@/modules/sales/services/gtkJobOrderService';
import GTKJobOrderRegister from './GTKJobOrderRegister';
import { toast } from 'sonner';

const fmt = (n: number) => Math.round(n).toLocaleString('en-PK');

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<GTKQuotation['status'], { label: string; color: string; icon: React.ReactNode }> = {
  Draft:    { label: 'Draft',    color: 'bg-slate-100 text-slate-600',   icon: <Pencil size={10}/> },
  Sent:     { label: 'Sent',     color: 'bg-blue-100 text-blue-700',     icon: <Send size={10}/> },
  Approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={10}/> },
  Rejected: { label: 'Rejected', color: 'bg-rose-100 text-rose-700',     icon: <XCircle size={10}/> },
};

// ─── RATE CARD MODAL ──────────────────────────────────────────────────────────

const RateCardModal: React.FC<{ rates: RateCard; onSave: (r: RateCard) => void; onClose: () => void }> = ({ rates, onSave, onClose }) => {
  const [local, setLocal] = useState<RateCard>(JSON.parse(JSON.stringify(rates)));
  const setRate = (p: string, id: string, v: string) =>
    setLocal(prev => ({ ...prev, [p]: { ...prev[p], [id]: parseFloat(v) || 0 } }));
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-sm font-black text-slate-800">⚙️ Rate Card — Rs./sqft</h2>
            <p className="text-[10px] text-slate-500">Default rates auto-fill. Override per item anytime.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-5">
          {Object.keys(local).map(profile => (
            <div key={profile}>
              <h3 className="text-xs font-black text-slate-600 mb-2 pb-1 border-b">{profile}</h3>
              <div className="grid grid-cols-2 gap-1">
                {WINDOW_TYPES.map(wt => (
                  <div key={wt.id} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="text-slate-500 flex-1 truncate">{wt.shortLabel}</span>
                    <span className="text-slate-400 text-[9px] w-8">{wt.pricingUnit}</span>
                    <input type="number" value={local[profile]?.[wt.id] ?? ''}
                      onChange={e => setRate(profile, wt.id, e.target.value)}
                      className="w-20 text-right px-2 py-0.5 border border-slate-200 rounded text-xs" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 p-4 border-t sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-xs font-semibold hover:bg-slate-50">Cancel</button>
          <button onClick={() => { onSave(local); onClose(); }} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">Save Rates</button>
        </div>
      </div>
    </div>
  );
};

// ─── QUOTATION LIST VIEW ──────────────────────────────────────────────────────

const QuotationListView: React.FC<{
  onLoad: (q: GTKQuotation) => void;
  onNew: () => void;
}> = ({ onLoad, onNew }) => {
  const [quotations, setQuotations] = useState<GTKQuotation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const list = await listGTKQuotations('GTK');
    setQuotations(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Delete quotation ${id}?`)) return;
    await deleteGTKQuotation(id);
    setQuotations(prev => prev.filter(q => q.id !== id));
    toast.success('Quotation deleted');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-800">Saved Quotations</h3>
          <p className="text-[10px] text-slate-400">{quotations.length} total — GTK</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={onNew} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">
            <Plus size={13}/> New Quotation
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-white border rounded-2xl p-16 text-center text-slate-300 text-xs font-bold animate-pulse">Loading quotations…</div>
      )}

      {!loading && quotations.length === 0 && (
        <div className="bg-white border rounded-2xl p-16 text-center">
          <FileText size={40} className="mx-auto text-slate-200 mb-3"/>
          <p className="text-slate-400 text-sm font-bold">No quotations saved yet</p>
          <p className="text-slate-300 text-xs mt-1">Click "New Quotation" to start building</p>
        </div>
      )}

      {!loading && quotations.map(q => {
        const cfg = STATUS_CFG[q.status];
        const activeOpt = q.options.find(o => o.id === q.activeOptionId) ?? q.options[0];
        return (
          <div key={q.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-sm transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-black text-blue-700 text-sm">{q.id}</span>
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                  {q.options.length > 1 && (
                    <span className="text-[9px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-black">
                      {q.options.length} options
                    </span>
                  )}
                </div>
                <p className="font-bold text-slate-800 text-sm truncate">{q.header.clientName || 'No client'}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{q.header.site}</p>
                <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                  <span>{q.header.profileType} · {q.header.sectionSize}</span>
                  <span>{activeOpt?.items.length || 0} items</span>
                  <span>{activeOpt?.totalSqft.toFixed(1) || '0'} sqft</span>
                  <span className="font-black text-slate-700">₨ {fmt(activeOpt?.totalAmount || 0)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <p className="text-[9px] text-slate-400">Updated</p>
                  <p className="text-[10px] font-bold text-slate-600">{new Date(q.updatedAt).toLocaleDateString('en-PK')}</p>
                </div>
                <button
                  onClick={() => onLoad(q)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
                >
                  <FolderOpen size={13}/> Open
                </button>
                <button
                  onClick={() => handleDelete(q.id)}
                  className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── MARGIN PANEL ─────────────────────────────────────────────────────────────

const MarginPanel: React.FC<{ margin: ReturnType<typeof import('./useGTKQuotation').calcMargin> }> = ({ margin }) => {
  const marginColor = margin.marginPct >= 35 ? 'text-emerald-600' : margin.marginPct >= 20 ? 'text-amber-600' : 'text-rose-600';
  const barColor    = margin.marginPct >= 35 ? 'bg-emerald-500' : margin.marginPct >= 20 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-slate-400"/>
        <h4 className="text-[9px] font-black text-slate-400 uppercase">Margin Analysis (Estimated)</h4>
      </div>

      {/* Margin bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-500">Gross Margin</span>
          <span className={`font-black text-sm ${marginColor}`}>{margin.marginPct.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(margin.marginPct, 60)}%` }}/>
        </div>
        <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
          <span>0%</span><span>30% target</span><span>60%</span>
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        {[
          { l: 'Est. Revenue',  v: `₨ ${fmt(margin.grossSell)}`,   bold: false },
          { l: 'Est. Cost',     v: `₨ ${fmt(margin.totalCost)}`,   bold: false },
          { l: 'Gross Profit',  v: `₨ ${fmt(margin.grossProfit)}`, bold: true  },
          { l: 'Per Sqft Sell', v: `₨ ${fmt(margin.perSqftSell)}`, bold: false },
          { l: 'Per Sqft Cost', v: `₨ ${fmt(margin.perSqftCost)}`, bold: false },
        ].map(row => (
          <div key={row.l} className="flex justify-between">
            <span className="text-slate-500">{row.l}</span>
            <span className={row.bold ? `font-black ${marginColor}` : 'font-medium text-slate-700'}>{row.v}</span>
          </div>
        ))}
      </div>

      <p className="text-[9px] text-slate-300 mt-3 italic">Based on typical GTK material ratios. Actual may vary.</p>
    </div>
  );
};

// ─── OPTION TABS BAR ──────────────────────────────────────────────────────────

const OptionTabsBar: React.FC<{
  options: GTKQuoteOption[]; activeId: string;
  onSelect: (id: string) => void; onAdd: () => void;
  onDuplicate: (id: string) => void; onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
}> = ({ options, activeId, onSelect, onAdd, onDuplicate, onRemove, onRename }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {options.map(opt => (
        <div key={opt.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-all ${activeId === opt.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
          onClick={() => onSelect(opt.id)}>
          {editing === opt.id
            ? <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                onBlur={() => { onRename(opt.id, editVal); setEditing(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { onRename(opt.id, editVal); setEditing(null); } }}
                className="bg-transparent outline-none w-24 text-xs" onClick={e => e.stopPropagation()}/>
            : <span>{opt.label}</span>}
          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={e => { e.stopPropagation(); setEditing(opt.id); setEditVal(opt.label); }}
              className="p-0.5 hover:bg-white/20 rounded"><Edit2 size={10}/></button>
            <button onClick={e => { e.stopPropagation(); onDuplicate(opt.id); }}
              className="p-0.5 hover:bg-white/20 rounded"><Copy size={10}/></button>
            {options.length > 1 && (
              <button onClick={e => { e.stopPropagation(); onRemove(opt.id); }}
                className="p-0.5 hover:bg-red-200 text-red-400 rounded"><X size={10}/></button>
            )}
          </div>
        </div>
      ))}
      <button onClick={onAdd} className="flex items-center gap-1 px-2.5 py-1.5 border border-dashed border-slate-300 text-slate-400 text-xs rounded-lg hover:border-blue-400 hover:text-blue-500 shrink-0">
        <Plus size={12}/> Add Option
      </button>
    </div>
  );
};

// ─── COMPARE VIEW ─────────────────────────────────────────────────────────────

const CompareView: React.FC<{ options: GTKQuoteOption[]; header: any; installAmt: number; discount: number }> = ({ options, header, discount }) => {
  const calcGrand = (opt: GTKQuoteOption) => {
    const gross = opt.totalAmount + (header.cartage || 0);
    return gross - (discount / 100) * gross;
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b bg-slate-50">
        <h3 className="text-sm font-black text-slate-700">Option Comparison</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-4 py-3 text-left font-bold">Metric</th>
              {options.map(o => <th key={o.id} className="px-4 py-3 text-center font-bold">{o.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Profile Type',  fn: (o: GTKQuoteOption) => o.profileType },
              { label: 'Section Size',  fn: (o: GTKQuoteOption) => o.sectionSize },
              { label: 'Total Items',   fn: (o: GTKQuoteOption) => String(o.items.length) },
              { label: 'Total Sq.Ft',   fn: (o: GTKQuoteOption) => o.totalSqft.toFixed(2) },
              { label: 'Sub Total',     fn: (o: GTKQuoteOption) => `₨ ${fmt(o.totalAmount)}` },
              { label: 'Grand Total',   fn: (o: GTKQuoteOption) => `₨ ${fmt(calcGrand(o))}` },
              { label: 'Per Sqft Rate', fn: (o: GTKQuoteOption) => o.totalSqft > 0 ? `₨ ${fmt(calcGrand(o) / o.totalSqft)}` : '—' },
            ].map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                <td className="px-4 py-2.5 font-bold text-slate-600">{row.label}</td>
                {options.map(o => (
                  <td key={o.id} className={`px-4 py-2.5 text-center font-medium ${row.label === 'Grand Total' ? 'font-black text-blue-700' : ''}`}>
                    {row.fn(o)}
                  </td>
                ))}
              </tr>
            ))}
            {options.length > 1 && (() => {
              const amounts = options.map(o => calcGrand(o));
              const max = Math.max(...amounts);
              return (
                <tr className="bg-emerald-50">
                  <td className="px-4 py-2.5 font-bold text-emerald-700">Savings vs Highest</td>
                  {options.map((o, i) => {
                    const saving = max - amounts[i];
                    return <td key={o.id} className="px-4 py-2.5 text-center font-bold text-emerald-700">{saving === 0 ? '—' : `- ₨ ${fmt(saving)}`}</td>;
                  })}
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── ITEM ROW ─────────────────────────────────────────────────────────────────

const ItemRow: React.FC<{
  item: GTKQuoteItem; index: number; isSelected: boolean; defaultRate: number;
  onSelect: () => void;
  onUpdate: <K extends keyof GTKQuoteItem>(field: K, val: GTKQuoteItem[K]) => void;
  onDelete: () => void; onDuplicate: () => void; onMoveUp: () => void; onMoveDown: () => void;
}> = ({ item, index, isSelected, defaultRate, onSelect, onUpdate, onDelete, onDuplicate, onMoveUp, onMoveDown }) => {
  const wt = WINDOW_TYPES.find(w => w.id === item.windowTypeId);
  const isRFT = wt?.pricingUnit === 'rft';
  const inp = 'w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none bg-white';
  const numInp = inp + ' text-right';

  return (
    <>
      <tr className={`hover:bg-blue-50/30 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
        onClick={onSelect}>
        <td className="px-3 py-2 text-xs text-slate-400 font-bold text-center">{index + 1}</td>
        <td className="px-2 py-1.5 w-14" onClick={e => e.stopPropagation()}>
          <input value={item.serialNo} onChange={e => onUpdate('serialNo', e.target.value)} placeholder="52" className={inp} />
        </td>
        <td className="px-2 py-1.5 min-w-[170px]" onClick={e => e.stopPropagation()}>
          <select value={item.windowTypeId} onChange={e => onUpdate('windowTypeId', e.target.value as any)} className={inp}>
            <optgroup label="── Windows ──">{WINDOW_TYPES.filter(w => w.category === 'window').map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</optgroup>
            <optgroup label="── Doors ──">{WINDOW_TYPES.filter(w => w.category === 'door').map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</optgroup>
            <optgroup label="── Special / RFT ──">{WINDOW_TYPES.filter(w => w.category === 'special').map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</optgroup>
          </select>
          {isRFT && <span className="text-[9px] text-amber-600 font-bold mt-0.5 block">⚡ RFT Pricing</span>}
        </td>
        <td className="px-2 py-1.5 w-20" onClick={e => e.stopPropagation()}>
          <select value={item.profile} onChange={e => onUpdate('profile', e.target.value)} className={inp}>
            {SECTION_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
        <td className="px-2 py-1.5 min-w-[110px]" onClick={e => e.stopPropagation()}>
          <select value={item.glassSpecId} onChange={e => onUpdate('glassSpecId', e.target.value)} className={`${inp} ${isRFT ? 'opacity-50' : ''}`} disabled={isRFT}>
            {GLASS_SPECS.map(g => <option key={g.id} value={g.id}>{g.abbr}</option>)}
          </select>
          {item.glassSpecId === 'custom' && !isRFT && (
            <input value={item.customGlassLabel} onChange={e => onUpdate('customGlassLabel', e.target.value)}
              placeholder="Custom..." className={`${inp} mt-1`} onClick={e => e.stopPropagation()} />
          )}
        </td>
        <td className="px-2 py-1.5 w-32" onClick={e => e.stopPropagation()}>
          <select value={item.floor} onChange={e => onUpdate('floor', e.target.value)} className={inp}>
            {FLOORS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </td>
        <td className="px-2 py-1.5 w-28" onClick={e => e.stopPropagation()}>
          <input value={item.location} onChange={e => onUpdate('location', e.target.value)} placeholder="Drawing Room" className={inp} />
        </td>
        <td className="px-2 py-1.5 w-16" onClick={e => e.stopPropagation()}>
          <input value={item.locationCode} onChange={e => onUpdate('locationCode', e.target.value)} placeholder="W1" className={inp} />
        </td>
        <td className="px-2 py-1.5 w-14" onClick={e => e.stopPropagation()}>
          <input type="number" min={1} value={item.qty} onChange={e => onUpdate('qty', parseInt(e.target.value) || 1)} className={numInp} />
        </td>
        <td className="px-2 py-1.5 w-16" onClick={e => e.stopPropagation()}>
          <input type="number" value={item.widthFt || ''} onChange={e => onUpdate('widthFt', parseFloat(e.target.value) || 0)}
            placeholder={isRFT ? 'RFT' : 'ft'} className={numInp} />
        </td>
        <td className="px-2 py-1.5 w-16" onClick={e => e.stopPropagation()}>
          <input type="number" value={item.heightFt || ''} onChange={e => onUpdate('heightFt', parseFloat(e.target.value) || 0)}
            placeholder={isRFT ? '—' : 'ft'} disabled={isRFT} className={`${numInp} ${isRFT ? 'opacity-40' : ''}`} />
        </td>
        <td className="px-3 py-2 text-xs text-right font-bold text-blue-600 whitespace-nowrap">
          <span className="text-[9px] text-slate-400 block">{isRFT ? 'RFT' : 'Sqft'}</span>
          {item.sqftPerPiece > 0 ? item.sqftPerPiece.toFixed(2) : '—'}
          {item.qty > 1 && item.sqftPerPiece > 0 && <div className="text-[9px] text-slate-400">={item.totalSqft.toFixed(2)}</div>}
        </td>
        <td className="px-2 py-1.5 w-20" onClick={e => e.stopPropagation()}>
          <input type="number" value={item.rateOverride}
            onChange={e => onUpdate('rateOverride', e.target.value)}
            placeholder={String(defaultRate || 0)}
            className={`${numInp} ${item.rateOverride !== '' ? 'text-blue-700 border-blue-300 font-bold' : 'text-slate-400'}`} />
        </td>
        <td className="px-3 py-2 text-sm font-black text-slate-800 text-right whitespace-nowrap">
          {item.total > 0 ? `₨ ${Math.round(item.total).toLocaleString()}` : '—'}
        </td>
        <td className="px-2 py-1.5 w-24" onClick={e => e.stopPropagation()}>
          <select value={item.netting} onChange={e => onUpdate('netting', e.target.value as any)}
            className={`${inp} ${isRFT ? 'opacity-40' : ''}`} disabled={isRFT}>
            {NETTING_TYPES.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
        </td>
        <td className="px-2 py-1.5 w-24" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-0.5">
            <button onClick={onMoveUp} className="p-1 text-slate-300 hover:text-slate-600 rounded"><ChevronUp size={12}/></button>
            <button onClick={onMoveDown} className="p-1 text-slate-300 hover:text-slate-600 rounded"><ChevronDown size={12}/></button>
            <button onClick={onDuplicate} className="p-1 text-blue-400 hover:text-blue-600 rounded"><Copy size={13}/></button>
            <button onClick={onDelete} className="p-1 text-rose-400 hover:text-rose-600 rounded"><Trash2 size={13}/></button>
          </div>
        </td>
      </tr>

      {isSelected && (
        <tr className="bg-blue-50/60">
          <td colSpan={16} className="px-4 py-4">
            <div className="grid grid-cols-4 gap-4 items-start">
              <div className="flex flex-col items-center gap-2 bg-white rounded-xl border border-slate-200 p-4">
                <WindowSVG typeId={wt?.svgType || 'fixed_no_div'} width={160} height={120} />
                <div className="text-xs font-bold text-slate-600 text-center">
                  {!isRFT && item.widthFt > 0 && item.heightFt > 0
                    ? `${Math.round(item.widthFt * 304.8)} × ${Math.round(item.heightFt * 304.8)} mm`
                    : isRFT && item.widthFt > 0 ? `${item.widthFt} RFT` : 'Enter dimensions'}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase block">Divider / Fixed Note</label>
                <input value={item.dividerNote} onChange={e => onUpdate('dividerNote', e.target.value)}
                  placeholder="e.g. Bottom & Center Fixed With Dividers"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none" />
                <label className="text-[9px] font-black text-slate-400 uppercase block mt-2">Notes</label>
                <input value={item.notes} onChange={e => onUpdate('notes', e.target.value)}
                  placeholder="Any special instructions..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
                  <input type="checkbox" checked={item.coupled} onChange={e => onUpdate('coupled', e.target.checked)} className="w-3 h-3" />
                  Coupled with other items
                </label>
                {item.coupled && (
                  <input value={item.coupledWith} onChange={e => onUpdate('coupledWith', e.target.value)}
                    placeholder="e.g. Item 10-A & 10-C joined with Coupling Profile"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none" />
                )}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">{isRFT ? 'RFT/pc' : 'Sqft/pc'}</span><span className="font-bold">{item.sqftPerPiece.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-bold text-blue-600">{item.totalSqft.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Rate</span><span>₨ {fmt(item.effectiveRate)}/{isRFT ? 'rft' : 'sqft'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Alu. Amt</span><span>₨ {fmt(item.aluminumAmt)}</span></div>
                {item.glassAmt > 0 && <div className="flex justify-between"><span className="text-slate-500">Glass</span><span>₨ {fmt(item.glassAmt)}</span></div>}
                {item.nettingAmt > 0 && <div className="flex justify-between"><span className="text-slate-500">Netting</span><span>₨ {fmt(item.nettingAmt)}</span></div>}
                <div className="flex justify-between font-black text-emerald-700 border-t border-slate-100 pt-1.5">
                  <span>Total</span><span>₨ {fmt(item.total)}</span>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const GTKQuotationManager: React.FC = () => {
  const {
    rates, header, options, activeOption, activeOptionId, items,
    activeView, setActiveView,
    showRateCard, setShowRateCard,
    selectedItemId, setSelectedItemId,
    updateHeader,
    addOption, removeOption, duplicateOption, updateOptionLabel, setActiveOptionId,
    addItem, deleteItem, duplicateItem, updateItem, moveItem,
    saveRates,
    totals,
    // Phase 3
    quotationId, quotationStatus, isDirty, isSaving,
    saveQuotation, loadQuotation, newQuotation, updateStatus,
    margin,
  } = useGTKQuotation();

  const [converting,      setConverting]      = useState(false);
  const [showJobRegister, setShowJobRegister] = useState(false);
  const [showList,        setShowList]        = useState(false);

  const statusCfg = STATUS_CFG[quotationStatus];

  const tabBtn = (view: typeof activeView, label: string, icon: React.ReactNode, badge?: string) => (
    <button onClick={() => setActiveView(view)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all
        ${activeView === view ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>
      {icon}<span>{label}</span>
      {badge && <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[9px]">{badge}</span>}
    </button>
  );

  if (showList) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-900 to-blue-700 px-5 py-3 rounded-2xl">
          <div className="bg-white/15 rounded-xl px-3 py-1.5 text-lg font-black text-white tracking-tight">GT</div>
          <div className="flex-1">
            <div className="text-white font-black text-sm">GTK Quotation Builder</div>
            <div className="text-blue-200 text-[10px]">Aluminum Window & Door Systems</div>
          </div>
          <button onClick={() => setShowList(false)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/25">
            <X size={13}/> Close List
          </button>
        </div>
        <QuotationListView
          onLoad={q => { loadQuotation(q); setShowList(false); }}
          onNew={() => { newQuotation(); setShowList(false); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="no-print flex items-center justify-between bg-gradient-to-r from-blue-900 to-blue-700 px-5 py-3 rounded-2xl flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 rounded-xl px-3 py-1.5 text-lg font-black text-white tracking-tight">GT</div>
          <div>
            <div className="text-white font-black text-sm flex items-center gap-2">
              GTK Quotation Builder
              {quotationId && (
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">{quotationId}</span>
              )}
              {isDirty && (
                <span className="text-[9px] bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                  <AlertCircle size={9}/> Unsaved
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${quotationStatus === 'Approved' ? 'bg-emerald-400 text-emerald-900' : quotationStatus === 'Sent' ? 'bg-blue-300 text-blue-900' : quotationStatus === 'Rejected' ? 'bg-rose-400 text-rose-900' : 'bg-white/20 text-white'}`}>
                {statusCfg.icon} {statusCfg.label}
              </span>
              <span className="text-blue-200 text-[10px]">Aluminum Window & Door Systems</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Quotation List */}
          <button onClick={() => setShowList(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/25">
            <FolderOpen size={13}/> My Quotations
          </button>
          {/* New */}
          <button onClick={newQuotation}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/25">
            <Plus size={13}/> New
          </button>
          {/* Save */}
          <button onClick={() => saveQuotation()} disabled={isSaving}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              isDirty
                ? 'bg-amber-400 text-amber-900 hover:bg-amber-300'
                : 'bg-white/15 text-white border border-white/25 hover:bg-white/25'
            }`}>
            {isSaving ? <RefreshCw size={13} className="animate-spin"/> : <Save size={13}/>}
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          {/* Status workflow */}
          {quotationId && quotationStatus === 'Draft' && (
            <button onClick={() => updateStatus('Sent')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-400 text-white rounded-lg text-xs font-bold hover:bg-blue-300">
              <Send size={13}/> Mark Sent
            </button>
          )}
          {quotationId && quotationStatus === 'Sent' && (
            <>
              <button onClick={() => updateStatus('Approved')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-400">
                <CheckCircle2 size={13}/> Approve
              </button>
              <button onClick={() => updateStatus('Rejected')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-bold hover:bg-rose-400">
                <XCircle size={13}/> Reject
              </button>
            </>
          )}
          <button onClick={() => setShowJobRegister(!showJobRegister)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/25">
            <ListOrdered size={13}/> Job Register
          </button>
          <button onClick={() => setShowRateCard(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/25">
            <Settings size={13}/> Rate Card
          </button>
          <button
            disabled={items.length === 0 || converting}
            onClick={async () => {
              if (!header.clientName) { toast.error('Add client name before converting.'); return; }
              if (!window.confirm(`Convert "${activeOption?.label}" to Job Order?`)) return;
              setConverting(true);
              try {
                const jo = await convertQuotationToJobOrder(header, activeOption!, 'GTK');
                toast.success(`Job Order ${jo.id} created — ${jo.items.length} items.`, { duration: 8000 });
                setShowJobRegister(true);
              } catch (e: any) {
                toast.error('Job Order creation failed: ' + e.message);
              } finally { setConverting(false); }
            }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              items.length === 0 || converting
                ? 'bg-white/10 text-white/40 cursor-not-allowed'
                : 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg'
            }`}>
            <Send size={13}/> {converting ? 'Converting…' : 'Convert to Job Order'}
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-50">
            <Printer size={13}/> Print
          </button>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="no-print flex items-center gap-4 bg-white border border-slate-200 rounded-2xl px-5 py-3">
        <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Quote Mode:</span>
        {(['aluminum', 'inclusive'] as const).map(m => (
          <button key={m} onClick={() => updateHeader('mode', m)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-all
              ${header.mode === m ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            {m === 'aluminum' ? 'Aluminum Only' : 'All-Inclusive (Glass + Alu)'}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={header.installationIncluded}
            onChange={e => updateHeader('installationIncluded', e.target.checked)} className="w-3.5 h-3.5" />
          Include Installation (₨120/sqft)
        </label>
      </div>

      {showJobRegister && <div className="no-print"><GTKJobOrderRegister /></div>}

      {/* View Tabs */}
      <div className="no-print flex gap-2">
        {tabBtn('builder', 'Builder', <FileText size={14}/>)}
        {tabBtn('preview_quote', 'Quotation Preview', <Eye size={14}/>)}
        {tabBtn('preview_jobs', 'Job Orders', <Package size={14}/>, String(items.length))}
        {options.length > 1 && tabBtn('compare', 'Compare Options', <BarChart2 size={14}/>, String(options.length))}
      </div>

      {/* ═══ BUILDER ═══ */}
      {activeView === 'builder' && (
        <div className="no-print space-y-4">
          {/* Client Info */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-4">Project & Client Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {([
                ['refNo','Ref. No.','GT20251021'],
                ['date','Date','','date'],
                ['validTill','Valid Till','','date'],
                ['color','Color','Black'],
                ['clientName','Client Name *','Mr. Salman Paracha'],
                ['site','Site / Address','DHA Phase 8, Karachi'],
                ['architect','Architect','Ashray Studio'],
                ['hardware','Hardware','KINLONG'],
              ] as [keyof typeof header, string, string, string?][]).map(([field, label, ph, type]) => (
                <div key={field}>
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">{label}</label>
                  <input type={type || 'text'} value={header[field] as string}
                    onChange={e => updateHeader(field, e.target.value)} placeholder={ph}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none" />
                </div>
              ))}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Profile Type</label>
                <select value={header.profileType} onChange={e => updateHeader('profileType', e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none">
                  {PROFILE_SYSTEMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Section Size</label>
                <select value={header.sectionSize} onChange={e => updateHeader('sectionSize', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none">
                  {(PROFILE_SYSTEMS.find(p => p.id === header.profileType)?.sectionSizes || SECTION_SIZES).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Series / Brand</label>
                <input value={header.sectionBrand} onChange={e => updateHeader('sectionBrand', e.target.value)}
                  placeholder="GT Gulf Series"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none" />
              </div>
              <div className="md:col-span-4">
                <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Subject Line</label>
                <input value={header.subject} onChange={e => updateHeader('subject', e.target.value)}
                  placeholder={`Quotation for ${header.sectionSize} ${header.profileType} Aluminum Window & Door Systems`}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Option Tabs */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <GitBranch size={14} className="text-slate-400"/>
              <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Quotation Options</span>
            </div>
            <OptionTabsBar options={options} activeId={activeOptionId}
              onSelect={setActiveOptionId} onAdd={addOption}
              onDuplicate={duplicateOption} onRemove={removeOption}
              onRename={updateOptionLabel} />
          </div>

          {/* Items Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50">
              <div>
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">{activeOption?.label} — Line Items</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Click row to expand · Blue rate = override</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ minWidth: 1450 }}>
                <thead>
                  <tr className="bg-slate-900 text-white">
                    {['#','S.No','Window / Door Type','Profile','Glass','Floor','Location','Loc.Code','Qty','W (ft)','H (ft)','Sqft/RFT','Rate','Amount','Netting','Actions'].map(h => (
                      <th key={h} className="px-2 py-2.5 text-[9px] font-black uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const defaultRate = rates[header.profileType]?.[item.windowTypeId] ?? 0;
                    return (
                      <ItemRow key={item.id} item={item} index={idx} isSelected={selectedItemId === item.id}
                        defaultRate={defaultRate}
                        onSelect={() => setSelectedItemId(selectedItemId === item.id ? null : item.id)}
                        onUpdate={(field, val) => updateItem(item.id, field, val)}
                        onDelete={() => deleteItem(item.id)}
                        onDuplicate={() => duplicateItem(item.id)}
                        onMoveUp={() => moveItem(item.id, 'up')}
                        onMoveDown={() => moveItem(item.id, 'down')}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t">
              <button onClick={addItem} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">
                <Plus size={14}/> Add Item
              </button>
            </div>
          </div>

          {/* Bottom — Adjustments + Margin + Totals */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <h4 className="text-[9px] font-black text-slate-400 uppercase">Adjustments</h4>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 w-20">Discount %</label>
                <input type="number" min={0} max={100} value={header.discount || ''}
                  onChange={e => updateHeader('discount', parseFloat(e.target.value) || 0)}
                  className="w-20 text-center px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
                {totals.discountAmt > 0 && <span className="text-xs text-rose-600 font-bold">- ₨{fmt(totals.discountAmt)}</span>}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 w-20">Cartage (Rs.)</label>
                <input type="number" min={0} value={header.cartage || ''}
                  onChange={e => updateHeader('cartage', parseFloat(e.target.value) || 0)}
                  className="w-24 text-center px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
              </div>
            </div>

            {/* Margin Panel — Phase 3 */}
            <MarginPanel margin={margin} />

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <h4 className="text-[9px] font-black text-slate-400 uppercase mb-2">Terms & Conditions</h4>
              <textarea value={header.terms} onChange={e => updateHeader('terms', e.target.value)} rows={4}
                className="w-full text-[9px] px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none resize-none leading-relaxed" />
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <h4 className="text-[9px] font-black text-slate-400 uppercase mb-3">Summary — {activeOption?.label}</h4>
              {[
                { l: 'Total Sq.Ft', v: totals.totalSqft.toFixed(2) },
                { l: 'Sub Total', v: `₨ ${fmt(totals.subTotal)}` },
                ...(totals.installAmt > 0 ? [{ l: 'Installation', v: `₨ ${fmt(totals.installAmt)}` }] : []),
                ...(header.cartage > 0 ? [{ l: 'Cartage', v: `₨ ${fmt(header.cartage)}` }] : []),
              ].map(row => (
                <div key={row.l} className="flex justify-between text-xs py-1 border-b border-slate-50">
                  <span className="text-slate-500">{row.l}</span>
                  <span className="font-bold">{row.v}</span>
                </div>
              ))}
              {totals.discountAmt > 0 && (
                <div className="flex justify-between text-xs py-1 border-b border-slate-50">
                  <span className="text-rose-500">Discount ({header.discount}%)</span>
                  <span className="font-bold text-rose-500">- ₨ {fmt(totals.discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between mt-3 pt-2 border-t-2 border-blue-600">
                <span className="text-sm font-black text-blue-700">Grand Total</span>
                <span className="text-sm font-black text-blue-700">₨ {fmt(totals.grandTotal)}</span>
              </div>
              {totals.totalSqft > 0 && (
                <div className="text-[10px] text-slate-400 text-right mt-1">₨ {fmt(totals.grandTotal / totals.totalSqft)} avg/sqft</div>
              )}
              {/* Quick save from summary */}
              <button onClick={() => saveQuotation()} disabled={isSaving}
                className="w-full mt-3 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50">
                {isSaving ? <RefreshCw size={12} className="animate-spin"/> : <Save size={12}/>}
                {isSaving ? 'Saving…' : isDirty ? 'Save Changes' : 'Saved ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PREVIEW ═══ */}
      {activeView === 'preview_quote' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <PrintQuotation header={header} items={items} totals={totals} clientName={header.clientName} />
        </div>
      )}

      {/* ═══ JOB ORDERS ═══ */}
      {activeView === 'preview_jobs' && (
        <div className="space-y-4">
          {items.length === 0
            ? <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-400">Add items in Builder tab first.</div>
            : items.map((item, i) => {
                const wt = WINDOW_TYPES.find(w => w.id === item.windowTypeId);
                return (
                  <div key={item.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500 border-b">
                      Job Order {i + 1}: {wt?.label} — {item.location || 'No location'} {item.floor ? `(${item.floor})` : ''}
                    </div>
                    <JobOrderPage item={item} header={header} index={i} clientName={header.clientName} />
                  </div>
                );
              })
          }
        </div>
      )}

      {/* ═══ COMPARE ═══ */}
      {activeView === 'compare' && (
        <CompareView options={options} header={header} installAmt={totals.installAmt} discount={header.discount} />
      )}

      {showRateCard && <RateCardModal rates={rates} onSave={saveRates} onClose={() => setShowRateCard(false)} />}

      <style>{`@media print { .no-print { display: none !important; } body { margin: 0; } }`}</style>
    </div>
  );
};

export default GTKQuotationManager;
