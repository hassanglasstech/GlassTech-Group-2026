/**
 * PhotoCapture — Sprint 12
 *
 * Mobile-first photo capture using the native file-input camera trigger
 * (`capture="environment"`). On phones this opens the rear camera
 * directly; on desktop it falls back to the file picker — both are
 * useful for the driver app and for office capture.
 *
 * Returns the captured photo as a base64 dataURL via onChange. Optional
 * client-side resize keeps uploads small (default ≤1280 px on the long
 * edge, JPEG q=0.85).
 *
 * Usage:
 *   <PhotoCapture
 *     label="Photo at gate"
 *     onChange={(dataUrl) => setPhoto(dataUrl)}
 *   />
 */

import React, { useRef, useState } from 'react';
import { Camera, X, Image as ImageIcon } from 'lucide-react';

interface PhotoCaptureProps {
  label?:        string;
  /** Called once the photo is captured + (optionally) resized. */
  onChange?:     (dataUrl: string) => void;
  /** Long-edge max in px. Default 1280. Pass 0 to disable resize. */
  maxDimension?: number;
  /** JPEG quality 0-1. Default 0.85 */
  quality?:      number;
  className?:    string;
}

async function resizeToDataUrl(
  file: File,
  maxDimension: number,
  quality: number,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = maxDimension > 0 && longEdge > maxDimension ? maxDimension / longEdge : 1;
  const w = Math.round(bitmap.width  * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

const PhotoCapture: React.FC<PhotoCaptureProps> = ({
  label        = 'Take photo',
  onChange,
  maxDimension = 1280,
  quality      = 0.85,
  className    = '',
}) => {
  const inputRef         = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeToDataUrl(file, maxDimension, quality);
      setPreview(dataUrl);
      onChange?.(dataUrl);
    } catch (err) {
      console.error('[PhotoCapture] resize failed', err);
      // Fall back to raw FileReader if bitmap path fails (older Safari)
      const fr = new FileReader();
      fr.onload = () => {
        const url = String(fr.result || '');
        setPreview(url);
        onChange?.(url);
      };
      fr.readAsDataURL(file);
    } finally {
      setBusy(false);
      // Reset so the same photo can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const clear = () => {
    setPreview(null);
    onChange?.('');
  };

  return (
    <div className={`photo-capture ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="hidden"
      />

      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt={label}
            className="w-full max-h-64 object-cover rounded-lg border-2 border-emerald-200"
          />
          <button
            type="button"
            onClick={clear}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg"
            aria-label="Remove photo"
          >
            <X size={16}/>
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-2 w-full px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-bold text-sm flex items-center justify-center gap-2"
          >
            <Camera size={14}/> Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full h-32 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center gap-2 text-slate-500 disabled:opacity-50"
        >
          {busy ? (
            <>
              <ImageIcon size={28} className="animate-pulse"/>
              <span className="text-sm font-bold">Processing…</span>
            </>
          ) : (
            <>
              <Camera size={28}/>
              <span className="text-sm font-bold">{label}</span>
              <span className="text-[10px] text-slate-400">Tap to open camera</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default PhotoCapture;
