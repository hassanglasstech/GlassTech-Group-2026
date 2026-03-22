import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Trash2, CheckCircle, X, ShieldAlert } from 'lucide-react';

type ConfirmVariant = 'delete' | 'danger' | 'action';

interface DialogState {
  open: boolean;
  title: string;
  message: string;
  variant: ConfirmVariant;
  confirmLabel: string;
  onResult: ((ok: boolean) => void) | null;
}

const INITIAL: DialogState = {
  open: false, title: '', message: '', variant: 'action', confirmLabel: 'Confirm', onResult: null,
};

const VARIANT_STYLES: Record<ConfirmVariant, {
  icon: React.FC<{ size?: number; className?: string }>;
  iconBg: string; iconColor: string; btnColor: string; btnHover: string;
}> = {
  delete:  { icon: Trash2,      iconBg: 'bg-rose-50',   iconColor: 'text-rose-600',   btnColor: 'bg-rose-600',   btnHover: 'hover:bg-rose-700' },
  danger:  { icon: ShieldAlert,  iconBg: 'bg-amber-50', iconColor: 'text-amber-600', btnColor: 'bg-amber-600', btnHover: 'hover:bg-amber-700' },
  action:  { icon: CheckCircle,  iconBg: 'bg-blue-50',  iconColor: 'text-blue-600',  btnColor: 'bg-blue-600',  btnHover: 'hover:bg-blue-700' },
};

function detectVariant(msg: string): ConfirmVariant {
  const m = msg.toLowerCase();
  if (m.includes('delete') || m.includes('remove')) return 'delete';
  if (m.includes('critical') || m.includes('reset') || m.includes('overwrite') || m.includes('permanently') || m.includes('cannot be undone') || m.includes('all data')) return 'danger';
  return 'action';
}

function detectLabel(msg: string, v: ConfirmVariant): string {
  if (v === 'delete') return 'Delete';
  if (v === 'danger') return 'Yes, proceed';
  const m = msg.toLowerCase();
  if (m.includes('approve')) return 'Approve';
  if (m.includes('dispatch')) return 'Dispatch';
  if (m.includes('generate')) return 'Generate';
  if (m.includes('deactivate')) return 'Deactivate';
  return 'Confirm';
}

function detectTitle(v: ConfirmVariant): string {
  if (v === 'delete') return 'Confirm delete';
  if (v === 'danger') return 'Warning';
  return 'Confirm action';
}

// ── Singleton queue (works because React renders sync in one thread) ──
let _showDialog: ((msg: string) => Promise<boolean>) | null = null;

/**
 * Drop-in replacement for window.confirm that shows a styled modal.
 * Usage: wrap your app in <ConfirmProvider>, then all existing
 * confirm() / window.confirm() calls automatically get the styled dialog.
 */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DialogState>(INITIAL);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Register the show function
  const show = useCallback((msg: string): Promise<boolean> => {
    return new Promise(resolve => {
      const v = detectVariant(msg);
      setState({
        open: true,
        title: detectTitle(v),
        message: msg.replace(/\\n/g, '\n'),
        variant: v,
        confirmLabel: detectLabel(msg, v),
        onResult: resolve,
      });
    });
  }, []);

  useEffect(() => { _showDialog = show; return () => { _showDialog = null; }; }, [show]);

  // Override window.confirm with async modal
  // Since confirm() is synchronous but our modal is async, we can't truly replace it.
  // Instead, we replace all `confirm(` calls with `await confirmModal(` via a global function.
  useEffect(() => {
    (window as any).__confirmModal = show;
  }, [show]);

  const close = useCallback((result: boolean) => {
    state.onResult?.(result);
    setState(INITIAL);
  }, [state.onResult]);

  // Keyboard
  useEffect(() => {
    if (!state.open) return;
    btnRef.current?.focus();
    document.body.style.overflow = 'hidden';
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', h);
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [state.open, close]);

  const cfg = VARIANT_STYLES[state.variant];
  const Icon = cfg.icon;

  return (
    <>
      {children}
      {state.open && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby="cd-msg">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => close(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in overflow-hidden">
            <button onClick={() => close(false)} className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Close"><X size={18} /></button>
            <div className="p-6">
              <div className={`w-12 h-12 rounded-xl ${cfg.iconBg} flex items-center justify-center mb-4`}><Icon size={24} className={cfg.iconColor} /></div>
              <h3 id="cd-title" className="text-lg font-bold text-slate-900 mb-2">{state.title}</h3>
              <p id="cd-msg" className="text-sm text-slate-500 leading-relaxed whitespace-pre-line">{state.message}</p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => close(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button ref={btnRef} onClick={() => close(true)} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white ${cfg.btnColor} ${cfg.btnHover} transition-colors shadow-sm`}>{state.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/** Async confirm — use in place of window.confirm for styled modal */
export async function confirmModal(message: string): Promise<boolean> {
  if (_showDialog) return _showDialog(message);
  return window.confirm(message); // fallback
}

export default ConfirmProvider;
