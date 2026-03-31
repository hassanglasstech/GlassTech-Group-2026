import React, { useState } from 'react';
import {
  Plus, Trash2, Copy, ChevronUp, ChevronDown,
  Printer, Settings, Eye, FileText, Package,
  X, GitBranch, BarChart2, Edit2, Check,
} from 'lucide-react';
import { useGTKQuotation } from './useGTKQuotation';
import {
  WINDOW_TYPES, GLASS_SPECS, NETTING_TYPES, FLOORS,
  PROFILE_SYSTEMS, SECTION_SIZES, DEFAULT_RATE_CARD, RateCard,
} from './gtkQuotationConstants';
import { GTKQuoteItem, GTKQuoteOption } from './gtkQuotationTypes';
import WindowSVG from './WindowSVG';
import PrintQuotation from './PrintQuotation';
import JobOrderPage from './JobOrderPage';

const fmt = (n: number) => Math.round(n).toLocaleString('en-PK');

// ─── RATE CARD MODAL ─────────────────────────────────────────────────────────

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
            <p className="text-[10px] text-slate-500">Default rates auto-fill in builder. Override per item anytime.</p>
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

// ─── OPTION TABS BAR ─────────────────────────────────────────────────────────

const OptionTabsBar: React.FC<{
  options: GTKQuoteOption[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
}> = ({ options, activeId, onSelect, onAdd, onDuplicate, onRemove, onRename }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {options.map(opt => (
        <div key={opt.id} className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-all shrink-0
          ${opt.id === activeId ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
          onClick={() => onSelect(opt.id)}>
          {editing === opt.id ? (
            <input value={editVal} autoFocus onChange={e => setEditVal(e.target.value)}
              onBlur={() => { onRename(opt.id, editVal); setEditing(null); }}
              onKeyDown={e => { if (e.key === 'Enter') { onRename(opt.id, editVal); setEditing(null); } }}
              className="bg-transparent outline-none w-24 text-xs" onClick={e => e.stopPropagation()} />
          ) : (
            <span>{opt.label}</span>
          )}
          {/* Amount badge */}
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${opt.id === activeId ? 'bg-white/20' : 'bg-slate-100'}`}>
            ₨{Math.round(opt.totalAmount / 1000)}K
          </span>
          {/* Actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setEditing(opt.id); setEditVal(opt.label); }}
              className="p-0.5 hover:bg-white/20 rounded"><Edit2 size={10}/></button>
            <button onClick={() => onDuplicate(opt.id)}
              className="p-0.5 hover:bg-white/20 rounded"><Copy size={10}/></button>
            {options.length > 1 && (
              <button onClick={() => onRemove(opt.id)}
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

const CompareView: React.FC<{
  options: GTKQuoteOption[];
  header: any;
  installAmt: number;
  discount: number;
}> = ({ options, header, discount }) => {
  const calcGrand = (opt: GTKQuoteOption) => {
    const gross = opt.totalAmount + (header.cartage || 0);
    return gross - (discount / 100) * gross;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b bg-slate-50">
        <h3 className="text-sm font-black text-slate-700">Option Comparison</h3>
        <p className="text-xs text-slate-500 mt-0.5">Side-by-side comparison of all quotation options</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-4 py-3 text-left font-bold">Metric</th>
              {options.map(o => (
                <th key={o.id} className="px-4 py-3 text-center font-bold">{o.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Profile Type', fn: (o: GTKQuoteOption) => o.profileType },
              { label: 'Section Size', fn: (o: GTKQuoteOption) => o.sectionSize },
              { label: 'Total Items', fn: (o: GTKQuoteOption) => String(o.items.length) },
              { label: 'Total Sq.Ft', fn: (o: GTKQuoteOption) => o.totalSqft.toFixed(2) },
              { label: 'Sub Total', fn: (o: GTKQuoteOption) => `₨ ${fmt(o.totalAmount)}` },
              { label: 'Grand Total', fn: (o: GTKQuoteOption) => `₨ ${fmt(calcGrand(o))}` },
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
            {/* Savings row */}
            {options.length > 1 && (() => {
              const amounts = options.map(o => calcGrand(o));
              const max = Math.max(...amounts);
              return (
                <tr className="bg-emerald-50">
                  <td className="px-4 py-2.5 font-bold text-emerald-700">Savings vs Highest</td>
                  {options.map((o, i) => {
                    const saving = max - amounts[i];
                    return (
                      <td key={o.id} className="px-4 py-2.5 text-center font-bold text-emerald-700">
                        {saving === 0 ? '—' : `- ₨ ${fmt(saving)}`}
                      </td>
                    );
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
        {/* Window Type */}
        <td className="px-2 py-1.5 min-w-[170px]" onClick={e => e.stopPropagation()}>
          <select value={item.windowTypeId} onChange={e => onUpdate('windowTypeId', e.target.value as any)} className={inp}>
            <optgroup label="── Windows ──">
              {WINDOW_TYPES.filter(w => w.category === 'window').map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
            </optgroup>
            <optgroup label="── Doors ──">
              {WINDOW_TYPES.filter(w => w.category === 'door').map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
            </optgroup>
            <optgroup label="── Special / RFT ──">
              {WINDOW_TYPES.filter(w => w.category === 'special').map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
            </optgroup>
          </select>
          {isRFT && <span className="text-[9px] text-amber-600 font-bold mt-0.5 block">⚡ RFT Pricing — enter length in W field</span>}
        </td>
        {/* Profile */}
        <td className="px-2 py-1.5 w-20" onClick={e => e.stopPropagation()}>
          <select value={item.profile} onChange={e => onUpdate('profile', e.target.value)} className={inp}>
            {SECTION_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
        {/* Glass */}
        <td className="px-2 py-1.5 min-w-[110px]" onClick={e => e.stopPropagation()}>
          <select value={item.glassSpecId} onChange={e => onUpdate('glassSpecId', e.target.value)} className={`${inp} ${isRFT ? 'opacity-50' : ''}`} disabled={isRFT}>
            {GLASS_SPECS.map(g => <option key={g.id} value={g.id}>{g.abbr}</option>)}
          </select>
          {item.glassSpecId === 'custom' && !isRFT && (
            <input value={item.customGlassLabel} onChange={e => onUpdate('customGlassLabel', e.target.value)}
              placeholder="Custom..." className={`${inp} mt-1`} onClick={e => e.stopPropagation()} />
          )}
        </td>
        {/* Floor */}
        <td className="px-2 py-1.5 w-32" onClick={e => e.stopPropagation()}>
          <select value={item.floor} onChange={e => onUpdate('floor', e.target.value)} className={inp}>
            {FLOORS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </td>
        {/* Location */}
        <td className="px-2 py-1.5 w-28" onClick={e => e.stopPropagation()}>
          <input value={item.location} onChange={e => onUpdate('location', e.target.value)} placeholder="Drawing Room" className={inp} />
        </td>
        {/* Loc Code */}
        <td className="px-2 py-1.5 w-16" onClick={e => e.stopPropagation()}>
          <input value={item.locationCode} onChange={e => onUpdate('locationCode', e.target.value)} placeholder="W1" className={inp} />
        </td>
        {/* Qty */}
        <td className="px-2 py-1.5 w-14" onClick={e => e.stopPropagation()}>
          <input type="number" min={1} value={item.qty} onChange={e => onUpdate('qty', parseInt(e.target.value) || 1)} className={numInp} />
        </td>
        {/* W */}
        <td className="px-2 py-1.5 w-16" onClick={e => e.stopPropagation()}>
          <input type="number" value={item.widthFt || ''} onChange={e => onUpdate('widthFt', parseFloat(e.target.value) || 0)}
            placeholder={isRFT ? 'RFT' : 'ft'} className={numInp} />
        </td>
        {/* H */}
        <td className="px-2 py-1.5 w-16" onClick={e => e.stopPropagation()}>
          <input type="number" value={item.heightFt || ''} onChange={e => onUpdate('heightFt', parseFloat(e.target.value) || 0)}
            placeholder={isRFT ? '—' : 'ft'} disabled={isRFT} className={`${numInp} ${isRFT ? 'opacity-40' : ''}`} />
        </td>
        {/* Sqft / RFT */}
        <td className="px-3 py-2 text-xs text-right font-bold text-blue-600 whitespace-nowrap">
          <span className="text-[9px] text-slate-400 block">{isRFT ? 'RFT' : 'Sqft'}</span>
          {item.sqftPerPiece > 0 ? item.sqftPerPiece.toFixed(2) : '—'}
          {item.qty > 1 && item.sqftPerPiece > 0 && (
            <div className="text-[9px] text-slate-400">={item.totalSqft.toFixed(2)}</div>
          )}
        </td>
        {/* Rate override */}
        <td className="px-2 py-1.5 w-20" onClick={e => e.stopPropagation()}>
          <input type="number" value={item.rateOverride}
            onChange={e => onUpdate('rateOverride', e.target.value)}
            placeholder={String(defaultRate || 0)}
            className={`${numInp} ${item.rateOverride !== '' ? 'text-blue-700 border-blue-300 font-bold' : 'text-slate-400'}`} />
        </td>
        {/* Amount */}
        <td className="px-3 py-2 text-sm font-black text-slate-800 text-right whitespace-nowrap">
          {item.total > 0 ? `₨ ${Math.round(item.total).toLocaleString()}` : '—'}
        </td>
        {/* Netting */}
        <td className="px-2 py-1.5 w-24" onClick={e => e.stopPropagation()}>
          <select value={item.netting} onChange={e => onUpdate('netting', e.target.value as any)}
            className={`${inp} ${isRFT ? 'opacity-40' : ''}`} disabled={isRFT}>
            {NETTING_TYPES.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
        </td>
        {/* Actions */}
        <td className="px-2 py-1.5 w-24" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-0.5">
            <button onClick={onMoveUp} className="p-1 text-slate-300 hover:text-slate-600 rounded"><ChevronUp size={12}/></button>
            <button onClick={onMoveDown} className="p-1 text-slate-300 hover:text-slate-600 rounded"><ChevronDown size={12}/></button>
            <button onClick={onDuplicate} className="p-1 text-blue-400 hover:text-blue-600 rounded"><Copy size={13}/></button>
            <button onClick={onDelete} className="p-1 text-rose-400 hover:text-rose-600 rounded"><Trash2 size={13}/></button>
          </div>
        </td>
      </tr>

      {/* Expanded detail */}
      {isSelected && (
        <tr className="bg-blue-50/60">
          <td colSpan={16} className="px-4 py-4">
            <div className="grid grid-cols-4 gap-4 items-start">
              {/* SVG Preview */}
              <div className="flex flex-col items-center gap-2 bg-white rounded-xl border border-slate-200 p-4">
                <WindowSVG typeId={wt?.svgType || 'fixed_no_div'} width={160} height={120} />
                <div className="text-xs font-bold text-slate-600 text-center">
                  {!isRFT && item.widthFt > 0 && item.heightFt > 0
                    ? `${Math.round(item.widthFt * 304.8)} × ${Math.round(item.heightFt * 304.8)} mm`
                    : isRFT && item.widthFt > 0
                    ? `${item.widthFt} RFT`
                    : 'Enter dimensions'}
                </div>
              </div>
              {/* Divider note + Notes */}
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
              {/* Coupling */}
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
              {/* Breakdown */}
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

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

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
  } = useGTKQuotation();

  const tabBtn = (view: typeof activeView, label: string, icon: React.ReactNode, badge?: string) => (
    <button onClick={() => setActiveView(view)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all
        ${activeView === view ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>
      {icon}<span>{label}</span>
      {badge && <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[9px]">{badge}</span>}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="no-print flex items-center justify-between bg-gradient-to-r from-blue-900 to-blue-700 px-5 py-3 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 rounded-xl px-3 py-1.5 text-lg font-black text-white tracking-tight">GT</div>
          <div>
            <div className="text-white font-black text-sm">GTK Quotation Builder</div>
            <div className="text-blue-200 text-[10px]">Aluminum Window & Door Systems — Phase 2</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowRateCard(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/25">
            <Settings size={13}/> Rate Card
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
              {/* Profile Type */}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Profile Type</label>
                <select value={header.profileType} onChange={e => updateHeader('profileType', e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none">
                  {PROFILE_SYSTEMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              {/* Section Size */}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Section Size</label>
                <select value={header.sectionSize} onChange={e => updateHeader('sectionSize', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none">
                  {(PROFILE_SYSTEMS.find(p => p.id === header.profileType)?.sectionSizes || SECTION_SIZES).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              {/* Brand */}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Series / Brand</label>
                <input value={header.sectionBrand} onChange={e => updateHeader('sectionBrand', e.target.value)}
                  placeholder="GT Gulf Series"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-blue-400 focus:outline-none" />
              </div>
              {/* Subject */}
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
              <span className="text-[10px] text-slate-400">(e.g. Option A = 4" Non-Thermal, Option B = 5" Gulf Series)</span>
            </div>
            <OptionTabsBar
              options={options} activeId={activeOptionId}
              onSelect={setActiveOptionId} onAdd={addOption}
              onDuplicate={duplicateOption} onRemove={removeOption}
              onRename={updateOptionLabel}
            />
          </div>

          {/* Items Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50">
              <div>
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                  {activeOption?.label} — Line Items
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Click row to expand · Blue rate = override · RFT items use Width field for linear feet</p>
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

          {/* Bottom — Adjustments + Totals */}
          <div className="grid grid-cols-3 gap-4">
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
              <div className="flex justify-between mt-3 pt-2 border-t-2 border-blue-600">
                <span className="text-sm font-black text-blue-700">Grand Total</span>
                <span className="text-sm font-black text-blue-700">₨ {fmt(totals.grandTotal)}</span>
              </div>
              {totals.totalSqft > 0 && (
                <div className="text-[10px] text-slate-400 text-right mt-1">₨ {fmt(totals.grandTotal / totals.totalSqft)} avg/sqft</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PREVIEW QUOTATION ═══ */}
      {activeView === 'preview_quote' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <PrintQuotation header={header} items={items} totals={totals} clientName={header.clientName} />
        </div>
      )}

      {/* ═══ JOB ORDERS ═══ */}
      {activeView === 'preview_jobs' && (
        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-400">Add items in Builder tab first.</div>
          ) : (
            items.map((item, i) => {
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
          )}
        </div>
      )}

      {/* ═══ COMPARE ═══ */}
      {activeView === 'compare' && (
        <CompareView options={options} header={header} installAmt={totals.installAmt} discount={header.discount} />
      )}

      {showRateCard && <RateCardModal rates={rates} onSave={saveRates} onClose={() => setShowRateCard(false)} />}

      <style>{`
        @media print { .no-print { display: none !important; } body { margin: 0; } }
      `}</style>
    </div>
  );
};

export default GTKQuotationManager;
