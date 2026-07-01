import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Quotation } from '../../shared/types';
import { MoreVertical, FileCheck, FileText, Send, XCircle, MinusCircle, RotateCcw, FileSpreadsheet, FileJson, Trash2 } from 'lucide-react';

/**
 * Overflow "⋯" menu for a quotation/sales-order row.
 *
 * Replaces the old action column where up to 8 status-conditional icon buttons
 * rendered inline — so Edit/Print/Delete never held a stable X position
 * (column jitter), the icon-only buttons were sub-44px with no labels, and
 * Reject vs Mark-as-Lost were indistinguishable. Now the row shows a fixed set
 * (Edit, Print are siblings of this) plus a single ⋯ trigger; every secondary
 * action lives here as a LABELLED menu item.
 *
 * The menu is rendered with position:fixed (anchored to the trigger via
 * getBoundingClientRect) so it is never clipped by the table's overflow-x-auto
 * wrapper and never fights table z-index. It closes on scroll/resize/Escape/
 * outside-click.
 */

interface RowActionsMenuProps {
  q: Quotation;
  onApprove: (q: Quotation) => void;
  onPrintJobCard: (q: Quotation) => void;
  onExport: (q: Quotation) => void;
  onExportJson: (q: Quotation) => void;
  onDelete: (id: string) => void;
  onMarkSent?: (q: Quotation) => void;
  onReject?: (q: Quotation) => void;
  onMarkLost?: (q: Quotation) => void;
  onReopen?: (q: Quotation) => void;
}

const MENU_WIDTH = 208;

export const RowActionsMenu: React.FC<RowActionsMenuProps> = ({
  q, onApprove, onPrintJobCard, onExport, onExportJson, onDelete,
  onMarkSent, onReject, onMarkLost, onReopen,
}) => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const toggle = () => {
    if (open || !btnRef.current) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    // Right-align to the trigger, open downward, clamp inside the viewport.
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setPos({ top: r.bottom + 4, left });
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setPos(null);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const s = q.status;
  const item = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button
      key={label}
      role="menuitem"
      onClick={() => { onClick(); setPos(null); }}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-left transition-colors ${danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'}`}
    >
      <span className={`shrink-0 ${danger ? 'text-rose-500' : 'text-slate-400'}`}>{icon}</span>
      {label}
    </button>
  );

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical size={15} />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH }}
          className="z-overlay bg-white border border-slate-200 rounded-xl shadow-xl py-1 animate-in fade-in"
        >
          {s === 'Draft' && onMarkSent && item(<Send size={13} />, 'Mark as Sent', () => onMarkSent(q))}
          {s !== 'Approved' && s !== 'Rejected' && s !== 'Lost' && s !== 'Expired' && s !== 'Invoiced' && s !== 'Paid' &&
            item(<FileCheck size={13} />, 'Approve & Generate SO', () => onApprove(q))}
          {s === 'Approved' && item(<FileText size={13} />, 'Print Job Card', () => onPrintJobCard(q))}
          {s !== 'Approved' && s !== 'Invoiced' && s !== 'Paid' && s !== 'Rejected' && s !== 'Lost' && onReject &&
            item(<XCircle size={13} />, 'Reject', () => onReject(q))}
          {s !== 'Approved' && s !== 'Invoiced' && s !== 'Paid' && s !== 'Lost' && onMarkLost &&
            item(<MinusCircle size={13} />, 'Mark as Lost', () => onMarkLost(q))}
          {(s === 'Rejected' || s === 'Lost' || s === 'Expired') && onReopen &&
            item(<RotateCcw size={13} />, 'Reopen → Draft', () => onReopen(q))}

          <div className="my-1 border-t border-slate-100" />
          {item(<FileSpreadsheet size={13} />, 'Export Excel', () => onExport(q))}
          {item(<FileJson size={13} />, 'Export JSON', () => onExportJson(q))}
          <div className="my-1 border-t border-slate-100" />
          {item(<Trash2 size={13} />, 'Delete', () => onDelete(q.id), true)}
        </div>,
        document.body
      )}
    </>
  );
};

export default RowActionsMenu;
