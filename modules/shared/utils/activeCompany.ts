// ============================================================================
// activeCompany — the ONE canonical active-company resolver for the service
// layer (non-React). Replaces six byte-identical copies previously inlined in
// asyncSalesService, salesServiceHelpers, financeService, inventoryService and
// hrService.
// ============================================================================
// The sidebar company switcher updates ONLY appStore.selectedCompany — NOT
// authStore.profile.company. profile.company is a phantom field here
// (user_profiles has no `company` column, so it is effectively always empty),
// which is why the switcher's selection is authoritative and profile.company is
// only a pre-bootstrap fallback.
//
// Earlier, services read profile.company directly: the go-live user's seed
// profile.company is 'GTK' while App.tsx forces selectedCompany to the deployed
// company, so every read asked Supabase for the wrong company's rows (Nippon
// products/COA/inventory came back empty; caches got overwritten cross-tenant).
//
// Returns '' when neither source is available (a very early app start, before
// appStore has bootstrapped). Service callers already treat '' as "skip the
// cloud read / keep the local cache" — they must NEVER default to a hardcoded
// company here or they would misfile / leak cross-tenant rows.
// ============================================================================
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';

export const activeCompany = (): string => {
  try {
    const sel = useAppStore.getState().selectedCompany;
    if (sel) return sel;
  } catch { /* appStore not initialised yet */ }
  return useAuthStore.getState().profile?.company ?? '';
};
