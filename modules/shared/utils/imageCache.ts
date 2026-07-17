/**
 * imageCache — product-image cache-bust token.
 *
 * Product images live in the public Supabase bucket `product-images`, named by
 * product id (e.g. `NIP-KL-FC500-12.png`). Because the URL is deterministic,
 * re-uploading a NEW file under the SAME name does not change the URL — so the
 * browser (and the Supabase CDN, `Cache-Control: max-age=3600`) keep serving the
 * OLD picture. Appending `?v=<token>` to the URL makes the new upload resolve.
 *
 * The token is stored in localStorage and only changes when someone explicitly
 * "Refresh Images" (or a product save bumps it), so normal browsing still caches
 * images fully — important for customers on mobile data — and a re-upload shows
 * the moment the token bumps.
 */

const KEY = 'gtk_img_cache_v';

/** Current cache-bust token ('0' = none set yet → no param appended). */
export function getImageCacheToken(): string {
  try {
    return localStorage.getItem(KEY) || '0';
  } catch {
    return '0';
  }
}

/** Bump the token (call after replacing product images) → forces a fresh fetch. */
export function bumpImageCacheToken(): string {
  const v = String(Date.now());
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable — noop */
  }
  return v;
}

/** Append the cache-bust param to a storage URL. Skips data: URIs and empties. */
export function withImageCacheBust(url: string): string {
  if (!url || url.startsWith('data:')) return url;
  const v = getImageCacheToken();
  if (!v || v === '0') return url;
  return url + (url.includes('?') ? '&' : '?') + 'v=' + v;
}
