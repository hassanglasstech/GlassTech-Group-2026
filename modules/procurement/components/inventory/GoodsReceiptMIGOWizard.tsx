/**
 * GoodsReceiptMIGOWizard — Sprint 23
 *
 * 3-step wizard wrapper around the existing GoodsReceiptMIGO component.
 *
 *   Step 1 — Header     (vendor, date, ref, vehicle)
 *   Step 2 — Line items (search, qty, per-sheet inspection)
 *   Step 3 — Charges    (freight, crane, labour, packing) + Save
 *
 * Strategy: rather than rewrite the 1,582-line MIGO from scratch (high
 * risk for live procurement), this wizard **mounts the existing
 * component once** and overlays a step navigator that scrolls to the
 * relevant section + validates step-completion before allowing Next.
 *
 * Why scroll-overlay vs full rewrite:
 *   • Zero risk to existing GL posting / tag generation / inspection flows
 *   • Same data model (one form, one save action) — no new schema
 *   • The wizard is a UX layer; we can rip it off without touching MIGO
 *     internals if Hassan prefers the all-on-one-page version
 *
 * Sprint 23 acceptance gate ("typical 10-line GRN: 20 min → 3 min") is
 * driven by the existing MIGO once it's been laid out into clearly
 * scoped sections via section anchors. The wizard surfaces those
 * sections one at a time + validates before next-step.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Package, Receipt, ChevronRight, ChevronLeft, Check, X } from 'lucide-react';
import { Product } from '@/modules/shared/types';
import GoodsReceiptMIGO from './GoodsReceiptMIGO';

// ── Props (mirror GoodsReceiptMIGO so it's a drop-in alternative) ────

interface GoodsReceiptMIGOWizardProps {
  products:    Product[];
  isOpen:      boolean;
  onClose:     () => void;
  refreshData: () => void;
}

// ── Step definitions ─────────────────────────────────────────────────

interface StepDef {
  id:        'header' | 'lines' | 'charges';
  label:     string;
  icon:      React.ReactNode;
  /** Selector for the corresponding section inside the underlying MIGO. */
  scrollTo?: string;
  /** Validation summary — number of empty/required fields. */
  validate:  () => string | null;
}

const SECTION_SELECTORS = {
  header:  '[data-migo-section="header"]',
  lines:   '[data-migo-section="lines"]',
  charges: '[data-migo-section="charges"]',
};

// ── Component ─────────────────────────────────────────────────────────

const GoodsReceiptMIGOWizard: React.FC<GoodsReceiptMIGOWizardProps> = (props) => {
  const [step, setStep]   = useState<0 | 1 | 2>(0);
  const [errors, setErrors] = useState<string[]>([]);
  const containerRef        = useRef<HTMLDivElement>(null);

  // Build steps with live validators that read the underlying form state
  // by querying inputs in the rendered MIGO. Cheap and avoids a state
  // hoist refactor that would risk breaking the existing flow.
  const steps: StepDef[] = useMemo(() => [
    {
      id: 'header',
      label: 'Header',
      icon: <Building2 size={14}/>,
      scrollTo: SECTION_SELECTORS.header,
      validate: () => {
        if (!containerRef.current) return null;
        // Vendor required — find any select with name|id mentioning vendor
        const vendorSel = containerRef.current.querySelector(
          'select[name*="vendor" i], select[id*="vendor" i], [data-migo-field="vendor"] select',
        ) as HTMLSelectElement | null;
        if (vendorSel && !vendorSel.value) return 'Vendor required';
        const dateInput = containerRef.current.querySelector(
          'input[type="date"], [data-migo-field="date"] input',
        ) as HTMLInputElement | null;
        if (dateInput && !dateInput.value) return 'GRN date required';
        return null;
      },
    },
    {
      id: 'lines',
      label: 'Line items',
      icon: <Package size={14}/>,
      scrollTo: SECTION_SELECTORS.lines,
      validate: () => {
        if (!containerRef.current) return null;
        // Need at least one line with sheetCount > 0
        const sheetInputs = containerRef.current.querySelectorAll(
          'input[name*="sheetCount" i], input[data-migo-field="sheetCount"]',
        );
        let total = 0;
        sheetInputs.forEach(el => {
          total += Number((el as HTMLInputElement).value) || 0;
        });
        if (total === 0) return 'Add at least one line with sheet count';
        return null;
      },
    },
    {
      id: 'charges',
      label: 'Charges & Save',
      icon: <Receipt size={14}/>,
      scrollTo: SECTION_SELECTORS.charges,
      validate: () => null,   // optional fields — no hard validation
    },
  ], []);

  // ── Scroll to section when step changes ──────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const target = steps[step].scrollTo;
    if (!target) return;

    // Defer one frame so the DOM has settled
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector(target);
      if (el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // Re-validate
    setErrors(steps.slice(0, step).map(s => s.validate()).filter(Boolean) as string[]);
  }, [step, steps]);

  // ── Navigation guards ────────────────────────────────────────────
  const canAdvance = (): boolean => {
    const err = steps[step].validate();
    if (err) {
      setErrors([err]);
      return false;
    }
    return true;
  };

  const next = () => {
    if (step === 2) return;
    if (!canAdvance()) return;
    setStep((s) => (s + 1) as 0 | 1 | 2);
  };

  const back = () => {
    if (step === 0) return;
    setStep((s) => (s - 1) as 0 | 1 | 2);
    setErrors([]);
  };

  if (!props.isOpen) return null;

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[150] bg-slate-50 flex flex-col">
      {/* Wizard step bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {steps.map((s, i) => {
              const active   = i === step;
              const complete = i < step;
              return (
                <React.Fragment key={s.id}>
                  {i > 0 && <ChevronRight size={12} className="text-slate-300"/>}
                  <button
                    type="button"
                    onClick={() => i <= step && setStep(i as 0 | 1 | 2)}
                    disabled={i > step}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                      ${active
                        ? 'bg-blue-600 text-white'
                        : complete
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-500 cursor-not-allowed'}
                    `}
                  >
                    {complete ? <Check size={12}/> : s.icon}
                    <span className="hidden sm:inline">Step {i + 1} —</span>
                    <span>{s.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          <button
            type="button"
            onClick={props.onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-100 hover:text-rose-600"
            title="Close wizard"
            aria-label="Close"
          >
            <X size={16}/>
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300"
            style={{ width: `${((step + 1) / 3) * 100}%` }}
          />
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="mt-2 text-xs text-rose-700 font-bold flex items-center gap-2">
            ⚠ {errors.join(' · ')}
          </div>
        )}
      </div>

      {/* Underlying MIGO — mounted once, scrolled into view per step */}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <GoodsReceiptMIGO {...props} />
      </div>

      {/* Footer nav */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-sm font-bold flex items-center gap-1.5"
        >
          <ChevronLeft size={14}/> Back
        </button>

        <span className="text-xs text-slate-400">
          Step {step + 1} of {steps.length}
        </span>

        {step < 2 ? (
          <button
            type="button"
            onClick={next}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5"
          >
            Next: {steps[step + 1].label} <ChevronRight size={14}/>
          </button>
        ) : (
          <span className="text-xs text-slate-500 italic">
            Use the Save button inside the form to post the GRN.
          </span>
        )}
      </div>
    </div>
  );
};

export default GoodsReceiptMIGOWizard;
