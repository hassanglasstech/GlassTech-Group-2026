/**
 * unsavedGuard — global "unsaved changes" navigation guard.
 *
 * The app uses <HashRouter> (a declarative router), so React Router's useBlocker
 * is unavailable. Instead a single capture-phase click listener intercepts in-app
 * hash-navigation (sidebar links, tab anchors) while any editor is "dirty" and
 * asks the user to confirm before leaving — the SPA equivalent of the browser's
 * beforeunload prompt (which the editors also keep for tab-close/refresh).
 *
 * An editor registers its dirty state with the `useUnsavedGuard(dirty)` hook.
 */

let _dirty = false;
let _message =
  'Aap ke unsaved changes hain — save/draft nahi hua. Chhod dein?\n\n' +
  'You have unsaved changes. Leave without saving?';
let _installed = false;

export const setUnsavedDirty = (dirty: boolean, message?: string): void => {
  _dirty = dirty;
  if (message) _message = message;
};
export const clearUnsavedDirty = (): void => { _dirty = false; };
export const isUnsavedDirty = (): boolean => _dirty;

const currentRoute = (): string => (window.location.hash.replace(/^#/, '') || '/');

const onCaptureClick = (e: MouseEvent): void => {
  if (!_dirty) return;
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  // Find the nearest anchor in the event path.
  const path = (typeof e.composedPath === 'function' ? e.composedPath() : []) as EventTarget[];
  let anchor: HTMLAnchorElement | null = null;
  for (const el of path) { if (el instanceof HTMLAnchorElement) { anchor = el; break; } }
  if (!anchor) {
    const t = e.target as HTMLElement | null;
    anchor = t?.closest?.('a') ?? null;
  }
  if (!anchor) return;
  const href = anchor.getAttribute('href') || '';
  if (!href.startsWith('#/')) return;                 // only in-app hash routes
  const target = href.slice(1);
  if (target === currentRoute()) return;              // same screen — no guard
  // Block until the user confirms leaving.
  // eslint-disable-next-line no-alert
  if (!window.confirm(_message)) {
    e.preventDefault();
    e.stopPropagation();
  } else {
    _dirty = false;                                   // user chose to leave — stop guarding
  }
};

/** Install the global guard once (idempotent). Called from App on mount. */
export const installUnsavedGuard = (): (() => void) => {
  if (_installed) return () => {};
  _installed = true;
  document.addEventListener('click', onCaptureClick, true);   // capture — runs before React Router
  return () => { document.removeEventListener('click', onCaptureClick, true); _installed = false; };
};
