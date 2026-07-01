/**
 * StatusBadge.tsx — the one way to render a status.
 *
 * Colors come from statusColors.ts (single source of truth), so "Approved"
 * is the same green everywhere and "Overdue" the same red. Never hand-pick
 * bg-emerald-100/text-rose-700 in a component again.
 *
 *   <StatusBadge status={req.status} />
 *   <StatusBadge status="QC-Passed" dot />          // leading dot
 *   <StatusBadge status={inv.status} size="sm" />
 */

import React from 'react';
import { statusBadgeClass, statusDotClass } from '@/modules/shared/utils/statusColors';

export interface StatusBadgeProps {
  status: string;
  /** Show a leading solid dot (good for dense tables / legends). */
  dot?: boolean;
  /** sm = 2xs/tight (table cells), md = label (default). */
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE: Record<NonNullable<StatusBadgeProps['size']>, string> = {
  sm: 'text-2xs px-1.5 py-0.5 gap-1',
  md: 'text-label px-2 py-0.5 gap-1.5',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status, dot = false, size = 'md', className = '',
}) => (
  <span
    className={[
      'inline-flex items-center font-semibold rounded-control whitespace-nowrap',
      SIZE[size],
      statusBadgeClass(status),
      className,
    ].join(' ')}
  >
    {dot && <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(status)}`} aria-hidden />}
    {status}
  </span>
);

export default StatusBadge;
