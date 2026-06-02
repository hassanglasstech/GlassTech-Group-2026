/**
 * dispatchService.ts — Sprint 11
 *
 * Single entry point for the tempering-dispatch lifecycle. Replaces
 * fragmented status-flag updates scattered across DispatchPlanner /
 * ProductionContext with an event-sourced log:
 *
 *   CREATED → PIECES_LOADED → AUTHORIZED → GATE_OUT → IN_TRANSIT
 *   → ARRIVED → RECEIVING → INVOICE_RECORDED → THREE_WAY_MATCHED → CLOSED
 *
 * Every transition appends to dispatch_events (append-only).
 *
 * Guarantees:
 *   - Cannot mark Dispatched without a gate pass (DB RPC + UI guard)
 *   - A piece cannot be in 2 active dispatches (DB unique index)
 *   - Vendor invoice mismatch >5% flagged Mismatch (DB RPC)
 *
 * Pattern: every public method returns { data?: T, error?: string }.
 */

import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';
import type { Company } from '@/modules/shared/types';

// ── Types ─────────────────────────────────────────────────────────────

export type DispatchEventType =
  | 'CREATED'
  | 'PIECES_LOADED'
  | 'AUTHORIZED'
  | 'GATE_OUT'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'RECEIVING'
  | 'INVOICE_RECORDED'
  | 'THREE_WAY_MATCHED'
  | 'CLOSED'
  | 'CANCELLED';

export interface DispatchEvent {
  id:          number;
  dispatch_id: string;
  company:     string;
  event_type:  DispatchEventType;
  event_data:  Record<string, unknown>;
  occurred_at: string;
  created_by:  string;
}

export type ThreeWayMatchStatus = 'Match' | 'Mismatch' | 'Pending';

