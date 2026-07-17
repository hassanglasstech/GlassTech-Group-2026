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
  | 'gtk_admin'
  | 'customer';         // external Nippon customer — self-service portal only

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  allowedCompanies: string[];
  allowedModules: string[];
  timeRestricted: boolean;
  /**
   * Primary company for this user session, synthesised at login from the DB row
   * (or ROLE_DEFAULT_COMPANY when there is no `company` column). NOTE: this is a
   * pre-bootstrap fallback ONLY — the authoritative company at runtime is the
   * sidebar switcher (appStore.selectedCompany). Service reads resolve company
   * via modules/shared/utils/activeCompany.ts, which prefers the switcher.
   */
  company: string;
  employeeId?: string;     // linked employee record
  employeeCode?: string;   // e.g. "GTK-007" for display
}

// NOTE: the old getActiveCompany(profile) resolver was removed (2026-07-12).
// It ignored the sidebar switcher (appStore.selectedCompany) and led with the
// phantom profile.company, so it resolved to the WRONG company in the
// multitenant app. Service reads now use the canonical resolver in
// modules/shared/utils/activeCompany.ts (prefers the switcher). Do not re-add.

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
  customer:            'Nippon',
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
  customer:           ['customer-portal'],
};

// Default route after login per role
// Sprint 18: production roles land on their dedicated mini-app instead
// of the shared module page.
export const ROLE_DEFAULT_ROUTE: Record<UserRole, string> = {
  super_admin:        '/',
  owner:              '/md-dashboard',
  hassan:             '/',
  factory_manager:    '/factory-incharge',
  admin_officer:      '/finance/inbox',         // Sprint 25 — accountants land on inbox
  glassco_supervisor: '/production/workbench',     // Sprint 18 supervisor mini-app
  gtk_supervisor:     '/production/workbench',
  gti_supervisor:     '/production/workbench',
  glassco_cutter:     '/cutter',                   // Sprint 6 mini-app
  dispatch_staff:     '/dispatch',                 // Sprint 18 dispatch mini-app
  gtk_admin:          '/',
  glassco_admin:      '/sales',
  glassco_production: '/production/workbench',
  nippon_admin:       '/sales',
  customer:           '/customer-portal',      // external customer → straight to the portal
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
  customer:           'Customer',
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
  | 'set_pin'        // set a device PIN after first login
  | 'set_password'   // set your own account password after first OTP login
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
