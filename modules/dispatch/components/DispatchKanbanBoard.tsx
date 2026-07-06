import React from 'react';
import { DISPATCH_COLUMNS, type DispatchColumn } from '@/modules/dispatch/services/deriveDispatchColumn';
import type { DispatchTripVM } from '@/modules/dispatch/hooks/useDispatchTrips';
import DispatchTripCard from '@/modules/dispatch/components/DispatchTripCard';

const COLUMN_META: Record<DispatchColumn, { hint: string; accent: string }> = {
  Ready:        { hint: 'QC-passed, awaiting a trip',    accent: 'bg-slate-400' },
  Loading:      { hint: 'Pieces loaded onto a trip',     accent: 'bg-blue-400' },
  'At-Gate':    { hint: 'Gate pass issued / authorized', accent: 'bg-amber-400' },
  'In-Transit': { hint: 'On the road',                   accent: 'bg-indigo-500' },
  Delivered:    { hint: 'POD done / received back',      accent: 'bg-emerald-500' },
  Invoiced:     { hint: 'Billed — COGS posted',          accent: 'bg-teal-600' },
};

const DispatchKanbanBoard: React.FC<{
  columns: Record<DispatchColumn, DispatchTripVM[]>;
  counts: Record<DispatchColumn, number>;
}> = ({ columns, counts }) => (
  <div className="overflow-x-auto pb-3">
    <div className="grid min-w-[960px] grid-cols-6 gap-3">
      {DISPATCH_COLUMNS.map(col => (
        <div key={col} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-2">
          <div className="mb-2 flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${COLUMN_META[col].accent}`} />
              <span className="text-xs font-black uppercase tracking-tight text-slate-700">{col}</span>
            </div>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 font-mono text-[11px] text-slate-600">{counts[col]}</span>
          </div>
          <p className="mb-2 px-1 text-[10px] leading-tight text-slate-400">{COLUMN_META[col].hint}</p>
          <div className="space-y-2">
            {columns[col].length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-[11px] text-slate-300">—</div>
            ) : (
              columns[col].map(trip => <DispatchTripCard key={trip.key} trip={trip} />)
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default DispatchKanbanBoard;
