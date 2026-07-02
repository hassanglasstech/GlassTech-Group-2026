/**
 * taxSettingsService.ts — Tax/GST Configuration Toggle
 *
 * Business reality: Pakistani SME customers don't always demand GST invoices.
 * This service provides a per-company toggle so:
 *   - When disabled (default): no GST line on invoices, no GST account posting,
 *     no tax-related validation checks in Phase 0 audit.
 *   - When enabled: full GST treatment activates (rate, account, WHT, FBR fields).
 *
 * Stored in erp_config under key 'tax_settings'.
 */

import { supabase } from '@/src/services/supabaseClient';

export interface TaxSettings {
  enabled:              boolean;        // master toggle
  gst_rate:             number;         // % e.g. 18
  gst_input_account:    string;         // COA code for input GST (asset)
  gst_output_account:   string;         // COA code for output GST (liability)
  wht_enabled:          boolean;        // withholding tax
  wht_rate:             number;         // % e.g. 4
  wht_account:          string;         // COA code for WHT payable
  ntn_required:         boolean;        // require NTN on every invoice
  strn_required:        boolean;        // require STRN on every invoice
  fbr_einvoicing:       boolean;        // future: integrate PRAL FBR e-invoicing
}

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  enabled:            false,            // ── OFF by default ──
  gst_rate:           18,
  // Audit #7 fix: was '11514', colliding with Glassco's 'Laminated Glass
  // Stock' / 'WIP — Direct Labour' codes. Latent (this default isn't posted
  // to by any live GL path yet), but given a clean code to prevent a future
  // collision the moment GST posting is wired up.
  gst_input_account:  '11431',          // Input GST receivable
  gst_output_account: '21105',          // Output GST payable
  wht_enabled:        false,
  wht_rate:           4,
  wht_account:        '21106',          // WHT payable
  ntn_required:       false,
  strn_required:      false,
  fbr_einvoicing:     false,
};

interface Result<T> { data?: T; error?: string }

const CONFIG_KEY = 'tax_settings';

// ── 1. Load tax settings for a company ───────────────────────────────────────
export const loadTaxSettings = async (company: string): Promise<Result<TaxSettings>> => {
  try {
    const { data, error } = await supabase
      .from('erp_config')
      .select('value')
      .eq('id', `${company}_${CONFIG_KEY}`)
      .maybeSingle();

    if (error) return { error: error.message };

    if (!data) return { data: DEFAULT_TAX_SETTINGS };

    // Merge with defaults to ensure new fields don't break old records
    return { data: { ...DEFAULT_TAX_SETTINGS, ...(data.value as Partial<TaxSettings>) } };
  } catch (e) {
    return { error: (e as Error).message };
  }
};

// ── 2. Save tax settings for a company ───────────────────────────────────────
export const saveTaxSettings = async (
  company:  string,
  settings: TaxSettings,
): Promise<Result<TaxSettings>> => {
  try {
    const { error } = await supabase
      .from('erp_config')
      .upsert(
        {
          id:         `${company}_${CONFIG_KEY}`,
          company,
          key:        CONFIG_KEY,
          value:      settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

    if (error) return { error: error.message };
    return { data: settings };
  } catch (e) {
    return { error: (e as Error).message };
  }
};

// ── 3. Quick "is tax enabled for this company?" check ────────────────────────
// Used by invoice services + Phase 0 audit script to conditionally enforce
// GST validation.
export const isTaxEnabled = async (company: string): Promise<boolean> => {
  const { data } = await loadTaxSettings(company);
  return data?.enabled ?? false;
};

// ── 4. Compute tax on a base amount (only when enabled) ──────────────────────
export interface TaxBreakdown {
  taxable_amount: number;
  gst_amount:     number;
  wht_amount:     number;
  total_with_tax: number;
  net_payable:    number;   // total minus WHT
  enabled:        boolean;
}

export const computeTax = (settings: TaxSettings, baseAmount: number): TaxBreakdown => {
  if (!settings.enabled) {
    return {
      taxable_amount: baseAmount,
      gst_amount:     0,
      wht_amount:     0,
      total_with_tax: baseAmount,
      net_payable:    baseAmount,
      enabled:        false,
    };
  }

  const gst = Math.round((baseAmount * settings.gst_rate / 100) * 100) / 100;
  const wht = settings.wht_enabled
    ? Math.round((baseAmount * settings.wht_rate / 100) * 100) / 100
    : 0;

  return {
    taxable_amount: baseAmount,
    gst_amount:     gst,
    wht_amount:     wht,
    total_with_tax: baseAmount + gst,
    net_payable:    baseAmount + gst - wht,
    enabled:        true,
  };
};
