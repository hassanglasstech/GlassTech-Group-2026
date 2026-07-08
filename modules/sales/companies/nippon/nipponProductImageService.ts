/**
 * nipponProductImageService — per-product image upload/delete for the Nippon
 * Material Master, keyed by product id so the image is TRACEABLE by code.
 *
 * Convention (CLAUDE.md): public bucket `product-images`, file named EXACTLY by
 * the product id — e.g. `NIP-KL-CZS133-L55-W.png`. Storing by id means the same
 * image resolves everywhere (Master, quotation/sales-order print via <ProductImage
 * id=…>) WITHOUT needing the product master loaded. Mirrors the proven upload
 * pattern in employeeDocService (upsert + getPublicUrl + remove).
 */

import { supabase } from '@/src/services/supabaseClient';
import { Logger } from '@/modules/shared/services/logger';

const BUCKET = 'product-images';
const EXTS = ['png', 'jpg', 'jpeg', 'webp'] as const;

const extOf = (file: File): string => {
  const fromName = (file.name.split('.').pop() || '').toLowerCase();
  if (fromName && (EXTS as readonly string[]).includes(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  const fromType = (file.type.split('/').pop() || '').toLowerCase();
  return fromType === 'jpeg' ? 'jpg' : (EXTS as readonly string[]).includes(fromType) ? fromType : 'png';
};

/**
 * Upload (or replace) a product's image. Deletes any prior file for the same id
 * (all known extensions) first so a JPG→PNG swap doesn't leave a stale file, then
 * uploads `<id>.<ext>` with upsert. Returns the cache-busted public URL to store
 * on product.imageUrl. Never throws — returns { url, error }.
 */
export async function uploadProductImage(
  productId: string,
  file: File,
): Promise<{ url: string | null; error: string | null }> {
  const id = (productId || '').trim();
  if (!id) return { url: null, error: 'Missing product id' };
  if (!file) return { url: null, error: 'No file' };
  if (!file.type.startsWith('image/')) return { url: null, error: 'File is not an image' };
  if (file.size > 5 * 1024 * 1024) return { url: null, error: 'Image too large (max 5 MB)' };

  const ext = extOf(file);
  const path = `${id}.${ext}`;
  try {
    // Remove any prior file for this id (all extensions) so exactly one remains.
    await supabase.storage.from(BUCKET).remove(EXTS.map(e => `${id}.${e}`)).catch(() => undefined);

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || `image/${ext}`,
    });
    if (upErr) {
      Logger.error('NipponProductImage', `upload failed for ${id}`, upErr);
      return { url: null, error: upErr.message };
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // Cache-bust so a replaced image refreshes immediately in the UI.
    const url = `${data.publicUrl}?v=${Date.now()}`;
    return { url, error: null };
  } catch (e) {
    Logger.error('NipponProductImage', `upload exception for ${id}`, e);
    return { url: null, error: e instanceof Error ? e.message : 'Upload failed' };
  }
}

/** Delete a product's image (all known extensions). Returns { error }. */
export async function deleteProductImage(productId: string): Promise<{ error: string | null }> {
  const id = (productId || '').trim();
  if (!id) return { error: 'Missing product id' };
  try {
    const { error } = await supabase.storage.from(BUCKET).remove(EXTS.map(e => `${id}.${e}`));
    if (error) {
      Logger.error('NipponProductImage', `delete failed for ${id}`, error);
      return { error: error.message };
    }
    return { error: null };
  } catch (e) {
    Logger.error('NipponProductImage', `delete exception for ${id}`, e);
    return { error: e instanceof Error ? e.message : 'Delete failed' };
  }
}
