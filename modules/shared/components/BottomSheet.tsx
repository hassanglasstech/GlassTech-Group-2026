/**
 * BottomSheet — Sprint 26
 *
 * Mobile-friendly modal alternative. Slides up from the bottom of the
 * viewport with a drag handle; on desktop it falls back to a centered
 * dialog so a single component covers both surfaces.
 *
 * Why bottom-sheet vs centered modal on phones:
 *   - Reachable with one thumb (centered modals on tall iPhones force
 *     users to stretch to the top of the screen)
 *   - Native iOS/Android feel — backdrop tint + swipe-down-to-close
 *   - Sticky action footer = primary CTA always at thumb height
 *
 * Touch interactions:
 *   - Tap the drag handle area or backdrop → close
 *   - Drag the handle down >40 px → close
 *   - Esc on desktop → close
 *
 * Usage:
 *   <BottomSheet open={open} onClose={() => setOpen(false)} title="New invoice"
 *                footer={<button>Save</button>}>
 *     <FormFields/>
 *   </BottomSheet>
 */

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useIsMobile } from '@/modules/shared/hooks/useMediaQuery';

interface BottomSheetProps {
  open:     boolean;
  onClose:  () => void;
  title?:   React.ReactNode;
  /** Optional sticky footer — usually a primary CTA + secondary. */
  footer?:  React.ReactNode;
  /** Max height as a vh percentage. Default 88. */
  maxHeightVh?: number;
  /** Disable swipe-to-close (e.g., during async save). Default false. */
  preventClose?: boolean;
  /** Extra wrapper class — typically padding overrides. */
  className?: string;
  children: React.ReactNode;
}

const BottomSheet: React.FC<BottomSheetProps> = ({
  open, onClose, title, footer, maxHeightVh = 88, preventClose = false,
  className = '', children,
}) => {
  const isMobile = useIsMobile();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const dragStartY = useRef<number | null>(null);

  // ── Esc closes ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, preventClose]);

  // ── Lock body scroll while open ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ── Touch drag-to-close (mobile only) ──────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile || preventClose) return;
    dragStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || preventClose || dragStartY.current == null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) setDragOffset(dy);
  };
  const onTouchEnd = () => {
    if (!isMobile || preventClose) return;
    if (dragOffset > 80) onClose();
    setDragOffset(0);
    dragStartY.current = null;
  };

  if (!open) return null;

  const sheetTransform = dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={() => !preventClose && onClose()}
        aria-hidden
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        style={{
          maxHeight: `${maxHeightVh}vh`,
          transform: sheetTransform,
          transition: dragOffset > 0 ? 'none' : 'transform 200ms ease-out',
        }}
        className={`
          fixed z-[301] flex flex-col bg-white shadow-2xl overflow-hidden
          inset-x-0 bottom-0 rounded-t-2xl                             /* mobile: bottom sheet */
          md:inset-auto md:left-1/2 md:top-1/2
          md:-translate-x-1/2 md:-translate-y-1/2
          md:rounded-2xl md:w-[640px] md:max-w-[92vw]
          animate-in slide-in-from-bottom md:fade-in md:zoom-in-95 duration-200
          ${className}
        `}
      >
        {/* Drag handle (mobile only) */}
        {isMobile && (
          <div
            className="pt-2 pb-1 flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onClick={() => !preventClose && onClose()}
          >
            <span className="w-10 h-1.5 rounded-full bg-slate-300"/>
          </div>
        )}

        {/* Header */}
        {(title || !isMobile) && (
          <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <div className="text-base font-black text-slate-800 truncate">
              {title}
            </div>
            <button
              type="button"
              onClick={() => !preventClose && onClose()}
              disabled={preventClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50 min-w-[44px] min-h-[44px] -m-1.5"
              aria-label="Close"
            >
              <X size={16}/>
            </button>
          </header>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>

        {/* Sticky footer */}
        {footer && (
          <footer className="border-t border-slate-200 px-4 py-3 bg-white shrink-0 flex items-center justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </>
  );
};

export default BottomSheet;
