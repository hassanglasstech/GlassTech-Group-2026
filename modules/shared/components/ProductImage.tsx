import React, { useState } from 'react';
import { Package } from 'lucide-react';

const SUPA = (import.meta as any).env?.VITE_SUPABASE_URL || '';

// ERP convention: Supabase public bucket 'product-images', file = NIP-KL-<code>.<ext>
export function nipponImageUrl(code?: string, ext: 'png' | 'jpg' = 'png'): string {
  if (!SUPA || !code) return '';
  return `${SUPA}/storage/v1/object/public/product-images/NIP-KL-${encodeURIComponent(String(code).trim())}.${ext}`;
}

interface Props { code?: string; url?: string; alt?: string; className?: string; iconSize?: number; }

/** Tries the stored image_url first, then the bucket file by code as .png, then
 *  .jpg, then a placeholder. So an image shows whether it was uploaded via the
 *  form (.jpg, url stored) or dropped into the bucket in bulk (.png), and the
 *  Master no longer shows "sometimes yes, sometimes no" based on a stored url. */
export const ProductImage: React.FC<Props> = ({ code, url, alt, className, iconSize = 18 }) => {
  const candidates = [
    (url && url.trim()) ? url.trim() : '',
    nipponImageUrl(code, 'png'),
    nipponImageUrl(code, 'jpg'),
  ].filter(Boolean);
  const [idx, setIdx] = useState(0);
  if (idx >= candidates.length) return <Package size={iconSize} className="text-slate-300" />;
  return (
    <img src={candidates[idx]} alt={alt || code || ''} className={className} loading="lazy"
      onError={() => setIdx(i => i + 1)} />
  );
};
export default ProductImage;
