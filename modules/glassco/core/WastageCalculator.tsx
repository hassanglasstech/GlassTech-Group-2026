/**
 * WastageCalculator.tsx — Wastage Analysis Tab
 * Real 2D cutting diagram with sheet selector for quotation-time wastage preview.
 * Shows: cutting plan SVG, wastage %, sheets needed, rate adjustment suggestion.
 */

import React, { useState, useMemo } from 'react';
import { QuotationItem, Product } from '../../shared/types';
import CuttingDiagram, { buildPackingPiecesFromQuotation } from './CuttingDiagram';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { useAppStore } from '@/modules/shared/store/appStore';
import { Scissors, Layers, AlertTriangle, CheckCircle2, TrendingDown } from 'lucide-react';

interface Props {
  items: QuotationItem[];
  sheetSize: { w: number; h: number };
  products: Product[];
}

// Common glass sheet sizes (inches)
const SHEET_SIZES: { label: string; w: number; h: number }[] = [
  { label: '84 x 144 (7x12 ft)', w: 84, h: 144 },
  { label: '84 x 120 (7x10 ft)', w: 84, h: 120 },
  { label: '72 x 120 (6x10 ft)', w: 72, h: 120 },
  { label: '72 x 96 (6x8 ft)', w: 72, h: 96 },
  { label: '96 x 144 (8x12 ft)', w: 96, h: 144 },
  { label: '60 x 96 (5x8 ft)', w: 60, h: 96 },
  { label: '48 x 96 (4x8 ft)', w: 48, h: 96 },
];

export const WastageCalculator: React.FC<Props> = ({ items, sheetSize, products }) => {
  const company = useAppStore(s => s.selectedCompany);
  const [selectedSize, setSelectedSize] = useState<{ w: number; h: number }>(sheetSize);

  // Build cutting pieces from quotation items
  const cuttingPieces = useMemo(() => buildPackingPiecesFromQuotation(items), [items]);

  // Get live stock for selected sheet size
  const stockInfo = useMemo(() => {
    try {
      const store = InventoryService.getStore().filter(i => i.company === company && i.category === 'Raw');
      const matching = store.filter(item => {
        const sizeMatch = item.name.match(/(\d+)\s*x\s*(\d+)/i);
        if (!sizeMatch) return false;
        const w = Number(sizeMatch[1]);
        const h = Number(sizeMatch[2]);
        return (w === selectedSize.w && h === selectedSize.h) || (w === selectedSize.h && h === selectedSize.w);
      });
      const totalSheets = matching.reduce((s, i) => s + (i.unrestrictedQty || i.quantity || 0), 0);
      const remnants = matching.reduce((s, i) => s + (i.remnantCount || 0), 0);
      const remnantSqft = matching.reduce((s, i) => s + (i.remnantSqft || 0), 0);
      return { totalSheets, remnants, remnantSqft, items: matching };
    } catch { return { totalSheets: 0, remnants: 0, remnantSqft: 0, items: [] }; }
  }, [company, selectedSize]);

  // Total required sqft
  const totalRequiredSqft = items.reduce((s, i) => s + (i.totalSqFt || 0), 0);
  const sheetSqft = (selectedSize.w * selectedSize.h) / 144;
  const usagePct = sheetSqft > 0 ? (totalRequiredSqft / sheetSqft) * 100 : 0;

  // No pieces to show
  if (cuttingPieces.length === 0) {
    return (
      <div className="p-10 text-center">
        <Scissors size={40} className="mx-auto text-slate-300 mb-4"/>
        <h3 className="text-lg font-black text-slate-400 uppercase tracking-widest">Wastage Analysis</h3>
        <p className="text-sm text-slate-400 mt-2">Add glass items with dimensions (width x height) to see cutting plan.</p>
        <p className="text-xs text-slate-300 mt-1">Items need inch or mm dimensions to generate 2D diagram.</p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      {/* Header + Sheet Selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <Scissors size={16} className="text-blue-600"/> 2D Cutting Plan — Wastage Preview
          </h3>
          <p className="text-[10px] text-slate-500 font-bold mt-0.5">
            {cuttingPieces.length} piece type(s) · {totalRequiredSqft.toFixed(1)} sqft required
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Sheet Size Selector */}
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-1">
              <Layers size={10}/> Sheet Size
            </label>
            <select
              value={`${selectedSize.w}x${selectedSize.h}`}
              onChange={e => {
                const [w, h] = e.target.value.split('x').map(Number);
                setSelectedSize({ w, h });
              }}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {SHEET_SIZES.map(s => (
                <option key={`${s.w}x${s.h}`} value={`${s.w}x${s.h}`}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stock + Usage Info */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black border ${
          stockInfo.totalSheets > 5 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
          stockInfo.totalSheets > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' :
          'bg-red-50 text-red-700 border-red-200'
        }`}>
          {stockInfo.totalSheets} sheets in stock
        </span>
        {stockInfo.remnants > 0 && (
          <span className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            {stockInfo.remnants} remnants ({stockInfo.remnantSqft.toFixed(0)} sqft)
          </span>
        )}
        {usagePct > 0 && (
          <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black border ${
            usagePct > 50 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {usagePct > 50 ? <CheckCircle2 size={10} className="inline mr-1"/> : <AlertTriangle size={10} className="inline mr-1"/>}
            {usagePct.toFixed(0)}% sheet usage {usagePct <= 50 ? '— check remnants first' : ''}
          </span>
        )}
      </div>

      {/* 2D Cutting Diagram */}
      <CuttingDiagram
        pieces={cuttingPieces}
        sheetWidthInch={selectedSize.w}
        sheetHeightInch={selectedSize.h}
        glassType={cuttingPieces[0]?.glassType}
        quotationMode={true}
      />
    </div>
  );
};
