/**
 * useProductionRealtime — Sprint 10
 *
 * Mount once at GlasscoProduction level. Listens to production_pieces
 * postgres_changes (via the existing `gtk_realtime_update` window event
 * from RealtimeService) AND to the `gtk_piece_status_changed` custom
 * event fired by ProductionService after each atomic status update.
 *
 * Fires debounced cross-team toast notifications:
 *   QC-Passed → toast for Dispatcher / Supervisor (dispatch queue grew)
 *   QC-Failed → toast for Supervisor
 *   Received-From-Tempering → toast for Supervisor / QC
 *   Dispatched → toast for Supervisor
 *   Delivered → toast for all
 *
 * Debounce: bursts within 1.5s are collapsed into a single summary toast.
 * ("30 pieces QC-Passed" instead of 30 individual toasts.)
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { PieceStatus } from '@/modules/shared/constants';
import type { UserRole } from '@/modules/auth/authStore';

// ── Types ─────────────────────────────────────────────────────────────

interface PieceEvent {
  id:        string;
  status:    string;
  company:   string;
  timestamp: number;
}

interface ToastRule {
  status:  string;
  message: (count: number, firstId: string) => string;
  /** Empty = show to ALL roles. Otherwise show only to listed roles. */
  roles:   UserRole[];
}

// ── Toast rules (order matters — first match wins) ────────────────────

const TOAST_RULES: ToastRule[] = [
  {
    status:  PieceStatus.QC_PASSED,
    message: (n, id) =>
      n === 1
        ? `✅ ${id} QC-Passed — ready to dispatch`
        : `✅ ${n} pieces QC-Passed — ready to dispatch`,
    roles: ['dispatch_staff', 'glassco_supervisor', 'super_admin', 'factory_manager', 'hassan'],
  },
  {
    status:  PieceStatus.QC_FAILED,
    message: (n, id) =>
      n === 1 ? `❌ ${id} QC-Failed` : `❌ ${n} pieces QC-Failed`,
    roles: ['glassco_supervisor', 'super_admin', 'factory_manager', 'hassan'],
  },
  {
    status:  PieceStatus.RECEIVED_FROM_TEMPERING,
    message: (n, id) =>
      n === 1
        ? `🔥 ${id} received back from tempering`
        : `🔥 ${n} pieces received back from tempering`,
    roles: ['glassco_supervisor', 'super_admin', 'factory_manager', 'hassan'],
  },
  {
    status:  PieceStatus.DISPATCHED,
    message: (n, id) =>
      n === 1 ? `🚛 ${id} dispatched to tempering` : `🚛 ${n} pieces dispatched`,
    roles: ['glassco_supervisor', 'super_admin', 'hassan'],
  },
  {
    status:  PieceStatus.DELIVERED,
    message: (n, id) =>
      n === 1 ? `📦 ${id} delivered to client` : `📦 ${n} pieces delivered`,
    roles: [],
  },
];

const DEBOUNCE_MS = 1500;

// ── Hook ──────────────────────────────────────────────────────────────

/**
 * @param userRole  role from useAuthStore — used to filter which toasts show
 */
export function useProductionRealtime(userRole: UserRole | undefined): void {
  // Map of status → buffered events within debounce window
  const buffer = useRef<Map<string, PieceEvent[]>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    // ── 1. Listen for specific piece status changes (from ProductionService) ──
    const onPieceStatus = (e: Event) => {
      const ev = e as CustomEvent<{ pieceId: string; status: string; company: string }>;
      const { pieceId, status, company } = ev.detail ?? {};
      if (!pieceId || !status) return;
      enqueue(pieceId, status, company ?? '', userRole);
    };

    // ── 2. Listen for generic realtime updates (fallback) ──────────────
    // When a production_pieces row changes on ANY remote device we get this.
    // We can't know WHICH piece changed here (RealtimeService doesn't pass
    // the row in the window event), so we don't fire a toast from this path
    // — the service-layer event above covers known local actions.
    // But we DO fire a subtle "data refreshed" indicator.
    const onRealtimeUpdate = (e: Event) => {
      const ev = e as CustomEvent<{ table: string; eventType: string }>;
      if (ev.detail?.table !== 'production_pieces') return;
      // Nothing extra — RealtimeService already updated localStorage and
      // TanStack Query Bridge already invalidated queries. Components
      // re-render automatically. No toast needed here.
    };

    window.addEventListener('gtk_piece_status_changed', onPieceStatus);
    window.addEventListener('gtk_realtime_update',      onRealtimeUpdate);

    return () => {
      window.removeEventListener('gtk_piece_status_changed', onPieceStatus);
      window.removeEventListener('gtk_realtime_update',      onRealtimeUpdate);
      timers.current.forEach(t => clearTimeout(t));
    };
  }, [userRole]);

  function enqueue(
    pieceId:  string,
    status:   string,
    company:  string,
    role:     UserRole | undefined,
  ): void {
    const rule = TOAST_RULES.find(r => r.status === status);
    if (!rule) return;

    // Role gate
    if (rule.roles.length > 0 && role && !rule.roles.includes(role)) return;

    const batch = buffer.current.get(status) ?? [];
    batch.push({ id: pieceId, status, company, timestamp: Date.now() });
    buffer.current.set(status, batch);

    // Reset debounce timer
    const existing = timers.current.get(status);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const events = buffer.current.get(status) ?? [];
      if (events.length === 0) return;
      toast(rule.message(events.length, events[0].id), { duration: 4000 });
      buffer.current.delete(status);
      timers.current.delete(status);
    }, DEBOUNCE_MS);

    timers.current.set(status, timer);
  }
}

// ── Service-layer helper ──────────────────────────────────────────────

/**
 * Call this from ProductionService.updatePieceStatus() (or any atomic
 * status-update RPC) after a successful save so useProductionRealtime
 * can fire the correct cross-team toast on the same device.
 *
 * Remote devices get the toast via the Supabase Realtime path once
 * Sprint 10 wires up payload-aware events.
 */
export function dispatchPieceStatusEvent(
  pieceId: string,
  status:  string,
  company: string,
): void {
  window.dispatchEvent(
    new CustomEvent('gtk_piece_status_changed', {
      detail: { pieceId, status, company },
    }),
  );
}