interface ServiceResult<T = void> {
  data?:  T;
  error?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────

function actor(): string {
  const s = useAuthStore.getState();
  return s.profile?.email ?? s.user?.email ?? 'system';
}

function asError(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return 'Unknown error';
}

// ── Public API ────────────────────────────────────────────────────────

export const DispatchService = {
  /**
   * Append a single lifecycle event. Most callers should use the
   * higher-level helpers (authorizeDispatch, recordInvoice, etc.) which
   * also update the dispatch row atomically.
   */
  async appendEvent(
    dispatchId: string,
    eventType:  DispatchEventType,
    eventData:  Record<string, unknown> = {},
  ): Promise<ServiceResult<number>> {
    try {
      const { data, error } = await supabase.rpc('append_dispatch_event', {
        p_dispatch_id: dispatchId,
        p_event_type:  eventType,
        p_event_data:  eventData,
        p_created_by:  actor(),
      });
      if (error) return { error: error.message };
      return { data: data as number };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Read full lifecycle for a dispatch — used by the reconciliation
   * timeline UI in DispatchPlanner.
   */
  async getEvents(dispatchId: string): Promise<ServiceResult<DispatchEvent[]>> {
    try {
      const { data, error } = await supabase
        .from('dispatch_events')
        .select('*')
        .eq('dispatch_id', dispatchId)
        .order('occurred_at', { ascending: true });
      if (error) return { error: error.message };
      return { data: (data ?? []) as DispatchEvent[] };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Read recent events across the whole company (audit dashboard).
   */
  async getRecentEvents(
    company: Company,
    limit:   number = 100,
  ): Promise<ServiceResult<DispatchEvent[]>> {
    try {
      const { data, error } = await supabase
        .from('dispatch_events')
        .select('*')
        .eq('company', company)
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (error) return { error: error.message };
      return { data: (data ?? []) as DispatchEvent[] };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Mark a dispatch as Dispatched. REQUIRES a gate pass — both the
   * service layer guard (here) and the DB RPC enforce it.
   *
   * @returns success | error string surfaced to the caller's toast
   */
  async authorizeDispatch(
    dispatchId: string,
    gatePassId: string,
  ): Promise<ServiceResult<void>> {
    if (!dispatchId) return { error: 'Dispatch ID required' };
    if (!gatePassId) return { error: 'Gate pass is mandatory before dispatch' };

    try {
      const { error } = await supabase.rpc('authorize_dispatch', {
        p_dispatch_id:   dispatchId,
        p_gate_pass_id:  gatePassId,
        p_authorized_by: actor(),
      });

      if (error) {
        const msg = error.message ?? '';
        if (msg.includes('gate_pass_not_found_for_company')) {
          return { error: 'Gate pass not found for this company. Issue a gate pass first.' };
        }
        if (msg.includes('already_authorized_with_different_gate_pass')) {
          return { error: 'Dispatch already authorized with a different gate pass — cannot change.' };
        }
        if (msg.includes('dispatch_not_found')) {
          return { error: `Dispatch ${dispatchId} not found.` };
        }
        return { error: msg };
      }
      return {};
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Record vendor invoice and run 3-way match (PO/dispatch ↔ goods receipt
   * ↔ vendor invoice). Server compares vendor amount vs computed AP from
   * tempering inward GL; flags Mismatch if delta > 5 %.
   */
  async recordInvoiceAndMatch(params: {
    dispatchId:           string;
    vendorInvoiceNo:      string;
    vendorInvoiceAmount:  number;
    computedApAmount:     number;
  }): Promise<ServiceResult<ThreeWayMatchStatus>> {
    const { dispatchId, vendorInvoiceNo, vendorInvoiceAmount, computedApAmount } = params;
    if (!dispatchId || !vendorInvoiceNo) {
      return { error: 'Dispatch ID and vendor invoice number required' };
    }
    if (vendorInvoiceAmount < 0 || computedApAmount < 0) {
      return { error: 'Amounts must be non-negative' };
    }

    try {
      const { data, error } = await supabase.rpc('record_three_way_match', {
        p_dispatch_id:           dispatchId,
        p_vendor_invoice_no:     vendorInvoiceNo,
        p_vendor_invoice_amount: vendorInvoiceAmount,
        p_computed_ap_amount:    computedApAmount,
        p_recorded_by:           actor(),
      });
      if (error) return { error: error.message };
      return { data: data as ThreeWayMatchStatus };
    } catch (e) {
      return { error: asError(e) };
    }
  },

  /**
   * Receiving event — partial inward.
   *   receivedPieceIds: pieces that came back tempered + accepted
   *   brokenPieceIds:   pieces broken/lost in transit (NCR raised separately)
   *
   * Posts the RECEIVING event to the audit log; the actual GL post is
   * handled by glasscoGLService.postTemperingInwardGL with the same
   * receivedPieceIds (Sprint 11 update — partial inward support).
   */
  async recordReceiving(params: {
    dispatchId:        string;
    receivedPieceIds:  string[];
    brokenPieceIds:    string[];
    notes?:            string;
  }): Promise<ServiceResult<void>> {
    const { dispatchId, receivedPieceIds, brokenPieceIds, notes } = params;
    if (!dispatchId) return { error: 'Dispatch ID required' };

    return this.appendEvent(dispatchId, 'RECEIVING', {
      receivedCount: receivedPieceIds.length,
      brokenCount:   brokenPieceIds.length,
      receivedPieceIds,
      brokenPieceIds,
      notes:        notes ?? '',
    }).then(r => (r.error ? { error: r.error } : {}));
  },

  /** Convenience helpers for the simpler lifecycle events. */
  async markCreated(dispatchId: string, summary: { pieceCount: number; vendor: string; totalSqFt: number; }): Promise<ServiceResult<void>> {
    return this.appendEvent(dispatchId, 'CREATED', summary).then(r => (r.error ? { error: r.error } : {}));
  },
  async markPiecesLoaded(dispatchId: string, pieceIds: string[]): Promise<ServiceResult<void>> {
    return this.appendEvent(dispatchId, 'PIECES_LOADED', { pieceIds, count: pieceIds.length })
      .then(r => (r.error ? { error: r.error } : {}));
  },
  async markGateOut(dispatchId: string, gatePassId: string): Promise<ServiceResult<void>> {
    return this.appendEvent(dispatchId, 'GATE_OUT', { gatePassId })
      .then(r => (r.error ? { error: r.error } : {}));
  },
  async markInTransit(dispatchId: string): Promise<ServiceResult<void>> {
    return this.appendEvent(dispatchId, 'IN_TRANSIT', {})
      .then(r => (r.error ? { error: r.error } : {}));
  },
  async markArrived(dispatchId: string, arrivedAt?: string): Promise<ServiceResult<void>> {
    return this.appendEvent(dispatchId, 'ARRIVED', { arrivedAt: arrivedAt ?? new Date().toISOString() })
      .then(r => (r.error ? { error: r.error } : {}));
  },
  async markClosed(dispatchId: string, closeReason?: string): Promise<ServiceResult<void>> {
    return this.appendEvent(dispatchId, 'CLOSED', { closeReason: closeReason ?? 'normal' })
      .then(r => (r.error ? { error: r.error } : {}));
  },
  async markCancelled(dispatchId: string, reason: string): Promise<ServiceResult<void>> {
    if (!reason || !reason.trim()) {
      return { error: 'Cancellation reason required' };
    }
    return this.appendEvent(dispatchId, 'CANCELLED', { reason })
      .then(r => (r.error ? { error: r.error } : {}));
  },
};
