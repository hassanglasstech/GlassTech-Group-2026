/**
 * NIPPON_COMPANY_INFO — seller identity for Nippon customer-facing documents
 * (Quotation, Sales Order, Receipt letterheads).
 *
 * Regulatory + contact data (address / email / website / NTN / STRN / bank) is
 * NOT hard-coded. It is entered by the owner in Admin → Branding Settings for
 * company "Nippon", persisted via BrandingService (Supabase `company_branding`
 * + sync cache), and merged in at print time by `getNipponCompanyInfo()`.
 *
 * The constant below is only the visual-identity default (name + tagline + the
 * current phone) and the fallback before anything is configured. Letterheads
 * render the NTN / STRN / address / bank lines ONLY when non-empty — so nothing
 * fake is ever shown to a customer.
 */
import { BrandingService } from '@/modules/shared/services/brandingService';

export const NIPPON_COMPANY_INFO = {
  name: 'Nippon Hardware',
  tagline: 'Architectural Hardware & Accessories',
  phone: '0300-8716303',
  email: '',          // sales / general — quotation & sales order
  accountsEmail: '',  // accounts / billing — invoice & receipt (falls back to email)
  website: '',  // ← Admin → Branding Settings (Nippon)
  address: '',  // ← Admin → Branding Settings (Nippon)
  ntn: '',      // ← Admin → Branding Settings (FBR NTN)
  strn: '',     // ← Admin → Branding Settings (Sales Tax Reg.)
};

export type NipponCompanyInfo = typeof NIPPON_COMPANY_INFO;

/**
 * Live seller identity for Nippon prints. Merges admin-configured branding
 * (BrandingService → `company_branding`, company = "Nippon") over the static
 * defaults above, reading the SYNCHRONOUS cache so it is safe inside a print
 * render (no async flash of an empty letterhead).
 */
export function getNipponCompanyInfo(): NipponCompanyInfo {
  try {
    const b = BrandingService.getCachedBranding('Nippon');
    const address = [b.addressLine1, b.addressLine2, b.city]
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .join(', ');
    return {
      name:    (b.legalName || '').trim() && !/GlassTech Group/i.test(b.legalName)
                 ? b.legalName.trim()
                 : NIPPON_COMPANY_INFO.name,
      tagline: NIPPON_COMPANY_INFO.tagline,
      phone:   (b.phone   || '').trim() || NIPPON_COMPANY_INFO.phone,
      email:   (b.email   || '').trim() || NIPPON_COMPANY_INFO.email,
      accountsEmail: (b.accountsEmail || '').trim() || NIPPON_COMPANY_INFO.accountsEmail,
      website: (b.website || '').trim() || NIPPON_COMPANY_INFO.website,
      address: address                  || NIPPON_COMPANY_INFO.address,
      ntn:     (b.ntn     || '').trim() || NIPPON_COMPANY_INFO.ntn,
      strn:    (b.strn    || '').trim() || NIPPON_COMPANY_INFO.strn,
    };
  } catch {
    return NIPPON_COMPANY_INFO;
  }
}

/**
 * Default footer Terms & Conditions for Nippon documents. These are the terms
 * that were previously hard-coded on the quotation / sales-order prints — now
 * they seed the Admin → Branding Settings T&C fields, and the prints fall back
 * to them when branding is blank. Edit in Branding to override.
 */
export const NIPPON_DEFAULT_TERMS = {
  quotation: [
    '100% Cash Deposit before Delivery.',
    'Quotation valid for 2 days only.',
    'Check samples carefully, no return or exchange.',
    'Prices exclusive of Transportation and Taxes.',
  ].join('\n'),
  salesOrder: [
    '100% Cash Deposit before Delivery.',
    'Check samples carefully, no return or exchange.',
    'Prices exclusive of Transportation and Taxes.',
  ].join('\n'),
};

/**
 * Live footer terms for a Nippon document as an array of bullet lines. Reads the
 * admin-configured branding T&C (quotation → termsQuotation, salesOrder →
 * termsInvoice), falling back to NIPPON_DEFAULT_TERMS when blank.
 */
export function getNipponTerms(kind: 'quotation' | 'salesOrder'): string[] {
  let stored = '';
  try {
    const b = BrandingService.getCachedBranding('Nippon');
    stored = (kind === 'quotation' ? b.termsQuotation : b.termsInvoice) || '';
  } catch { /* use defaults */ }
  const raw = stored.trim()
    || (kind === 'quotation' ? NIPPON_DEFAULT_TERMS.quotation : NIPPON_DEFAULT_TERMS.salesOrder);
  return raw.split('\n').map(s => s.replace(/^[•\-\s]+/, '').trim()).filter(Boolean);
}
