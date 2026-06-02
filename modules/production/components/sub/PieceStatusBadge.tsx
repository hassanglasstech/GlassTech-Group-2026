/**
 * PieceStatusBadge — Sprint 10
 *
 * Colour-coded status pill for a production piece. Flashes briefly (ring
 * pulse + slight scale) when the status prop changes, giving a visible
 * "just updated" cue across all devices watching the same floor in real time.
 *
 * Usage:
 *   <PieceStatusBadge status={piece.status} />
 *   <PieceStatusBadge status={piece.status} size="md" />
 */

import React, { useEffect, useRef, useState } from 'react';
import { PieceStatus } from '@/modules/shared/constants';

// ── Types ─────────────────────────────────────────────────────────────

interface PieceStatusBadgeProps {
  status:  string;
  size?:   'xs' | 'sm' | 'md';
}

// ── Colour map ────────────────────────────────────────────────────────

interface StatusStyle {
  bg:   string;
  text: string;
  dot:  string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  [PieceStatus.CUT]:                    { bg: 'bg-sky-100',     text: 'text-sky-700',     dot: 'bg-sky-500'     },
  [PieceStatus.SERVICE_PENDING]:        { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  [PieceStatus.QC_PENDING]:             { bg: 'bg-yellow-100',  text: 'text-yellow-700',  dot: 'bg-yellow-500'  },
  [PieceStatus.QC_PASSED]:              { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  [PieceStatus.QC_FAILED]:              { bg: 'bg-rose-100',    text: 'text-rose-700',    dot: 'bg-rose-500'    },
  [PieceStatus.READY_TO_DISPATCH]:      { bg: 'bg-violet-100',  text: 'text-violet-700',  dot: 'bg-violet-500'  },
  [PieceStatus.DISPATCHED]:             { bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500'  },
  [PieceStatus.TEMPERED]:               { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
  [PieceStatus.RECEIVED_FROM_TEMPERING]:{ bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  [PieceStatus.DELIVERED]:              { bg: 'bg-green-100',   text: 'text-green-700',   dot: 'bg-green-500'   },
  [PieceStatus.BROKEN]:                 { bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-400'   },
  [PieceStatus.HOLD]:                   { bg: 'bg-zinc-100',    text: 'text-zinc-700',    dot: 'bg-zinc-500'    },
  [PieceStatus.RETURNED]:               { bg: 'bg-pink-100',    text: 'text-pink-700',    dot: 'bg-pink-500'    },
};

const FALLBACK: StatusStyle = { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' };

// ── Size tokens ───────────────────────────────────────────────────────

const SIZE_PILL: Record<string, string> = {
  xs: 'text-[9px]  px-1.5 py-0.5 gap-1',
  sm: 'text-[10px] px-2   py-0.5 gap-1',
  md: 'text-xs     px-2.5 py-1   gap-1.5',
};

const SIZE_DOT: Record<string, string> = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-1.5 h-1.5',
  md: 'w-2   h-2',
};

// ── Component ─────────────────────────────────────────────────────────

const PieceStatusBadge: React.FC<PieceStatusBadgeProps> = ({
  status,
  size = 'sm',
}) => {
  const prevRef            = useRef(status);
  const [flash, setFlash]  = useState(false);

  // Flash animation when status changes (e.g. remote user QC-passed this piece)
  useEffect(() => {
    if (prevRef.current !== status) {
      prevRef.current = status;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      return () => clearTimeout(t);
    }
  }, [status]);

  const styles = STATUS_STYLES[status] ?? FALLBACK;

  return (
    <span
      className={[
        'inline-flex items-center rounded-full font-black uppercase tracking-wide',
        'transition-all duration-200',
        styles.bg,
        styles.text,
        SIZE_PILL[size],
        flash ? 'ring-2 ring-offset-1 ring-blue-400 scale-110' : '',
      ].join(' ')}
    >
      <span className={`rounded-full shrink-0 ${styles.dot} ${SIZE_DOT[size]}`} />
      {status}
    </span>
  );
};

export default PieceStatusBadge;
