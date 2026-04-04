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
  Loader2, AlertCircle, CheckCircle2, Clock, Key, LogIn
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
    console.log('[Auth] fetchProfile:', { userId, data, error });

    if (error) {
      console.error('[Auth] Profile fetch error:', error);
      // If RLS blocks it, try without filter (will get own row due to RLS)
      const { data: data2, error: err2 } = await supabase
        .from('user_profiles')
        .select('*')
        .maybeSingle();
      if (err2 || !data2) return null;
      if (!data2.is_active) return null;
      return {
        id:               data2.id,
        email:            data2.email,
        fullName:         data2.full_name,
        role:             data2.role as UserRole,
        allowedCompanies: data2.allowed_companies || [],
        allowedModules:   data2.allowed_modules   || [],
        timeRestricted:   data2.time_restricted   || false,
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

    return {
      id:               data.id,
      email:            data.email,
      fullName:         data.full_name,
      role:             data.role as UserRole,
      allowedCompanies: data.allowed_companies || [],
      allowedModules:   data.allowed_modules   || [],
      timeRestricted:   data.time_restricted   || false,
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

  // ── STEP: Google OAuth ───────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setBusy(true);
    setError('');
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/',
        queryParams: { prompt: 'select_account' },
      },
    });
    if (oauthErr) {
      setError('Google sign-in failed. Try again.');
      setBusy(false);
    }
    // If successful, Supabase redirects back — useEffect below handles it
  };

  // ── Handle OAuth redirect callback ──────────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await handlePostAuth(session.user.id, session.user.email || '');
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // ── After Google auth: check profile + time + send OTP ──────────────
  const handlePostAuth = async (userId: string, email: string) => {
    setBusy(true);
    setError('');

    // 1. Check profile exists and is active
    const profile = await fetchProfile(userId, email);
    if (!profile) {
      // Check if table exists and profile issue
      const { data: check } = await supabase.from('user_profiles').select('count').single();
      console.log('[Auth] Profile table check:', check);
      setError('Access not configured yet. Please contact Hassan (Admin) to get access.');
      await supabase.auth.signOut();
      setBusy(false);
      setStep('google');
      return;
    }

    // 2. Time restriction check
    if (profile.timeRestricted && !isOfficeHours()) {
      setError('Access restricted to office hours (Mon–Sat 9am–6pm PKT).');
      await supabase.auth.signOut();
      setBusy(false);
      setStep('google');
      return;
    }

    // Skip OTP — Google auth is sufficient verification
    // Go directly to device setup
    if (!hasDeviceRegistered() && !hasRememberToken()) {
      setStep('device_choice');
      sessionStorage.setItem('_pending_profile', JSON.stringify(profile));
    } else {
      setStep('biometric');
      sessionStorage.setItem('_pending_profile', JSON.stringify(profile));
    }
    setBusy(false);
  };

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
      setError('Profile not found. Contact admin.');
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
      // Store profile temporarily for after device setup
      sessionStorage.setItem('_pending_profile', JSON.stringify(profile));
    } else {
      // Already registered → go to biometric
      setStep('biometric');
      sessionStorage.setItem('_pending_profile', JSON.stringify(profile));
    }

    setBusy(false);
  };

  // ── STEP: Device choice ──────────────────────────────────────────────
  const handleSetupBiometric = async () => {
    setBusy(true);
    const profileStr = sessionStorage.getItem('_pending_profile');
    if (!profileStr) { setBusy(false); setError('Session lost. Please sign in again.'); setStep('google'); return; }
    try {
      const profile: UserProfile = JSON.parse(profileStr);
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
    const profileStr = sessionStorage.getItem('_pending_profile');
    if (!profileStr) { setError('Session lost. Please sign in again.'); setStep('google'); return; }
    try {
      const profile: UserProfile = JSON.parse(profileStr);
      saveRememberToken(profile.id);
      await completeLogin(profile);
    } catch (err) {
      console.error('handleRememberDevice error:', err);
      setError('Something went wrong. Please sign in again.');
      setStep('google');
    }
  };

  const handleSkipDevice = async () => {
    const profileStr = sessionStorage.getItem('_pending_profile');
    if (!profileStr) { setError('Session lost. Please sign in again.'); setStep('google'); return; }
    try {
      await completeLogin(JSON.parse(profileStr));
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
      sessionStorage.removeItem('_pending_profile');
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

        {/* ── STEP: Google Login ─────────────────────────────────────── */}
        {step === 'google' && (
          <Card>
            <div className="space-y-5">
              <div>
                <p className="text-white font-black text-base">Sign In</p>
                <p className="text-slate-400 text-xs mt-1">Use your company Google account</p>
              </div>
              {error && <ErrBox msg={error} />}
              <button onClick={handleGoogleLogin} disabled={busy}
                className="w-full flex items-center justify-center space-x-3 bg-white hover:bg-slate-100 text-slate-800 font-bold py-3 rounded-xl transition-all shadow-lg disabled:opacity-50">
                {busy ? <Loader2 size={18} className="animate-spin" /> : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 48 48">
                      <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-4z"/>
                      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.7-2.9-11.9-7.2l-6.6 5.1C9.5 39.6 16.3 44 24 44z"/>
                      <path fill="#1565C0" d="M43.6 20H24v8h11.3c-1 2.7-2.8 4.9-5.1 6.4l6.2 5.2C40.1 36.1 44 30.5 44 24c0-1.3-.1-2.7-.4-4z"/>
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>
              <p className="text-center text-[10px] text-slate-600">Internal use only — unauthorized access prohibited</p>
            </div>
          </Card>
        )}

        {/* ── STEP: OTP ─────────────────────────────────────────────── */}
        {step === 'otp' && (
          <Card>
            <div className="space-y-5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
                  <Mail size={18} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-black text-sm">Check Your Email</p>
                  <p className="text-slate-400 text-xs mt-0.5">OTP sent to <span className="text-blue-400">{pendingEmail}</span></p>
                </div>
              </div>
              {error && <ErrBox msg={error} />}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">6-Digit OTP</label>
                <input
                  type="text" inputMode="numeric" maxLength={6}
                  value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                  placeholder="000000"
                  className="w-full bg-[#0f1923] border border-white/10 rounded-xl py-3 px-4 text-2xl text-white text-center font-black tracking-[0.5em] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
                  autoFocus
                />
              </div>
              <button onClick={handleVerifyOtp} disabled={busy || otp.length < 6}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/30 text-white font-black uppercase tracking-widest py-3 rounded-xl transition-all flex items-center justify-center space-x-2">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <><Key size={15}/><span>Verify OTP</span></>}
              </button>
              <button onClick={() => { setStep('google'); setOtp(''); setError(''); }}
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
              <button onClick={() => { clearDeviceAuth(); setStep('google'); setError(''); }}
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
