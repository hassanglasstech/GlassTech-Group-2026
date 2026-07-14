// Client-side PDF generation from a rendered DOM node.
//
// Why: on mobile, the browser's print → "Save as PDF" path is unreliable (blank
// pages, no save dialog). Generating the PDF ourselves produces a real .pdf file
// download that works the same on every device. The heavy libs are dynamically
// imported so they land in a lazy chunk and never weigh down the initial load.

/**
 * Render `el` to a multi-page A4 PDF and trigger a download named `<filename>.pdf`.
 * The node is captured at its natural width (the print sheet is 210mm), sliced
 * across A4 pages when taller than one page.
 */
export async function exportElementToPdf(el: HTMLElement, filename: string): Promise<void> {
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

  pdf.save(`${filename}.pdf`);
}
