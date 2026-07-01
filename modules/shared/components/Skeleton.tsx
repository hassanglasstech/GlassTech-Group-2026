/**
 * Skeleton.tsx — content-shaped loading placeholders.
 *
 * Replaces lone spinners / blank flashes. A skeleton holds the layout so
 * there's no jump when data arrives. Uses the shimmer .skeleton classes from
 * index.css.
 *
 *   <Skeleton variant="heading" />
 *   <Skeleton width="60%" />
 *   <SkeletonTable rows={6} cols={5} />   // table-shaped placeholder
 */

import React from 'react';

export type SkeletonVariant = 'text' | 'heading' | 'card' | 'row' | 'avatar';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  /** Override width (e.g. "60%", "8rem"). */
  width?: string;
  /** Override height. */
  height?: string;
  className?: string;
}

const VARIANT_CLS: Record<SkeletonVariant, string> = {
  text: 'skeleton skeleton-text',
  heading: 'skeleton skeleton-heading',
  card: 'skeleton skeleton-card',
  row: 'skeleton skeleton-row',
  avatar: 'skeleton skeleton-avatar',
};

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text', width, height, className = '',
}) => (
  <div
    className={`${VARIANT_CLS[variant]} ${className}`}
    style={{ width, height }}
    aria-hidden
  />
);

/** Table-shaped placeholder — drop into a card while rows load. */
export const SkeletonTable: React.FC<{ rows?: number; cols?: number; className?: string }> = ({
  rows = 6, cols = 5, className = '',
}) => (
  <div className={`p-3 ${className}`} role="status" aria-label="Loading">
    <div className="flex gap-3 mb-3">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} variant="text" className="flex-1" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-3 mb-2">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} variant="text" className="flex-1" height="20px" />
        ))}
      </div>
    ))}
  </div>
);

export default Skeleton;
