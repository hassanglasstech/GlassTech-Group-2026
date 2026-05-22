/**
 * Admin Auth Service
 *
 * All admin auth operations go through the manage-users Edge Function.
 * The service role key stays server-side — never in the browser.
 *
 * Setup:
 *   - Set VITE_USE_EDGE_FUNCTIONS=true in .env
 *   - Deploy supabase/functions/manage-users
 */

import { supabase } from '@/src/services/supabaseClient';

// ── Edge Function caller ────────────────────────────────────────────
const callEdgeFunction = async (action: string, params: Record<string, any> = {}): Promise<any> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('manage-users', {
    body: { action, ...params },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};

// ── Admin Auth Service ──────────────────────────────────────────────
export const AdminAuthService = {

  /** Admin operations require the manage-users Edge Function */
  isConfigured: (): boolean => true,

  getMode: (): 'edge_function' => 'edge_function',

  /** Create a new Supabase auth user (with password — for PIN fallback users) */
  createUser: async (opts: {
    email: string;
    password?: string;
    userMetadata?: Record<string, any>;
  }): Promise<{ userId: string; email: string }> => {
    const result = await callEdgeFunction('create_user', {
      email: opts.email,
      password: opts.password,
      user_metadata: opts.userMetadata,
    });
    return { userId: result.user.id, email: result.user.email };
  },

  /**
   * Invite user via magic-link email (passwordless onboarding).
   * Supabase sends a signup invite to `email`. After they click it, they're
   * signed in and can use 6-digit OTP for all subsequent logins.
   *
   * Use this for new ERP users — admin only enters email + role, no manual
   * password ever needs to be shared.
   */
  inviteUser: async (opts: {
    email: string;
    userMetadata?: Record<string, any>;
    redirectTo?: string;
  }): Promise<{ userId: string; email: string }> => {
    const result = await callEdgeFunction('invite_user', {
      email: opts.email,
      user_metadata: opts.userMetadata,
      redirect_to: opts.redirectTo || (window.location.origin + '/'),
    });
    return { userId: result.user.id, email: result.user.email };
  },

  /** Update user (password, metadata, etc.) */
  updateUser: async (userId: string, updates: {
    password?: string;
    banDuration?: string;
    userMetadata?: Record<string, any>;
  }): Promise<void> => {
    await callEdgeFunction('update_user', {
      user_id: userId,
      updates: {
        password: updates.password,
        ban_duration: updates.banDuration,
        user_metadata: updates.userMetadata,
      },
    });
  },

  /** Ban user (revoke access) */
  banUser: async (userId: string): Promise<void> => {
    await callEdgeFunction('ban_user', { user_id: userId });
  },

  /** Unban user (reactivate) */
  unbanUser: async (userId: string): Promise<void> => {
    await callEdgeFunction('unban_user', { user_id: userId });
  },

  /** Reset user password/PIN */
  resetPassword: async (userId: string, newPassword: string): Promise<void> => {
    await callEdgeFunction('reset_password', {
      user_id: userId,
      new_password: newPassword,
    });
  },

  /** List all auth users */
  listUsers: async (): Promise<{ id: string; email: string }[]> => {
    const result = await callEdgeFunction('list_users');
    return result.users;
  },
};
