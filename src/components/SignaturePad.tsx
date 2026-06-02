/**
 * SignaturePad — Sprint 12
 *
 * Touch + mouse signature capture on a <canvas>. Returns a base64 PNG
 * dataURL via onChange (debounced) so the parent can persist on submit.
 *
 * Mobile-first:
 *   - Stops scroll while drawing
 *   - High-DPI canvas (devicePixelRatio scaled)
 *   - Pointer events (works for stylus, finger, mouse without per-event
 *     code paths)
 *
 * Usage:
 *   <SignaturePad onChange={(dataUrl) => setSig(dataUrl)} height={180} />
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Eraser, Check } from 'lucide-react';

interface SignaturePadProps {
  /** Fired each time the user lifts their finger / mouse — debounced */
  onChange?:   (dataUrl: string) => void;
  /** Visual height of the pad in CSS px. Default 180. */
  height?:     number;
  /** Stroke colour. Default '#0f172a' (slate-900). */
  strokeColor?: string;
  /** Stroke width in CSS px. Default 2.5 */
  strokeWidth?: number;
  /** Optional class on the outer wrapper */
  className?:   string;
}

const SignaturePad: React.FC<SignaturePadProps> = ({
  onChange,
  height       = 180,
  strokeColor  = '#0f172a',
  strokeWidth  = 2.5,
  className    = '',
}) => {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const drawingRef      = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [width, setWidth]     = useState(0);

  // ── Setup canvas size + DPI ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const ro = new ResizeObserver(() => {
      const cssW = parent.clientWidth;
      setWidth(cssW);
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(cssW * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width  = `${cssW}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.lineWidth   = strokeWidth;
        ctx.strokeStyle = strokeColor;
      }
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [height, strokeColor, strokeWidth]);

  // ── Drawing handlers ────────────────────────────────────────────
  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const { x, y } = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (e) {
      const canvas = canvasRef.current;
      try { canvas?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsEmpty(false);
    onChange?.(canvas.toDataURL('image/png'));
  }, [onChange]);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onChange?.('');
  };

  return (
    <div className={`signature-pad ${className}`}>
      <div
        className="relative w-full bg-white rounded-lg border-2 border-dashed border-slate-300 overflow-hidden"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="touch-none w-full h-full block"
          aria-label="Signature pad"
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-slate-400 text-sm font-medium">Sign here</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="text-slate-400">
          {isEmpty ? 'No signature yet' : `${width}px wide pad — looks good`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clear}
            disabled={isEmpty}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 font-semibold"
          >
            <Eraser size={12}/> Clear
          </button>
          {!isEmpty && (
            <span className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold">
              <Check size={12}/> Captured
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignaturePad;
