/**
 * NipponLetterhead — ONE shared, CO-BRANDED letterhead for every Nippon
 * customer-facing document (Quotation, Sales Order, Receipt).
 *
 * Layout: the two brand marks FRAME the header — KinLong logo on the left,
 * GlassTech logo on the right — with the seller identity (name, tagline,
 * address, contact, NTN/STRN) CENTRED beneath them. This keeps the two logos
 * balanced and the contact info reading as one clean centred block instead of
 * being crammed into a side column.
 *
 * Logos + regulatory/contact lines are fed by Admin → Branding Settings and
 * render only when non-empty, so nothing fake is ever shown.
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
  const showLogos = !b || b.showLogo !== false;
  const own       = (b?.logoDataUrl || '').trim();
  const kinlong   = (b?.logoKinlongDataUrl || '').trim();
  const glasstech = (b?.logoGlasstechDataUrl || '').trim();

  // Two brand marks framing the header: KinLong (left) + GlassTech (right).
  // If a brand logo isn't uploaded yet, that side stays empty (falls back to the
  // main logo on the left so a single-logo setup still looks intentional).
  const leftLogo  = showLogos ? (kinlong || own) : '';
  const rightLogo = showLogos ? glasstech : '';

  const contactLine = [
    info.address,
    info.phone && `Tel: ${info.phone}`,
    info.email,
    info.website,
  ].filter(Boolean).join('  ·  ');

  const partnerLine =
    printType === 'Glasstech' ? 'A GlassTech Group Company'
    : printType === 'General' ? ''
    : 'Authorized KIN LONG Partner';

  return (
    <div className="mb-3 pb-3 border-b-2 border-slate-800">
      {/* Brand marks — KinLong left, GlassTech right */}
      {(leftLogo || rightLogo) && (
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex-1 flex justify-start">
            {leftLogo ? <img src={leftLogo} alt="" className="h-14 w-auto max-w-[190px] object-contain" /> : <span />}
          </div>
          <div className="flex-1 flex justify-end">
            {rightLogo ? <img src={rightLogo} alt="" className="h-14 w-auto max-w-[190px] object-contain" /> : <span />}
          </div>
        </div>
      )}

      {/* Seller identity — centred beneath the logos */}
      <div className="text-center">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 leading-none">{info.name}</h1>
        {info.tagline && (
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 mt-1">{info.tagline}</p>
        )}
        {contactLine && (
          <p className="text-[9px] font-bold text-slate-600 mt-1.5 leading-snug">{contactLine}</p>
        )}
        {(info.ntn || info.strn) && (
          <p className="text-[9px] font-bold text-slate-600 mt-0.5">
            {[info.ntn && `NTN: ${info.ntn}`, info.strn && `STRN: ${info.strn}`].filter(Boolean).join('   ·   ')}
          </p>
        )}
        {partnerLine && (
          <p className="text-[8px] font-black uppercase tracking-widest text-blue-700 mt-1">{partnerLine}</p>
        )}
      </div>
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
