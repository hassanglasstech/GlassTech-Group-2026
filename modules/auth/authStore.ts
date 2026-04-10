import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/src/services/supabaseClient';

export type UserRole =
  | 'super_admin'
  | 'owner'
  | 'hassan'
  | 'factory_manager'
  | 'admin_officer'
  | 'glassco_supervisor'
  | 'gtk_supervisor'
  | 'gti_supervisor'
  | 'glassco_cutter'
  | 'dispatch_staff'
  | 'glassco_admin'
  | 'glassco_production'
  | 'nippon_admin'
  | 'gtk_admin';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  allowedCompanies: string[];
  allowedModules: string[];
  timeRestricted: boolean;
  /**
   * BUG-1 Fix (Phase 7): Primary active company for this user session.
   * Populated from user_profiles.company on login.
   * All service-layer .eq('company', ...) calls resolve through getActiveCompany().
   */
  company: string;
  employeeId?: string;     // linked employee record
  employeeCode?: string;   // e.g. "GTK-007" for display
}

/**
 * BUG-1 Fix: Safe, deterministic company resolver.
 *
 * Resolution priority:
 *   1. profile.company            — direct DB column (most authoritative)
 *   2. profile.allowedCompanies[0] — first entry in allowed list
 *   3. ROLE_DEFAULT_COMPANY[role]  — role-based fallback (always defined)
 *
 * Never returns an empty string for a logged-in user; callers no longer
 * silently fall back to localStorage with an empty .eq('company', '').
 *
 * @example
 *   const company = getActiveCompany(useAuthStore.getState().profile);
 */
export function getActiveCompany(profile: UserProfile | null): string {
  if (!profile) return '';
  return (
    profile.company ||
    profile.allowedCompanies?.[0] ||
    ROLE_DEFAULT_COMPANY[profile.role] ||
    ''
  );
}

export const ROLE_DEFAULT_COMPANY: Record<UserRole, string> = {
  super_admin:         'GTK',
  owner:               'GTK',
  hassan:              'GTK',
  factory_manager:     'Glassco',
  admin_officer:       'Glassco',
  glassco_supervisor:  'Glassco',
  gtk_supervisor:      'GTK',
  gti_supervisor:      'GTI',
  glassco_cutter:      'Glassco',
  dispatch_staff:      'Glassco',
  gtk_admin:           'GTK',
  glassco_admin:       'Glassco',
  glassco_production:  'Glassco',
  nippon_admin:        'Nippon',
};

// Empty array = all modules allowed
export const ROLE_MODULES: Record<UserRole, string[]> = {
  super_admin:        [],
  owner:              [],
  hassan:             [],
  factory_manager:    ['production','inventory','requisitions','factory-incharge'],
  admin_officer:      ['sales','inventory','logistics','requisitions','accounts'],
  glassco_supervisor: ['production','inventory','requisitions'],
  gtk_supervisor:     ['production','inventory','requisitions'],
  gti_supervisor:     ['production','inventory','requisitions'],
  glassco_cutter:     ['production'],
  dispatch_staff:     ['production','logistics'],
  gtk_admin:          [],
  glassco_admin:      [],
  glassco_production: ['production','inventory','logistics','requisitions'],
  nippon_admin:       ['sales','inventory','hr','accounts','requisitions'],
};

// Default route after login per role
export const ROLE_DEFAULT_ROUTE: Record<UserRole, string> = {
  super_admin:        '/',
  owner:              '/md-dashboard',
  hassan:             '/',
  factory_manager:    '/factory-incharge',
  admin_officer:      '/sales',
  glassco_supervisor: '/production',
  gtk_supervisor:     '/production',
  gti_supervisor:     '/production',
  glassco_cutter:     '/production',
  dispatch_staff:     '/logistics',
  gtk_admin:          '/',
  glassco_admin:      '/sales',
  glassco_production: '/production',
  nippon_admin:       '/sales',
};

// Role display labels
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin:        'Super Admin',
  owner:              'Owner',
  hassan:             'System Admin',
  factory_manager:    'Factory Manager',
  admin_officer:      'Admin Officer',
  glassco_supervisor: 'GlassCo Supervisor',
  gtk_supervisor:     'GTK Supervisor',
  gti_supervisor:     'GTI Supervisor',
  glassco_cutter:     'Cutter',
  dispatch_staff:     'Dispatch',
  gtk_admin:          'GTK Admin',
  glassco_admin:      'GlassCo Admin',
  glassco_production: 'Production',
  nippon_admin:       'Nippon Admin',
};

export const isOfficeHours = (): boolean => {
  const now = new Date();
  const pkt = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const day  = pkt.getUTCDay();
  const hour = pkt.getUTCHours();
  return day >= 1 && day <= 6 && hour >= 9 && hour < 18;
};

// ── Auth step tracker ─────────────────────────────────────────────────
export type AuthStep =
  | 'idle'           // not started
  | 'google'         // show Google login button
  | 'otp'            // OTP sent, waiting for code
  | 'device_choice'  // ask: biometric or remember device?
  | 'device_setup'   // registering WebAuthn
  | 'biometric'      // authenticate with device
  | 'pin'            // PIN fallback login (Phase 4)
  | 'done';          // fully authenticated

interface AuthState {
  user:         UserProfile | null;
  /**
   * BUG-1 Fix: `profile` is a mirror of `user`, kept in sync by setUser().
   * All 14+ service files call `useAuthStore.getState().profile?.company`.
   * This field was previously absent from the store definition, causing
   * every such access to silently return `undefined`.
   */
  profile:      UserProfile | null;
  authStep:     AuthStep;
  pendingEmail: string;     // email during OTP flow
  loading:      boolean;
  error:        string | null;

  setUser:         (u: UserProfile | null)  => void;
  setAuthStep:     (s: AuthStep)            => void;
  setPendingEmail: (e: string)              => void;
  setLoading:      (v: boolean)             => void;
  setError:        (e: string | null)       => void;
  signOut:         ()                       => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:         null,
      profile:      null,   // BUG-1 Fix: initialise alongside user
      authStep:     'idle',
      pendingEmail: '',
      loading:      false,
      error:        null,

      // BUG-1 Fix: setUser now keeps `profile` in perfect sync with `user`.
      // Both fields always point to the same object reference.
      setUser:         (user)         => set({ user, profile: user }),
      setAuthStep:     (authStep)     => set({ authStep }),
      setPendingEmail: (pendingEmail) => set({ pendingEmail }),
      setLoading:      (loading)      => set({ loading }),
      setError:        (error)        => set({ error }),

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, profile: null, authStep: 'idle', pendingEmail: '' });
      },
    }),
    {
      name:        'glasstech-auth',
      // BUG-1 Fix: persist profile alongside user so the company field
      // survives a page refresh without requiring a fresh DB fetch.
      partialize:  (s) => ({ user: s.user, profile: s.profile }),
    }
  )
);
