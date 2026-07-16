// Client-side PDF generation from a rendered DOM node.
//
// Why: on mobile, the browser's print → "Save as PDF" path is unreliable (blank
// pages, no save dialog). Generating the PDF ourselves produces a real .pdf file
// that works the same on every device — and, importantly, a Blob we can hand to
// the Web Share API so a trader can WhatsApp a quote straight from the preview.
// The heavy libs are dynamically imported so they land in a lazy chunk and never
// weigh down the initial load.

import type { jsPDF as JsPdf } from 'jspdf';

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
  const pageW = 210;
  const pageH = 297;
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
    heightLeft -= pageH;
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
