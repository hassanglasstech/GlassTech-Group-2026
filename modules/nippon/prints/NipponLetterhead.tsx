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

  // HISTORY, so nobody re-litigates the logo: this header used flex, and
  // html2canvas — which does not implement flex alignment — computed a different
  // header height than the browser, pushing the QUOTATION oval 22px up in the PDF.
  // It stayed invisible while the partner mark was TEXT (both columns were the same
  // height, so getting flex wrong changed nothing); the PNG made the right column
  // taller and exposed it. The logo was never the fault — the rasteriser was.
  //
  // That rasteriser is now gone from the quote/SO path (NipponPrintTemplate prints
  // through the browser, Glassco-style), and the receipt — the one surviving
  // html2canvas document — imports only NipponContactFooter, not this header. So
  // the table layout below is no longer a workaround; it is kept simply because it
  // is correct and stable. The FOOTER's plain-text-no-SVG rule, however, is still
  // load-bearing: the receipt renders it through html2canvas.
  return (
    <div className="mb-3 pb-2 border-b-2 border-slate-800">
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            {/* Own-logo slot. Capped on BOTH axes and centred, so it accepts either
                shape without the header lurching: a wide horizontal wordmark hits
                the width cap, a stacked mark (Nippon's — monogram over the name
                over a tagline) hits the height cap. 78px of height is what makes
                the stacked one's tagline hold together; at print resolution a
                ~1600px-wide source lands near 1900dpi there, so it stays crisp
                even though it looks small on screen. */}
            {/* THE LOGO REPLACES THE WORDMARK — it does not sit beside it.
                An uploaded logo already carries the company name (and, for
                Nippon's, the tagline too), so printing "Nippon Hardware" next to
                it says the same thing twice. Whichever exists is the identity:
                logo if uploaded, text if not. That also means the letterhead can
                never end up blank — clearing the logo in Branding brings the
                wordmark straight back, no code change. */}
            <td className="align-middle">
              {ownLogo ? (
                // LOGO_SLOT — balanced against the partner slot by AREA, not height.
                //
                // Matching the two on height was the mistake: the eye reads how much
                // paper a mark covers, not how tall it is, so a 2.69:1 partner
                // wordmark at the same height covered 2.4x the area of our near-square
                // mark and simply looked bigger. These two boxes are sized so the two
                // real logos land at ~7,200 px^2 each — ours 90x80, the partner's
                // 140x52. Different shapes, same visual weight.
                <div className="h-[80px] w-[100px] text-left leading-[80px]">
                  <img src={ownLogo} alt="" className="inline-block max-h-[80px] max-w-[100px] align-middle" />
                </div>
              ) : (
                <>
                  {/* Explicit line-heights, never `leading-none` — see the note on
                      the receipt path in the footer below. */}
                  <h1 className="text-2xl font-black tracking-tight text-slate-900 leading-[26px]">Nippon Hardware</h1>
                  {info.tagline && (
                    <p className="mt-[3px] text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500 leading-[11px]">{info.tagline}</p>
                  )}
                </>
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
                {/* Wider and shorter than our own slot on purpose — see LOGO_SLOT.
                    A wide wordmark fills width first, so 140x52 gives it the same
                    ~7,200 px^2 of paper our taller mark gets. */}
                <div className="h-[52px] w-[140px] text-center leading-[52px]">
                  {partnerLogo
                    ? <img src={partnerLogo} alt="" className="inline-block max-h-[52px] max-w-[140px] align-middle" />
                    // The text mark is a FIRST-CLASS alternative to the image, not a
                    // "no logo yet" placeholder — clearing the logo in Branding is a
                    // supported way to run this letterhead, and it is the safest one:
                    // text is laid out by the same engine that renders the rest of
                    // the sheet, so preview and PDF cannot disagree about its height.
                    // It was slate-300, which read as something that failed to load.
                    : <span className="align-middle text-2xl font-black tracking-tight text-slate-800 select-none">{partnerName}</span>}
                </div>
                {partnerLine && (
                  <p className="mt-1 w-[140px] text-center text-[9px] font-bold uppercase tracking-tight text-blue-700 leading-tight">{partnerLine}</p>
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
export const NipponContactFooter: React.FC<{ emailKind?: 'sales' | 'accounts'; showCatalogueQr?: boolean }> = ({ emailKind = 'sales', showCatalogueQr }) => {
  const info = getNipponCompanyInfo();
  const b = branding();
  const email = emailKind === 'accounts' ? (info.accountsEmail || info.email) : info.email;

  const hasContact = !!(info.address || info.phone || email || info.website);
  // NTN / STRN ride the SAME switch as the GST line (Admin → Branding). They are
  // one claim, not three: printing a Sales Tax Registration number on a document
  // that charges no sales tax tells the buyer we are filing GST when we are not.
  // Until the founder turns tax on, these documents stay silent about it.
  const showTaxIdentity = !!b?.showGstOnInvoice;
  const reg = showTaxIdentity
    ? [info.ntn && `NTN: ${info.ntn}`, info.strn && `STRN: ${info.strn}`].filter(Boolean).join('   ·   ')
    : '';
  const bankParts = b && b.showBankOnInvoice !== false ? [
    b.bankName && `Bank: ${b.bankName}`,
    b.bankAccountTitle && `Title: ${b.bankAccountTitle}`,
    b.bankAccountNo && `A/C: ${b.bankAccountNo}`,
    b.bankIban && `IBAN: ${b.bankIban}`,
  ].filter(Boolean) : [];

  // The QR is a BRANDING setting now (Admin → Branding), not something each print
  // hardcodes — it was on for quotations and sales orders whether or not anyone
  // wanted it. A caller may still force it via the prop; otherwise the toggle rules.
  const qrOn = showCatalogueQr ?? !!b?.showQrOnInvoice;
  const uploadedQr = (b?.catalogueQrDataUrl || '').trim();
  const site = (info.website || 'www.nipponhardware.com.pk').trim();
  const catalogueUrl = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  // An uploaded code is what the customer should scan; generating one from the
  // website is only the fallback so the toggle is never a no-op.
  const withQr = qrOn && (!!uploadedQr || !!site);

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
        {uploadedQr
          ? <img src={uploadedQr} alt="Catalogue QR" className="w-[15mm] h-[15mm] object-contain" />
          : <QrTag value={catalogueUrl} sizeMm={15} />}
        <span className="text-[6px] font-black uppercase tracking-widest text-slate-400 mt-0.5 text-center leading-tight">Scan for<br/>catalogue</span>
      </div>
      {infoBlock}
      <div className="w-14 shrink-0" aria-hidden="true" />
    </div>
  );
};

export default NipponLetterhead;
