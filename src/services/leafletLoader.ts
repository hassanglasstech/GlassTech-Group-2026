/**
 * leafletLoader.ts — Sprint 14
 *
 * Loads Leaflet (map library) lazily from a CDN — avoids adding it as
 * an npm dependency. Returns the global L object once the library and
 * its CSS are both ready. Idempotent.
 *
 * Why CDN over npm?
 *   - LiveDispatchMap is the only consumer; lazy-import keeps the main
 *     bundle slim.
 *   - Leaflet has no peer-dep complexity, plays well with React refs.
 *   - The user can drop in `npm i leaflet` later and switch to direct
 *     import without changing the component.
 */

const LEAFLET_VERSION = '1.9.4';
const JS_URL  = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const CSS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;

let loadPromise: Promise<unknown> | null = null;

declare global {
  interface Window { L?: unknown }
}

export function loadLeaflet(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.L) return Promise.resolve(window.L);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // CSS first — non-blocking
    if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
      const link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = CSS_URL;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }

    // JS
    if (document.querySelector(`script[src="${JS_URL}"]`)) {
      // Already loading — poll briefly
      const start = Date.now();
      const tick  = () => {
        if (window.L) return resolve(window.L);
        if (Date.now() - start > 8000) return reject(new Error('Leaflet load timeout'));
        setTimeout(tick, 100);
      };
      tick();
      return;
    }

    const script = document.createElement('script');
    script.src   = JS_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload  = () => resolve(window.L);
    script.onerror = () => reject(new Error('Leaflet failed to load'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
