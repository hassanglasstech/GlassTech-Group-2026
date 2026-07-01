/**
 * OnboardingTour — Sprint 20
 *
 * Custom 5-step tour for the Production Workbench. No external library —
 * just React state, a fixed backdrop with a "spotlight" cutout, and a
 * floating tooltip card.
 *
 * First-visit detection: localStorage key `gtk_workbench_tour_seen`.
 *   - First time: tour shows on mount (after a 600 ms delay so the
 *     workbench has time to render its targets)
 *   - Subsequent visits: dormant. User can re-trigger via the
 *     "?" → ShortcutSheet → "Restart tour" link, or the Help button.
 *
 * Each step targets a DOM element via `data-tour` attribute. Workbench
 * adds these attrs to the search bar, lens sidebar, etc.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';

const SEEN_KEY = 'gtk_workbench_tour_seen';

interface Step {
  /** CSS attribute selector — Workbench adds data-tour="search" etc. to the matching elements. */
  target:  string;
  title:   string;
  body:    string;
  /** Where to anchor the tooltip relative to the target. */
  anchor:  'right' | 'bottom' | 'top' | 'left';
}

const STEPS: Step[] = [
  {
    target: '[data-tour="search"]',
    title:  'Find any piece in seconds',
    body:   'Press ⌘K (Ctrl+K) anywhere on the page to jump here. Type a piece ID, job number, or specs — results filter as you type.',
    anchor: 'bottom',
  },
  {
    target: '[data-tour="filter-chips"]',
    title:  'Combine filters',
    body:   'Click any chip to narrow by job, date, mm, vendor, or status. Active chips turn blue and the URL updates so you can share or bookmark the view.',
    anchor: 'bottom',
  },
  {
    target: '[data-tour="lenses"]',
    title:  'One-click lenses',
    body:   'Lenses are saved filter combinations: Today, Hold, NCR, Tempering. Click any lens to swap your view.',
    anchor: 'right',
  },
  {
    target: '[data-tour="view-toggle"]',
    title:  'Three ways to see your work',
    body:   'List for scanning, Grid for thumbnails, Kanban to drag pieces between states. Your last choice is remembered.',
    anchor: 'bottom',
  },
  {
    target: '[data-tour="content"]',
    title:  'Click any piece to dive in',
    body:   'Opens a slide-in panel with details, history, photos, and quick actions. Use ←/→ to flip through pieces without closing.',
    anchor: 'top',
  },
];

interface OnboardingTourProps {
  /** Force-show the tour (e.g., from a "Replay tour" button). */
  forceShow?: boolean;
  /** Fired when the tour ends (finished, dismissed, or skipped). */
  onClose?:   () => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ forceShow, onClose }) => {
  const [active, setActive] = useState(false);
  const [step, setStep]     = useState(0);
  const [rect, setRect]     = useState<DOMRect | null>(null);
  const tooltipRef          = useRef<HTMLDivElement>(null);

  // ── First-visit detection ──────────────────────────────────────
  useEffect(() => {
    if (forceShow) {
      setActive(true);
      setStep(0);
      return;
    }
    let seen = false;
    try { seen = !!localStorage.getItem(SEEN_KEY); } catch { /* noop */ }
    if (seen) return;

    // Delay so workbench layout settles
    const id = setTimeout(() => setActive(true), 600);
    return () => clearTimeout(id);
  }, [forceShow]);

  // ── Track target rect ──────────────────────────────────────────
  const current = STEPS[step];
  useEffect(() => {
    if (!active || !current) return;

    const measure = () => {
      const el = document.querySelector(current.target);
      setRect(el ? (el as HTMLElement).getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, current]);

  // ── Keyboard nav ───────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')                       end();
      else if (e.key === 'ArrowLeft' && step > 0)   setStep(s => s - 1);
      else if (e.key === 'ArrowRight')              advance();
      else if (e.key === 'Enter')                   advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  const advance = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else end(true);
  };

  const end = (completed = false) => {
    if (completed) {
      try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* noop */ }
    }
    setActive(false);
    onClose?.();
  };

  // ── Tooltip placement ──────────────────────────────────────────
  const tooltipStyle = useMemo<React.CSSProperties>(() => {
    if (!rect) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
    const margin = 12;
    switch (current.anchor) {
      case 'bottom':
        return { left: rect.left + rect.width / 2, top: rect.bottom + margin, transform: 'translateX(-50%)' };
      case 'top':
        return { left: rect.left + rect.width / 2, top: rect.top - margin, transform: 'translate(-50%, -100%)' };
      case 'right':
        return { left: rect.right + margin, top: rect.top + rect.height / 2, transform: 'translateY(-50%)' };
      case 'left':
        return { left: rect.left - margin, top: rect.top + rect.height / 2, transform: 'translate(-100%, -50%)' };
    }
  }, [rect, current]);

  if (!active || !current) return null;

  return (
    <>
      {/* Backdrop with "spotlight" cutout */}
      <div className="fixed inset-0 z-modalLow pointer-events-none">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white"/>
              {rect && (
                <rect
                  x={rect.left - 6}
                  y={rect.top - 6}
                  width={rect.width + 12}
                  height={rect.height + 12}
                  rx="8"
                  ry="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(15, 23, 42, 0.55)"
            mask="url(#tour-mask)"
          />
        </svg>
        {/* Click-through area = full screen, but with mask so the spotlight is visible */}
        <div className="absolute inset-0 pointer-events-auto" onClick={() => end(false)}/>
      </div>

      {/* Highlight ring */}
      {rect && (
        <div
          className="fixed z-modalLow pointer-events-none rounded-lg ring-4 ring-blue-400 ring-offset-2 ring-offset-transparent transition-all duration-200"
          style={{
            left:   rect.left - 6,
            top:    rect.top - 6,
            width:  rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-label={`Tour step ${step + 1} of ${STEPS.length}`}
        className="fixed z-modalLow bg-white rounded-xl shadow-2xl p-4 w-[300px] max-w-[90vw]"
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="flex items-center gap-1.5 text-2xs font-black uppercase tracking-wider text-blue-600">
            <Sparkles size={11}/> Tour · {step + 1}/{STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => end(false)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
            aria-label="Skip tour"
          >
            <X size={13}/>
          </button>
        </div>
        <h3 className="text-sm font-black text-slate-800 mb-1">{current.title}</h3>
        <p className="text-xs text-slate-600 leading-relaxed">{current.body}</p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1 mt-3">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === step ? 'bg-blue-600 w-3' : i < step ? 'bg-blue-300' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 gap-2">
          <button
            type="button"
            onClick={() => end(false)}
            className="text-2xs text-slate-500 hover:text-slate-700 font-semibold"
          >
            Skip
          </button>
          <div className="flex gap-1.5">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                <ChevronLeft size={12}/> Back
              </button>
            )}
            <button
              type="button"
              onClick={advance}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
            >
              {step === STEPS.length - 1 ? 'Done' : 'Next'} <ChevronRight size={12}/>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default OnboardingTour;
