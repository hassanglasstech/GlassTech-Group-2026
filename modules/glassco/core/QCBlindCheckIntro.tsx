/**
 * QCBlindCheckIntro.tsx — Sprint 7
 *
 * First-use tutorial banner explaining the blind-check protocol to new
 * QC inspectors. Surfaces ONLY when the user has never opened the QC
 * panel before (per-user localStorage flag); after the first dismiss
 * it never reappears unless the user clicks "Show again" in settings
 * (out of scope for Sprint 7 — the dismiss is final).
 *
 * Why blind check matters:
 *   • Cutter records their own defect assessment per piece on a
 *     defective sheet (CutterScanPanel) — but QC must NOT see it
 *     before forming an independent verdict.
 *   • If QC's verdict matches cutter's → no NCR escalation.
 *   • If they conflict (cutter said clean, QC found defect) → BOTH
 *     get an NCR-CUT-QC for performance review.
 *   • The banner makes the rule visible so QC operators don't try
 *     to "look first then decide" (which defeats the whole point).
 *
 * Usage:
 *   <QCBlindCheckIntro userId={user.id} />
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, Eye, EyeOff, Info } from 'lucide-react';

interface Props {
  userId: string | undefined;
  /** When true the banner re-shows even if already dismissed (for help links). */
  forceShow?: boolean;
  onClose?: () => void;
}

const STORAGE_KEY = (userId: string) => `gtk_erp_qc_blind_intro_seen_${userId}`;

const QCBlindCheckIntro: React.FC<Props> = ({ userId, forceShow = false, onClose }) => {
  const [show, setShow] = useState<boolean>(false);

  useEffect(() => {
    if (forceShow) { setShow(true); return; }
    if (!userId) return;
    try {
      const seen = localStorage.getItem(STORAGE_KEY(userId));
      setShow(!seen);
    } catch {
      setShow(true);
    }
  }, [userId, forceShow]);

  const dismiss = () => {
    if (userId && !forceShow) {
      try { localStorage.setItem(STORAGE_KEY(userId), '1'); } catch { /* swallow */ }
    }
    setShow(false);
    onClose?.();
  };

  if (!show) return null;

  return (
    <div className="bg-gradient-to-br from-emerald-700 to-teal-700 text-white rounded-2xl p-5 shadow-xl relative overflow-hidden">
      <div className="absolute -right-6 -top-6 opacity-10 pointer-events-none">
        <ShieldCheck size={120}/>
      </div>
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/10 text-white/80"
        aria-label="Dismiss"
      >
        <X size={16}/>
      </button>

      <div className="flex items-start gap-3 relative z-10">
        <div className="p-2 bg-white/15 rounded-xl shrink-0">
          <ShieldCheck size={20}/>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100">First-time QC orientation</p>
          <h3 className="text-base font-black mt-0.5">Blind Check — Why &amp; How</h3>

          <p className="text-xs font-bold text-emerald-50 mt-2 leading-relaxed">
            Cutter ne agar koi defective sheet scan ki hai, to us ne har piece ke
            liye apni assessment bhi record ki hai (Yes/No defect). <strong className="text-white">Aap us assessment ko
            apna decision submit karne se PEHLE nahi dekh sakte.</strong> Yeh hi blind-check ka
            asal point hai — taake QC ka decision independent rahe.
          </p>

          <div className="grid sm:grid-cols-3 gap-2 mt-3">
            <div className="bg-white/10 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-200 mb-1"><EyeOff size={11}/>Hidden until submit</div>
              <p className="text-[11px] font-bold text-white leading-snug">Cutter assessment locked until your Pass/Fail submitted.</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-200 mb-1"><Eye size={11}/>10% mandatory</div>
              <p className="text-[11px] font-bold text-white leading-snug">System randomly flags 10% pieces — these MUST be checked.</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-200 mb-1"><Info size={11}/>Conflict = NCR</div>
              <p className="text-[11px] font-bold text-white leading-snug">If cutter said clean &amp; you find defect → NCR for both.</p>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              onClick={dismiss}
              className="bg-white text-emerald-700 px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-emerald-50"
            >
              Got it — start QC
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QCBlindCheckIntro;
