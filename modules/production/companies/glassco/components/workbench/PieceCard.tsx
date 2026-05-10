/**
 * PieceCard — Sprint 16
 *
 * Sortable piece card for the Kanban board. Three density modes:
 *   - compact   — ID + status pill only       (~32 px tall)
 *   - normal    — adds order ID + age dot     (~64 px tall)  ← default
 *   - detailed  — adds specs + vendor + spot  (~96 px tall)
 *
 * Color rules:
 *   - Status pill — uses PieceStatusBadge (already colour-mapped per status)
 *   - Age dot   — green <3d, amber 3-7d, red >7d  (only on aging-relevant states)
 *   - Priority  — red border-l when piece.fault exists
 *
 * Bulk select: checkbox on hover or when in selection mode.
 */

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MapPin, AlertTriangle } from 'lucide-react';
import PieceStatusBadge from '@/modules/production/components/sub/PieceStatusBadge';
import type { ProductionPiece } from '@/modules/shared/types';

export type CardDensity = 'compact' | 'normal' | 'detailed';

interface PieceCardProps {
  piece:      ProductionPiece;
  density:    CardDensity;
  selected:   boolean;
  onToggle:   (id: string, additive: boolean) => void;
  /** True while ANY piece is selected — shows checkboxes everywhere. */
  inSelectionMode: boolean;
  /** True for the dragging-overlay clone — hides pointer effects. */
  isOverlay?: boolean;
  vendorName?: string;
}

// ── Age helpers ───────────────────────────────────────────────────────

function ageDays(iso?: string): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

const AGING_STATES = new Set([
  'Cut', 'Service-Pending', 'QC-Pending', 'QC-Passed',
  'Ready to Dispatch', 'Dispatched', 'Tempered', 'Received-From-Tempering',
]);

function ageDotClass(piece: ProductionPiece): string {
  if (!AGING_STATES.has(piece.status)) return 'bg-slate-300';
  const d = ageDays(piece.lastUpdated);
  if (d > 7)  return 'bg-rose-500';
  if (d >= 3) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// ── Component ─────────────────────────────────────────────────────────

const PieceCard: React.FC<PieceCardProps> = ({
  piece, density, selected, onToggle, inSelectionMode, isOverlay, vendorName,
}) => {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: piece.id,
    data: { piece },
    disabled: isOverlay,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const days = ageDays(piece.lastUpdated);
  const hasFault = !!piece.fault;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative bg-white rounded-lg border shadow-sm select-none
        ${selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'}
        ${hasFault ? 'border-l-4 border-l-rose-500' : ''}
        ${isOverlay ? 'shadow-2xl rotate-1 cursor-grabbing' : 'cursor-grab active:cursor-grabbing'}
        transition-all
      `}
      {...attributes}
      {...listeners}
    >
      {/* Compact: just ID + status pill */}
      <div className="px-2.5 py-2 flex items-center gap-2">
        {/* Drag handle / age dot */}
        <span
          className={`shrink-0 w-2 h-2 rounded-full ${ageDotClass(piece)}`}
          title={`${days} day${days === 1 ? '' : 's'} since last update`}
        />

        {/* Piece ID */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(piece.id, e.shiftKey || e.metaKey || e.ctrlKey);
          }}
          className="font-mono font-black text-xs text-blue-700 truncate flex-1 text-left hover:underline"
          title="Click to select; Shift-click to add"
        >
          {piece.id}
        </button>

        {/* Drag grip — visible on hover */}
        <GripVertical
          size={12}
          className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>

      {/* Normal: order + status badge */}
      {density !== 'compact' && (
        <div className="px-2.5 pb-2 flex items-center justify-between gap-2 -mt-1">
          <span className="text-[10px] text-slate-500 font-bold truncate">{piece.orderId}</span>
          <PieceStatusBadge status={piece.status} size="xs"/>
        </div>
      )}

      {/* Detailed: specs, vendor, spot */}
      {density === 'detailed' && (
        <div className="px-2.5 pb-2 space-y-1 border-t border-slate-100 pt-2">
          {piece.specs && (
            <p className="text-[10px] text-slate-500 line-clamp-2">{piece.specs}</p>
          )}
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            {vendorName && (
              <span className="flex items-center gap-0.5"><AlertTriangle size={9}/>{vendorName}</span>
            )}
            {piece.spotId && (
              <span className="flex items-center gap-0.5"><MapPin size={9}/>{piece.spotId}</span>
            )}
            {hasFault && (
              <span className="flex items-center gap-0.5 text-rose-600 font-bold">
                <AlertTriangle size={9}/> Fault
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bulk-select checkbox — left edge, fades in on hover or in selection mode */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(piece.id, false)}
        onClick={(e) => e.stopPropagation()}
        className={`
          absolute -left-1 top-2 w-3.5 h-3.5 rounded
          ${inSelectionMode || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          transition-opacity cursor-pointer
        `}
        aria-label={`Select piece ${piece.id}`}
      />
    </div>
  );
};

export default PieceCard;
