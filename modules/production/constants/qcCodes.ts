/**
 * qcCodes.ts — Sprint 7
 *
 * Single canonical list of QC defect codes for the production module.
 *
 * Before Sprint 7 there were two divergent code lists:
 *   • DispatchView.tsx   — FAULT_CODES   (QC-01…QC-10, broad set)
 *   • QCCheckPanel.tsx   — QC_DEFECT_CODES (QC-01…QC-07, blind-check set)
 *
 * Result: an inspector closing a piece in QC saw "QC-04 Hole/Notch Position
 * Error" while the dispatch supervisor closing the same piece later saw
 * "QC-04 Notch Out of Spec" — same code, different meaning, no usable
 * cross-team analytics. This file is the source of truth from now on.
 *
 * Severity colours:
 *   critical → rose-600   (likely customer rejection, loss > rate × sqft)
 *   major    → amber-600  (rework or vendor claim)
 *   minor    → yellow-600 (cosmetic, accept-and-rebate path possible)
 */

export type QCSeverity = 'critical' | 'major' | 'minor';

export interface QCDefectCode {
  code:     string;        // QC-XX (stable id used in NCR / GL refs)
  label:    string;        // human-readable, no code prefix
  severity: QCSeverity;
  /** Optional measurement input shown only for matching codes. */
  needsMeasurement?: 'hole' | 'notch' | 'dimension';
  /** Force a comment box (e.g. "Other"). */
  requiresComment?: boolean;
}

export const QC_DEFECT_CODES: readonly QCDefectCode[] = [
  { code: 'QC-01', label: 'Scratch / Surface Damage', severity: 'major'    },
  { code: 'QC-02', label: 'Edge Chip / Rough Edge',   severity: 'major'    },
  { code: 'QC-03', label: 'Hole Misalignment',        severity: 'critical', needsMeasurement: 'hole' },
  { code: 'QC-04', label: 'Notch Out of Spec',        severity: 'critical', needsMeasurement: 'notch' },
  { code: 'QC-05', label: 'Crack',                    severity: 'critical' },
  { code: 'QC-06', label: 'Color Mismatch',           severity: 'major'    },
  { code: 'QC-07', label: 'Dimension Out of Spec',    severity: 'critical', needsMeasurement: 'dimension' },
  { code: 'QC-08', label: 'Bubbles / Inclusions',     severity: 'minor'    },
  { code: 'QC-09', label: 'Coating Defect',           severity: 'major'    },
  { code: 'QC-10', label: 'Other (specify)',          severity: 'minor', requiresComment: true },
] as const;

export const QC_DEFECT_CODE_MAP: Record<string, QCDefectCode> =
  QC_DEFECT_CODES.reduce((acc, c) => { acc[c.code] = c; return acc; }, {} as Record<string, QCDefectCode>);

export const SEVERITY_COLOR: Record<QCSeverity, { bg: string; text: string; border: string; pill: string }> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200',   pill: 'bg-rose-600 text-white' },
  major:    { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  pill: 'bg-amber-500 text-white' },
  minor:    { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', pill: 'bg-yellow-400 text-slate-900' },
};

/**
 * Recents helper — Sprint 7 picker pins last 5 used codes at the top so
 * QC inspectors don't scroll past the codes they hit every shift.
 */
const RECENTS_KEY = 'gtk_erp_qc_recent_codes';
const RECENTS_MAX = 5;

export function getQCRecentCodes(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(c => typeof c === 'string' && QC_DEFECT_CODE_MAP[c]).slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

export function pushQCRecentCode(code: string): void {
  if (!QC_DEFECT_CODE_MAP[code]) return;
  try {
    const cur = getQCRecentCodes();
    const next = [code, ...cur.filter(c => c !== code)].slice(0, RECENTS_MAX);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch { /* swallow — non-critical */ }
}
