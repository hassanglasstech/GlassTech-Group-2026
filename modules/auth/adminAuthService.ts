/**
 * Admin Auth Service
 * 
 * Abstracts Supabase admin auth operations. Supports two modes:
 * 
 * MODE 1 (Recommended): Edge Function
 *   - Set VITE_USE_EDGE_FUNCTIONS=true in .env
 *   - Deploy supabase/functions/manage-users
 *   - Service role key stays server-side
 * 
 * MODE 2 (Quick setup): Direct admin client
 *   - Set VITE_SUPABASE_SERVICE_KEY in .env
 *   - Less secure (key in browser) but works immediately
 *   - Only use during development
 * 
 * If neither is configured, operations will fail gracefully with
 * instructions for the user.
 */

import { supabase } from '@/src/services/supabaseClient';
import { createClient } from '@supabase/supabase-js';

// ── Detect mode ─────────────────────────────────────────────────────
const USE_EDGE_FN = import.meta.env.VITE_USE_EDGE_FUNCTIONS === 'true';
const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY || '';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

// Admin client (only created if service key is available)
const adminClient = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

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

  /** Check if admin operations are available */
  isConfigured: (): boolean => {
    return USE_EDGE_FN || !!adminClient;
  },

  getMode: (): 'edge_function' | 'direct' | 'none' => {
    if (USE_EDGE_FN) return 'edge_function';
    if (adminClient) return 'direct';
    return 'none';
  },

  /** Create a new Supabase auth user */
  createUser: async (opts: {
    email: string;
    password?: string;
    userMetadata?: Record<string, any>;
  }): Promise<{ userId: string; email: string }> => {

    if (USE_EDGE_FN) {
      const result = await callEdgeFunction('create_user', {
        email: opts.email,
        password: opts.password,
        user_metadata: opts.userMetadata,
      });
      return { userId: result.user.id, email: result.user.email };
    }

    if (adminClient) {
      const { data, error } = await adminClient.auth.admin.createUser({
        email: opts.email,
        password: opts.password || undefined,
        email_confirm: true,
        user_metadata: opts.userMetadata,
      });
      if (error) throw error;
      return { userId: data.user.id, email: data.user.email! };
    }

    throw new Error(
      'Admin auth not configured. Either:\n' +
      '1. Deploy the manage-users Edge Function and set VITE_USE_EDGE_FUNCTIONS=true\n' +
      '2. Set VITE_SUPABASE_SERVICE_KEY in your .env file'
    );
  },

  /** Update user (password, metadata, etc.) */
  updateUser: async (userId: string, updates: {
    password?: string;
    banDuration?: string;
    userMetadata?: Record<string, any>;
  }): Promise<void> => {

    if (USE_EDGE_FN) {
      await callEdgeFunction('update_user', {
        user_id: userId,
        updates: {
          password: updates.password,
          ban_duration: updates.banDuration,
          user_metadata: updates.userMetadata,
        },
      });
      return;
    }

    if (adminClient) {
      const payload: any = {};
      if (updates.password) payload.password = updates.password;
      if (updates.banDuration !== undefined) payload.ban_duration = updates.banDuration;
      if (updates.userMetadata) payload.user_metadata = updates.userMetadata;

      const { error } = await adminClient.auth.admin.updateUserById(userId, payload);
      if (error) throw error;
      return;
    }

    throw new Error('Admin auth not configured.');
  },

  /** Ban user (revoke access) */
  banUser: async (userId: string): Promise<void> => {
    if (USE_EDGE_FN) {
      await callEdgeFunction('ban_user', { user_id: userId });
      return;
    }
    if (adminClient) {
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: '876000h',
      });
      if (error) throw error;
      return;
    }
    throw new Error('Admin auth not configured.');
  },

  /** Unban user (reactivate) */
  unbanUser: async (userId: string): Promise<void> => {
    if (USE_EDGE_FN) {
      await callEdgeFunction('unban_user', { user_id: userId });
      return;
    }
    if (adminClient) {
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
      });
      if (error) throw error;
      return;
    }
    throw new Error('Admin auth not configured.');
  },

  /** Reset user password/PIN */
  resetPassword: async (userId: string, newPassword: string): Promise<void> => {
    if (USE_EDGE_FN) {
      await callEdgeFunction('reset_password', {
        user_id: userId,
        new_password: newPassword,
      });
      return;
    }
    if (adminClient) {
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
      if (error) throw error;
      return;
    }
    throw new Error('Admin auth not configured.');
  },

  /** List all auth users */
  listUsers: async (): Promise<{ id: string; email: string }[]> => {
    if (USE_EDGE_FN) {
      const result = await callEdgeFunction('list_users');
      return result.users;
    }
    if (adminClient) {
      const { data, error } = await adminClient.auth.admin.listUsers();
      if (error) throw error;
      return data.users.map(u => ({ id: u.id, email: u.email! }));
    }
    throw new Error('Admin auth not configured.');
  },
};
