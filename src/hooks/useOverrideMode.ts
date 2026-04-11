/**
 * useOverrideMode.ts — GRC Control Exception Register
 *
 * Hook for Super Admin override mode:
 *   - Reads override_mode_active from user_profiles
 *   - Exposes toggle + logBypass() for audit trail
 *   - Every bypass auto-inserted into bypass_log table
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';
import { toast } from 'sonner';

type BypassModule = 'Finance' | 'HR' | 'Sales' | 'SCM' | 'Production' | 'HSE' | 'Admin';

interface BypassEntry {
  id: string;
  module: BypassModule;
  rule_bypassed: string;
  record_id: string;
  bypass_reason: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  created_at: string;
  days_open?: number;
  sla_status?: string;
}

const ADMIN_ROLES = ['super_admin', 'owner', 'hassan', 'gtk_admin', 'glassco_admin', 'nippon_admin'];

export function useOverrideMode() {
  const profile = useAuthStore(s => s.profile);
  const user = useAuthStore(s => s.user);
  const [isOverrideMode, setIsOverrideMode] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);

  // Check both profile.role and user.role — auth store may populate either
  const role = profile?.role || (user as any)?.role || '';
  const isAdmin = ADMIN_ROLES.includes(role);
  const userId = userId || (user as any)?.id || '';

  // Load override state from profile
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('user_profiles')
      .select('override_mode_active')
      .eq('id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setIsOverrideMode(!!data.override_mode_active);
      })
      .catch(() => {});
  }, [userId]);

  // Load open bypass count
  const refreshCounts = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('bypass_log_overdue')
        .select('id, sla_status');
      if (data) {
        setOpenCount(data.length);
        setOverdueCount(data.filter(d => d.sla_status === 'overdue' || d.sla_status === 'critical').length);
      }
    } catch { /* offline */ }
  }, []);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  // Toggle override mode
  const toggleOverrideMode = useCallback(async () => {
    if (!isAdmin) {
      toast.error('Only Super Admin can toggle override mode.');
      return;
    }
    const next = !isOverrideMode;
    setIsOverrideMode(next);
    try {
      await supabase
        .from('user_profiles')
        .update({ override_mode_active: next })
        .eq('id', userId);
      toast.success(next ? 'Override Mode ACTIVATED — all bypasses will be logged.' : 'Override Mode DEACTIVATED.');
    } catch {
      toast.error('Failed to update override mode.');
      setIsOverrideMode(!next);
    }
  }, [isAdmin, isOverrideMode, profile]);

  // Log a bypass event
  const logBypass = useCallback(async (
    module: BypassModule,
    ruleBypassed: string,
    recordId: string = '',
    reason: string = ''
  ) => {
    const entry = {
      id: `BYP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: user?.id || userId || '',
      user_name: profile?.fullName || user?.email || 'Unknown',
      module,
      rule_bypassed: ruleBypassed,
      record_id: recordId,
      bypass_reason: reason,
      status: 'Open',
      addressing_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
      company: profile?.company || '',
    };

    try {
      const { error } = await supabase.from('bypass_log').insert(entry);
      if (error) throw error;
      setOpenCount(c => c + 1);
      toast.warning(`Bypass logged: ${module} — ${ruleBypassed}`, { duration: 5000 });
    } catch (e: any) {
      console.error('[useOverrideMode] logBypass failed:', e.message);
      toast.error('Failed to log bypass — action may not be auditable.');
    }
  }, [user, profile]);

  return {
    isOverrideMode,
    isAdmin,
    toggleOverrideMode,
    logBypass,
    openCount,
    overdueCount,
    refreshCounts,
  };
}
