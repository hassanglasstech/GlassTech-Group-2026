/**
 * useMediaQuery — Sprint 26
 *
 * Subscribe to a CSS media query string. Returns true while it matches.
 * SSR-safe (window guard) and uses the modern addEventListener path
 * with the legacy addListener fallback for older Safari.
 *
 * Convenience helpers wrap the common breakpoints used across the app:
 *   useIsMobile()  → max-width: 767px   (Tailwind sm and below)
 *   useIsTablet()  → 768px..1023px      (Tailwind md only)
 *   useIsDesktop() → 1024px+            (Tailwind lg and above)
 *
 * The breakpoints match Tailwind's default `md` breakpoint so a
 * `useIsMobile() === true` check lines up with `md:hidden` in JSX.
 */

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  // SSR / non-browser → default false
  const getInitial = (): boolean => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(getInitial);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);

    // Sync once in case the value changed between SSR initial and client mount
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Safari < 14 fallback
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [query]);

  return matches;
}

// ── Tailwind-aligned convenience helpers ──────────────────────────────

export const useIsMobile  = () => useMediaQuery('(max-width: 767px)');
export const useIsTablet  = () => useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');

/** True on coarse-pointer devices (touch screens). */
export const useIsTouch   = () => useMediaQuery('(pointer: coarse)');
