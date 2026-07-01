/**
 * ContextMenu.tsx — reusable right-click menu + discoverable "⋯" twin.
 *
 * ERP power-user pattern (SAP GUI / Excel): right-click a row for quick
 * actions. But right-click is HIDDEN — so every action must also be reachable
 * via a visible control. This file ships both, sharing one menu renderer:
 *
 *   <ContextMenu items={items}> ...row... </ContextMenu>   // right-click anywhere inside
 *   <OverflowMenuButton items={items} />                   // the visible ⋯ twin
 *
 * The menu is a portal positioned with position:fixed (never clipped by a
 * table's overflow-x-auto), clamps inside the viewport, supports arrow-key
 * navigation, and closes on Escape / outside-click / scroll / resize.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  /** Render in danger (rose) styling — for destructive actions. */
  danger?: boolean;
  disabled?: boolean;
  /** Draw a separator line ABOVE this item. */
  divider?: boolean;
}

const MENU_WIDTH = 216;

// ── Shared menu list (portal) ──────────────────────────────────────────
interface MenuListProps {
  items: ContextMenuItem[];
  pos: { top: number; left: number };
  onClose: () => void;
}

const MenuList: React.FC<MenuListProps> = ({ items, pos, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // Clamp inside viewport (open upward / shift left if needed).
  const top = Math.min(pos.top, window.innerHeight - items.length * 36 - 16);
  const left = Math.max(8, Math.min(pos.left, window.innerWidth - MENU_WIDTH - 8));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[active];
        if (it && !it.disabled) { it.onClick(); onClose(); }
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [active, items, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', top, left, width: MENU_WIDTH }}
      className="z-popover bg-white border border-neutral-border rounded-card shadow-xl py-1 animate-in fade-in"
    >
      {items.map((it, i) => (
        <React.Fragment key={it.label}>
          {it.divider && <div className="my-1 border-t border-slate-100" />}
          <button
            role="menuitem"
            disabled={it.disabled}
            onMouseEnter={() => setActive(i)}
            onClick={() => { it.onClick(); onClose(); }}
            className={[
              'w-full flex items-center gap-2.5 px-3 py-2 text-body font-semibold text-left transition-colors',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              it.danger ? 'text-danger hover:bg-danger-subtle' : 'text-slate-700 hover:bg-slate-50',
              active === i && !it.disabled ? (it.danger ? 'bg-danger-subtle' : 'bg-slate-50') : '',
            ].join(' ')}
          >
            <span className={`shrink-0 ${it.danger ? 'text-danger' : 'text-slate-400'}`}>{it.icon}</span>
            {it.label}
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body,
  );
};

/**
 * Controlled menu portal — for surfaces where you can't wrap the target in a
 * div (e.g. a table <tr>). Manage `pos` yourself from the row's onContextMenu:
 *
 *   const [menu, setMenu] = useState<{pos; items} | null>(null);
 *   <tr onContextMenu={(e) => { e.preventDefault(); setMenu({ pos: {top:e.clientY,left:e.clientX}, items }); }}>
 *   {menu && <ContextMenuPortal items={menu.items} pos={menu.pos} onClose={() => setMenu(null)} />}
 */
export const ContextMenuPortal = MenuList;

// ── Right-click wrapper ─────────────────────────────────────────────────
export const ContextMenu: React.FC<{
  items: ContextMenuItem[];
  children: React.ReactNode;
  className?: string;
}> = ({ items, children, className }) => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!items.length) return;
    e.preventDefault();
    setPos({ top: e.clientY, left: e.clientX });
  }, [items.length]);

  return (
    <>
      <div className={className} onContextMenu={onContextMenu}>
        {children}
      </div>
      {pos && <MenuList items={items} pos={pos} onClose={() => setPos(null)} />}
    </>
  );
};

// ── Discoverable "⋯" twin ───────────────────────────────────────────────
export const OverflowMenuButton: React.FC<{
  items: ContextMenuItem[];
  className?: string;
  'aria-label'?: string;
}> = ({ items, className, 'aria-label': ariaLabel = 'More actions' }) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pos !== null;

  const toggle = () => {
    if (open || !btnRef.current) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.right - MENU_WIDTH });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={ariaLabel}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`p-1.5 text-slate-500 hover:bg-slate-100 rounded-control transition-colors ${className ?? ''}`}
      >
        <MoreHorizontal size={16} />
      </button>
      {pos && <MenuList items={items} pos={pos} onClose={() => setPos(null)} />}
    </>
  );
};

export default ContextMenu;
