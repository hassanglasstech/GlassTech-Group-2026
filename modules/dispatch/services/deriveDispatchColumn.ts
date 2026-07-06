/**
 * deriveDispatchColumn.ts — One-Window Dispatch cockpit (Phase 1)
 *
 * PURE resolver. Fuses the fragmented dispatch state — TemperingDispatch.status,
 * loaded pieces, gate pass, vendor invoice, POD flag, and (when available) the
 * latest dispatch_events type — into ONE of six board columns, plus a conflict
 * flag when the signals disagree in a way that should not happen.
 *
 * No side effects, no I/O, no React. Safe to unit-test and safe to run on
 * read-only cached data. It NEVER writes and has ZERO GL impact — this is the
 * IFRS-neutral heart of Phase 1 (financial controller sign-off: build now).
 */
import type { TemperingDispatch } from '@/modules/shared/types';
import type { DispatchEventType } from '@/modules/procurement/services/dispatchService';

export const DISPATCH_COLUMNS = [
  'Ready', 'Loading', 'At-Gate', 'In-Transit', 'Delivered', 'Invoiced',
] as const;
export type DispatchColumn = typeof DISPATCH_COLUMNS[number];

/** Lifecycle order — used for "more/less advanced" comparisons + conflict span. */
const ORDER: Record<DispatchColumn, number> = {
  Ready: 0, Loading: 1, 'At-Gate': 2, 'In-Transit': 3, Delivered: 4, Invoiced: 5,
};

export interface DispatchSignals {
  status: string;
  pieceCount: number;
  receivedCount: number;
  hasGatePass: boolean;
  hasVendorInvoice: boolean;
  podCompleted: boolean;
  latestEvent?: DispatchEventType;
}

export interface DispatchColumnResult {
  column: DispatchColumn;
  conflict: boolean;
  conflictReason?: string;
}

/**
 * Read the board-relevant signals off a raw dispatch row. Defensive about the
 * optional POD fields, which live on the Supabase row (pod_completed_at) but
 * not on the TemperingDispatch TS interface.
 */
export function signalsFromDispatch(d: TemperingDispatch): DispatchSignals {
  const extra = d as unknown as { pod_completed_at?: string | null; podCompletedAt?: string | null };
  return {
    status: d.status,
    pieceCount: Array.isArray(d.pieceIds) ? d.pieceIds.length : 0,
    receivedCount: Array.isArray(d.receivedPieceIds) ? d.receivedPieceIds.length : 0,
    hasGatePass: Boolean(d.gatePassId),
    hasVendorInvoice: Boolean(d.vendorInvoiceNo),
    podCompleted: Boolean(extra.pod_completed_at || extra.podCompletedAt),
  };
}

function columnFromStatus(s: DispatchSignals): DispatchColumn {
  if (s.hasVendorInvoice) return 'Invoiced';
  if (s.podCompleted || s.receivedCount > 0 || s.status === 'Received') return 'Delivered';
  if (s.status === 'Dispatched') return 'In-Transit';
  if (s.status === 'Ready to Dispatch' && s.hasGatePass) return 'At-Gate';
  if (s.pieceCount > 0 || s.status === 'Ready to Dispatch' || s.status === 'Scheduled') return 'Loading';
  return 'Ready';
}

function columnFromEvent(e?: DispatchEventType): DispatchColumn | null {
  switch (e) {
    case 'INVOICE_RECORDED':
    case 'THREE_WAY_MATCHED':
    case 'CLOSED': return 'Invoiced';
    case 'ARRIVED':
    case 'RECEIVING': return 'Delivered';
    case 'IN_TRANSIT': return 'In-Transit';
    case 'AUTHORIZED':
    case 'GATE_OUT': return 'At-Gate';
    case 'PIECES_LOADED': return 'Loading';
    case 'CREATED': return 'Ready';
    default: return null;
  }
}

/**
 * The resolver. Takes the more-advanced of the status-view and the event-view
 * of reality, then flags a conflict only for genuine "this shouldn't happen"
 * cases (so the board can surface a visible badge rather than silently
 * mis-bucketing).
 */
export function deriveDispatchColumn(s: DispatchSignals): DispatchColumnResult {
  const byStatus = columnFromStatus(s);
  const byEvent = columnFromEvent(s.latestEvent);

  let column = byStatus;
  if (byEvent && ORDER[byEvent] > ORDER[column]) column = byEvent;

  let conflict = false;
  let conflictReason: string | undefined;

  if (s.status === 'Dispatched' && !s.hasGatePass) {
    conflict = true;
    conflictReason = 'Dispatched without a gate pass';
  } else if (s.podCompleted && s.status !== 'Received' && s.status !== 'Dispatched') {
    conflict = true;
    conflictReason = `POD complete but status is "${s.status}"`;
  } else if (s.hasVendorInvoice && s.status !== 'Received' && s.status !== 'Dispatched') {
    conflict = true;
    conflictReason = `Vendor invoice recorded but status is "${s.status}"`;
  } else if (byEvent && Math.abs(ORDER[byEvent] - ORDER[byStatus]) > 1) {
    conflict = true;
    conflictReason = `Status says "${byStatus}" but last event says "${byEvent}"`;
  }

  return { column, conflict, conflictReason };
}

/**
 * Reduce a group of dispatches (one trip) to a single column: the LEAST
 * advanced leg governs — a trip is not "Delivered" until every leg is. Conflict
 * on any leg propagates to the trip.
 */
export function deriveTripColumn(results: DispatchColumnResult[]): DispatchColumnResult {
  if (results.length === 0) return { column: 'Ready', conflict: false };
  let least = results[0];
  let conflict = false;
  let conflictReason: string | undefined;
  for (const r of results) {
    if (ORDER[r.column] < ORDER[least.column]) least = r;
    if (r.conflict && !conflict) {
      conflict = true;
      conflictReason = r.conflictReason;
    }
  }
  return { column: least.column, conflict, conflictReason };
}

export function compareColumns(a: DispatchColumn, b: DispatchColumn): number {
  return ORDER[a] - ORDER[b];
}
