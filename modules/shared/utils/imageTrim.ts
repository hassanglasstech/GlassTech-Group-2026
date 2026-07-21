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
 * Make a logo's flat backdrop transparent, so it sits ON the letterhead instead
 * of looking like a photo pasted onto it.
 *
 * Designers routinely export on an off-white canvas rather than a transparent
 * one — Nippon's came in on #F7F7F7. Cropping alone cannot help: the backdrop is
 * BEHIND the artwork, not around it, so the trimmed logo still prints as a grey
 * rectangle on white paper.
 *
 * Flood-fills inward from the border rather than matching the colour globally,
 * so a pixel of the same off-white INSIDE the mark (a highlight, a counter in a
 * letter) is never punched through. Bails out unless the border really is one
 * flat colour, and refuses to eat more than 92% of the image — either means this
 * is a photo or a full-bleed design, and clearing it would destroy the upload.
 */
const TOLERANCE = 26;          // how far a pixel may drift and still be "the backdrop"
const MAX_CLEARED = 0.92;      // above this we are clearly not looking at a backdrop

function clearFlatBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const at = (x: number, y: number) => (y * w + x) * 4;

  // The backdrop colour is whatever the four corners agree on.
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  if (corners.some(i => d[i + 3] < 250)) return false;          // already transparent
  const [r0, g0, b0] = [d[corners[0]], d[corners[0] + 1], d[corners[0] + 2]];
  const agrees = (i: number) =>
    Math.abs(d[i] - r0) <= TOLERANCE && Math.abs(d[i + 1] - g0) <= TOLERANCE && Math.abs(d[i + 2] - b0) <= TOLERANCE;
  if (!corners.every(agrees)) return false;                     // no single flat backdrop

  // Iterative flood fill from every border pixel (a stack, not recursion — a
  // 1600x1425 logo would blow the call stack).
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1); }
  for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y); }

  let cleared = 0;
  while (stack.length) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (d[i + 3] < 16) continue;                                // already clear
    if (!agrees(i)) continue;                                   // hit the artwork — stop
    d[i + 3] = 0;
    cleared++;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  if (cleared === 0 || cleared / (w * h) > MAX_CLEARED) return false;
  ctx.putImageData(img, 0, 0);
  return true;
}

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

    // Punch out a flat backdrop FIRST. It makes the logo sit on the letterhead
    // instead of on a grey card, and it also lets the crop below find the real
    // artwork edges — against an opaque backdrop every pixel reads as content,
    // so there is nothing to trim.
    const backdropCleared = clearFlatBackdrop(sctx, w, h);

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
    // Nothing to crop — but if the backdrop was punched out we must still re-emit
    // the canvas, or that work is thrown away and the grey card is stored again.
    if (cw >= w && ch >= h && !backdropCleared) return dataUrl;

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
