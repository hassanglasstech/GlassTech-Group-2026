/**
 * PresenceAvatars — Sprint 10
 *
 * Shows stacked initials-avatar chips for every user currently active on
 * the production floor (from useProductionPresence). Rendered in the
 * GlasscoProduction top-bar so all roles can see who else is online.
 *
 * Features:
 * - Deterministic colour per userId (stable across renders)
 * - Green online dot on each avatar
 * - Tooltip on hover: full name + role abbreviation + current view
 * - Overflow chip (+N) when more than maxVisible users
 * - Own user greyed out (still shown so others can see them)
 *
 * Usage:
 *   <PresenceAvatars presenceMap={presenceMap} currentUserId={user.id} />
 */

import React from 'react';
import type { PresenceMap } from '@/modules/production/hooks/usePiecePresence';

// ── Types ─────────────────────────────────────────────────────────────

interface PresenceAvatarsProps {
  presenceMap:     PresenceMap;
  currentUserId?:  string;
  maxVisible?:     number;
}

// ── Constants ─────────────────────────────────────────────────────────

const ROLE_ABBR: Record<string, string> = {
  glassco_cutter:     'CUT',
  glassco_supervisor: 'SUP',
  dispatch_staff:     'DSP',
  factory_manager:    'MGR',
  super_admin:        'ADM',
  hassan:             'OWN',
  glassco_admin:      'ADM',
  glassco_production: 'PRD',
  owner:              'OWN',
};

const VIEW_LABEL: Record<string, string> = {
  fabrication: 'Fabrication',
  processing:  'Processing',
  dispatch:    'QC & Dispatch',
  qc:          'QC Workbench',
  dashboard:   'Dashboard',
};

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
  'bg-teal-500',
];

// ── Helpers ───────────────────────────────────────────────────────────

function colorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────────

const PresenceAvatars: React.FC<PresenceAvatarsProps> = ({
  presenceMap,
  currentUserId,
  maxVisible = 5,
}) => {
  const users = Object.values(presenceMap);
  if (users.length === 0) return null;

  const visible  = users.slice(0, maxVisible);
  const overflow = users.length - maxVisible;

  return (
    <div
      className="flex items-center gap-1.5"
      title={`${users.length} user${users.length !== 1 ? 's' : ''} on production floor`}
    >
      {/* "Live" label */}
      <span className="hidden sm:inline text-[10px] font-semibold text-slate-400 tracking-wide">
        LIVE
      </span>

      {/* Stacked avatars */}
      <div className="flex -space-x-1.5">
        {visible.map(u => {
          const isSelf      = u.userId === currentUserId;
          const roleAbbr    = ROLE_ABBR[u.role]   ?? u.role.toUpperCase().slice(0, 3);
          const viewLabel   = VIEW_LABEL[u.view]  ?? u.view;
          const tooltipText = `${u.name} (${roleAbbr}) — ${viewLabel}${isSelf ? ' · You' : ''}`;

          return (
            <div
              key={u.userId}
              className={[
                'relative w-7 h-7 rounded-full flex items-center justify-center',
                'text-white text-[10px] font-black',
                'border-2 border-white shadow-sm cursor-default select-none',
                'transition-opacity duration-200',
                colorFor(u.userId),
                isSelf ? 'opacity-40' : 'opacity-100',
              ].join(' ')}
              title={tooltipText}
            >
              {initials(u.name)}

              {/* Green presence dot */}
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-white"
                aria-hidden="true"
              />
            </div>
          );
        })}

        {/* Overflow chip */}
        {overflow > 0 && (
          <div
            className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-black text-slate-600 border-2 border-white shadow-sm cursor-default"
            title={`${overflow} more user${overflow !== 1 ? 's' : ''} online`}
          >
            +{overflow}
          </div>
        )}
      </div>
    </div>
  );
};

export default PresenceAvatars;
