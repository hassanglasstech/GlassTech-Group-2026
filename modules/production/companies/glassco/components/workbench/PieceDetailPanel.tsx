/**
 * PieceDetailPanel — Sprint 17
 *
 * Slide-in panel that opens when a piece is clicked on the workbench.
 *
 *   Desktop: 40% wide (min 420 px) right-anchored, slides 200ms ease-out
 *   Mobile:  bottom sheet — full width, 88vh tall, swipe-down to close
 *
 * Tabs:    Details · History · Photos
 * Actions: Move to next state · Hold · NCR · Print Tag
 *
 * Keyboard:
 *   Esc            close
 *   ←  / →         navigate prev / next piece in the list
 *   Cmd/Ctrl + .   close
 *
 * Atomic transitions go through the existing
 * ProductionContext.handleUpdatePieceStatus → update_piece_status_atomic
 * RPC (Sprint 5). Optimistic UI + rollback on server reject is shared
 * with the Kanban drag-drop path.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  X, ChevronLeft, ChevronRight, ArrowRight, PauseCircle, AlertTriangle,
  Printer, Image as ImageIcon, Activity, Info, Loader2,
} from 'lucide-react';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import PieceStatusBadge from '@/modules/production/components/sub/PieceStatusBadge';
import { PieceStatus } from '@/modules/shared/constants';
import type { ProductionPiece } from '@/modules/shared/types';
import { PodService, PodPhoto } from '@/modules/sales/services/podService';
import PieceHistoryTab from './PieceHistoryTab';

// ── Next-state map (UI shortcut — server still validates) ────────────

const NEXT_STATE: Partial<Record<string, string>> = {
  [PieceStatus.CUT]:                     PieceStatus.QC_PENDING,
  [PieceStatus.SERVICE_PENDING]:         PieceStatus.QC_PENDING,
  [PieceStatus.QC_PENDING]:              PieceStatus.QC_PASSED,
  [PieceStatus.QC_PASSED]:               PieceStatus.READY_TO_DISPATCH,
  [PieceStatus.READY_TO_DISPATCH]:       PieceStatus.DISPATCHED,
  [PieceStatus.DISPATCHED]:              PieceStatus.TEMPERED,
  [PieceStatus.TEMPERED]:                PieceStatus.RECEIVED_FROM_TEMPERING,
  [PieceStatus.RECEIVED_FROM_TEMPERING]: PieceStatus.READY_TO_DISPATCH,
  [PieceStatus.QC_FAILED]:               PieceStatus.CUT,
  [PieceStatus.HOLD]:                    PieceStatus.QC_PENDING,
};

// ── Types ─────────────────────────────────────────────────────────────

type Tab = 'details' | 'history' | 'photos';

interface PieceDetailPanelProps {
  /** All pieces currently visible in the workbench — for prev/next nav. */
  visiblePieces: ProductionPiece[];
  /** Currently focused piece id. null → panel closed. */
  pieceId:       string | null;
  onClose:       () => void;
  onNavigate:    (newId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────

const PieceDetailPanel: React.FC<PieceDetailPanelProps> = ({
  visiblePieces, pieceId, onClose, onNavigate,
}) => {
  const { pieces, jobOrders, dispatches, handleUpdatePieceStatus } = useProductionContext();

  const piece = useMemo(
    () => (pieceId ? pieces.find(p => p.id === pieceId) ?? null : null),
    [pieceId, pieces],
  );

  const [tab, setTab]               = useState<Tab>('details');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [photos, setPhotos]         = useState<PodPhoto[]>([]);
  const [photosLoaded, setPhotosLoaded] = useState(false);

  // Nav indices for prev/next
  const idx = useMemo(
    () => (pieceId ? visiblePieces.findIndex(p => p.id === pieceId) : -1),
    [pieceId, visiblePieces],
  );
  const prevPiece = idx > 0                            ? visiblePieces[idx - 1] : null;
  const nextPiece = idx >= 0 && idx < visiblePieces.length - 1 ? visiblePieces[idx + 1] : null;

  // ── Reset tab + photos cache when piece changes ─────────────────
  useEffect(() => {
    setTab('details');
    setPhotos([]);
    setPhotosLoaded(false);
  }, [pieceId]);

  // ── Lazy-load photos when Photos tab is opened ──────────────────
  useEffect(() => {
    if (tab !== 'photos' || !piece || photosLoaded) return;
    if (!piece.dispatchId) { setPhotosLoaded(true); return; }
    PodService.getPhotos(piece.dispatchId).then(r => {
      setPhotos(r.data ?? []);
      setPhotosLoaded(true);
    });
  }, [tab, piece, photosLoaded]);

  // ── Keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    if (!pieceId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).matches('input, textarea, select')) return;

      if (e.key === 'Escape')                                onClose();
      else if (e.key === 'ArrowLeft' && prevPiece)           onNavigate(prevPiece.id);
      else if (e.key === 'ArrowRight' && nextPiece)          onNavigate(nextPiece.id);
      else if ((e.metaKey || e.ctrlKey) && e.key === '.')    onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pieceId, prevPiece, nextPiece, onClose, onNavigate]);

  // ── Actions ─────────────────────────────────────────────────────
  const moveToStatus = useCallback(async (target: string, label: string) => {
    if (!piece) return;
    setBusyAction(label);
    try {
      await handleUpdatePieceStatus(piece.id, target as PieceStatus);
      toast.success(`${piece.id} → ${label}`);
    } catch {
      toast.error(`Failed to move to ${label}`);
    } finally {
      setBusyAction(null);
    }
  }, [piece, handleUpdatePieceStatus]);

  const printTag = useCallback(() => {
    if (!piece) return;
    // Small popup with barcode-print friendly markup
    const w = window.open('', '_blank', 'width=400,height=300');
    if (!w) { toast.error('Popup blocked — allow popups to print tags'); return; }
    const order = jobOrders.find(j => j.orderNo === piece.orderId || j.id === piece.orderId);
    w.document.write(`<!doctype html><html><head><title>${piece.id}</title>
      <style>body{font-family:monospace;padding:24px;text-align:center}
      h1{font-size:28px;margin:0 0 8px}
      .specs{font-size:12px;color:#555;margin-bottom:12px}
      .barcode{font-size:14px;font-family:'Libre Barcode 128',monospace;letter-spacing:.05em}
      </style></head><body>
      <h1>${piece.id}</h1>
      <div class="specs">${piece.specs ?? ''}<br/>${order?.orderNo ?? piece.orderId}</div>
      <div class="barcode">*${piece.id}*</div>
      <script>window.print();</script>
      </body></html>`);
    w.document.close();
  }, [piece, jobOrders]);

  if (!piece) return null;

  const order    = jobOrders.find(j => j.orderNo === piece.orderId || j.id === piece.orderId);
  const dispatch = piece.dispatchId ? dispatches.find(d => d.id === piece.dispatchId) : null;
  const item     = order?.items?.[piece.itemIndex];
  const nextStatus = NEXT_STATE[piece.status];

  // ── Render ──────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop — click closes; mobile = stronger tint */}
      <div
        className="fixed inset-0 z-[200] bg-slate-900/30 md:bg-slate-900/20 transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className={`
          fixed z-[201] bg-white shadow-2xl flex flex-col
          inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl   /* mobile: bottom sheet */
          md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:max-h-none md:rounded-none md:rounded-l-2xl
          md:w-[40vw] md:min-w-[420px] md:max-w-[640px]
          animate-in slide-in-from-bottom md:slide-in-from-right duration-200 ease-out
        `}
        role="dialog"
        aria-label={`Piece ${piece.id}`}
      >
        {/* Mobile drag handle */}
        <div className="md:hidden flex justify-center pt-2 pb-1" onClick={onClose}>
          <span className="w-12 h-1.5 rounded-full bg-slate-300"/>
        </div>

        {/* Header */}
        <header className="px-5 py-3 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-black text-base text-blue-700 truncate">{piece.id}</span>
              <PieceStatusBadge status={piece.status} size="xs"/>
            </div>
            {piece.specs && (
              <p className="text-xs text-slate-500 line-clamp-1">{piece.specs}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {prevPiece && (
              <button
                type="button"
                onClick={() => onNavigate(prevPiece.id)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                title="Previous (←)"
              >
                <ChevronLeft size={16}/>
              </button>
            )}
            {nextPiece && (
              <button
                type="button"
                onClick={() => onNavigate(nextPiece.id)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                title="Next (→)"
              >
                <ChevronRight size={16}/>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-100 hover:text-rose-600"
              title="Close (Esc)"
            >
              <X size={16}/>
            </button>
          </div>
        </header>

        {/* Tabs */}
        <nav className="px-2 border-b border-slate-200 shrink-0 flex gap-1">
          {([
            { id: 'details', label: 'Details', icon: <Info size={12}/> },
            { id: 'history', label: 'History', icon: <Activity size={12}/> },
            { id: 'photos',  label: 'Photos',  icon: <ImageIcon size={12}/> },
          ] as Array<{ id: Tab; label: string; icon: React.ReactNode }>).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 -mb-px
                ${tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}
              `}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
          {tab === 'details' && (
            <dl className="space-y-3 text-xs">
              <Row label="Job">{piece.orderId}</Row>
              <Row label="Item">
                {(item as { glassType?: string })?.glassType ?? '—'}
                {' · '}
                {(item as { glassSize?: string; thickness?: string })?.glassSize
                  ?? (item as { thickness?: string })?.thickness
                  ?? '—'}
              </Row>
              <Row label="Specs">{piece.specs || '—'}</Row>
              <Row label="Spot">{piece.spotId || <span className="text-slate-400 italic">unassigned</span>}</Row>
              <Row label="Dispatch">{dispatch ? `${dispatch.id} · ${dispatch.plantName}` : '—'}</Row>
              <Row label="Hold from">{piece.holdFrom || '—'}</Row>
              <Row label="Fault">
                {piece.fault
                  ? <span className="text-rose-700 font-bold">{(piece.fault as { description?: string }).description ?? 'flagged'}</span>
                  : '—'}
              </Row>
              <Row label="Last update">{piece.lastUpdated ? new Date(piece.lastUpdated).toLocaleString() : '—'}</Row>
              <Row label="Version">{piece.version ?? 1}</Row>
              {piece.barcode && <Row label="Barcode"><span className="font-mono">{piece.barcode}</span></Row>}
            </dl>
          )}

          {tab === 'history' && <PieceHistoryTab pieceId={piece.id} />}

          {tab === 'photos' && (
            !piece.dispatchId ? (
              <div className="text-center py-12 text-slate-400 text-sm italic">
                No dispatch attached — no photos yet.
              </div>
            ) : !photosLoaded ? (
              <div className="flex items-center justify-center py-12 text-slate-500">
                <Loader2 className="animate-spin mr-2" size={16}/>
                <span className="text-sm">Loading photos…</span>
              </div>
            ) : photos.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm italic">
                No photos captured for dispatch {piece.dispatchId} yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {photos.map(ph => (
                  <a
                    key={ph.id}
                    href={PodService.getPhotoUrl(ph.storage_path)}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400"
                  >
                    <img
                      src={PodService.getPhotoUrl(ph.storage_path)}
                      alt={ph.photo_type}
                      className="w-full h-32 object-cover"
                      loading="lazy"
                    />
                    <div className="px-2 py-1 text-[10px] font-bold text-slate-600 bg-slate-50">
                      {ph.photo_type.replace(/_/g, ' ')} · {new Date(ph.taken_at).toLocaleString()}
                    </div>
                  </a>
                ))}
              </div>
            )
          )}
        </div>

        {/* Action bar — sticky bottom */}
        <footer className="border-t border-slate-200 px-3 py-2 flex flex-wrap gap-1.5 shrink-0 bg-white">
          {nextStatus && (
            <ActionBtn
              tone="primary"
              busy={busyAction === nextStatus}
              icon={<ArrowRight size={12}/>}
              onClick={() => moveToStatus(nextStatus, nextStatus)}
            >
              → {nextStatus}
            </ActionBtn>
          )}
          {piece.status !== PieceStatus.HOLD && (
            <ActionBtn
              tone="warning"
              busy={busyAction === 'Hold'}
              icon={<PauseCircle size={12}/>}
              onClick={() => moveToStatus(PieceStatus.HOLD, 'Hold')}
            >
              Hold
            </ActionBtn>
          )}
          <ActionBtn
            tone="danger"
            busy={busyAction === 'NCR'}
            icon={<AlertTriangle size={12}/>}
            onClick={() => moveToStatus(PieceStatus.QC_FAILED, 'NCR')}
          >
            NCR
          </ActionBtn>
          <ActionBtn
            tone="neutral"
            busy={false}
            icon={<Printer size={12}/>}
            onClick={printTag}
          >
            Print tag
          </ActionBtn>
        </footer>
      </aside>
    </>
  );
};

// ── Sub-components ────────────────────────────────────────────────────

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline gap-3">
    <dt className="text-[10px] font-black uppercase text-slate-400 w-20 shrink-0">{label}</dt>
    <dd className="text-slate-700 flex-1 break-all">{children}</dd>
  </div>
);

interface ActionBtnProps {
  tone:    'primary' | 'warning' | 'danger' | 'neutral';
  busy:    boolean;
  icon:    React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}
const TONE_CLASS: Record<ActionBtnProps['tone'], string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white',
  danger:  'bg-rose-600 hover:bg-rose-700 text-white',
  neutral: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
};
const ActionBtn: React.FC<ActionBtnProps> = ({ tone, busy, icon, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy}
    className={`
      inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold
      disabled:opacity-50 ${TONE_CLASS[tone]}
    `}
  >
    {busy ? <Loader2 size={12} className="animate-spin"/> : icon}
    {children}
  </button>
);

export default PieceDetailPanel;
