/**
 * SheetSelector.tsx — Stage 2A
 * Dropdown showing available glass sheet sizes from inventory with live stock count.
 * 50% rule: >50% sqft usage = suggest new sheet, <50% = check remnants first.
 */

import React, { useMemo } from 'react';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Layers, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface SheetOption {
  id: string;
  name: string;
  widthInch: number;
  heightInch: number;
  sqft: number;
  sheetsAvailable: number;
  thickness: string;
  glassType: string;
  remnantCount: number;
  remnantSqft: number;
}

interface Props {
  company: string;
  selectedSheet: { width: number; height: number } | null;
  onSelect: (width: number, height: number, option: SheetOption) => void;
  requiredSqft?: number; // total sqft needed for the job
  filterThickness?: string; // filter by thickness from job
}

// Common glass sheet sizes in Pakistan (inches)
const STANDARD_SIZES: [number, number][] = [
  [84, 144],  // 7x12 ft — most common
  [84, 120],  // 7x10 ft
  [72, 120],  // 6x10 ft
  [72, 96],   // 6x8 ft
  [60, 96],   // 5x8 ft
  [48, 96],   // 4x8 ft
  [96, 144],  // 8x12 ft — jumbo
];

function parseSheetSize(name: string): { widthInch: number; heightInch: number; thickness: string; glassType: string } | null {
  // Parse names like "5mm Plain Clear 84x144", "6mm Mirror 72x120"
  const thicknessMatch = name.match(/(\d+(?:\.\d+)?)\s*mm/i);
  const sizeMatch = name.match(/(\d+)\s*x\s*(\d+)/i);
  const thickness = thicknessMatch ? `${thicknessMatch[1]}mm` : '';

  // Determine glass type
  let glassType = 'Plain';
  const lower = name.toLowerCase();
  if (lower.includes('mirror')) glassType = 'Mirror';
  else if (lower.includes('tinted') || lower.includes('color') || lower.includes('bronze') || lower.includes('grey') || lower.includes('green') || lower.includes('blue')) glassType = 'Tinted';
  else if (lower.includes('frosted') || lower.includes('acid')) glassType = 'Frosted';
  else if (lower.includes('laminated')) glassType = 'Laminated';

  if (sizeMatch) {
    return { widthInch: Number(sizeMatch[1]), heightInch: Number(sizeMatch[2]), thickness, glassType };
  }
  return thickness ? { widthInch: 84, heightInch: 144, thickness, glassType } : null;
}

const SheetSelector: React.FC<Props> = ({ company, selectedSheet, onSelect, requiredSqft, filterThickness }) => {
  const sheetOptions = useMemo(() => {
    const store = InventoryService.getStore().filter(i => i.company === company && i.category === 'Raw');
    const options: SheetOption[] = [];

    store.forEach(item => {
      const parsed = parseSheetSize(item.name);
      if (!parsed) return;
      if (filterThickness && parsed.thickness !== filterThickness) return;

      options.push({
        id: item.id,
        name: item.name,
        widthInch: parsed.widthInch,
        heightInch: parsed.heightInch,
        sqft: (parsed.widthInch * parsed.heightInch) / 144,
        sheetsAvailable: item.unrestrictedQty || item.quantity || 0,
        thickness: parsed.thickness,
        glassType: parsed.glassType,
        remnantCount: item.remnantCount || 0,
        remnantSqft: item.remnantSqft || 0,
      });
    });

    // Sort: most stock first, then by size
    return options.sort((a, b) => b.sheetsAvailable - a.sheetsAvailable || b.sqft - a.sqft);
  }, [company, filterThickness]);

  // 50% rule check
  const usagePercent = requiredSqft && selectedSheet
    ? (requiredSqft / ((selectedSheet.width * selectedSheet.height) / 144)) * 100
    : null;

  const selectedOption = selectedSheet
    ? sheetOptions.find(o => o.widthInch === selectedSheet.width && o.heightInch === selectedSheet.height)
    : null;

  return (
    <div className="space-y-2">
      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
        <Layers size={11}/> Sheet Size (Live Stock)
      </label>
      <select
        value={selectedSheet ? `${selectedSheet.width}x${selectedSheet.height}` : ''}
        onChange={e => {
          const [w, h] = e.target.value.split('x').map(Number);
          const opt = sheetOptions.find(o => o.widthInch === w && o.heightInch === h);
          if (opt) onSelect(w, h, opt);
          else if (w && h) onSelect(w, h, { id: '', name: `${w}x${h}`, widthInch: w, heightInch: h, sqft: (w*h)/144, sheetsAvailable: 0, thickness: '', glassType: '', remnantCount: 0, remnantSqft: 0 });
        }}
        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-400 bg-white"
      >
        <option value="">— Select Sheet Size —</option>
        {sheetOptions.map(opt => (
          <option key={`${opt.widthInch}x${opt.heightInch}-${opt.thickness}`} value={`${opt.widthInch}x${opt.heightInch}`}>
            {opt.widthInch}×{opt.heightInch}" ({opt.thickness} {opt.glassType}) — {opt.sheetsAvailable} sheets
          </option>
        ))}
        {/* Standard sizes not in stock */}
        {STANDARD_SIZES.filter(([w, h]) => !sheetOptions.find(o => o.widthInch === w && o.heightInch === h)).map(([w, h]) => (
          <option key={`std-${w}x${h}`} value={`${w}x${h}`}>
            {w}×{h}" (standard) — 0 in stock
          </option>
        ))}
      </select>

      {/* Stock + Remnant Info */}
      {selectedOption && (
        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          <span className={`px-2 py-0.5 rounded-full font-black ${selectedOption.sheetsAvailable > 5 ? 'bg-emerald-100 text-emerald-700' : selectedOption.sheetsAvailable > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
            {selectedOption.sheetsAvailable} sheets
          </span>
          {selectedOption.remnantCount > 0 && (
            <span className="px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">
              {selectedOption.remnantCount} remnants ({selectedOption.remnantSqft.toFixed(0)} sqft)
            </span>
          )}
        </div>
      )}

      {/* 50% Rule */}
      {usagePercent !== null && (
        <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg ${usagePercent > 50 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {usagePercent > 50
            ? <><CheckCircle2 size={11}/> {usagePercent.toFixed(0)}% usage — new sheet recommended</>
            : <><AlertTriangle size={11}/> {usagePercent.toFixed(0)}% usage — check remnants first ({selectedOption?.remnantCount || 0} available)</>
          }
        </div>
      )}
    </div>
  );
};

export default SheetSelector;
