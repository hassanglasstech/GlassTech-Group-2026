/**
 * featureFlagService.ts — per-company feature entitlements for phased launch.
 *
 * Mirrors the taxSettingsService storage pattern: one row in `erp_config`
 * (id = `${company}_feature_flags`, value jsonb = { [featureKey]: boolean }).
 *
 * `hasFeature(key)` is SYNCHRONOUS (safe to call in render) — it reads an
 * in-memory cache that is hydrated from localStorage at import and refreshed
 * from Supabase by `loadAsync()` at boot + on company switch. Components that
 * need to react to a flip use `useFeature(key)` (see hooks/useFeature.ts).
 *
 * Resolution: per-company override → registry default → true (unregistered key).
 */

import { supabase } from '@/src/services/supabaseClient';
import { activeCompany } from '@/modules/shared/utils/activeCompany';
import { Logger } from '@/modules/shared/services/logger';
import { FEATURE_DEFAULTS, type FeatureFlagMap } from '@/modules/shared/config/featureFlags';

const CONFIG_KEY = 'feature_flags';
const LS_KEY = 'gtk_erp_feature_flags'; // { [company]: FeatureFlagMap }

let _cache: Record<string, FeatureFlagMap> = {};
try { _cache = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch { _cache = {}; }

const _listeners = new Set<() => void>();
const _emit = (): void => { _listeners.forEach((l) => { try { l(); } catch { /* noop */ } }); };
const _persistLocal = (): void => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(_cache)); } catch { /* quota — cache stays in memory */ }
};

export const FeatureFlagService = {
  /** Refresh a company's flags from Supabase into the cache. */
  loadAsync: async (companyArg?: string): Promise<void> => {
    const company = companyArg || activeCompany();
    if (!company) return;
    try {
      const { data, error } = await supabase
        .from('erp_config')
        .select('value')
        .eq('id', `${company}_${CONFIG_KEY}`)
        .maybeSingle();
      if (error) { Logger.error('FeatureFlags', 'loadAsync failed', error); return; }
      _cache[company] = (data?.value as FeatureFlagMap) || {};
      _persistLocal();
      _emit();
    } catch (e) {
      Logger.error('FeatureFlags', 'loadAsync exception', e);
    }
  },

  /** Persist a company's full flag map (optimistic local + cloud). */
  saveAsync: async (flags: FeatureFlagMap, companyArg?: string): Promise<{ error?: string }> => {
    const company = companyArg || activeCompany();
    if (!company) return { error: 'no active company' };
    _cache[company] = { ...flags };
    _persistLocal();
    _emit();
    try {
      const { error } = await supabase.from('erp_config').upsert(
        { id: `${company}_${CONFIG_KEY}`, company, key: CONFIG_KEY, value: flags, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      );
      if (error) { Logger.error('FeatureFlags', 'saveAsync failed', error); return { error: error.message }; }
      return {};
    } catch (e) {
      Logger.error('FeatureFlags', 'saveAsync exception', e);
      return { error: (e as Error).message };
    }
  },

  /** Current override map for a company (does not include registry defaults). */
  getFlags: (companyArg?: string): FeatureFlagMap => {
    const company = companyArg || activeCompany();
    return _cache[company] || {};
  },

  /** Subscribe to flag changes (for useSyncExternalStore). Returns an unsubscribe fn. */
  subscribe: (l: () => void): (() => void) => { _listeners.add(l); return () => { _listeners.delete(l); }; },
};

/**
 * Is `key` enabled for the (optionally given) company? Synchronous.
 * per-company override → registry default → true (unregistered = ungated).
 */
export function hasFeature(key: string, companyArg?: string): boolean {
  const company = companyArg || activeCompany();
  const override = _cache[company]?.[key];
  if (typeof override === 'boolean') return override;
  if (key in FEATURE_DEFAULTS) return FEATURE_DEFAULTS[key];
  return true;
}
