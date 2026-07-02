/**
 * useOverrideMode.ts — GRC Control Exception Register
 *
 * Hook for Super Admin override mode.
 * IMPORTANT: Does NOT import useAuthStore at module level to avoid circular deps.
 * Instead, reads auth state lazily via dynamic import.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

type BypassModule = 'Finance' | 'HR' | 'Sales' | 'SCM' | 'Production' | 'HSE' | 'Admin';

const ADMIN_ROLES = ['super_admin', 'owner', 'hassan', 'gtk_admin', 'glassco_admin', 'nippon_admin'];

/** Read auth state from localStorage directly — zero import dependency */
function getAuthFromStorage(): { id: string; email: string; fullName: string; role: string; company: string } | null {
  try {
    const raw = localStorage.getItem('glasstech-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const profile = parsed?.state?.profile || parsed?.state?.user;
    if (!profile?.role) return null;
    return {
      id: profile.id || '',
      email: profile.email || '',
      fullName: profile.fullName || profile.email || '',
      role: profile.role || '',
      company: profile.company || '',
    };
  } catch {
    return null;
  }
}

/** Lazy supabase getter — avoids top-level import chain */
async function getSupabase() {
  const mod = await import('@/src/services/supabaseClient');
  return mod.supabase;
}

export function useOverrideMode() {
  const [isOverrideMode, setIsOverrideMode] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [authData, setAuthData] = useState(getAuthFromStorage);

  // Re-read auth on mount and on storage changes
  useEffect(() => {
    const refresh = () => setAuthData(getAuthFromStorage());
    refresh();
    window.addEventListener('storage', refresh);
    // Poll once after 1s for Zustand hydration
    const t = setTimeout(refresh, 1000);
    return () => { window.removeEventListener('storage', refresh); clearTimeout(t); };
  }, []);

  const isAdmin = useMemo(() => {
    return authData?.role ? ADMIN_ROLES.includes(authData.role) : false;
  }, [authData?.role]);

  // Load override state
  useEffect(() => {
    if (!authData?.id) return;
    getSupabase().then(sb => {
      sb.from('user_profiles')
        .select('override_mode_active')
        .eq('id', authData.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setIsOverrideMode(!!data.override_mode_active);
        }, () => {});
    });
  }, [authData?.id]);

  // Load open bypass count
  const refreshCounts = useCallback(async () => {
    try {
      const sb = await getSupabase();
      const { data } = await sb.from('bypass_log_overdue').select('id, sla_status');
      if (data) {
        setOpenCount(data.length);
        setOverdueCount(data.filter((d: any) => d.sla_status === 'overdue' || d.sla_status === 'critical').length);
      }
    } catch { /* offline */ }
  }, []);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  // Toggle override mode
  const toggleOverrideMode = useCallback(async () => {
    if (!isAdmin) {
      toast.error('Only Admin can toggle override mode.');
      return;
    }
    const next = !isOverrideMode;
    setIsOverrideMode(next);
    try {
      const sb = await getSupabase();
      await sb.from('user_profiles').update({ override_mode_active: next }).eq('id', authData!.id);
      toast.success(next ? 'Override Mode ACTIVATED — all bypasses will be logged.' : 'Override Mode DEACTIVATED.');
    } catch {
      toast.error('Failed to update override mode.');
      setIsOverrideMode(!next);
    }
  }, [isAdmin, isOverrideMode, authData]);

  // Log a bypass event
  const logBypass = useCallback(async (
    module: BypassModule,
    ruleBypassed: string,
    recordId: string = '',
    reason: string = ''
  ) => {
    const auth = authData || getAuthFromStorage();
    const entry = {
      id: `BYP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: auth?.id || '',
      user_name: auth?.fullName || auth?.email || 'Unknown',
      module,
      rule_bypassed: ruleBypassed,
      record_id: recordId,
      bypass_reason: reason,
      status: 'Open',
      addressing_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
      company: auth?.company || '',
    };

    try {
      const sb = await getSupabase();
      const { error } = await sb.from('bypass_log').insert(entry);
      if (error) throw error;
      setOpenCount(c => c + 1);
      toast.warning(`Bypass logged: ${module} — ${ruleBypassed}`, { duration: 5000 });
    } catch (e: any) {
      console.error('[useOverrideMode] logBypass failed:', e.message);
    }
  }, [authData]);

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
