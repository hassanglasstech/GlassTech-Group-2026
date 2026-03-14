import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/src/services/supabaseClient';

export type UserRole =
  | 'super_admin'
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
}

export const ROLE_DEFAULT_COMPANY: Record<UserRole, string> = {
  super_admin:        'GTK',
  gtk_admin:          'GTK',
  glassco_admin:      'Glassco',
  glassco_production: 'Glassco',
  nippon_admin:       'Nippon',
};

export const ROLE_MODULES: Record<UserRole, string[]> = {
  super_admin:        [],
  gtk_admin:          [],
  glassco_admin:      [],
  glassco_production: ['production','inventory','logistics','requisitions'],
  nippon_admin:       ['sales','inventory','hr','accounts','requisitions'],
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
  | 'done';          // fully authenticated

interface AuthState {
  user:        UserProfile | null;
  authStep:    AuthStep;
  pendingEmail: string;     // email during OTP flow
  loading:     boolean;
  error:       string | null;

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
      authStep:     'idle',
      pendingEmail: '',
      loading:      false,
      error:        null,

      setUser:         (user)         => set({ user }),
      setAuthStep:     (authStep)     => set({ authStep }),
      setPendingEmail: (pendingEmail) => set({ pendingEmail }),
      setLoading:      (loading)      => set({ loading }),
      setError:        (error)        => set({ error }),

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, authStep: 'idle', pendingEmail: '' });
      },
    }),
    {
      name:        'glasstech-auth',
      partialize:  (s) => ({ user: s.user }),
    }
  )
);
