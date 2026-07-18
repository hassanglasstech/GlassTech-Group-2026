/**
 * brandingService.ts — Sprint 33
 *
 * Single source of truth for company-level branding + regulatory
 * fields (NTN, STRN, address, bank details, T&C blocks, logo).
 *
 * Reads through a localStorage cache so PrintHeader / PrintFooter
 * render synchronously (no flash-of-empty-letterhead). Writes go to
 * Supabase first, then mirror to cache; cache also seeds itself
 * lazily from Supabase on first read.
 *
 * Used by:
 *   • PrintHeader.tsx — letterhead on every customer-facing print
 *   • PrintFooter.tsx — bank details + signatures + T&C
 *   • BrandingSettings.tsx — admin page that owns the data
 *
 * Synchronous getter `getCachedBranding(company)` is intentional:
 *   • Print components are inside a print-flow where async render
 *     causes blank pages.
 *   • Cache is hydrated by `prefetchBranding(company)` on app boot
 *     (see App.tsx → BrandingBootstrap below) and on Settings save.
 */

import { supabase } from '@/src/services/supabaseClient';

export interface CompanyBranding {
  id:                   string;
  company:              string;
  legalName:            string;
  addressLine1:         string;
  addressLine2:         string;
  city:                 string;
  country:              string;
  phone:                string;
  email:                string;
  website:              string;
  ntn:                  string;
  strn:                 string;
  cnic:                 string;
  logoDataUrl:          string;            // base64 PNG/SVG (cap 150 KB) — own/General
  logoGlasstechDataUrl: string;            // header logo for the "Glasstech" print variant
  logoKinlongDataUrl:   string;            // header logo for the "KinLong" print variant
  signatureBlock:       string;            // multi-line text
  bankName:             string;
  bankBranch:           string;
  bankIban:             string;
  bankAccountTitle:     string;
  bankAccountNo:        string;
  bankSwift:            string;
  termsQuotation:       string;
  termsInvoice:         string;
  termsDeliveryChallan: string;
  termsServiceOrder:    string;
  termsCreditNote:      string;
  termsGrn:             string;
  showLogo:             boolean;
  showBankOnInvoice:    boolean;
  showQrOnInvoice:      boolean;
}

const CACHE_KEY = 'gtk_erp_company_branding';

const _empty = (company: string): CompanyBranding => ({
  id:                   company,
  company,
  legalName:            `GlassTech Group — ${company}`,
  addressLine1:         '',
  addressLine2:         '',
  city:                 'Karachi',
  country:              'Pakistan',
  phone:                '',
  email:                '',
  website:              '',
  ntn:                  '',
  strn:                 '',
  cnic:                 '',
  logoDataUrl:          '',
  logoGlasstechDataUrl: '',
  logoKinlongDataUrl:   '',
  signatureBlock:       'Authorised Signatory',
  bankName:             '',
  bankBranch:           '',
  bankIban:             '',
  bankAccountTitle:     '',
  bankAccountNo:        '',
  bankSwift:            '',
  termsQuotation:       '',
  termsInvoice:         '',
  termsDeliveryChallan: '',
  termsServiceOrder:    '',
  termsCreditNote:      '',
  termsGrn:             '',
  showLogo:             true,
  showBankOnInvoice:    true,
  showQrOnInvoice:      false,
});

const _fromRow = (r: any): CompanyBranding => ({
  id:                   r.id,
  company:              r.company,
  legalName:            r.legal_name             || `GlassTech Group — ${r.company}`,
  addressLine1:         r.address_line1          || '',
  addressLine2:         r.address_line2          || '',
  city:                 r.city                   || '',
  country:              r.country                || 'Pakistan',
  phone:                r.phone                  || '',
  email:                r.email                  || '',
  website:              r.website                || '',
  ntn:                  r.ntn                    || '',
  strn:                 r.strn                   || '',
  cnic:                 r.cnic                   || '',
  logoDataUrl:          r.logo_data_url          || '',
  logoGlasstechDataUrl: r.logo_glasstech_data_url || '',
  logoKinlongDataUrl:   r.logo_kinlong_data_url   || '',
  signatureBlock:       r.signature_block        || 'Authorised Signatory',
  bankName:             r.bank_name              || '',
  bankBranch:           r.bank_branch            || '',
  bankIban:             r.bank_iban              || '',
  bankAccountTitle:     r.bank_account_title     || '',
  bankAccountNo:        r.bank_account_no        || '',
  bankSwift:            r.bank_swift             || '',
  termsQuotation:       r.terms_quotation        || '',
  termsInvoice:         r.terms_invoice          || '',
  termsDeliveryChallan: r.terms_delivery_challan || '',
  termsServiceOrder:    r.terms_service_order    || '',
  termsCreditNote:      r.terms_credit_note      || '',
  termsGrn:             r.terms_grn              || '',
  showLogo:             r.show_logo            !== false,
  showBankOnInvoice:    r.show_bank_on_invoice !== false,
  showQrOnInvoice:      !!r.show_qr_on_invoice,
});

