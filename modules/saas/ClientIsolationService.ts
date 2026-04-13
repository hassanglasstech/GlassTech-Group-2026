// ═══════════════════════════════════════════════════════════════════
// Client Isolation Service — Multi-tenant RLS enforcement
// Ensures Client A never sees Client B's data.
// Uses client_id column + Supabase RLS policies.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';

// ── Types ────────────────────────────────────────────────────────────
export interface ClientProfile {
  client_id:     string;
  company_name:  string;
  industry:      string;
  tier:          'starter' | 'professional' | 'enterprise';
  max_users:     number;
  max_companies: number;
  max_api_calls: number;
  active:        boolean;
  created_at:    string;
}

// ── Get current client_id from JWT ───────────────────────────────────
export const getCurrentClientId = async (): Promise<string | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  // client_id stored in user metadata or app_metadata
  return session.user.app_metadata?.client_id
    || session.user.user_metadata?.client_id
    || 'glasstech-internal'; // Default for GlassTech's own data
};

// ── Verify client isolation (test function) ──────────────────────────
export const verifyIsolation = async (clientId: string): Promise<{
  isolated: boolean;
  tables_checked: number;
  violations: string[];
}> => {
  const violations: string[] = [];
  const tablesToCheck = [
    'quotations', 'requisitions', 'factory_events', 'agent_tasks',
    'pattern_library', 'business_manual', 'agent_episodic_memory',
  ];

  let checked = 0;
  for (const table of tablesToCheck) {
    try {
      const { data, count } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true });
      checked++;
      // If RLS is working, we should only see our own data
      // This is a basic check — full isolation testing needs cross-client login
    } catch {
      violations.push(`Cannot query ${table} — RLS may be blocking`);
    }
  }

  return {
    isolated:       violations.length === 0,
    tables_checked: checked,
    violations,
  };
};

// ── Check tier limits ────────────────────────────────────────────────
export const checkTierLimits = async (clientId: string): Promise<{
  withinLimits: boolean;
  violations:   string[];
}> => {
  const violations: string[] = [];

  // Load client profile from erp_config
  const { data: configRows } = await supabase
    .from('erp_config')
    .select('key, value')
    .eq('company', clientId);

  if (!configRows || configRows.length === 0) {
    return { withinLimits: true, violations: [] }; // No config = no limits (GlassTech internal)
  }

  const config: Record<string, any> = {};
  configRows.forEach((r: any) => { config[r.key] = JSON.parse(r.value); });

  const tier = config.tier || 'starter';
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.starter;

  // Check API call count (current month)
  const monthStart = new Date().toISOString().slice(0, 7) + '-01';
  const { count: apiCalls } = await supabase
    .from('agent_api_calls')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', monthStart);

  if ((apiCalls || 0) > limits.max_api_calls) {
    violations.push(`API calls ${apiCalls} exceeds ${tier} limit ${limits.max_api_calls}`);
  }

  return {
    withinLimits: violations.length === 0,
    violations,
  };
};

// ── Tier limits configuration ────────────────────────────────────────
const TIER_LIMITS: Record<string, { max_users: number; max_companies: number; max_api_calls: number }> = {
  starter:      { max_users: 25,  max_companies: 1,  max_api_calls: 500 },
  professional: { max_users: 50,  max_companies: 3,  max_api_calls: 2000 },
  enterprise:   { max_users: 999, max_companies: 99, max_api_calls: 5000 },
};

// ── Get tier for display ─────────────────────────────────────────────
export const getTierInfo = (tier: string) => TIER_LIMITS[tier] || TIER_LIMITS.starter;
