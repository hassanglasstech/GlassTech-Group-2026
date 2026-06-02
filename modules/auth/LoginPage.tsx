import { Logger } from '@/modules/shared/services/logger';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import {
  useAuthStore, isOfficeHours, ROLE_DEFAULT_COMPANY,
  UserProfile, UserRole, AuthStep
} from './authStore';
import {
  registerDevice, authenticateDevice,
  isPlatformAuthenticatorAvailable,
  saveRememberToken, checkRememberToken,
  hasDeviceRegistered, hasRememberToken, clearDeviceAuth,
} from './useWebAuthn';
import {
  Mail, Shield, Fingerprint, Smartphone,
  Loader2, AlertCircle, CheckCircle2, Clock, Key, LogIn,
  Eye, EyeOff,
} from 'lucide-react';

// ── Fetch user profile from DB ────────────────────────────────────────
const fetchProfile = async (userId: string, email?: string): Promise<UserProfile | null> => {
  try {
    // Try by UUID first, then fallback to email match
    let { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    // If not found by UUID, try by email (handles localStorage-persisted sessions)
    if (!data && !error && email) {
      const { data: data2, error: err2 } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      if (!err2 && data2) { data = data2; }
    }

    // Log for debugging
    Logger.info('Auth', JSON.stringify({ userId, data, error }));

    if (error) {
      console.error('[Auth] Profile fetch error:', error);
      // If RLS blocks it, try without filter (will get own row due to RLS)
      const { data: data2, error: err2 } = await supabase
        .from('user_profiles')
        .select('*')
        .maybeSingle();
      if (err2 || !data2) return null;
      if (!data2.is_active) return null;
      // BUG-1 Fix: populate company from DB row; fall back to role default
      // so getActiveCompany() never resolves to an empty string.
      const role2 = data2.role as UserRole;
      return {
        id:               data2.id,
        email:            data2.email,
        fullName:         data2.full_name,
        role:             role2,
        allowedCompanies: data2.allowed_companies || [],
        allowedModules:   data2.allowed_modules   || [],
        timeRestricted:   data2.time_restricted   || false,
        company:          data2.company || ROLE_DEFAULT_COMPANY[role2] || '',
      };
    }

    if (!data) {
      console.warn('[Auth] No profile found for:', userId);
      return null;
    }
    if (!data.is_active) {
      console.warn('[Auth] Profile inactive for:', userId);
      return null;
    }

    // BUG-1 Fix: populate company from DB row; fall back to role default
    // so getActiveCompany() never resolves to an empty string.
    const role = data.role as UserRole;
    return {
      id:               data.id,
      email:            data.email,
      fullName:         data.full_name,
      role:             role,
      allowedCompanies: data.allowed_companies || [],
      allowedModules:   data.allowed_modules   || [],
      timeRestricted:   data.time_restricted   || false,
      company:          data.company || ROLE_DEFAULT_COMPANY[role] || '',
    };
  } catch (err) {
    console.error('[Auth] fetchProfile exception:', err);
    return null;
  }
};

// ── Card wrapper ──────────────────────────────────────────────────────
const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-[#1a2535] border border-white/10 rounded-2xl p-8 shadow-2xl w-full max-w-sm">
    {children}
  </div>
);

const ErrBox: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="flex items-start space-x-2 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
    <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
    <p className="text-xs text-rose-300">{msg}</p>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════
const LoginPage: React.FC = () => {
  const { setUser, setAuthStep, authStep, setPendingEmail, pendingEmail } = useAuthStore();

  const [otp,        setOtp]        = useState('');
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState('');
  const [hasBiometric, setHasBiometric] = useState(false);
  const [step,       setStep]       = useState<AuthStep>('idle');

  // ── On mount: check if device is already remembered ─────────────────
  useEffect(() => {
    const tryAutoLogin = async () => {
      // Check if this is a magic link redirect (Supabase adds access_token & type=magiclink to URL)
      const hash = window.location.hash;
      const isMagicLinkRedirect = hash.includes('access_token') && hash.includes('type=magiclink');

      // If magic link redirect, don't set step here — let onAuthStateChange handle it
      if (isMagicLinkRedirect) {
        setStep('idle'); // show loading while auth processes
        return;
      }

      // 1. Try WebAuthn registered device
      if (hasDeviceRegistered()) {
        setStep('biometric');
        return;
      }
      // 2. Try remember-device token
      const { valid } = checkRememberToken();
      if (valid) {
        setStep('biometric'); // reuse same screen, will use token
        return;
      }
      // 3. Fresh login
      setStep('google');
    };

    // Check biometric availability
    isPlatformAuthenticatorAvailable().then(setHasBiometric);
    tryAutoLogin();
  }, []);

  // ── STEP: Email OTP — send magic link ──────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSendOtp = async () => {
    if (!email.includes('@')) return setError('Valid email daalo.');
    setBusy(true);
    setError('');
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + '/',
      },
    });
    if (otpErr) {
      setError('Magic link nahi bheja. Email check karo ya admin se raabt karo.');
      setBusy(false);
      return;
    }
    setPendingEmail(email.toLowerCase().trim());
    setError('');
    setStep('otp');
    setBusy(false);
  };

  // ── Email + Password sign-in (primary flow for invited users) ──────
  // Admin creates the user with a password (UserAccessManager.handleInviteByEmail),
  // shares it via WhatsApp / SMS, user types email + password here. No magic
  // link, no email round-trip — just works.
  const handlePasswordLogin = async () => {
    if (!email.includes('@')) return setError('Valid email daalo.');
    if (!password || password.length < 6) return setError('Password chahiye (kam se kam 6 chars).');
    setBusy(true);
    setError('');
    const { data, error: signErr } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });
    if (signErr || !data?.user) {
      setError('Email ya password galat hai. Admin se confirm karen.');
      setBusy(false);
      return;
    }
    // onAuthStateChange will fire SIGNED_IN and drive the rest of the flow
    // (fetchProfile → device choice → biometric). Just clear errors here.
    setPendingEmail(email.toLowerCase().trim());
    setBusy(false);
  };

  // ── Handle magic link redirect from email ────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const profile = await fetchProfile(session.user.id, session.user.email || '');

          // SECURITY FIX (BUG-4): NEVER auto-create a profile here. If a user
          // can authenticate but no profile row exists, that means the admin
          // hasn't granted them ERP access yet. Sign them out immediately —
          // otherwise anyone with Supabase Auth access becomes a viewer.
          //
          // Admin grants access via Admin → Users → Invite User (which both
          // sends the magic-link invite AND creates the user_profiles row).

          if (profile) {
            if (profile.timeRestricted && !isOfficeHours()) {
              setError('Access restricted to office hours (Mon–Sat 9am–6pm PKT).');
              await supabase.auth.signOut();
              setBusy(false);
              setStep('google');
              return;
            }
            // If this is magic link login (coming from email), skip device setup and log in directly
            // The onAuthStateChange listener indicates we're authenticated, so trust it
            if (!hasDeviceRegistered() && !hasRememberToken()) {
              // First-time device: go through device choice
              setStep('device_choice');
            } else {
              // Already has device setup: log in directly
              setStep('biometric');
            }
          } else {
            // No profile = no ERP access. Sign them out of Supabase Auth so
            // they can't get stuck in a "logged-in-but-blank-screen" state.
            await supabase.auth.signOut();
            setError('Aapko abhi tak ERP access nahi mila. Admin se Users → Invite karwayen.');
            setStep('google');
          }
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // ── STEP: Verify OTP ─────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    if (otp.length < 6) return setError('Enter 6-digit OTP.');
    setBusy(true);
    setError('');

    const { data, error: verifyErr } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: otp,
      type:  'email',
    });

    if (verifyErr || !data.user) {
      setError('Invalid or expired OTP. Try again.');
      setBusy(false);
      return;
    }

    // OTP verified — now fetch full profile and decide device setup
    const profile = await fetchProfile(data.user.id, data.user.email || '');
    if (!profile) {
      // SECURITY (BUG-4): sign out so they're not stuck in a half-authed state.
      await supabase.auth.signOut();
      setError('Aapko abhi tak ERP access nahi mila. Admin se Users → Invite karwayen.');
      setStep('google');
      setBusy(false);
      return;
    }

    // Log login
    await supabase.from('access_logs').insert({
      user_id: data.user.id, email: pendingEmail,
      action: 'login', user_agent: navigator.userAgent,
    });

    // If device not registered yet → ask for device setup
    if (!hasDeviceRegistered() && !hasRememberToken()) {
      setStep('device_choice');
    } else {
      // Already registered → go to biometric
      setStep('biometric');
    }

    setBusy(false);
  };

  // ── Resolve profile from live Supabase session (no sessionStorage) ──
  const resolveSessionProfile = async (): Promise<UserProfile | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    return fetchProfile(session.user.id, session.user.email || '');
  };

  // ── STEP: Device choice ──────────────────────────────────────────────
  const handleSetupBiometric = async () => {
    setBusy(true);
    try {
      const profile = await resolveSessionProfile();
      if (!profile) { setError('Session expired. Please sign in again.'); setStep('google'); setBusy(false); return; }
      const ok = await registerDevice(profile.id, profile.email);
      if (!ok) saveRememberToken(profile.id);
      await completeLogin(profile);
    } catch (err) {
      console.error('handleSetupBiometric error:', err);
      setError('Setup failed. Please sign in again.');
      setStep('google');
    }
    setBusy(false);
  };

  const handleRememberDevice = async () => {
    try {
      const profile = await resolveSessionProfile();
      if (!profile) { setError('Session expired. Please sign in again.'); setStep('google'); return; }
      saveRememberToken(profile.id);
      await completeLogin(profile);
    } catch (err) {
      console.error('handleRememberDevice error:', err);
      setError('Something went wrong. Please sign in again.');
      setStep('google');
    }
  };

  const handleSkipDevice = async () => {
    try {
      const profile = await resolveSessionProfile();
      if (!profile) { setError('Session expired. Please sign in again.'); setStep('google'); return; }
      await completeLogin(profile);
    } catch (err) {
      setError('Something went wrong. Please sign in again.');
      setStep('google');
    }
  };

  // ── STEP: Biometric login (returning user) ───────────────────────────
  const handleBiometricLogin = async () => {
    setBusy(true);
    setError('');

    // Try WebAuthn first
    if (hasDeviceRegistered()) {
      const { success, userId } = await authenticateDevice();
      if (success && userId) {
        // Re-authenticate with Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const profile = await fetchProfile(session.user.id, session.user.email || '');
          if (profile) {
            if (profile.timeRestricted && !isOfficeHours()) {
              setError('Access restricted to office hours (Mon–Sat 9am–6pm PKT).');
              clearDeviceAuth();
              setBusy(false);
              setStep('google');
              return;
            }
            completeLogin(profile);
            setBusy(false);
            return;
          }
        }
        // Session expired — need Google login again
        setError('Session expired. Please sign in with Google.');
        clearDeviceAuth();
        setStep('google');
        setBusy(false);
        return;
      }
      setError('Biometric failed. Please sign in with Google.');
      clearDeviceAuth();
      setStep('google');
      setBusy(false);
      return;
    }

    // Fallback: remember token
    const { valid } = checkRememberToken();
    if (valid) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.email || '');
        if (profile) {
          if (profile.timeRestricted && !isOfficeHours()) {
            setError('Access restricted to office hours.');
            clearDeviceAuth();
            setStep('google');
            setBusy(false);
            return;
          }
          completeLogin(profile);
          setBusy(false);
          return;
        }
      }
    }

    // Token expired or invalid
    setError('Session expired. Please sign in again.');
    clearDeviceAuth();
    setStep('google');
    setBusy(false);
  };

  const completeLogin = async (profile: UserProfile) => {
    try {
      await supabase.from('user_profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', profile.id)
        .then(() => {});
      setUser(profile);
      // Warm localStorage cache from Supabase in background
      import('./../../modules/sales/services/salesService').then(({ SalesService }) => {
        SalesService.warmCache().catch(() => {});
      });
    } catch (err) {
      console.error('completeLogin error:', err);
      setUser(profile);
    }
  };

  // ════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#0f1923] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex flex-col items-center space-y-6 w-full max-w-sm">

        {/* Logo */}
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/10">
            <Shield size={32} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Glasstech ERP</h1>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">2026 — Secure Access Portal</p>
        </div>

        {/* ── STEP: Email Login ─────────────────────────────────────── */}
        {step === 'google' && (
          <Card>
            <div className="space-y-5">
              <div>
                <p className="text-white font-black text-base">Sign In</p>
                <p className="text-slate-400 text-xs mt-1">Email + Password se login — admin ne aap ko jo credentials diye hain</p>
              </div>
              {error && <ErrBox msg={error} />}

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (password ? handlePasswordLogin() : handleSendOtp())}
                  placeholder="email@example.com"
                  className="w-full bg-[#0f1923] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
                  autoFocus
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePasswordLogin()}
                    placeholder="Aap ka password"
                    className="w-full bg-[#0f1923] border border-white/10 rounded-xl py-3 px-4 pr-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Primary: password sign-in */}
              <button onClick={handlePasswordLogin} disabled={busy || !email.includes('@') || password.length < 6}
                className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/30 text-white font-black uppercase tracking-widest py-3 rounded-xl transition-all shadow-lg">
                {busy ? <Loader2 size={18} className="animate-spin" /> : (
                  <><LogIn size={16} /><span>Sign In</span></>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <p className="text-[9px] uppercase tracking-widest text-slate-600">OR</p>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Fallback: OTP via email (kept for users without password) */}
              <button onClick={handleSendOtp} disabled={busy || !email.includes('@')}
                className="w-full flex items-center justify-center space-x-2 bg-transparent hover:bg-white/5 border border-white/10 text-slate-300 text-xs font-bold uppercase tracking-widest py-2.5 rounded-xl transition-all">
                {busy ? <Loader2 size={14} className="animate-spin" /> : (
                  <><Mail size={13} /><span>Send 6-digit OTP instead</span></>
                )}
              </button>

              <p className="text-center text-[10px] text-slate-600">Internal use only — unauthorized access prohibited</p>
            </div>
          </Card>
        )}

        {/* ── STEP: OTP — Magic Link / 6-digit code ────────────────── */}
        {step === 'otp' && (
          <Card>
            <div className="space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <Mail size={28} className="text-blue-400" />
                </div>
                <p className="text-white font-black text-base">Check Your Email</p>
                <p className="text-slate-400 text-xs mt-2">
                  Code bhej di. <span className="text-blue-400 font-semibold">{pendingEmail}</span> check karo.
                </p>
              </div>
              {error && <ErrBox msg={error} />}

              {/* 6-digit code entry */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">6-Digit Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                  placeholder="123456"
                  className="w-full bg-[#0f1923] border border-white/10 rounded-xl py-3 px-4 text-white text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
                  autoFocus
                />
              </div>

              <button onClick={handleVerifyOtp} disabled={busy || otp.length !== 6}
                className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/30 text-white font-black uppercase tracking-widest py-3 rounded-xl transition-all shadow-lg">
                {busy ? <Loader2 size={18} className="animate-spin" /> : (
                  <><CheckCircle2 size={16} /><span>Verify & Sign In</span></>
                )}
              </button>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-[11px] text-slate-400">
                <p>📧 Email me code aaya hoga. <strong className="text-blue-300">Link click karne ki zarurat nahi</strong> — bas 6-digit code yahan daalo.</p>
                <p className="mt-1">Agar code visible nahi to email template me <code className="text-blue-300">{'{{ .Token }}'}</code> add karen.</p>
              </div>

              <p className="text-center text-[11px] text-slate-500">
                Code 1 ghantay mein expire ho jayega
              </p>
              <button onClick={() => { setStep('google'); setError(''); setOtp(''); }}
                className="w-full text-slate-500 hover:text-slate-300 text-xs font-bold uppercase transition-colors">
                ← Back
              </button>
            </div>
          </Card>
        )}

        {/* ── STEP: Device setup choice ─────────────────────────────── */}
        {step === 'device_choice' && (
          <Card>
            <div className="space-y-5">
              <div className="text-center">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={24} className="text-emerald-400" />
                </div>
                <p className="text-white font-black text-base">Identity Verified</p>
                <p className="text-slate-400 text-xs mt-1">Set up quick access for this device</p>
              </div>
              {error && <ErrBox msg={error} />}

              {/* Biometric option */}
              {hasBiometric && (
                <button onClick={handleSetupBiometric} disabled={busy}
                  className="w-full flex items-center space-x-4 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-xl p-4 transition-all text-left">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
                    <Fingerprint size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-black text-sm">Fingerprint / Face ID / PIN</p>
                    <p className="text-slate-400 text-[11px] mt-0.5">Use device biometrics — most secure</p>
                  </div>
                </button>
              )}

              {/* Remember device option */}
              <button onClick={handleRememberDevice} disabled={busy}
                className="w-full flex items-center space-x-4 bg-slate-700/50 hover:bg-slate-700 border border-white/10 rounded-xl p-4 transition-all text-left">
                <div className="w-10 h-10 bg-slate-600 rounded-lg flex items-center justify-center shrink-0">
                  <Smartphone size={20} className="text-slate-300" />
                </div>
                <div>
                  <p className="text-white font-black text-sm">Remember This Device</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">Stay logged in for 30 days</p>
                </div>
              </button>

              {/* Skip */}
              <button onClick={handleSkipDevice}
                className="w-full text-slate-500 hover:text-slate-300 text-xs font-bold uppercase transition-colors py-1">
                Skip — Ask Every Time
              </button>
            </div>
          </Card>
        )}

        {/* ── STEP: Biometric login (returning device) ─────────────── */}
        {step === 'biometric' && (
          <Card>
            <div className="space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-500/10 border-2 border-blue-500/30 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <Fingerprint size={32} className="text-blue-400" />
                </div>
                <p className="text-white font-black text-base">
                  {hasDeviceRegistered() ? 'Use Biometric / PIN' : 'Tap to Sign In'}
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  {hasDeviceRegistered()
                    ? 'Authenticate with your device'
                    : 'Your device is remembered for 30 days'}
                </p>
              </div>
              {error && <ErrBox msg={error} />}
              <button onClick={handleBiometricLogin} disabled={busy}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest py-3.5 rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/20">
                {busy
                  ? <Loader2 size={18} className="animate-spin" />
                  : <><Fingerprint size={18} /><span>{hasDeviceRegistered() ? 'Authenticate' : 'Continue'}</span></>
                }
              </button>
              <button onClick={() => { clearDeviceAuth(); setStep('google'); setError(''); setEmail(''); }}
                className="w-full text-slate-500 hover:text-slate-300 text-xs font-bold uppercase transition-colors">
                Sign in with different account
              </button>
            </div>
          </Card>
        )}

        {/* Loading */}
        {step === 'idle' && (
          <div className="flex items-center space-x-3 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-medium">Checking session...</span>
          </div>
        )}

        <p className="text-[10px] text-slate-700 font-bold uppercase tracking-widest">
          Glasstech Group © 2026
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
