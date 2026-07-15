/**
 * BackButton — ERP-wide "Up" navigation.
 *
 * Why not window.history.back(): browser history is unpredictable in a hash-
 * routed SPA — on a fresh load / refresh / deep-link it points outside the app
 * (or nowhere), so the button did nothing or bounced you to login. That is the
 * "bekar back button" problem.
 *
 * Best practice for an app shell is *hierarchical* Up navigation: go to the
 * parent of the current route, deterministically. We ALSO keep a tiny in-app
 * visited-stack (sessionStorage) so, when you did navigate within the app, Back
 * behaves like a real back — but it can never leave the app: if the stack is
 * empty it falls back to the parent path, and from a top-level module to Home.
 */

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const STACK_KEY = 'gt_nav_stack';

function readStack(): string[] {
  try { return JSON.parse(sessionStorage.getItem(STACK_KEY) || '[]'); } catch { return []; }
}
function writeStack(s: string[]): void {
  try { sessionStorage.setItem(STACK_KEY, JSON.stringify(s.slice(-25))); } catch { /* ignore */ }
}

/** Parent of a hash path — drops the last segment; a top-level module → Home. */
function parentOf(path: string): string {
  const segs = path.split('/').filter(Boolean);
  if (segs.length <= 1) return '/';
  return '/' + segs.slice(0, -1).join('/');
}

const BackButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const here = location.pathname + location.search;

  // Record each distinct route into the in-app stack (so Back can retrace it).
  React.useEffect(() => {
    const stack = readStack();
    if (stack[stack.length - 1] !== here) { stack.push(here); writeStack(stack); }
  }, [here]);

  const goBack = () => {
    const stack = readStack();
    // Drop the current entry, then pop the previous distinct in-app route.
    while (stack.length && stack[stack.length - 1] === here) stack.pop();
    const prev = stack.pop();
    writeStack(stack);
    if (prev && prev !== here) { navigate(prev); return; }
    // No in-app history → go up a level (never out of the app).
    navigate(parentOf(location.pathname));
  };

  return (
    <button
      onClick={goBack}
      title="Back / up one level"
      className={`flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 text-[11px] font-black uppercase tracking-widest transition-all ${className}`}
    >
      <ArrowLeft size={13}/> Back
    </button>
  );
};

export default BackButton;
