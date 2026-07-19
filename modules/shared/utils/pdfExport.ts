// Client-side PDF generation from a rendered DOM node.
//
// Why: on mobile, the browser's print → "Save as PDF" path is unreliable (blank
// pages, no save dialog). Generating the PDF ourselves produces a real .pdf file
// that works the same on every device — and, importantly, a Blob we can hand to
// the Web Share API so a trader can WhatsApp a quote straight from the preview.
// The heavy libs are dynamically imported so they land in a lazy chunk and never
// weigh down the initial load.

import type { jsPDF as JsPdf } from 'jspdf';

/** A4 page geometry shared by the PDF writer and the on-screen page guides. */
export const PDF_PAGE_W_MM = 210;
export const PDF_PAGE_H_MM = 297;
/** Height of the footer band reserved on every page for the "Page n / N" stamp. */
export const PDF_FOOTER_H_MM = 12;
/** Sheet height shown per PDF page. The preview draws its page-break guides at
 *  multiples of this, so what the user sees is exactly where the PDF splits. */
export const PDF_CONTENT_H_MM = PDF_PAGE_H_MM - PDF_FOOTER_H_MM;

/**
 * Y offsets (px, relative to `el`) where a page may break WITHOUT slicing through
 * a table row. One entry per row bottom — those are the only clean seams.
 */
function rowSeamsPx(el: HTMLElement): number[] {
  const top = el.getBoundingClientRect().top;
  return Array.from(el.querySelectorAll('tbody tr'))
    .map((tr) => (tr as HTMLElement).getBoundingClientRect().bottom - top)
    .sort((a, b) => a - b);
}

/**
 * Page cut offsets (px from the top of `el`) that never split a product row:
 * for each page, take the LAST row seam that still fits in the remaining height.
 * Page 1 gets `firstCapPx`; continuation pages get `contCapPx` (they give up
 * height to the repeated column header). Falls back to a hard cut only when a
 * single block is taller than a whole page.
 */
export function computePageCutsPx(el: HTMLElement, firstCapPx: number, contCapPx: number): number[] {
  const totalH = el.getBoundingClientRect().height;
  const seams = rowSeamsPx(el);
  const cuts: number[] = [];
  let start = 0;
  let cap = firstCapPx;
  let guard = 0;
  while (start + cap < totalH - 1 && guard++ < 200) {
    const target = start + cap;
    let cut = -1;
    for (const s of seams) {
      if (s > start + 20 && s <= target) cut = s;
      else if (s > target) break;
    }
    if (cut < 0) cut = target;            // block taller than a page — hard cut
    cuts.push(cut);
    start = cut;
    cap = contCapPx;
  }
  return cuts;
}

/**
 * Render `el` to a multi-page A4 jsPDF document (natural 210mm width, sliced
 * across A4 pages when taller than one page). Shared by the download + share
 * paths so both produce an identical file.
 */
async function renderElementToPdf(el: HTMLElement): Promise<JsPdf> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(el, {
    scale: 2,                    // crisp on retina / print
    useCORS: true,               // Supabase public product images
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 15000,
    // The print sheet is `.print-only` (display:none by default) — force it
    // visible in html2canvas's cloned document so the capture isn't blank.
    onclone: (doc: Document) => {
      doc.querySelectorAll<HTMLElement>('.print-only').forEach((n) => { n.style.display = 'block'; });
    },
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const imgW = PDF_PAGE_W_MM;
  const mmPerPx = imgW / canvas.width;
  const imgH = canvas.height * mmPerPx;

  // Each page shows PDF_CONTENT_H_MM of the sheet and keeps the remaining strip as a
  // clean white footer band — that band carries the "Page n / N" stamp, so the
  // numbering never lands on top of a table row.
  const contentH = PDF_CONTENT_H_MM;

  // The sheet draws the column-header row only once. Crop it out of the rendered
  // canvas so it can be re-stamped at the top of every continuation page (pure
  // canvas crop — no second html2canvas pass).
  let headerImg: string | null = null;
  let headerH = 0;
  try {
    const thead = el.querySelector('thead');
    const sheetRect = el.getBoundingClientRect();
    if (thead && sheetRect.width > 0) {
      const pxScale = canvas.width / sheetRect.width;
      const tr = thead.getBoundingClientRect();
      const sy = Math.max(0, Math.round((tr.top - sheetRect.top) * pxScale));
      const sh = Math.round(tr.height * pxScale);
      if (sh > 0 && sy + sh <= canvas.height) {
        const hc = document.createElement('canvas');
        hc.width = canvas.width;
        hc.height = sh;
        const hctx = hc.getContext('2d');
        if (hctx) {
          hctx.fillStyle = '#ffffff';
          hctx.fillRect(0, 0, hc.width, hc.height);
          hctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
          headerImg = hc.toDataURL('image/jpeg', 0.92);
          headerH = sh * mmPerPx;
        }
      }
    }
  } catch { /* repeating the header is a nicety — never block the export */ }

  // Break pages on row seams so a product is never sliced in half. Page 1 gets a
  // full contentH; continuation pages give up `headerH` to the repeated header.
  const elRect = el.getBoundingClientRect();
  const pxToMm = PDF_PAGE_W_MM / (elRect.width || 1);
  const cutsMm = computePageCutsPx(
    el,
    contentH / pxToMm,
    Math.max(1, contentH - headerH) / pxToMm,
  ).map((p) => p * pxToMm);
  const total = cutsMm.length + 1;

  for (let i = 0; i < total; i++) {
    if (i > 0) pdf.addPage();
    const headH = i === 0 ? 0 : headerH;
    const start = i === 0 ? 0 : cutsMm[i - 1];
    const end = i < cutsMm.length ? cutsMm[i] : imgH;

    // Place the sheet so `start` lines up just below the repeated header.
    pdf.addImage(imgData, 'JPEG', 0, headH - start, imgW, imgH, undefined, 'FAST');
    if (i > 0 && headerImg) {
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, PDF_PAGE_W_MM, headH, 'F');
      pdf.addImage(headerImg, 'JPEG', 0, 0, imgW, headerH, undefined, 'FAST');
    }
    // White-out below this page's last full row (kills the partial next row) and
    // through the footer band, then stamp the page number into that clean strip.
    const contentBottom = Math.min(contentH, headH + (end - start));
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, contentBottom, PDF_PAGE_W_MM, PDF_PAGE_H_MM - contentBottom, 'F');
    pdf.setFontSize(8);
    pdf.setTextColor(130);
    pdf.text(`Page ${i + 1} / ${total}`, PDF_PAGE_W_MM / 2, contentH + 7, { align: 'center' });
  }
  return pdf;
}

/** Render `el` to a PDF and trigger a download named `<filename>.pdf`. */
export async function exportElementToPdf(el: HTMLElement, filename: string): Promise<void> {
  const pdf = await renderElementToPdf(el);
  pdf.save(`${filename}.pdf`);
}

/** Render `el` to a PDF and return it as a File (for the Web Share API / upload). */
export async function elementToPdfFile(el: HTMLElement, filename: string): Promise<File> {
  const pdf = await renderElementToPdf(el);
  const blob = pdf.output('blob');
  return new File([blob], `${filename}.pdf`, { type: 'application/pdf' });
}
