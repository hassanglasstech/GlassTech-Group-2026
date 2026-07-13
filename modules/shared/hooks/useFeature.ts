/**
 * useFeature.ts — reactive feature-flag hook.
 *
 * `useFeature('dispatch.service_pool')` re-renders the component when the flag
 * is flipped (e.g. the founder toggles it in Admin → Feature Flags, or a fresh
 * load lands from Supabase). For non-component code use `hasFeature()` directly.
 */

import { useSyncExternalStore } from 'react';
import { FeatureFlagService, hasFeature } from '@/modules/shared/services/featureFlagService';

export function useFeature(key: string, company?: string): boolean {
  return useSyncExternalStore(
    FeatureFlagService.subscribe,
    () => hasFeature(key, company),
    () => hasFeature(key, company),
  );
}
