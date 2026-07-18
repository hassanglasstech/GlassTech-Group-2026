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
  email: '',    // ← Admin → Branding Settings (Nippon)
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
      website: (b.website || '').trim() || NIPPON_COMPANY_INFO.website,
      address: address                  || NIPPON_COMPANY_INFO.address,
      ntn:     (b.ntn     || '').trim() || NIPPON_COMPANY_INFO.ntn,
      strn:    (b.strn    || '').trim() || NIPPON_COMPANY_INFO.strn,
    };
  } catch {
    return NIPPON_COMPANY_INFO;
  }
}
