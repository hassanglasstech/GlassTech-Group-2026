/**
 * GLASSCO_COMPANY_INFO — company identity for customer-facing print documents
 * (Quotation, Sales Order, Job Card headers).
 *
 * NTN / STRN / address are no longer hard-coded here. They are entered by the
 * user in Settings → Company Branding (Admin → Settings tab → "Company Details
 * & NTN/STRN"), persisted via BrandingService (Supabase `company_branding`
 * table + sync cache), and merged in at print time by `getGlasscoCompanyInfo()`.
 *
 * The constant below stays only as the visual-identity default (name + tagline)
 * and as a fallback when nothing is configured yet. The print headers render the
 * NTN / STRN / address lines only when non-empty, so nothing fake is ever shown.
 */
import { BrandingService } from '@/modules/shared/services/brandingService';

export const GLASSCO_COMPANY_INFO = {
  name: 'GlassCo',
  tagline: 'Complete Architectural Glass Solutions',
  phone: '0303-2428128',
  address: '', // overridden by Settings → Company Branding
  ntn: '',     // overridden by Settings → Company Branding (FBR NTN)
  strn: '',    // overridden by Settings → Company Branding (Sales Tax Reg.)
};

export type GlasscoCompanyInfo = typeof GLASSCO_COMPANY_INFO;

/**
 * Live company identity for prints. Merges admin-configured branding
 * (BrandingService → `company_branding`) over the static defaults above, so
 * NTN / STRN / address / phone entered in Settings flow straight onto the
 * Quotation and Sales Order documents.
 *
 * Reads the SYNCHRONOUS branding cache (hydrated on app boot and on every
 * Settings save) so it is safe to call inside a print render — no async flash
 * of an empty letterhead. Name + tagline stay from the constant: they are the
 * fixed visual identity, not user-editable regulatory data.
 */
export function getGlasscoCompanyInfo(): GlasscoCompanyInfo {
  try {
    const b = BrandingService.getCachedBranding('Glassco');
    const address = [b.addressLine1, b.addressLine2, b.city]
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .join(', ');
    return {
      name:    GLASSCO_COMPANY_INFO.name,
      tagline: GLASSCO_COMPANY_INFO.tagline,
      phone:   (b.phone || '').trim() || GLASSCO_COMPANY_INFO.phone,
      address: address              || GLASSCO_COMPANY_INFO.address,
      ntn:     (b.ntn  || '').trim() || GLASSCO_COMPANY_INFO.ntn,
      strn:    (b.strn || '').trim() || GLASSCO_COMPANY_INFO.strn,
    };
  } catch {
    return GLASSCO_COMPANY_INFO;
  }
}
