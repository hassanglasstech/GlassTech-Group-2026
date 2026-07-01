import React, { useState } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

/**
 * User-facing self-service "Change Password" page.
 *
 * - Visible to any logged-in user (no super-admin guard).
 * - Calls supabase.auth.updateUser({ password }) which goes through the
 *   user's own JWT — admins never see the new value.
 * - Requires the user to enter the new password TWICE to catch typos.
 * - 6-char minimum (Supabase Auth default). We additionally nudge to 8+.
 *
 * Wired in App.tsx as /#/change-password.
 */
export default function ChangePasswordPage() {
  const { user } = useAuthStore();
  const [newPw,        setNewPw]        = useState('');
  const [confirmPw,    setConfirmPw]    = useState('');
  const [showNew,      setShowNew]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [busy,         setBusy]         = useState(false);
  const [done,         setDone]         = useState(false);

  const handleSubmit = async () => {
    if (newPw.length < 8) {
      toast.error('Password kam se kam 8 chars ka hona chahiye');
      return;
    }
    if (newPw !== confirmPw) {
      toast.error('Dono passwords match nahi karte');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      Logger.action('Auth', 'CHANGE_PASSWORD', `Password changed by ${user?.email}`);
      try {
        await supabase.from('access_logs').insert({
          user_id: user?.id,
          email:   user?.email,
          action:  'change_password_self',
          user_agent: navigator.userAgent,
        });
      } catch { /* table may not exist */ }
      setDone(true);
      toast.success('Password update ho gaya');
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      toast.error(`Failed: ${err?.message || err}`);
    }
    setBusy(false);
  };

  return (
    <div className="max-w-md mx-auto py-10 px-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Lock size={18} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-800 tracking-tight">Change Password</h2>
            <p className="text-[11px] text-slate-500">{user?.email}</p>
          </div>
        </div>

        {done && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-800">
              Password update ho gaya. Aage se naye password se login karen.
            </div>
          </div>
        )}

        {/* New password */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
            New Password
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="Naya password (min 8 chars)"
              className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
              autoFocus
            />
            <button type="button" onClick={() => setShowNew(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700">
              {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
            Confirm New Password
          </label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Wahi password dobara"
              className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
            <button type="button" onClick={() => setShowConfirm(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700">
              {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {confirmPw && newPw !== confirmPw && (
            <div className="flex items-center gap-1.5 text-[10px] text-rose-600 font-bold">
              <AlertCircle size={11} /> Passwords match nahi karte
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-[11px] text-amber-800">
          <p className="font-bold mb-1">⚠ Yeh password sirf aap ke paas hai</p>
          <p>Admin (Hassan) aap ka password dekh nahi sakte. Agar aap bhul gaye to admin se reset karwana parega.</p>
        </div>

        <button onClick={handleSubmit} disabled={busy || newPw.length < 8 || newPw !== confirmPw}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-sm">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
          {busy ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </div>
  );
}
