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
  email:                string;            // sales / general — shown on quotation & sales order
  accountsEmail:        string;            // accounts / billing — shown on invoice & receipt
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
  /** Print the catalogue QR in the document footer. */
  showQrOnInvoice:      boolean;
  /**
   * The QR image to print. Upload the real one (a Linktree, a WhatsApp catalogue,
   * a tracked short link) rather than trusting a code generated from the website
   * field — what a customer scans should be the thing you meant, not a guess.
   * Left empty, the footer falls back to generating one from the website URL so
   * turning the toggle on always shows something. Rides in `data` (no migration).
   */
  catalogueQrDataUrl:   string;
  gstPercent:           number;            // company-default GST / sales-tax % printed on quotes & invoices (0 = no GST line). Rides in the `data` jsonb (zero-migration).
  /**
   * Master switch for TAX IDENTITY on customer-facing documents. When OFF the
   * print shows no GST line AND no NTN / STRN — they are one claim, and an STRN
   * on a document that charges no sales tax misrepresents the seller as filing
   * GST. Rides in the `data` jsonb as `showGst`.
   * (Name kept for the stored key's sake; it gates more than the GST line.)
   */
  showGstOnInvoice:     boolean;
}

/**
 * ONE canvas spec for every letterhead logo — ours and every partner's.
 *
 * The alternative is balancing logos by eye, which is an argument without an end:
 * a near-square mark and a wide wordmark never look equal, and every tweak to one
 * unbalances the other. Author both to the same canvas, print both in the same
 * slot, and the question stops existing.
 *
 * 3:1 because a letterhead lockup reads horizontally. 1200px wide renders into a
 * 160px slot at ~7.5x, so it stays crisp at any print DPI. Transparent PNG so the
 * logo sits ON the paper — an opaque backdrop prints as a grey card (the upload
 * now punches flat backdrops out, but starting transparent is cleaner).
 */
export const LOGO_CANVAS = { w: 1200, h: 400, ratio: '3:1', maxKb: 150 } as const;
/** Human-readable, for the upload hints in Admin -> Branding. */
export const LOGO_CANVAS_HINT =
  `${LOGO_CANVAS.w} x ${LOGO_CANVAS.h} px (${LOGO_CANVAS.ratio}) · transparent PNG · max ${LOGO_CANVAS.maxKb} KB`;

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
  accountsEmail:        '',
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
  catalogueQrDataUrl:   '',
  gstPercent:           0,
  showGstOnInvoice:     false,
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
  accountsEmail:        r.accounts_email         || '',
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
  catalogueQrDataUrl:   String((r.data && r.data.catalogueQr) || ''),
  gstPercent:           Number((r.data && r.data.gstPercent) ?? 0) || 0,
  showGstOnInvoice:     !!(r.data && r.data.showGst),
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
  accounts_email:           b.accountsEmail         || null,
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
  // Zero-migration extras ride in the existing `data` jsonb column.
  data:                     { gstPercent: b.gstPercent ?? 0, showGst: !!b.showGstOnInvoice, catalogueQr: b.catalogueQrDataUrl || '' },
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
