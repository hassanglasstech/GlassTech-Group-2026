// ═══════════════════════════════════════════════════════════════════════
// WazirLauncher — Floating button that opens Wazir from anywhere
//
// Shown bottom-right on every page. Subtle but always available.
// Keyboard shortcut: Ctrl+K (or Cmd+K on Mac) opens Wazir.
// ═══════════════════════════════════════════════════════════════════════

import React, { lazy, Suspense, useEffect, useState } from 'react';

const WazirChat = lazy(() => import('./WazirChat'));

const WazirLauncher: React.FC = () => {
  const [open, setOpen] = useState(false);

  // ── Ctrl/Cmd + K to open Wazir ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <>
      {/* Floating launcher button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 via-rose-500 to-purple-600 shadow-lg shadow-rose-500/40 hover:shadow-rose-500/60 hover:scale-110 transition-all flex items-center justify-center group"
          title="Wazir — your digital shadow (Ctrl+K)"
          aria-label="Open Wazir"
        >
          <span className="text-2xl font-bold text-white">و</span>
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-900 animate-pulse"></span>

          {/* Tooltip */}
          <div className="absolute right-full mr-3 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none shadow-xl border border-slate-700">
            Wazir · Ctrl+K
          </div>
        </button>
      )}

      {/* Modal */}
      {open && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center">
              <div className="text-amber-400 text-lg">Wazir is waking up…</div>
            </div>
          }
        >
          <WazirChat onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
};

export default WazirLauncher;
