/**
 * KpiTile.tsx — the one way to render a KPI / stat tile.
 *
 * Odoo-warm card (rounded-card + soft shadow) for module/tab landing stats.
 * Retires the per-page mix of banner-embedded stats, bare number divs, and
 * absent KPI rows. Compose several inside <KpiRow>.
 *
 *   <KpiRow>
 *     <KpiTile label="Total BPs" value={42} icon={<Users size={16}/>} tone="primary" />
 *     <KpiTile label="Active"    value={38} icon={<CheckCircle2 size={16}/>} tone="success" />
 *     <KpiTile label="Credit"    value={`PKR ${formatNumber(x)}`} hint="exposure" tone="warning" />
 *   </KpiRow>
 *
 * Pass onClick to make it a smart-button (Odoo) that drills into a filtered list.
 * Tones are a STATIC map so Tailwind generates the classes (no interpolation).
 */

import React from 'react';

export type KpiTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  /** Icon rendered in a toned chip on the left. */
  icon?: React.ReactNode;
  /** Accent colour for the icon chip. */
  tone?: KpiTone;
  /** Small sub-text under the value (unit, delta, context). */
  hint?: React.ReactNode;
  /** Makes the tile a clickable smart-button (drill-into-filtered-list). */
  onClick?: () => void;
  className?: string;
}

const TONE: Record<KpiTone, string> = {
  neutral: 'bg-neutral-subtle text-neutral',
  primary: 'bg-primary-subtle text-primary',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger:  'bg-danger-subtle text-danger',
  info:    'bg-info-subtle text-info',
};

export const KpiTile: React.FC<KpiTileProps> = ({
  label, value, icon, tone = 'neutral', hint, onClick, className = '',
}) => {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}
      className={[
        'flex items-center gap-3 rounded-card border border-slate-200 bg-white p-4 shadow-sm',
        interactive ? 'cursor-pointer hover:border-slate-300 hover:shadow transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40' : '',
        className,
      ].join(' ')}
    >
      {icon && (
        <div className={`h-9 w-9 shrink-0 rounded-control flex items-center justify-center ${TONE[tone]}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-2xs font-bold uppercase tracking-wide text-slate-500 truncate">{label}</p>
        <p className="text-lg font-bold text-slate-900 leading-tight truncate tabular-nums">{value}</p>
        {hint && <p className="text-2xs font-semibold text-slate-400 truncate">{hint}</p>}
      </div>
    </div>
  );
};

/** Responsive grid container for a row of KpiTiles (2-up mobile, 4-up desktop). */
export const KpiRow: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children, className = '',
}) => (
  <div className={`grid gap-3 grid-cols-2 lg:grid-cols-4 ${className}`}>{children}</div>
);

export default KpiTile;