const _toRow = (b: CompanyBranding): any => ({
  id:                       b.id,
  company:                  b.company,
  legal_name:               b.legalName             || null,
  address_line1:            b.addressLine1          || null,
  address_line2:            b.addressLine2          || null,
  city:                     b.city                  || null,
  country:                  b.country               || 'Pakistan',
  phone:                    b.phone                 || null,
  email:                    b.email                 || null,
  website:                  b.website               || null,
  ntn:                      b.ntn                   || null,
  strn:                     b.strn                  || null,
  cnic:                     b.cnic                  || null,
  logo_data_url:            b.logoDataUrl           || null,
  logo_glasstech_data_url:  b.logoGlasstechDataUrl  || null,
  logo_kinlong_data_url:    b.logoKinlongDataUrl    || null,
  signature_block:          b.signatureBlock        || null,
  bank_name:                b.bankName              || null,
  bank_branch:              b.bankBranch            || null,
  bank_iban:                b.bankIban              || null,
  bank_account_title:       b.bankAccountTitle      || null,
  bank_account_no:          b.bankAccountNo         || null,
  bank_swift:               b.bankSwift             || null,
  terms_quotation:          b.termsQuotation        || null,
  terms_invoice:            b.termsInvoice          || null,
  terms_delivery_challan:   b.termsDeliveryChallan  || null,
  terms_service_order:      b.termsServiceOrder     || null,
  terms_credit_note:        b.termsCreditNote       || null,
  terms_grn:                b.termsGrn              || null,
  show_logo:                b.showLogo,
  show_bank_on_invoice:     b.showBankOnInvoice,
  show_qr_on_invoice:       b.showQrOnInvoice,
  updated_at:               new Date().toISOString(),
});

const _readCache = (): Record<string, CompanyBranding> => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; }
  catch { return {}; }
};
const _writeCache = (next: Record<string, CompanyBranding>) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* quota exceeded — non-fatal */ }
};

export const BrandingService = {
  /** Synchronous read from cache. Returns an empty default if not yet hydrated. */
  getCachedBranding: (company: string): CompanyBranding => {
    const cache = _readCache();
    return cache[company] || _empty(company);
  },

  /** All cached brandings (for ops dashboards). */
  listCached: (): CompanyBranding[] => {
    return Object.values(_readCache());
  },

  /** Pull all brandings from Supabase + warm cache. Call on app boot. */
  prefetchAll: async (): Promise<void> => {
    try {
      const { data, error } = await supabase.from('company_branding').select('*');
      if (error || !data) return;
      const next: Record<string, CompanyBranding> = {};
      for (const r of data) next[r.company] = _fromRow(r);
      _writeCache(next);
    } catch { /* offline — keep cache as-is */ }
  },

  /** Pull a single company on demand (used by Settings page). */
  loadBranding: async (company: string): Promise<CompanyBranding> => {
    try {
      const { data, error } = await supabase
        .from('company_branding')
        .select('*')
        .eq('company', company)
        .limit(1)
        .single();
      if (error || !data) return _empty(company);
      const b = _fromRow(data);
      const cache = _readCache();
      cache[company] = b;
      _writeCache(cache);
      return b;
    } catch {
      return _empty(company);
    }
  },

  saveBranding: async (b: CompanyBranding): Promise<{ ok: boolean; error?: string }> => {
    // Cache first so prints render correctly even if cloud write is slow
    const cache = _readCache();
    cache[b.company] = b;
    _writeCache(cache);
    try {
      const { error } = await supabase.from('company_branding').upsert(_toRow(b), { onConflict: 'id' });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'unknown' };
    }
  },
};

export default BrandingService;
