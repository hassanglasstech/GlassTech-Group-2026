import React, { useState } from 'react';
import { Package } from 'lucide-react';
import { withImageCacheBust } from '@/modules/shared/utils/imageCache';

const SUPA = (import.meta as any).env?.VITE_SUPABASE_URL || '';

// ERP convention: Supabase public bucket 'product-images', file = NIP-KL-<code>.<ext>
export function nipponImageUrl(code?: string, ext: 'png' | 'jpg' = 'png'): string {
  if (!SUPA || !code) return '';
  return `${SUPA}/storage/v1/object/public/product-images/NIP-KL-${encodeURIComponent(String(code).trim())}.${ext}`;
}

// Files are named EXACTLY by product id (e.g. NIP-KL-CZS133-L55-W.png), so the
// image is resolvable from the id alone — no product-master lookup required.
export function bucketImageUrl(id?: string, ext: 'png' | 'jpg' = 'png'): string {
  if (!SUPA || !id) return '';
  return `${SUPA}/storage/v1/object/public/product-images/${encodeURIComponent(String(id).trim())}.${ext}`;
}

interface Props { id?: string; code?: string; url?: string; alt?: string; className?: string; iconSize?: number; eager?: boolean; }

/** Tries, in order: the stored image_url → the bucket file by product **id**
 *  (id.png, id.jpg) → the legacy NIP-KL-<code> file (.png, .jpg) → a placeholder.
 *  The id path means prints resolve the image straight from item.productRef
 *  without needing the product master loaded (the Sales-Order print bug). */
export const ProductImage: React.FC<Props> = ({ id, code, url, alt, className, iconSize = 18, eager = false }) => {
  const candidates = [...new Set([
    (url && url.trim()) ? url.trim() : '',
    bucketImageUrl(id, 'png'),
    bucketImageUrl(id, 'jpg'),
    nipponImageUrl(code, 'png'),
    nipponImageUrl(code, 'jpg'),
  ].filter(Boolean))].map(withImageCacheBust);
  const [idx, setIdx] = useState(0);
  if (idx >= candidates.length) return <Package size={iconSize} className="text-slate-300" />;
  return (
    <img src={candidates[idx]} alt={alt || code || ''} className={className} loading={eager ? 'eager' : 'lazy'} referrerPolicy="no-referrer"
      onError={() => setIdx(i => i + 1)} />
  );
};
export default ProductImage;
