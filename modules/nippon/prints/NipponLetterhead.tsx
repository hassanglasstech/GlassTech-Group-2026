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
    : 'Authorized Distributor';

  // TABLE layout, deliberately NOT flex. html2canvas does not implement flex
  // alignment, so `items-center` here made it compute a different header height
  // than the browser — measured: the QUOTATION oval below rendered 22px too high
  // in the PDF. It never showed while the partner mark was TEXT (both columns were
  // the same height, so getting flex wrong changed nothing); the PNG made the right
  // column taller and the error became visible. Tables it does lay out correctly —
  // that is why the items grid has always been right.
  return (
    <div className="mb-3 pb-2 border-b-2 border-slate-800">
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            {ownLogo && (
              <td className="w-[120px] pr-3 align-middle">
                <img src={ownLogo} alt="" className="max-h-[56px] max-w-[120px]" />
              </td>
            )}
            <td className="align-middle">
              {/* Explicit line-heights, never `leading-none`. html2canvas reproduces a
                  box whose line-height IS its content height exactly, but GUESSES when
                  the leading is none/normal — which is what squeezed the gap under the
                  wordmark in the PDF while the preview looked right. */}
              <h1 className="text-2xl font-black tracking-tight text-slate-900 leading-[26px]">Nippon Hardware</h1>
              {info.tagline && (
                <p className="mt-[3px] text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500 leading-[11px]">{info.tagline}</p>
              )}
            </td>

            {/* FIXED SLOT — a constant 140x54 box with a constant 140-wide caption,
                so the header is immune to whatever logo aspect gets uploaded next.
                The mark is centred by line-height + align-middle (the one centring
                construct html2canvas reproduces exactly — verified on the oval),
                and sized by max-width/max-height rather than object-fit, which
                html2canvas does not support. */}
            {(partnerLogo || partnerName) && (
              <td className="w-[140px] align-middle">
                <div className="h-[54px] w-[140px] text-center leading-[54px]">
                  {partnerLogo
                    ? <img src={partnerLogo} alt="" className="inline-block max-h-[54px] max-w-[140px] align-middle" />
                    // The text mark is a FIRST-CLASS alternative to the image, not a
                    // "no logo yet" placeholder — clearing the logo in Branding is a
                    // supported way to run this letterhead, and it is the safest one:
                    // text is laid out by the same engine that renders the rest of
                    // the sheet, so preview and PDF cannot disagree about its height.
                    // It was slate-300, which read as something that failed to load.
                    : <span className="align-middle text-2xl font-black tracking-tight text-slate-800 select-none">{partnerName}</span>}
                </div>
                {partnerLine && (
                  <p className="mt-1 w-[140px] text-center text-[10px] font-bold uppercase tracking-tight text-blue-700 leading-tight">{partnerLine}</p>
                )}
              </td>
            )}
          </tr>
        </tbody>
      </table>
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
        // Plain text, deliberately NOT icons. html2canvas cannot place an inline
        // <svg> against its text: flex align-items, inline vertical-align,
        // table-cell and a clone-only positional nudge were each measured off the
        // real rasterised canvas and every one left the glyph ~7px high (the DOM
        // itself was correct to 1px in all four). Text is laid out by the same
        // engine that renders the rest of this sheet flawlessly, so it always
        // aligns. Revisit icons only if the PDF engine changes.
        <div>
          {[info.address, info.phone && `Tel: ${info.phone}`, email, info.website]
            .filter(Boolean)
            .join('   ·   ')}
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
