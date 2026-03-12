import React from 'react';
import { QuotationItem, Product } from '../../shared/types';

interface Props {
  items: QuotationItem[];
  sheetSize: { w: number; h: number };
  products: Product[];
}

export const WastageCalculator: React.FC<Props> = ({ items, sheetSize, products }) => {
  return (
    <div className="p-8 text-center">
      <h3 className="text-lg font-bold text-slate-400 uppercase tracking-widest">Wastage Analysis Module</h3>
      <p className="text-slate-500 mt-2">This module is currently being optimized for Glassco sheet optimization.</p>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <p className="text-[10px] font-black uppercase text-slate-400">Total Area</p>
          <p className="text-xl font-black text-slate-700">{items.reduce((s, i) => s + (i.totalSqFt || 0), 0).toFixed(2)} FT²</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <p className="text-[10px] font-black uppercase text-slate-400">Sheet Size</p>
          <p className="text-xl font-black text-slate-700">{sheetSize.h}" x {sheetSize.w}"</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <p className="text-[10px] font-black uppercase text-slate-400">Efficiency</p>
          <p className="text-xl font-black text-emerald-600">-- %</p>
        </div>
      </div>
    </div>
  );
};
