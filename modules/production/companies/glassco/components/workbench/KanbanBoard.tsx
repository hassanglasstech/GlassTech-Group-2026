/**
 * KanbanBoard — Sprint 16
 *
 * Visual production state machine. Six main columns + three universal
 * drop zones at the bottom (Hold / Broken / Returned).
 *
 * Architecture:
 *   - @dnd-kit/core for drag mechanics (mouse + touch + keyboard)
 *   - @dnd-kit/sortable for in-column reordering
 *   - On drop: validates transition via Sprint 5's update_piece_status_atomic
 *     RPC (server is the source of truth). Optimistic UI + rollback on
 *     server reject — same pattern as ProductionContext.handleUpdatePieceStatus.
 *   - Realtime: piece updates from other tabs/users flow in through
 *     ProductionContext (which Sprint 10's bridge already wires).
 *
 * Bulk select: checkbox-driven via PieceCard. When pieces are selected
 * the BulkActionBar appears at the bottom; "Move to {column}" button
 * applies the same drop logic to all selected pieces.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, TouchSensor,
  useSensor, useSensors, useDroppable, closestCenter,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import {
  Scissors, ShieldCheck, Truck, Flame, Package, CheckCircle2,
  PauseCircle, AlertTriangle, RotateCcw, Maximize2, Minus,
} from 'lucide-react';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import { BulkActionBar, useBulkSelection } from '@/modules/production/components/sub/BulkActionBar';
import { PieceStatus } from '@/modules/shared/constants';
import type { ProductionPiece } from '@/modules/shared/types';
import PieceCard, { CardDensity } from './PieceCard';

// ── Column config ─────────────────────────────────────────────────────

interface ColumnDef {
  id:           string;
  label:        string;
  icon:         React.ReactNode;
  /** Statuses that show in this column */
  statuses:     readonly string[];
  /** Status to apply on drop into this column */
  dropStatus:   string;
  /** Tailwind colour theme */
  accent:       string;
}

const COLUMNS: ColumnDef[] = [
  {
    id: 'cut',         label: 'Cut',         icon: <Scissors size={14}/>,
    statuses:   [PieceStatus.CUT, PieceStatus.SERVICE_PENDING],
    dropStatus: PieceStatus.CUT,
    accent: 'border-slate-300 bg-slate-50',
  },
  {
    id: 'qc',          label: 'QC',          icon: <ShieldCheck size={14}/>,
    statuses:   [PieceStatus.QC_PENDING, PieceStatus.QC_PASSED, PieceStatus.QC_FAILED],
    dropStatus: PieceStatus.QC_PENDING,
    accent: 'border-amber-300 bg-amber-50',
  },
  {
    id: 'dispatched',  label: 'Dispatched',  icon: <Truck size={14}/>,
    statuses:   [PieceStatus.DISPATCHED],
    dropStatus: PieceStatus.DISPATCHED,
    accent: 'border-blue-300 bg-blue-50',
  },
  {
    id: 'tempering',   label: 'Tempering',   icon: <Flame size={14}/>,
    statuses:   [PieceStatus.TEMPERED, PieceStatus.RECEIVED_FROM_TEMPERING],
    dropStatus: PieceStatus.TEMPERED,
    accent: 'border-orange-300 bg-orange-50',
  },
  {
    id: 'ready',       label: 'Ready',       icon: <Package size={14}/>,
    statuses:   [PieceStatus.READY_TO_DISPATCH],
    dropStatus: PieceStatus.READY_TO_DISPATCH,
    accent: 'border-violet-300 bg-violet-50',
  },
  {
    id: 'delivered',   label: 'Delivered',   icon: <CheckCircle2 size={14}/>,
    statuses:   [PieceStatus.DELIVERED],
    dropStatus: PieceStatus.DELIVERED,
    accent: 'border-emerald-300 bg-emerald-50',
  },
];

// Universal drop zones — these allow drops from ANY status (PIECE_TRANSITIONS
// map server-side has 'Hold','Broken','Returned' as universal targets).
const DROP_ZONES: ColumnDef[] = [
  {
    id: 'hold',     label: 'Hold',     icon: <PauseCircle size={14}/>,
    statuses: [PieceStatus.HOLD], dropStatus: PieceStatus.HOLD,
    accent: 'border-yellow-400 bg-yellow-50',
  },
  {
    id: 'broken',   label: 'Broken',   icon: <AlertTriangle size={14}/>,
    statuses: [PieceStatus.BROKEN], dropStatus: PieceStatus.BROKEN,
    accent: 'border-rose-400 bg-rose-50',
  },
  {
    id: 'returned', label: 'Returned', icon: <RotateCcw size={14}/>,
    statuses: [PieceStatus.RETURNED], dropStatus: PieceStatus.RETURNED,
    accent: 'border-slate-400 bg-slate-100',
  },
];

