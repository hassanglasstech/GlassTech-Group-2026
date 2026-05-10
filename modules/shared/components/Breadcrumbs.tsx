/**
 * Breadcrumbs — Sprint 21
 *
 * Persistent breadcrumb derived from the current URL hash. Drop into
 * the main shell once and it updates automatically as the route changes.
 *
 * Strategy:
 *   - Split pathname on `/` and look up each segment in LABEL_MAP
 *   - Unrecognised segments fall back to title-cased version
 *   - Search params show as a trailing chip (e.g., "?lens=hold" → "Hold")
 *   - Each crumb is a link except the last one (current page)
 *
 * Examples:
 *   /sales                      → Home › Sales
 *   /production/workbench       → Home › Workbench
 *   /production/workbench?lens=hold&piece=GLS-PC-001
 *                              → Home › Workbench › Hold › GLS-PC-001
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

// ── Path label map — single source of truth ───────────────────────────

const LABEL_MAP: Record<string, string> = {
  '':                 'Home',
  'sales':            'Sales',
  'accounts':         'Finance',
  'hr':               'HR',
  'inventory':        'Inventory',
  'requisitions':     'Procurement',
  'production':       'Production',
  'workbench':        'Workbench',
  'logistics':        'Logistics',
  'vendors':          'Vendors',
  'projects':         'Projects',
  'admin':            'Admin',
  'md-dashboard':     'MD Dashboard',
  'factory-incharge': 'Factory',
  'hub':              'Hub',
  'cutter':           'Cutter',
  'qc':               'QC',
  'dispatch':         'Dispatch',
  'live':             'Live Map',
  'workbench-aging':  'WIP Aging',
  'aging':            'Aging',
  'cutter-performance': 'Cutter Performance',
  'driver':           'Driver',
  'track':            'Tracking',
  'legacy':           'Legacy',
};

const SEARCH_LABEL_MAP: Record<string, (v: string) => string> = {
  lens:    (v) => v.charAt(0).toUpperCase() + v.slice(1),
  piece:   (v) => v,
  invoice: (v) => `Invoice ${v}`,
  client:  (v) => `Client ${v}`,
};

// ── Helpers ───────────────────────────────────────────────────────────

function titleCase(seg: string): string {
  return seg.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function labelFor(segment: string): string {
  return LABEL_MAP[segment] ?? titleCase(segment);
}

// ── Component ─────────────────────────────────────────────────────────

interface BreadcrumbsProps {
  className?: string;
  /** Hide on root path. Default true (clean home view). */
  hideOnHome?: boolean;
  /** Pages where breadcrumbs would clutter (e.g., driver/track public links). */
  hideOnPaths?: string[];
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  className   = '',
  hideOnHome  = true,
  hideOnPaths = ['/driver', '/track', '/cutter', '/qc', '/dispatch'],
}) => {
  const location = useLocation();
  const path     = location.pathname;

  // Hide on opted-out paths
  if (hideOnPaths.some(p => path === p || path.startsWith(p + '/'))) {
    return null;
  }

  const segments = path.split('/').filter(Boolean);
  if (hideOnHome && segments.length === 0) return null;

  // Build cumulative href crumbs from the path
  const crumbs: Array<{ label: string; href?: string }> = [
    { label: 'Home', href: '/' },
  ];
  segments.forEach((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/');
    crumbs.push({ label: labelFor(seg), href });
  });

  // Append search-param crumbs (lens, piece, etc.)
  const search = new URLSearchParams(location.search);
  for (const [k, v] of search.entries()) {
    const fmt = SEARCH_LABEL_MAP[k];
    if (!fmt) continue;
    crumbs.push({ label: fmt(v) });
  }

  // Last crumb is current page — no link
  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1 text-xs text-slate-500 ${className}`}
    >
      <ol className="flex items-center gap-1 flex-wrap">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={11} className="text-slate-300"/>}
              {!isLast && c.href ? (
                <Link
                  to={c.href}
                  className="hover:text-slate-800 hover:underline flex items-center gap-1"
                >
                  {i === 0 && <Home size={11}/>}
                  {c.label}
                </Link>
              ) : (
                <span className={`flex items-center gap-1 ${isLast ? 'font-bold text-slate-800' : ''}`}>
                  {i === 0 && <Home size={11}/>}
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
