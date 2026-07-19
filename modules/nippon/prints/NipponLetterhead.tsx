/**
 * NipponLetterhead + NipponContactFooter — shared header/footer for every Nippon
 * customer-facing document (Quotation, Sales Order, Receipt).
 *
 * HEADER: kept deliberately light so it never looks congested —
 *   • LEFT  (fixed): "Nippon Hardware" identity — always, logo or no logo.
 *   • RIGHT (per variant): the partner logo — KinLong on the KinLong variant,
 *     GlassTech on the GlassTech variant (a light text placeholder shows until
 *     that logo is uploaded in Admin → Branding Settings).
 *
 * FOOTER (NipponContactFooter): all the contact / regulatory / bank detail —
 *   address · tel · email · website, NTN/STRN, and bank details — lives here so
 *   the header stays clean. Every line renders only when non-empty (fed by
 *   Branding), so nothing fake is shown. Email switches sales↔accounts by doc.
 */
import React from 'react';
import { MapPin, Phone, Mail, Globe } from 'lucide-react';
import { getNipponCompanyInfo } from '../constants/nipponCompanyInfo';
import { BrandingService, CompanyBranding } from '../../shared/services/brandingService';
import QrTag from '../../glassco/core/QrTag';

export type NipponPrintType = 'KinLong' | 'Glasstech' | 'General';

const branding = (): CompanyBranding | null => {
  try { return BrandingService.getCachedBranding('Nippon'); } catch { return null; }
};

export const NipponLetterhead: React.FC<{ printType?: NipponPrintType }> = ({ printType = 'KinLong' }) => {
  const info = getNipponCompanyInfo();
  const b = branding();
  const showLogos = !b || b.showLogo !== false;
  const ownLogo   = showLogos ? (b?.logoDataUrl || '').trim() : '';
  const kinlong   = showLogos ? (b?.logoKinlongDataUrl || '').trim() : '';
  const glasstech = showLogos ? (b?.logoGlasstechDataUrl || '').trim() : '';

  // Right side = the partner brand for the chosen variant.
  const partnerLogo = printType === 'KinLong' ? kinlong : printType === 'Glasstech' ? glasstech : '';
  const partnerName = printType === 'KinLong' ? 'KIN LONG' : printType === 'Glasstech' ? 'GlassTech' : '';
  const partnerLine =
    printType === 'Glasstech' ? 'A GlassTech Group Company'
    : printType === 'General' ? ''
    : 'Authorized KIN LONG Distributor';

  return (
    <div className="mb-3 pb-2 border-b-2 border-slate-800 flex items-center justify-between gap-6">
      {/* LEFT — Nippon Hardware (fixed) */}
      <div className="flex items-center gap-3 min-w-0">
        {ownLogo ? <img src={ownLogo} alt="" className="h-14 w-auto max-w-[120px] object-contain shrink-0" /> : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-900 leading-none">Nippon Hardware</h1>
          {info.tagline && (
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500 mt-1">{info.tagline}</p>
          )}
        </div>
      </div>

      {/* RIGHT — partner logo (per variant) with its distributor/group line beneath.
          The line hugs the logo and is locked to the logo's width: `w-0 min-w-full`
          keeps the column sized by the logo (not the text), so the caption spans
          exactly the logo width and never runs wider. Light placeholder until a
          logo is uploaded in Branding. */}
      <div className="flex flex-col items-end justify-center shrink-0">
        {(partnerLogo || partnerName) && (
          <div className="inline-flex flex-col items-center w-fit">
            {partnerLogo
              ? <img src={partnerLogo} alt="" className="h-16 w-auto max-w-[300px] object-contain" />
              : <span className="text-3xl font-black tracking-tight text-slate-300 select-none leading-none">{partnerName}</span>}
            {partnerLine && (
              <p className="w-0 min-w-full text-center text-[10px] font-bold uppercase tracking-tight text-blue-700 leading-tight mt-1">{partnerLine}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * NipponContactFooter — contact, regulatory (NTN/STRN) and bank details for the
 * document footer. `emailKind` picks the sales email (quotation/SO) or accounts
 * email (invoice/receipt). Renders only the lines that are configured.
 */
export const NipponContactFooter: React.FC<{ emailKind?: 'sales' | 'accounts'; showCatalogueQr?: boolean }> = ({ emailKind = 'sales', showCatalogueQr = false }) => {
  const info = getNipponCompanyInfo();
  const b = branding();
  const email = emailKind === 'accounts' ? (info.accountsEmail || info.email) : info.email;

  const hasContact = !!(info.address || info.phone || email || info.website);
  const reg = [info.ntn && `NTN: ${info.ntn}`, info.strn && `STRN: ${info.strn}`].filter(Boolean).join('   ·   ');
  const bankParts = b && b.showBankOnInvoice !== false ? [
    b.bankName && `Bank: ${b.bankName}`,
    b.bankAccountTitle && `Title: ${b.bankAccountTitle}`,
    b.bankAccountNo && `A/C: ${b.bankAccountNo}`,
    b.bankIban && `IBAN: ${b.bankIban}`,
  ].filter(Boolean) : [];

  const site = (info.website || 'www.nipponhardware.com.pk').trim();
  const catalogueUrl = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  const withQr = showCatalogueQr && !!site;

  if (!hasContact && !reg && bankParts.length === 0 && !withQr) return null;

  const infoBlock = (
    <div className="flex-1 text-center text-[9px] font-bold text-slate-500 leading-snug space-y-0.5">
      {hasContact && (
        // Each contact detail gets its own glyph so the footer scans at a glance.
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5">
          {info.address && <span className="inline-flex items-center gap-1"><MapPin size={9} className="shrink-0 text-slate-400" />{info.address}</span>}
          {info.phone   && <span className="inline-flex items-center gap-1"><Phone  size={9} className="shrink-0 text-slate-400" />{info.phone}</span>}
          {email        && <span className="inline-flex items-center gap-1"><Mail   size={9} className="shrink-0 text-slate-400" />{email}</span>}
          {info.website && <span className="inline-flex items-center gap-1"><Globe  size={9} className="shrink-0 text-slate-400" />{info.website}</span>}
        </div>
      )}
      {reg && <div className="text-slate-600">{reg}</div>}
      {bankParts.length > 0 && (
        <div className="text-slate-600"><span className="uppercase tracking-widest text-slate-400 mr-1">Bank</span>{bankParts.join('   ·   ')}</div>
      )}
    </div>
  );

  if (!withQr) {
    return <div className="mt-2 pt-1.5 border-t border-slate-200">{infoBlock}</div>;
  }

  // QR (left) + centred contact block + a matching spacer (right) so the text
  // stays visually centred. Scans to the full online catalogue.
  return (
    <div className="mt-2 pt-1.5 border-t border-slate-200 flex items-center justify-between gap-3">
      <div className="w-14 shrink-0 flex flex-col items-center">
        <QrTag value={catalogueUrl} sizeMm={15} />
        <span className="text-[6px] font-black uppercase tracking-widest text-slate-400 mt-0.5 text-center leading-tight">Scan for<br/>catalogue</span>
      </div>
      {infoBlock}
      <div className="w-14 shrink-0" aria-hidden="true" />
    </div>
  );
};

export default NipponLetterhead;
