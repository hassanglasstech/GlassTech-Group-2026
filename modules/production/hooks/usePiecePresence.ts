/**
 * usePiecePresence — Sprint 10
 *
 * Supabase Realtime Presence: tracks who is active on the production floor.
 * Each page mount broadcasts a presence payload; all peers see merged state
 * within ~500ms.
 *
 * Usage (floor-level, in GlasscoProduction):
 *   const { presenceMap, userCount, focusPiece } = useProductionPresence('Glassco', 'processing');
 *
 * Usage (piece-level, to check who is focused on a specific card):
 *   const editors = usePiecePresence(pieceId, presenceMap);
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────

export interface PresenceUser {
  userId:   string;
  name:     string;
  role:     string;
  view:     string;       // 'fabrication' | 'processing' | 'dispatch' | 'qc'
  pieceId?: string;       // currently focused piece (optional)
  joinedAt: string;
}

export type PresenceMap = Record<string, PresenceUser>;

// ── Floor-level presence ──────────────────────────────────────────────

/**
 * Mount once per production page. Subscribes to the Glassco production
 * presence channel. Returns the live map of who's online.
 *
 * @param company  e.g. 'Glassco'
 * @param view     which sub-page the user is on
 */
export function useProductionPresence(company: string, view: string) {
  const { user, profile } = useAuthStore();
  const [presenceMap, setPresenceMap]   = useState<PresenceMap>({});
  const channelRef                       = useRef<RealtimeChannel | null>(null);
  const channelName                      = `production_presence_${company.toLowerCase()}`;

  useEffect(() => {
    if (!user?.id) return;

    const myPayload: PresenceUser = {
      userId:   user.id,
      name:     profile?.fullName || user.email || 'Unknown',
      role:     user.role || 'viewer',
      view,
      joinedAt: new Date().toISOString(),
    };

    const ch = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    ch
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<PresenceUser>();
        const flat: PresenceMap = {};
        for (const [key, arr] of Object.entries(state)) {
          const first = (arr as PresenceUser[])[0];
          if (first) flat[key] = first;
        }
        setPresenceMap(flat);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const newcomer = (newPresences as unknown as PresenceUser[])[0];
        if (!newcomer) return;
        setPresenceMap(prev => ({ ...prev, [key]: newcomer }));
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setPresenceMap(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track(myPayload);
        }
      });

    channelRef.current = ch;

    return () => {
      ch.untrack().finally(() => {
        supabase.removeChannel(ch);
      });
      channelRef.current = null;
    };
    // Re-subscribe when company or user changes; view changes handled via focusPiece/track
  }, [company, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Call when user opens/closes a piece card to update which piece they
   * are currently focused on — without remounting the channel.
   */
  const focusPiece = useCallback(
    async (pieceId: string | undefined) => {
      const ch = channelRef.current;
      if (!ch || !user?.id) return;
      await ch.track({
        userId:   user.id,
        name:     profile?.fullName || user.email || 'Unknown',
        role:     user.role || 'viewer',
        view,
        pieceId,
        joinedAt: new Date().toISOString(),
      } satisfies PresenceUser);
    },
    [user?.id, profile?.fullName, user?.email, user?.role, view],
  );

  const userCount = Object.keys(presenceMap).length;

  return { presenceMap, userCount, focusPiece };
}

// ── Piece-level: who is focused on a specific piece ───────────────────

/**
 * Derive from presenceMap (no extra subscription).
 * Pass the presenceMap from useProductionPresence().
 *
 * @param pieceId     the piece card being rendered
 * @param presenceMap live presence from useProductionPresence()
 * @returns           list of users currently focused on this piece
 */
export function usePiecePresence(
  pieceId: string,
  presenceMap: PresenceMap,
): PresenceUser[] {
  return Object.values(presenceMap).filter(u => u.pieceId === pieceId);
}
