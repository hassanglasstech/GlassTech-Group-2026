/**
 * CapacityValidator — Sprint 13
 *
 * Reusable vehicle-capacity guard. Renders a compact load-vs-capacity
 * progress bar AND exposes a callable `validate()` that the parent
 * uses to hard-block dispatch when overloaded.
 *
 * Usage:
 *   const ref = useRef<CapacityValidatorHandle>(null);
 *   <CapacityValidator
 *     ref={ref}
 *     loadKg={payloadInfo.totalKg}
 *     maxPayloadKg={vehicle.max_payload_kg}
 *     vehicleName={vehicle.vehicle_name}
 *   />
 *   // Before dispatch:
 *   if (!ref.current?.validate()) return;   // toast already fired
 */

import React, { forwardRef, useImperativeHandle } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Truck } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

export interface CapacityValidatorHandle {
  /** Returns false (and fires toast) when the load exceeds capacity. */
  validate: () => boolean;
  /** Live read of overload state — true while overloaded. */
  isOverloaded: () => boolean;
}

interface CapacityValidatorProps {
  loadKg:        number;
  maxPayloadKg:  number;
  vehicleName?:  string;
  /** Soft warn when utilisation crosses this %. Default 90. */
  warnAtPct?:    number;
  /** When true, hides the textual hint row. Default false. */
  compact?:      boolean;
}

// ── Component ─────────────────────────────────────────────────────────

const CapacityValidator = forwardRef<CapacityValidatorHandle, CapacityValidatorProps>(
  ({ loadKg, maxPayloadKg, vehicleName, warnAtPct = 90, compact = false }, ref) => {
    const safeMax  = maxPayloadKg > 0 ? maxPayloadKg : 0;
    const pct      = safeMax > 0 ? Math.round((loadKg / safeMax) * 100) : 0;
    const overload = safeMax > 0 && loadKg > safeMax;
    const warn     = !overload && pct >= warnAtPct;

    useImperativeHandle(ref, () => ({
      validate: () => {
        if (safeMax === 0) {
          toast.error('Vehicle has no capacity defined — pick a different vehicle.', { duration: 6000 });
          return false;
        }
        if (overload) {
          const overKg = Math.round(loadKg - safeMax);
          toast.error(
            `Vehicle overloaded by ${overKg.toLocaleString()} kg ` +
            `(${loadKg.toLocaleString()} kg load vs ${safeMax.toLocaleString()} kg capacity). ` +
            `Split into 2 trips or use a larger vehicle.`,
            { duration: 9000 },
          );
          return false;
        }
        return true;
      },
      isOverloaded: () => overload,
    }), [overload, loadKg, safeMax]);

    // Bar colour
    const barClass = overload ? 'bg-rose-600'
                   : warn     ? 'bg-amber-500'
                   :            'bg-emerald-500';

    const statusIcon = overload ? <AlertTriangle size={14} className="text-rose-600"/>
                     : warn     ? <AlertTriangle size={14} className="text-amber-500"/>
                     :            <CheckCircle2 size={14} className="text-emerald-500"/>;

    return (
      <div className={`capacity-validator ${overload ? 'border-2 border-rose-300 bg-rose-50' : warn ? 'bg-amber-50' : 'bg-slate-50'} rounded-lg p-3`}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <Truck size={14} className="text-slate-500 shrink-0"/>
            <span className="text-xs font-bold text-slate-700 truncate">
              {vehicleName ?? 'Vehicle'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {statusIcon}
            <span className={`text-xs font-black ${overload ? 'text-rose-700' : warn ? 'text-amber-700' : 'text-emerald-700'}`}>
              {pct}%
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${barClass} transition-all duration-300`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
          {overload && (
            <div
              className="h-full bg-rose-700 -mt-2 ml-[100%] inline-block"
              style={{ width: `${Math.min(50, pct - 100)}%`, transform: 'translateX(-100%)' }}
            />
          )}
        </div>

        {!compact && (
          <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-500">
            <span>
              <span className={`font-bold ${overload ? 'text-rose-700' : 'text-slate-700'}`}>
                {Math.round(loadKg).toLocaleString()} kg
              </span>
              {' / '}
              <span className="text-slate-500">
                {safeMax.toLocaleString()} kg
              </span>
            </span>
            {overload && (
              <span className="font-bold text-rose-700">
                +{Math.round(loadKg - safeMax).toLocaleString()} kg over
              </span>
            )}
            {warn && (
              <span className="font-bold text-amber-700">
                Near capacity
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
);

CapacityValidator.displayName = 'CapacityValidator';

export default CapacityValidator;
