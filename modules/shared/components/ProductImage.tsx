import React, { useState } from 'react';
import { Package } from 'lucide-react';

const SUPA = (import.meta as any).env?.VITE_SUPABASE_URL || '';

// ERP convention: Supabase public bucket 'product-images', file = NIP-KL-<code>.png
export function nipponImageUrl(code?: string): string {
  if (!SUPA || !code) return '';
  return `${SUPA}/storage/v1/object/public/product-images/NIP-KL-${encodeURIComponent(String(code).trim())}.png`;
}

interface Props { code?: string; url?: string; alt?: string; className?: string; iconSize?: number; }

/** Shows stored image_url if present; otherwise auto-derives the bucket URL from the
 *  product code. So just dropping NIP-KL-<code>.png into the bucket makes it appear. */
export const ProductImage: React.FC<Props> = ({ code, url, alt, className, iconSize = 18 }) => {
  const derived = nipponImageUrl(code);
  const initial = (url && url.trim()) ? url : derived;
  const [src, setSrc] = useState(initial);
  const [failed, setFailed] = useState(!initial);
  if (failed) return <Package size={iconSize} className="text-slate-300" />;
  return (
    <img src={src} alt={alt || code || ''} className={className} loading="lazy"
      onError={() => { if (src !== derived && derived) setSrc(derived); else setFailed(true); }} />
  );
};
export default ProductImage;
