// Crop blank padding off a data-URL image.
//
// Why: brand logos are routinely exported on a square canvas with the artwork
// centred (e.g. a 2.56:1 lockup sitting inside a 447x447 PNG = ~67% empty
// vertical padding). On a print letterhead the <img> box is sized by the CANVAS,
// so the visible artwork ends up a third of the intended height and the caption
// under it inherits a uselessly narrow width. Trimming on upload means the
// stored asset IS the artwork, and every downstream size just works.

/** A pixel counts as blank when it is transparent or effectively white. */
const isBlankPx = (d: Uint8ClampedArray, i: number): boolean =>
  d[i + 3] < 16 || (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245);

/**
 * Return `dataUrl` cropped to its artwork's bounding box. Returns the input
 * untouched for SVGs, blank images, already-tight images, or any failure —
 * trimming is an enhancement and must never lose the user's upload.
 */
export async function trimImagePadding(dataUrl: string, pad = 0): Promise<string> {
  // SVG scales cleanly and has no raster padding to measure — leave it alone.
  if (!/^data:image\/(png|webp|jpeg|jpg)/i.test(dataUrl)) return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = dataUrl;
    });
    if (!img?.naturalWidth || !img.naturalHeight) return dataUrl;

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    const sctx = src.getContext('2d');
    if (!sctx) return dataUrl;
    sctx.drawImage(img, 0, 0);

    const d = sctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isBlankPx(d, (y * w + x) * 4)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return dataUrl;                       // fully blank

    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    if (cw >= w && ch >= h) return dataUrl;             // already tight

    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    const octx = out.getContext('2d');
    if (!octx) return dataUrl;
    octx.drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);
    return out.toDataURL('image/png');                  // PNG keeps transparency
  } catch {
    return dataUrl;
  }
}
