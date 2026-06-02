/**
 * useLazyImage — Sprint 9
 *
 * IntersectionObserver-based image lazy-loader. Returns a `ref` to
 * attach to a container element and an `isVisible` flag the caller
 * uses to decide whether to render the actual <img>. Once visible the
 * flag stays `true` so we don't tear-down already-loaded images on
 * scroll-out (avoids re-fetch jank).
 *
 * Usage:
 *   const { ref, isVisible } = useLazyImage<HTMLDivElement>();
 *   return (
 *     <div ref={ref} className="w-full h-40 bg-slate-100">
 *       {isVisible && <img src={piece.imageUrl} alt={piece.id} />}
 *     </div>
 *   );
 *
 * Caller-supplied options:
 *   • rootMargin — how far before the viewport edge to start loading
 *     (default 200 px so off-screen rows pre-fetch their images).
 *   • threshold — the standard IO threshold (default 0.01).
 *
 * Falls back to `isVisible = true` immediately on browsers without
 * IntersectionObserver (very rare in 2025+; safer than blocking image
 * render forever).
 */

import { useEffect, useRef, useState } from 'react';

interface Options {
  rootMargin?: string;
  threshold?:  number | number[];
}

export function useLazyImage<T extends Element = HTMLElement>(opts: Options = {}) {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      // Old browser — no virtualisation, just render eagerly.
      setIsVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setIsVisible(true);
          io.disconnect();   // one-shot
          break;
        }
      }
    }, {
      rootMargin: opts.rootMargin ?? '200px',
      threshold:  opts.threshold  ?? 0.01,
    });
    io.observe(node);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.rootMargin, JSON.stringify(opts.threshold)]);

  return { ref, isVisible };
}

export default useLazyImage;
