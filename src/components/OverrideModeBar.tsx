/**
 * OverrideModeBar.tsx — GRC Override Mode Banner
 *
 * Sticky banner shown when admin has override mode active.
 * ZERO imports from authStore to prevent circular dependency.
 */

import React from 'react';
import { useOverrideMode } from '@/src/hooks/useOverrideMode';
import { ShieldAlert, Power, AlertTriangle } from 'lucide-react';

const OverrideModeBar: React.FC = () => {
  const { isOverrideMode, isAdmin, toggleOverrideMode, openCount, overdueCount } = useOverrideMode();

  if (!isAdmin) return null;

  if (!isOverrideMode) {
    return (
      <div className="bg-slate-800 text-slate-400 text-center text-[10px] font-bold uppercase tracking-widest py-1 px-4 no-print flex items-center justify-center gap-3">
        <ShieldAlert size={12} />
        <span>Override Mode: OFF</span>
        <button
          onClick={toggleOverrideMode}
          className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-0.5 rounded text-[9px] font-black uppercase transition-colors"
        >
          Enable
        </button>
        {openCount > 0 && (
          <span className="bg-amber-500 text-white px-1.5 py-0.5 rounded text-[9px] font-black">
            {openCount} Open Bypass{openCount !== 1 ? 'es' : ''}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-rose-600 to-rose-500 text-white text-center text-[10px] font-black uppercase tracking-widest py-1.5 px-4 no-print flex items-center justify-center gap-3 animate-in fade-in">
      <AlertTriangle size={12} className="animate-pulse" />
      <span>Override Mode ACTIVE — All bypasses are being logged</span>
      {openCount > 0 && (
        <span className="bg-white/20 px-2 py-0.5 rounded text-[9px]">
          {openCount} Open
        </span>
      )}
      {overdueCount > 0 && (
        <span className="bg-rose-900 px-2 py-0.5 rounded text-[9px] animate-pulse">
          {overdueCount} Overdue
        </span>
      )}
      <button
        onClick={toggleOverrideMode}
        className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-[9px] font-black uppercase transition-colors flex items-center gap-1"
      >
        <Power size={10} /> Disable
      </button>
    </div>
  );
};

export default OverrideModeBar;
