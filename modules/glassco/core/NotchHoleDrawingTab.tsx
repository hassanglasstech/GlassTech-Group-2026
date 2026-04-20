import React, { useMemo, useState } from 'react';
import { QuotationItem, Product, HoleLocation } from '@/modules/shared/types';
import { Circle, Square, Scissors, Trash2, Plus, AlertCircle } from 'lucide-react';

interface Props {
    items: QuotationItem[];
    products: Product[];
    onUpdateItem: (idx: number, field: string, val: unknown) => void;
}

type MarkerType = 'Hole' | 'Notch' | 'Cutout';

// 9-position grid mapped to (x%, y%) on the glass rectangle
const POSITIONS: Array<{ key: string; label: string; x: number; y: number }> = [
    { key: 'TL', label: 'Top-Left',     x: 8,  y: 8  },
    { key: 'TC', label: 'Top-Center',   x: 50, y: 8  },
    { key: 'TR', label: 'Top-Right',    x: 92, y: 8  },
    { key: 'ML', label: 'Mid-Left',     x: 8,  y: 50 },
    { key: 'MC', label: 'Center',       x: 50, y: 50 },
    { key: 'MR', label: 'Mid-Right',    x: 92, y: 50 },
    { key: 'BL', label: 'Bottom-Left',  x: 8,  y: 92 },
    { key: 'BC', label: 'Bottom-Center',x: 50, y: 92 },
    { key: 'BR', label: 'Bottom-Right', x: 92, y: 92 },
];

const normalize = (s: unknown) => String(s || '').trim().toLowerCase();

const MARKER_COLOR: Record<MarkerType, string> = {
    Hole: '#2563eb',      // blue
    Notch: '#dc2626',     // red
    Cutout: '#16a34a',    // green
};

