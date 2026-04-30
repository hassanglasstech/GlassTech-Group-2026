/**
 * QrTag.tsx — Phase-4 (4.3 / 4.4)
 *
 * Tiny synchronous QR code renderer used on:
 *   • SheetTag / RemnantTag prints (12 tags per A4 page)
 *   • Job Card piece-row prints
 *   • Sales Order job-level scan QR
 *
 * Why synchronous?
 *   `QRCode.toDataURL` and `toString` are async (Promise-based) which
 *   plays badly with React's print flow — `window.print()` can fire
 *   before the data URL has resolved, leaving a blank box on paper.
 *   `QRCode.create()` returns the bit matrix synchronously, so we can
 *   render an inline SVG that's ready by the time React commits.
 */

import React from 'react';
import QRCode from 'qrcode';

interface Props {
  /** Payload to encode (ID, URL, JSON, etc.). Falsy → renders nothing. */
  value: string | undefined | null;
  /** Square size in mm. Default 14mm fits a 62mm tag corner. */
  sizeMm?: number;
  /** Override foreground colour (default black). */
  fg?: string;
  /** Override background colour (default white). Use 'transparent' on dark cards. */
  bg?: string;
  /** Optional className for the wrapping <svg>. */
  className?: string;
  /** Error correction level. M (15%) is the QR default sweet-spot. */
  ecLevel?: 'L' | 'M' | 'Q' | 'H';
}

const QrTag: React.FC<Props> = ({
  value,
  sizeMm = 14,
  fg     = '#000',
  bg     = '#fff',
  className,
  ecLevel = 'M',
}) => {
  if (!value) return null;

  let n = 0;
  let modules: Uint8Array | undefined;
  try {
    const code = QRCode.create(String(value), { errorCorrectionLevel: ecLevel });
    modules = code.modules.data;
    n = code.modules.size;
  } catch (e) {
    // Encoding failed (e.g. payload too large) — render a placeholder so the
    // print layout is unchanged; operators will notice the blank cell.
    return (
      <svg
        width={`${sizeMm}mm`} height={`${sizeMm}mm`}
        viewBox={`0 0 ${sizeMm} ${sizeMm}`}
        className={className}
      >
        <rect width={sizeMm} height={sizeMm} fill={bg}/>
        <rect x={1} y={1} width={sizeMm - 2} height={sizeMm - 2} fill="none" stroke={fg} strokeWidth="0.4" strokeDasharray="0.6"/>
      </svg>
    );
  }

  if (!modules || n <= 0) return null;
  const cell = sizeMm / n;
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules[r * n + c]) {
        rects.push(
          <rect
            key={`${r}-${c}`}
            x={c * cell}
            y={r * cell}
            width={cell}
            height={cell}
            fill={fg}
          />
        );
      }
    }
  }

  return (
    <svg
      width={`${sizeMm}mm`}
      height={`${sizeMm}mm`}
      viewBox={`0 0 ${sizeMm} ${sizeMm}`}
      shapeRendering="crispEdges"
      className={className}
      style={{ display: 'block' }}
    >
      {bg !== 'transparent' && <rect width={sizeMm} height={sizeMm} fill={bg}/>}
      {rects}
    </svg>
  );
};

export default QrTag;