const ALL_DROP_TARGETS = [...COLUMNS, ...DROP_ZONES];

// ── Density preference (per-user) ────────────────────────────────────

const DENSITY_KEY = 'gtk_workbench_kanban_density';
function loadDensity(): CardDensity {
  try {
    const v = localStorage.getItem(DENSITY_KEY) as CardDensity | null;
    if (v === 'compact' || v === 'normal' || v === 'detailed') return v;
  } catch { /* noop */ }
  return 'normal';
}

// ── Component ─────────────────────────────────────────────────────────

interface KanbanBoardProps {
  pieces: ProductionPiece[];
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ pieces }) => {
  const { handleUpdatePieceStatus, dispatches } = useProductionContext();
  const bulk = useBulkSelection<string>();

  const [density, setDensity]       = useState<CardDensity>(loadDensity);
  const [activeId, setActiveId]     = useState<string | null>(null);

  // Persist density
  React.useEffect(() => {
    try { localStorage.setItem(DENSITY_KEY, density); } catch { /* noop */ }
  }, [density]);

  // Bucket pieces into columns
  const grouped = useMemo(() => {
    const map = new Map<string, ProductionPiece[]>();
    ALL_DROP_TARGETS.forEach(c => map.set(c.id, []));
    pieces.forEach(p => {
      const col = ALL_DROP_TARGETS.find(c => c.statuses.includes(p.status));
      if (col) map.get(col.id)!.push(p);
    });
    return map;
  }, [pieces]);

  const sensors = useSensors(
    useSensor(PointerSensor,  { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,    { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Vendor lookup for detailed card mode
  const vendorByDispatchId = useMemo(() => {
    const m = new Map<string, string>();
    dispatches.forEach(d => m.set(d.id, d.plantName ?? ''));
    return m;
  }, [dispatches]);

  // ── Drag handlers ────────────────────────────────────────────────
  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = useCallback(async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const target = ALL_DROP_TARGETS.find(c =>
      c.id === over.id || c.statuses.includes(String(over.id)));
    if (!target) return;

    // If user dragged a single piece but multiple are selected, treat
    // it as a bulk move (matches how Trello / Linear behave).
    const ids = bulk.selected.has(String(active.id))
      ? Array.from(bulk.selected)
      : [String(active.id)];

    const draggedPiece = pieces.find(p => p.id === String(active.id));
    if (!draggedPiece) return;

    // No-op drop into same column
    const sourceCol = ALL_DROP_TARGETS.find(c => c.statuses.includes(draggedPiece.status));
    if (sourceCol?.id === target.id && ids.length === 1) return;

    // Apply atomic update for each piece. handleUpdatePieceStatus
    // already does optimistic UI + rollback + audit + cross-tab event.
    let okCount = 0;
    let failCount = 0;
    for (const id of ids) {
      try {
        await handleUpdatePieceStatus(id, target.dropStatus as PieceStatus);
        okCount += 1;
      } catch {
        failCount += 1;
      }
    }

    if (ids.length > 1) {
      if (failCount === 0) {
        toast.success(`Moved ${okCount} pieces → ${target.label}`);
      } else {
        toast.warning(`Moved ${okCount} of ${ids.length} pieces → ${target.label} (${failCount} rejected)`, {
          duration: 7000,
        });
      }
      bulk.clear();
    }
  }, [bulk, pieces, handleUpdatePieceStatus]);

  const activePiece = activeId ? pieces.find(p => p.id === activeId) ?? null : null;

  // ── Bulk actions ─────────────────────────────────────────────────
  const bulkActions = useMemo(() => COLUMNS.slice(1, 6).map(col => ({
    label: `→ ${col.label}`,
    icon:  col.icon,
    tone:  'primary' as const,
    title: `Move ${bulk.count} selected to ${col.label}`,
    onClick: async () => {
      const ids = Array.from(bulk.selected);
      let ok = 0, fail = 0;
      for (const id of ids) {
        try { await handleUpdatePieceStatus(id, col.dropStatus as PieceStatus); ok += 1; }
        catch { fail += 1; }
      }
      if (fail === 0) toast.success(`Moved ${ok} pieces → ${col.label}`);
      else            toast.warning(`Moved ${ok} of ${ids.length}; ${fail} rejected by state machine`);
      bulk.clear();
    },
  })), [bulk, handleUpdatePieceStatus]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Density toolbar */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <span className="text-[10px] font-bold uppercase text-slate-400">Density</span>
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
          {(['compact', 'normal', 'detailed'] as CardDensity[]).map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setDensity(d)}
              className={`
                inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold
                ${density === d ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}
              `}
            >
              {d === 'compact'  && <Minus size={11}/>}
              {d === 'detailed' && <Maximize2 size={11}/>}
              <span className="capitalize">{d}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main 6 columns */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {COLUMNS.map(col => (
          <Column
            key={col.id}
            col={col}
            pieces={grouped.get(col.id) ?? []}
            density={density}
            bulk={bulk}
            vendorByDispatchId={vendorByDispatchId}
          />
        ))}
      </div>

      {/* Universal drop zones (always visible at bottom) */}
      <div className="grid grid-cols-3 gap-3">
        {DROP_ZONES.map(col => (
          <Column
            key={col.id}
            col={col}
            pieces={grouped.get(col.id) ?? []}
            density={density}
            bulk={bulk}
            vendorByDispatchId={vendorByDispatchId}
            isUniversal
          />
        ))}
      </div>

      {/* Drag overlay — floating clone follows the cursor */}
      <DragOverlay>
        {activePiece && (
          <PieceCard
            piece={activePiece}
            density={density}
            selected={false}
            onToggle={() => { /* noop on overlay */ }}
            inSelectionMode={false}
            isOverlay
          />
        )}
      </DragOverlay>

      {/* Bulk action bar */}
      <BulkActionBar
        count={bulk.count}
        total={pieces.length}
        actions={bulkActions}
        onClear={bulk.clear}
        onSelectAll={() => bulk.selectAll(pieces.map(p => p.id))}
        noun="pieces"
      />
    </DndContext>
  );
};

// ── Column ────────────────────────────────────────────────────────────

interface ColumnProps {
  col:        ColumnDef;
  pieces:     ProductionPiece[];
  density:    CardDensity;
  bulk:       ReturnType<typeof useBulkSelection<string>>;
  vendorByDispatchId: Map<string, string>;
  isUniversal?: boolean;
}

const Column: React.FC<ColumnProps> = ({ col, pieces, density, bulk, vendorByDispatchId, isUniversal }) => {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <div
      ref={setNodeRef}
      className={`
        rounded-xl border-2 p-2 flex flex-col
        ${col.accent}
        ${isOver ? 'ring-4 ring-blue-300 border-blue-500' : ''}
        ${isUniversal ? 'border-dashed' : ''}
        min-h-[280px] max-h-[calc(100vh-280px)]
      `}
    >
      {/* Column header */}
      <div className="px-1 pb-2 flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-600">{col.icon}</span>
          <span className="text-xs font-black uppercase text-slate-700">{col.label}</span>
        </div>
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white text-slate-600">
          {pieces.length}
        </span>
      </div>

      {/* Piece cards */}
      <SortableContext
        items={pieces.map(p => p.id)}
        strategy={rectSortingStrategy}
      >
        <div className="flex-1 overflow-y-auto pt-2 pb-1 space-y-1.5 px-0.5">
          {pieces.length === 0 ? (
            <div className="text-center py-6 text-[10px] text-slate-400 italic">
              {isUniversal ? 'Drop here to flag' : 'No pieces'}
            </div>
          ) : (
            pieces.slice(0, 100).map(p => (
              <PieceCard
                key={p.id}
                piece={p}
                density={density}
                selected={bulk.selected.has(p.id)}
                onToggle={(id) => bulk.toggle(id)}
                inSelectionMode={bulk.count > 0}
                vendorName={p.dispatchId ? vendorByDispatchId.get(p.dispatchId) : undefined}
              />
            ))
          )}
          {pieces.length > 100 && (
            <div className="text-[10px] text-slate-500 text-center py-1 italic">
              +{pieces.length - 100} more — narrow filters
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
};

export default KanbanBoard;
