/**
 * CompactPageHeader.tsx — Design System v2
 *
 * A strictly compact (max h-14) page header with:
 *   - Breadcrumb trail (chevron-separated, clickable)
 *   - Page title + optional subtitle chip
 *   - Action Ribbon (primary / secondary / danger / ghost buttons)
 *   - Optional meta slot (status chips, last-updated, counts)
 *
 * ZERO inline styles. ZERO gradients. ZERO dark ovals.
 * Pure Tailwind + shared CSS tokens only.
 */

import React from 'react';
import { ChevronRight } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────
export interface Breadcrumb {
  label: string;
  onClick?: () => void;
}

export type ActionVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ActionItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: ActionVariant;
  /** Shown as tooltip + keyboard hint badge */
  shortcut?: string;
  disabled?: boolean;
}

export interface CompactPageHeaderProps {
  /** Breadcrumb trail rendered above the title */
  breadcrumbs?: Breadcrumb[];
  /** Primary page title — always visible */
  title: string;
  /** Dimmed uppercase subtitle chip next to the title */
  subtitle?: string;
  /** Action Ribbon buttons — rendered right-aligned */
  actions?: ActionItem[];
  /** Arbitrary meta content (status chips, counters) placed left of actions */
  meta?: React.ReactNode;
  /** Extra className on the root div */
  className?: string;
}

// ── Button variant styles ──────────────────────────────────────────────
const VARIANT: Record<ActionVariant, string> = {
  primary:   'bg-blue-600 text-white hover:bg-blue-700 border-blue-600 shadow-sm',
  secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300',
  danger:    'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200',
  ghost:     'bg-transparent text-slate-500 hover:bg-slate-100 border-transparent',
};

// ── Component ─────────────────────────────────────────────────────────
export const CompactPageHeader: React.FC<CompactPageHeaderProps> = ({
  breadcrumbs = [],
  title,
  subtitle,
  actions = [],
  meta,
  className = '',
}) => (
  <div
    className={`h-14 flex items-center justify-between px-4 border-b border-slate-200 bg-white shrink-0 ${className}`}
    role="banner"
  >
    {/* ── Left: breadcrumbs + title ──────────────────────────────── */}
    <div className="flex flex-col justify-center min-w-0 pr-4">
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-0.5 mb-0.5" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <ChevronRight size={9} className="text-slate-300 shrink-0 mx-0.5" aria-hidden />
              )}
              {crumb.onClick ? (
                <button
                  onClick={crumb.onClick}
                  className="text-[10px] font-semibold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-wide leading-none"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide leading-none">
                  {crumb.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex items-baseline gap-2 min-w-0">
        <h1 className="text-sm font-bold text-slate-900 truncate leading-snug">
          {title}
        </h1>
        {subtitle && (
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap hidden sm:inline">
            {subtitle}
          </span>
        )}
      </div>
    </div>

    {/* ── Right: meta + action ribbon ────────────────────────────── */}
    <div className="flex items-center gap-2 shrink-0">
      {/* Meta slot — hidden on very small screens */}
      {meta && (
        <div className="hidden sm:flex items-center gap-2">
          {meta}
        </div>
      )}

      {/* Separator between meta and actions */}
      {meta && actions.length > 0 && (
        <div className="hidden sm:block h-4 w-px bg-slate-200 mx-1" />
      )}

      {/* Action buttons */}
      {actions.map((action, i) => (
        <button
          key={i}
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
          aria-label={action.label}
          className={[
            'inline-flex items-center gap-1.5 px-3 py-1.5',
            'text-[11px] font-bold rounded border transition-colors',
            'whitespace-nowrap',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            VARIANT[action.variant ?? 'secondary'],
          ].join(' ')}
        >
          {action.icon && (
            <span className="shrink-0 flex items-center">{action.icon}</span>
          )}
          <span className="hidden sm:inline">{action.label}</span>
          {action.shortcut && (
            <kbd className="hidden lg:inline ml-0.5 text-[9px] opacity-50 font-mono bg-black/5 px-1 py-px rounded">
              {action.shortcut}
            </kbd>
          )}
        </button>
      ))}
    </div>
  </div>
);

export default CompactPageHeader;
