/**
 * featureFlags.ts — Feature registry for phased launch.
 *
 * The founder's model: BUILD every feature now, but LAUNCH them in phases.
 * Each feature is a string key with a per-company on/off state. Resolution
 * (see featureFlagService.hasFeature):
 *   per-company override (erp_config)  →  registry defaultEnabled  →  true
 * An UNREGISTERED key returns true, so wiring hasFeature() into an existing
 * surface never changes its behavior until the key is added here.
 *
 * New / unlaunched features are registered with defaultEnabled:false so they
 * stay hidden until the founder flips them ON per company (Admin → Feature Flags).
 */

export type FeatureGroup = 'Procurement' | 'Dispatch' | 'Production' | 'Sales' | 'Finance' | 'Quality';

export interface FeatureDef {
  key: string;
  label: string;
  description: string;
  group: FeatureGroup;
  defaultEnabled: boolean;
}

export type FeatureFlagMap = Record<string, boolean>;

export const FEATURE_REGISTRY: FeatureDef[] = [
  // ── Procurement ────────────────────────────────────────────────────────────
  { key: 'proc.rate_chart', label: 'Vendor Rate Comparison Chart', group: 'Procurement', defaultEnabled: false,
    description: 'Item×vendor rate matrix with comparative colouring + per-vendor business volume.' },

  // ── Dispatch ───────────────────────────────────────────────────────────────
  { key: 'dispatch.service_pool', label: 'Out-at-Service Pool', group: 'Dispatch', defaultEnabled: false,
    description: 'Track pieces sent to tempering / lamination / double-glazing with expected return date + overdue.' },
  { key: 'dispatch.guard_screen', label: 'Guard Verify Screen', group: 'Dispatch', defaultEnabled: false,
    description: 'Gate-pass verification checkpoint for goods leaving the premises.' },

  // ── Production ─────────────────────────────────────────────────────────────
  { key: 'production.simple_mode', label: 'Production Simple Mode', group: 'Production', defaultEnabled: true,
    description: 'Show only order → cut → tempering → deliver; hide the advanced surfaces below.' },
  { key: 'production.cut_optimizer', label: 'Cut Plan Optimizer (2D nesting)', group: 'Production', defaultEnabled: false,
    description: 'Auto best-sheet guillotine nesting on the cut screen.' },
  { key: 'production.wastage_analytics', label: 'Wastage & Cutter Analytics', group: 'Production', defaultEnabled: false,
    description: 'Scrap/wastage capture + cutter performance leaderboard + WIP aging cockpit.' },

  // ── Sales ──────────────────────────────────────────────────────────────────
  { key: 'sales.service_rate_card', label: 'Service Rate Card & Price List', group: 'Sales', defaultEnabled: false,
    description: 'Internal charge-out rate matrix + updatable customer price lists feeding quotation pricing.' },

  // ── Finance ────────────────────────────────────────────────────────────────
  { key: 'finance.gl_enabled', label: 'Finance GL Posting', group: 'Finance', defaultEnabled: false,
    description: 'Post double-entry GL for invoices/receipts. OFF = single-entry (record the sale, no ledger). Non-blocking either way.' },

  // ── Quality ────────────────────────────────────────────────────────────────
  { key: 'quality.vendor_defects', label: 'Vendor Quality / Defect Tracking', group: 'Quality', defaultEnabled: false,
    description: 'QC report attributing breakage / bend / bubble / scratch / chipping to the vendor. No claim, no GL.' },
];

export const FEATURE_DEFAULTS: FeatureFlagMap = Object.fromEntries(
  FEATURE_REGISTRY.map((f) => [f.key, f.defaultEnabled]),
);

/** Group the registry for a settings UI. */
export const FEATURE_GROUPS: FeatureGroup[] = ['Procurement', 'Dispatch', 'Production', 'Sales', 'Finance', 'Quality'];
