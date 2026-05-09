/**
 * QCDefectPicker.tsx — Sprint 7
 *
 * Searchable defect-code picker used by the QC fail flow (DispatchView's
 * QCFailModal, QCCheckPanel, QCWorkbench). Replaces the bespoke selects
 * that each screen built independently.
 *
 * UX:
 *   • Recent codes pinned on top (last 5 used, persisted in localStorage)
 *   • Live filter — type "scratch" → shrinks to QC-01
 *   • Severity badge tints the row (critical=red, major=amber, minor=yellow)
 *   • Conditional inputs:
 *       – needsMeasurement = 'hole' / 'notch' / 'dimension'  → measurement field
 *       – requiresComment  = true                            → comment box (required)
 *   • Mobile-first: each tile ≥ 56 px tall, single-column on narrow viewports
 *
 * Surfaces selected QCDefectCode + comment + measurement back via onChange
 * so callers can keep their own NCR / piece-status logic.
 */

import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  QC_DEFECT_CODES, QC_DEFECT_CODE_MAP, SEVERITY_COLOR,
  getQCRecentCodes, pushQCRecentCode,
  QCDefectCode,
} from '@/modules/production/constants/qcCodes';
import { Search, AlertCircle } from 'lucide-react';

export interface QCDefectSelection {
  code:        string | null;
  comment?:    string;
  /** For QC-03 (hole), QC-04 (notch), QC-07 (dimension) — what was measured. */
  measurement?: string;
}

interface Props {
  value:    QCDefectSelection;
  onChange: (next: QCDefectSelection) => void;
  /** When true the comment input is shown regardless of code (caller wants notes). */
  alwaysShowComment?: boolean;
  /** Hide the search bar (e.g. very narrow modal). */
  compact?: boolean;
  /** Called when the user picks a code — commits to recents. */
  onCommitRecent?: (code: string) => void;
}

const QCDefectPicker: React.FC<Props> = ({
  value, onChange, alwaysShowComment = false, compact = false, onCommitRecent,
}) => {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [recents, setRecents] = useState<string[]>(() => getQCRecentCodes());

  useEffect(() => { setRecents(getQCRecentCodes()); }, [value.code]);

  const filtered = useMemo<QCDefectCode[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return QC_DEFECT_CODES.slice();
    return QC_DEFECT_CODES.filter(c =>
      c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
    );
  }, [search]);

  const recentCodes = useMemo<QCDefectCode[]>(() => {
    if (search.trim()) return [];                 // hide recents while searching
    return recents
      .map(code => QC_DEFECT_CODE_MAP[code])
      .filter((c): c is QCDefectCode => Boolean(c));
  }, [recents, search]);

  const filteredMinusRecents = useMemo<QCDefectCode[]>(() => {
    if (search.trim()) return filtered;
    const recentSet = new Set(recents);
    return filtered.filter(c => !recentSet.has(c.code));
  }, [filtered, recents, search]);

  const handlePick = (code: string) => {
    onChange({ ...value, code });
    pushQCRecentCode(code);
    onCommitRecent?.(code);
  };

  const selected = value.code ? QC_DEFECT_CODE_MAP[value.code] || null : null;
  const showComment = alwaysShowComment || (selected?.requiresComment ?? false);
  const measurementKind = selected?.needsMeasurement;
  const measurementLabel =
    measurementKind === 'hole'      ? 'Actual hole diameter (e.g. 10mm)'
    : measurementKind === 'notch'   ? 'Actual notch size (e.g. 25×40mm)'
    : measurementKind === 'dimension' ? 'Actual dimension (W × H, e.g. 600×1200mm)'
    : null;

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"/>
          <input
            ref={searchRef}
            type="text"
            className="w-full pl-9 pr-3 py-2.5 text-sm border-2 border-slate-200 rounded-xl font-bold focus:border-blue-500 focus:outline-none"
            placeholder="Type code or keyword (e.g. scratch, crack, hole)…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
      )}

      {/* Recents */}
      {recentCodes.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Recent</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentCodes.map(c => (
              <DefectTile key={c.code} code={c} selected={value.code === c.code} onPick={handlePick}/>
            ))}
          </div>
        </div>
      )}

      {/* All / filtered */}
      <div>
        {recentCodes.length > 0 && !search && (
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">All Codes</p>
        )}
        {filtered.length === 0 ? (
          <p className="text-center text-slate-300 italic py-6 text-sm font-bold">No matching defect codes.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredMinusRecents.map(c => (
              <DefectTile key={c.code} code={c} selected={value.code === c.code} onPick={handlePick}/>
            ))}
          </div>
        )}
      </div>

      {/* Conditional measurement input */}
      {measurementKind && measurementLabel && (
        <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-3 space-y-1">
          <label className="text-[11px] font-black uppercase text-slate-500 flex items-center gap-1.5">
            <AlertCircle size={12} className="text-slate-400"/> {measurementLabel} *
          </label>
          <input
            type="text"
            className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg text-sm font-mono font-bold"
            placeholder={
              measurementKind === 'hole'    ? 'e.g. 10mm  (required: Ø 8mm)'
              : measurementKind === 'notch' ? 'e.g. 25×42mm (required: 25×40mm)'
              :                                'e.g. 605×1198mm (required: 600×1200mm)'
            }
            value={value.measurement || ''}
            onChange={e => onChange({ ...value, measurement: e.target.value })}
          />
        </div>
      )}

      {/* Comment */}
      {(showComment || (value.comment ?? '').length > 0) && (
        <div>
          <label className="text-[11px] font-black uppercase text-slate-500 mb-1 block">
            Comment {selected?.requiresComment ? '*' : '(optional)'}
          </label>
          <textarea
            rows={2}
            className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg text-sm font-medium resize-none"
            placeholder={selected?.requiresComment ? 'Required — describe the defect' : 'Notes for the supervisor'}
            value={value.comment || ''}
            onChange={e => onChange({ ...value, comment: e.target.value })}
          />
        </div>
      )}
    </div>
  );
};

// ── Tile ────────────────────────────────────────────────────────────────
const DefectTile: React.FC<{
  code:     QCDefectCode;
  selected: boolean;
  onPick:   (code: string) => void;
}> = ({ code, selected, onPick }) => {
  const tone = SEVERITY_COLOR[code.severity];
  return (
    <button
      type="button"
      onClick={() => onPick(code.code)}
      className={`min-h-[56px] text-left p-3 rounded-xl border-2 transition-colors flex items-start gap-2 ${
        selected
          ? `${tone.bg} ${tone.border.replace('border-', 'border-')} ring-2 ring-blue-500`
          : `bg-white border-slate-200 hover:${tone.bg} hover:${tone.border}`
      }`}
    >
      <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase shrink-0 ${tone.pill}`}>
        {code.code}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-bold leading-tight ${selected ? tone.text : 'text-slate-700'}`}>{code.label}</p>
        <p className={`text-[10px] font-bold uppercase mt-0.5 ${tone.text} opacity-75`}>{code.severity}</p>
      </div>
    </button>
  );
};

export default QCDefectPicker;
