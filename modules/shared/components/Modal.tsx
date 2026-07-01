/**
 * Modal.tsx — the one accessible dialog shell.
 *
 * Replaces 30+ bespoke modals that each re-implemented backdrop + close + z
 * differently (and mostly skipped focus-trap / Esc / aria). Use this for every
 * new dialog; migrate old ones in Phase 2.
 *
 *   <Modal open={open} onClose={close} title="Edit requisition" size="lg"
 *          footer={<><button onClick={close}>Cancel</button><button>Save</button></>}>
 *     ...form...
 *   </Modal>
 *
 * Accessibility: role=dialog + aria-modal, focus-trap (Tab cycles inside),
 * Esc to close, focus restored to the trigger on close, backdrop click closes
 * (opt-out via closeOnBackdrop=false). z-modal token. Full-screen on mobile.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** Dimmed subtitle next to the title. */
  subtitle?: string;
  children: React.ReactNode;
  /** Footer content (usually action buttons), pinned at the bottom. */
  footer?: React.ReactNode;
  size?: ModalSize;
  /** Backdrop click closes the modal (default true). */
  closeOnBackdrop?: boolean;
  /** Hide the default header close (×) button. */
  hideClose?: boolean;
  className?: string;
}

const SIZE: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  open, onClose, title, subtitle, children, footer,
  size = 'md', closeOnBackdrop = true, hideClose = false, className = '',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Focus management: remember trigger, focus panel, restore on close.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => restoreRef.current?.focus?.();
  }, [open]);

  // Esc to close + focus-trap on Tab.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const f = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (f.length === 0) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-0 sm:p-4"
      onKeyDown={onKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] animate-in fade-in"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={[
          'relative bg-white shadow-xl flex flex-col w-full outline-none',
          'rounded-none sm:rounded-card max-h-full sm:max-h-[90vh]',
          'modal-fullscreen-mobile animate-in zoom-in',
          SIZE[size],
          className,
        ].join(' ')}
      >
        {/* Header */}
        {(title || !hideClose) && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-base font-bold text-slate-900 truncate">{title}</h2>}
              {subtitle && <p className="text-label text-slate-500 truncate">{subtitle}</p>}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 -mr-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-control transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
