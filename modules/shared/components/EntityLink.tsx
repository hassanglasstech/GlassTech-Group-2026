/**
 * EntityLink — Sprint 21
 *
 * Wraps any entity ID (client, invoice, quotation, vendor, piece) and
 * turns it into a navigable link to the canonical detail view. Drop-in
 * replacement anywhere a raw ID is rendered:
 *
 *   <EntityLink type="client"     id={inv.clientId}/>
 *   <EntityLink type="invoice"    id={inv.id}>{inv.invoice_number}</EntityLink>
 *   <EntityLink type="quotation"  id={q.orderNo}/>
 *   <EntityLink type="vendor"     id={dispatch.plantId}/>
 *   <EntityLink type="piece"      id={p.id}/>
 *
 * Navigation targets are centralised below so changing where, say,
 * "client" pages live is a one-file edit.
 */

import React from 'react';
import { Link } from 'react-router-dom';

export type EntityType = 'client' | 'invoice' | 'quotation' | 'vendor' | 'piece' | 'order' | 'dispatch';

interface EntityLinkProps {
  type:       EntityType;
  id:         string | number | null | undefined;
  /** Override the visible label. Falls back to the id. */
  children?:  React.ReactNode;
  /** Render plain text when `id` is empty/falsy. Default '—'. */
  fallback?:  string;
  className?: string;
  /** Open in a new tab/window. Default false. */
  newWindow?: boolean;
}

// ── Route map — single source of truth ────────────────────────────────

function routeFor(type: EntityType, id: string): string {
  switch (type) {
    case 'client':    return `/sales?client=${encodeURIComponent(id)}`;
    case 'invoice':   return `/sales?invoice=${encodeURIComponent(id)}`;
    case 'quotation': return `/sales?quotation=${encodeURIComponent(id)}`;
    case 'order':     return `/sales?order=${encodeURIComponent(id)}`;
    case 'vendor':    return `/vendors?id=${encodeURIComponent(id)}`;
    case 'piece':     return `/production/workbench?piece=${encodeURIComponent(id)}`;
    case 'dispatch':  return `/logistics?dispatch=${encodeURIComponent(id)}`;
  }
}

// ── Tone — colour by entity for quick recognition ─────────────────────

const TONE: Record<EntityType, string> = {
  client:    'text-blue-700    hover:text-blue-900',
  invoice:   'text-emerald-700 hover:text-emerald-900',
  quotation: 'text-violet-700  hover:text-violet-900',
  order:     'text-violet-700  hover:text-violet-900',
  vendor:    'text-orange-700  hover:text-orange-900',
  piece:     'text-blue-700    hover:text-blue-900',
  dispatch:  'text-slate-700   hover:text-slate-900',
};

const EntityLink: React.FC<EntityLinkProps> = ({
  type, id, children, fallback = '—', className = '', newWindow = false,
}) => {
  if (id == null || id === '') {
    return <span className={`text-slate-400 ${className}`}>{fallback}</span>;
  }
  const idStr = String(id);
  const route = routeFor(type, idStr);
  const label = children ?? idStr;

  if (newWindow) {
    return (
      <a
        href={`#${route}`}
        target="_blank"
        rel="noreferrer"
        className={`font-mono font-bold underline-offset-2 hover:underline ${TONE[type]} ${className}`}
        title={`Open ${type} ${idStr}`}
      >
        {label}
      </a>
    );
  }

  return (
    <Link
      to={route}
      className={`font-mono font-bold underline-offset-2 hover:underline ${TONE[type]} ${className}`}
      title={`Open ${type} ${idStr}`}
    >
      {label}
    </Link>
  );
};

export default EntityLink;
