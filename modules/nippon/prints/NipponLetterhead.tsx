/**
 * NipponLetterhead — ONE shared, branded letterhead for every Nippon
 * customer-facing document (Quotation, Sales Order, Receipt). Consolidating it
 * here kills branding drift between the near-duplicate print files and lets the
 * seller's real identity — logo, address, email, NTN/STRN — flow from Admin →
 * Branding Settings onto every document.
 *
 * Every regulatory / contact line renders ONLY when non-empty (via
 * getNipponCompanyInfo + the branding cache) so a not-yet-configured field
 * simply doesn't appear — nothing fake is shown to a customer.
 */
import React from 'react';
import { getNipponCompanyInfo } from '../constants/nipponCompanyInfo';
import { BrandingService, CompanyBranding } from '../../shared/services/brandingService';

export type NipponPrintType = 'KinLong' | 'Glasstech' | 'General';

const branding = (): CompanyBranding | null => {
  try { return BrandingService.getCachedBranding('Nippon'); } catch { return null; }
};

export const NipponLetterhead: React.FC<{ printType?: NipponPrintType }> = ({ printType = 'KinLong' }) => {
  const info = getNipponCompanyInfo();
  const b = branding();
  // Per-variant header logo: KinLong / GlassTech each have their own; "General"
  // uses the main logo. Falls back to the main logo if the variant one isn't set.
  const perVariant = printType === 'KinLong' ? (b?.logoKinlongDataUrl || '')
                   : printType === 'Glasstech' ? (b?.logoGlasstechDataUrl || '')
                   : (b?.logoDataUrl || '');
  const chosen = perVariant.trim() || (b?.logoDataUrl || '').trim();
  const logo = b && b.showLogo !== false && chosen ? chosen : '';

  return (
    <div className="mb-2 pb-2 border-b-2 border-slate-800">
      <div className="flex justify-between items-start gap-4">
        {/* Seller identity */}
        <div className="flex items-center gap-3 min-w-0">
          {logo ? <img src={logo} alt="" className="h-12 w-auto max-w-[120px] object-contain shrink-0" /> : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 leading-none">{info.name}</h1>
            {info.tagline && (
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">{info.tagline}</p>
            )}
            {printType === 'Glasstech' && (
              <p className="text-[9px] font-bold text-slate-500">A GlassTech Group Company</p>
            )}
          </div>
        </div>
        {/* Contact block */}
        <div className="text-right text-[9px] font-bold text-slate-700 leading-snug shrink-0">
          {info.address && <p>{info.address}</p>}
          {info.phone && <p>Tel: {info.phone}</p>}
          {info.email && <p>{info.email}</p>}
          {info.website && <p>{info.website}</p>}
          {printType === 'KinLong' && (
            <p className="text-[8px] font-black uppercase tracking-widest text-blue-700 mt-0.5">Authorized KIN LONG Partner</p>
          )}
        </div>
      </div>
      {/* Regulatory line — only when configured */}
      {(info.ntn || info.strn) && (
        <div className="flex flex-wrap gap-x-5 gap-y-0.5 mt-1 text-[9px] font-bold text-slate-600">
          {info.ntn && <span>NTN: <span className="text-slate-900">{info.ntn}</span></span>}
          {info.strn && <span>STRN: <span className="text-slate-900">{info.strn}</span></span>}
        </div>
      )}
    </div>
  );
};

/**
 * NipponBankFooter — bank / payment details, rendered only when the owner has
 * filled them in Branding Settings and left "show bank on invoice" on.
 */
export const NipponBankFooter: React.FC = () => {
  const b = branding();
  if (!b || b.showBankOnInvoice === false || !(b.bankName || '').trim()) return null;
  const parts = [
    b.bankName && `Bank: ${b.bankName}`,
    b.bankAccountTitle && `Title: ${b.bankAccountTitle}`,
    b.bankAccountNo && `A/C: ${b.bankAccountNo}`,
    b.bankIban && `IBAN: ${b.bankIban}`,
    b.bankBranch && `Branch: ${b.bankBranch}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <div className="mt-2 pt-1 border-t border-slate-200 text-[9px] font-bold text-slate-600">
      <span className="uppercase tracking-widest text-slate-400 mr-2">Bank Details</span>
      {parts.join('   ·   ')}
    </div>
  );
};

export default NipponLetterhead;
