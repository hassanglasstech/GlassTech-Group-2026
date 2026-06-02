/**
 * ProductionLegacy — Sprint 19
 *
 * Wraps the original ProductionModule with a deprecation banner. Lives
 * at /production/legacy until the 30-day grace period ends (2026-06-10),
 * after which it can be deleted along with the legacy tabs.
 *
 * The wrapper exists rather than editing ProductionModule directly so
 * the original file stays untouched — easier to git-blame the actual
 * removal commit when the deprecation lands.
 */

import React, { useState, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, X, Loader2 } from 'lucide-react';

const ProductionModule = React.lazy(() => import('./ProductionModule'));

const DEPRECATION_DATE = '2026-06-10';

const ProductionLegacy: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {!dismissed && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-3 text-xs">
          <AlertTriangle size={14} className="text-amber-600 shrink-0"/>
          <div className="flex-1">
            <span className="font-bold text-amber-900">Legacy Production view</span>
            <span className="text-amber-800 mx-2">·</span>
            <span className="text-amber-800">
              These tabs are deprecated. Use the new
              {' '}
              <Link to="/production/workbench" className="font-bold underline hover:text-amber-900">
                Workbench
              </Link>
              {' '}— search, filter, drag-drop. Removing this page on <strong>{DEPRECATION_DATE}</strong>.
            </span>
          </div>
          <Link
            to="/production/workbench"
            className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-md font-bold text-[11px] flex items-center gap-1 shrink-0"
          >
            Open Workbench <ArrowRight size={11}/>
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="opacity-50 hover:opacity-100 p-0.5"
            aria-label="Dismiss"
          >
            <X size={14}/>
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={
          <div className="flex items-center justify-center h-64 text-slate-500">
            <Loader2 className="animate-spin mr-2" size={16}/>
            <span className="text-sm">Loading legacy view…</span>
          </div>
        }>
          <ProductionModule />
        </Suspense>
      </div>
    </div>
  );
};

export default ProductionLegacy;