const ItemDrawingCard: React.FC<{
    item: QuotationItem;
    itemIdx: number;
    displayIdx: number;
    notchRate: number;
    onUpdateItem: (idx: number, field: string, val: unknown) => void;
}> = ({ item, itemIdx, displayIdx, notchRate, onUpdateItem }) => {
    const [selectedType, setSelectedType] = useState<MarkerType>('Notch');
    const [selectedPos, setSelectedPos] = useState<string>('TL');
    const [diameter, setDiameter] = useState<string>('25');
    const [ntchW, setNtchW] = useState<string>('50');
    const [ntchH, setNtchH] = useState<string>('30');

    const holes: HoleLocation[] = item.holes || [];
    const qty = Number(item.qty) || 1;
    const lineCharges = notchRate * holes.length * qty;

    // Visual glass proportions (cap at 320×200 max)
    const glassW = item.width || 0;
    const glassH = item.height || 0;
    const maxW = 320;
    const maxH = 200;
    let rectW = maxW;
    let rectH = maxH;
    if (glassW > 0 && glassH > 0) {
        const ratio = glassW / glassH;
        if (ratio > maxW / maxH) {
            rectW = maxW;
            rectH = Math.round(maxW / ratio);
        } else {
            rectH = maxH;
            rectW = Math.round(maxH * ratio);
        }
    }

    const addMarker = () => {
        const pos = POSITIONS.find(p => p.key === selectedPos);
        if (!pos) return;
        const newHole: HoleLocation = {
            id: `HL-${Date.now()}`,
            x: pos.x,
            y: pos.y,
            type: selectedType,
            diameter: selectedType === 'Hole' ? diameter : '',
            width: selectedType !== 'Hole' ? ntchW : '',
            height: selectedType !== 'Hole' ? ntchH : '',
        };
        onUpdateItem(itemIdx, 'holes', [...holes, newHole]);
    };

    const removeMarker = (id: string) => {
        onUpdateItem(itemIdx, 'holes', holes.filter(h => h.id !== id));
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Item #{displayIdx}</span>
                    <div className="text-sm font-bold text-slate-800 uppercase">{item.description || 'Untitled'}</div>
                    <div className="text-[10px] font-bold text-blue-600">
                        {glassW.toFixed(1)}" × {glassH.toFixed(1)}" · {item.glassSize} {item.glassType} · Qty {qty}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[9px] font-black uppercase text-slate-400">Notch Charges</div>
                    <div className="text-lg font-black text-rose-600">PKR {lineCharges.toLocaleString()}</div>
                    <div className="text-[9px] text-slate-500">{holes.length} × {notchRate} × {qty}</div>
                </div>
            </div>

            <div className="p-4 grid grid-cols-12 gap-4">
                {/* LEFT: 2D Visual */}
                <div className="col-span-5 flex flex-col items-center">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Glass Layout</div>
                    <svg width={rectW + 40} height={rectH + 40} className="bg-slate-50 rounded-lg border border-slate-200">
                        {/* Glass rect */}
                        <rect x={20} y={20} width={rectW} height={rectH} fill="#e0f2fe" stroke="#0284c7" strokeWidth={2} />
                        {/* Dimension labels */}
                        <text x={20 + rectW / 2} y={14} textAnchor="middle" fontSize={9} fontWeight={700} fill="#64748b">
                            W: {glassW.toFixed(1)}"
                        </text>
                        <text x={12} y={20 + rectH / 2} textAnchor="middle" fontSize={9} fontWeight={700} fill="#64748b" transform={`rotate(-90, 12, ${20 + rectH / 2})`}>
                            H: {glassH.toFixed(1)}"
                        </text>
                        {/* Markers */}
                        {holes.map(h => {
                            const cx = 20 + (h.x / 100) * rectW;
                            const cy = 20 + (h.y / 100) * rectH;
                            const color = MARKER_COLOR[h.type as MarkerType] || '#64748b';
                            if (h.type === 'Hole') {
                                return <circle key={h.id} cx={cx} cy={cy} r={6} fill={color} stroke="#fff" strokeWidth={2} />;
                            }
                            return <rect key={h.id} x={cx - 6} y={cy - 6} width={12} height={12} fill={color} stroke="#fff" strokeWidth={2} />;
                        })}
                    </svg>
                    <div className="mt-2 flex gap-3 text-[9px] font-bold uppercase">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: MARKER_COLOR.Hole }} /> Hole</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3" style={{ background: MARKER_COLOR.Notch }} /> Notch</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3" style={{ background: MARKER_COLOR.Cutout }} /> Cutout</span>
                    </div>
                </div>

                {/* MIDDLE: Add controls */}
                <div className="col-span-4 space-y-2.5">
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Marker Type</label>
                        <div className="grid grid-cols-3 gap-1">
                            {(['Hole', 'Notch', 'Cutout'] as MarkerType[]).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setSelectedType(t)}
                                    className={`py-1.5 rounded-md text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-1 ${selectedType === t ? 'text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                    style={selectedType === t ? { background: MARKER_COLOR[t] } : undefined}
                                >
                                    {t === 'Hole' ? <Circle size={10} /> : t === 'Notch' ? <Square size={10} /> : <Scissors size={10} />}
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Position</label>
                        <div className="grid grid-cols-3 gap-1">
                            {POSITIONS.map(p => (
                                <button
                                    key={p.key}
                                    onClick={() => setSelectedPos(p.key)}
                                    title={p.label}
                                    className={`py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${selectedPos === p.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                >
                                    {p.key}
                                </button>
                            ))}
                        </div>
                    </div>

                    {selectedType === 'Hole' ? (
                        <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Diameter (mm)</label>
                            <input
                                type="number"
                                value={diameter}
                                onChange={e => setDiameter(e.target.value)}
                                className="sap-input w-full h-8 text-xs font-bold border-slate-300 px-2"
                            />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Width (mm)</label>
                                <input
                                    type="number"
                                    value={ntchW}
                                    onChange={e => setNtchW(e.target.value)}
                                    className="sap-input w-full h-8 text-xs font-bold border-slate-300 px-2"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Height (mm)</label>
                                <input
                                    type="number"
                                    value={ntchH}
                                    onChange={e => setNtchH(e.target.value)}
                                    className="sap-input w-full h-8 text-xs font-bold border-slate-300 px-2"
                                />
                            </div>
                        </div>
                    )}

                    <button
                        onClick={addMarker}
                        className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm"
                    >
                        <Plus size={12} /> Add Marker
                    </button>
                </div>

                {/* RIGHT: List */}
                <div className="col-span-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Placed Markers ({holes.length})</div>
                    <div className="space-y-1 max-h-[260px] overflow-y-auto">
                        {holes.length === 0 && (
                            <div className="text-[10px] text-slate-400 italic py-4 text-center">No markers yet</div>
                        )}
                        {holes.map((h, i) => {
                            const posKey = POSITIONS.find(p => p.x === h.x && p.y === h.y)?.key || `${h.x},${h.y}`;
                            const sizeStr = h.type === 'Hole' ? `Ø${h.diameter}mm` : `${h.width}×${h.height}mm`;
                            return (
                                <div key={h.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: MARKER_COLOR[h.type as MarkerType] }} />
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-black text-slate-700 uppercase truncate">#{i + 1} {h.type}</div>
                                            <div className="text-[9px] text-slate-500 font-bold truncate">{posKey} · {sizeStr}</div>
                                        </div>
                                    </div>
                                    <button onClick={() => removeMarker(h.id)} className="p-1 text-slate-400 hover:text-rose-600 shrink-0">
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const NotchHoleDrawingTab: React.FC<Props> = ({ items, products, onUpdateItem }) => {
    const notchRate = useMemo(() => {
        const p = products.find(pr =>
            normalize(pr.category) === 'service' && normalize(pr.serviceNick) === 'notch'
        );
        return p?.basePrice || 0;
    }, [products]);

    // Items with Notch service selected
    const notchItems = useMemo(() => {
        return items
            .map((it, idx) => ({ item: it, idx }))
            .filter(({ item }) => !item.isSection && item.selectedServices?.some(s => normalize(s) === 'notch'));
    }, [items]);

    // Display index (skip section rows in count)
    const displayIdxMap = useMemo(() => {
        const map: Record<number, number> = {};
        let n = 0;
        items.forEach((it, idx) => {
            if (!it.isSection) {
                n++;
                map[idx] = n;
            }
        });
        return map;
    }, [items]);

    const grandTotal = notchItems.reduce((sum, { item }) => {
        const qty = Number(item.qty) || 1;
        return sum + notchRate * (item.holes?.length || 0) * qty;
    }, 0);

    if (notchItems.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-16 text-slate-400">
                <AlertCircle size={48} className="mb-4 opacity-40" />
                <div className="text-sm font-bold uppercase tracking-widest mb-2">No Notch Items</div>
                <div className="text-xs font-bold text-slate-500 max-w-md text-center">
                    Notch select karne ke liye, Line Items tab mein jaa kar item ke Services section mein "Notch" par click karein.
                </div>
                {notchRate === 0 && (
                    <div className="mt-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-bold text-amber-800">
                        ⚠ Notch rate not configured in Product Master (category=Service, nick=Notch)
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4 overflow-y-auto h-full">
            {/* Summary bar */}
            <div className="bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-rose-700">Notch / Hole Placement</div>
                    <div className="text-[11px] font-bold text-slate-600 mt-0.5">
                        {notchItems.length} item(s) · Rate per notch: PKR {notchRate.toLocaleString()}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-black uppercase text-slate-500">Total Notch Charges</div>
                    <div className="text-2xl font-black text-rose-600">PKR {grandTotal.toLocaleString()}</div>
                </div>
            </div>

            {notchItems.map(({ item, idx }) => (
                <ItemDrawingCard
                    key={item.id || idx}
                    item={item}
                    itemIdx={idx}
                    displayIdx={displayIdxMap[idx] || 0}
                    notchRate={notchRate}
                    onUpdateItem={onUpdateItem}
                />
            ))}
        </div>
    );
};

export default NotchHoleDrawingTab;
