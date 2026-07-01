/**
 * LensesSidebar — Sprint 15
 *
 * Pre-built filter "lenses" for the Production Workbench. Each lens is
 * a one-click named view: Today, My Jobs, Hold, NCR, PSG, etc.
 *
 * The sidebar is purely presentational — it emits the active lens id
 * upward; the parent computes which lens predicate to apply when
 * filtering pieces. Centralised in `LENS_PREDICATES` below so that the
 * workbench, the count-badge calculator, and any future analytics use
 * the same definitions.
 */

import React from 'react';
import {
  CalendarDays, User, PauseCircle, AlertTriangle, Flame, Inbox, Layers,
} from 'lucide-react';
import type { ProductionPiece } from '@/modules/shared/types';
import { PieceStatus } from '@/modules/shared/constants';

// ── Types ─────────────────────────────────────────────────────────────

export type LensId = 'all' | 'today' | 'my' | 'hold' | 'ncr' | 'psg' | 'overdue';

export interface LensDef {
  id:     LensId;
  label:  string;
  icon:   React.ReactNode;
  hint?:  string;
}

export const LENSES: LensDef[] = [
  { id: 'all',     label: 'All pieces',  icon: <Layers size={14}/>,        hint: 'No lens filter' },
  { id: 'today',   label: 'Today',       icon: <CalendarDays size={14}/>,  hint: 'Updated today' },
  { id: 'my',      label: 'My jobs',     icon: <User size={14}/>,          hint: 'Pieces in your active jobs' },
  { id: 'hold',    label: 'Hold',        icon: <PauseCircle size={14}/>,   hint: 'Pieces currently on Hold' },
  { id: 'ncr',     label: 'NCR',         icon: <AlertTriangle size={14}/>, hint: 'QC-Failed or with active NCR' },
  { id: 'psg',     label: 'Tempering',   icon: <Flame size={14}/>,         hint: 'Out at tempering vendor' },
  { id: 'overdue', label: 'Overdue',     icon: <Inbox size={14}/>,         hint: 'Updated > 7 days ago, not delivered' },
];

// ── Predicates ────────────────────────────────────────────────────────

/**
 * Single source of truth for what each lens means.
 * Add a new lens? Update LENSES + here together.
 */
export const LENS_PREDICATES: Record<LensId, (p: ProductionPiece, ctx?: { myOrderIds?: string[] }) => boolean> = {
  all:     () => true,

  today: (p) => {
    if (!p.lastUpdated) return false;
    const today = new Date().toISOString().slice(0, 10);
    return p.lastUpdated.slice(0, 10) === today;
  },

  my: (p, ctx) => {
    if (!ctx?.myOrderIds?.length) return true;
    return ctx.myOrderIds.includes(p.orderId);
  },

  hold:    (p) => p.status === PieceStatus.HOLD,

  ncr:     (p) => p.status === PieceStatus.QC_FAILED || !!p.fault,

  psg: (p) => (
    p.status === PieceStatus.DISPATCHED
    || p.status === PieceStatus.TEMPERED
    || p.status === PieceStatus.RECEIVED_FROM_TEMPERING
  ),

  overdue: (p) => {
    if (!p.lastUpdated) return false;
    if (p.status === PieceStatus.DELIVERED) return false;
    if (p.status === PieceStatus.BROKEN)    return false;
    const last = new Date(p.lastUpdated).getTime();
    const days = (Date.now() - last) / 86_400_000;
    return days > 7;
  },
};

// ── Component ─────────────────────────────────────────────────────────

interface LensesSidebarProps {
  activeLens: LensId;
  onChange:   (lens: LensId) => void;
  /** Per-lens piece counts (from the parent) for badge display */
  counts?:    Partial<Record<LensId, number>>;
  className?: string;
}

const LensesSidebar: React.FC<LensesSidebarProps> = ({
  activeLens, onChange, counts = {}, className = '',
}) => {
  return (
    <nav
      className={`bg-white border-r border-slate-200 ${className}`}
      aria-label="Workbench lenses"
    >
      <div className="px-3 pt-3 pb-2 text-2xs font-black uppercase tracking-wider text-slate-400">
        Lenses
      </div>
      <ul className="space-y-0.5 pb-3 px-2">
        {LENSES.map(lens => {
          const active = lens.id === activeLens;
          const count  = counts[lens.id] ?? 0;
          return (
            <li key={lens.id}>
              <button
                type="button"
                onClick={() => onChange(lens.id)}
                title={lens.hint}
                className={`
                  w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md
                  text-xs font-bold transition-colors text-left
                  ${active
                    ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-600 pl-2'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
                `}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={active ? 'text-blue-600' : 'text-slate-400'}>{lens.icon}</span>
                  <span className="truncate">{lens.label}</span>
                </span>
                {count > 0 && (
                  <span className={`
                    text-2xs font-black px-1.5 py-0.5 rounded-full shrink-0
                    ${active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}
                  `}>
                    {count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default LensesSidebar;
