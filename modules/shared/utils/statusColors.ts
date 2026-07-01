/**
 * statusColors.ts — single source of truth for status → color.
 *
 * Before this, every list/badge picked its own colors for the same status:
 * "Approved" was emerald on one page, blue on another; "Overdue" sometimes
 * amber, sometimes red. This maps ANY status string to one of five semantic
 * tones and returns Tailwind classes built on the design tokens
 * (colors.success/warning/danger/info/neutral in tailwind.config + the
 * matching --*-subtle/--*-border vars in index.css).
 *
 * Usage:
 *   <span className={statusBadgeClass(piece.status)}>{piece.status}</span>
 *   const tone = statusTone(invoice.status);   // 'success' | 'danger' | ...
 *   <Dot className={statusDotClass(req.status)} />
 *
 * Resolution order: explicit override table → keyword heuristic → 'neutral'.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Normalize a status for lookup: lowercase, trim, collapse separators. */
const norm = (s: string): string =>
  s.toLowerCase().trim().replace(/[\s_/-]+/g, '-');

/**
 * Explicit tone per known domain status. Keys are normalized (norm()).
 * Seeded from the ERP's real vocab — extend here, not in components.
 */
const STATUS_TONE: Record<string, StatusTone> = {
  // ── Production piece lifecycle ───────────────────────────────
  'pending-cut': 'neutral',
  'cut': 'info',
  'service-pending': 'warning',
  'qc-pending': 'warning',
  'qc-passed': 'success',
  'qc-failed': 'danger',
  'ready-to-dispatch': 'info',
  'scheduled': 'info',
  'dispatched': 'info',
  'received-from-tempering': 'info',
  'delivered': 'success',
  'scrapped': 'danger',
  'rework': 'warning',

  // ── Documents: quotation / invoice / order ───────────────────
  'draft': 'neutral',
  'sent': 'info',
  'pending': 'warning',
  'approved': 'success',
  'confirmed': 'success',
  'rejected': 'danger',
  'cancelled': 'danger',
  'canceled': 'danger',
  'void': 'danger',
  'expired': 'danger',
  'paid': 'success',
  'unpaid': 'danger',
  'partial': 'warning',
  'partially-paid': 'warning',
  'overdue': 'danger',

  // ── Finance: GL / voucher ────────────────────────────────────
  'parked': 'warning',
  'reversed': 'danger',
  'unposted': 'neutral',

  // ── Generic workflow ─────────────────────────────────────────
  'open': 'info',
  'in-progress': 'info',
  'in-process': 'info',
  'on-hold': 'warning',
  'hold': 'warning',
  'blocked': 'danger',
  'completed': 'success',
  'complete': 'success',
  'done': 'success',
  'closed': 'neutral',

  // ── Entity status ────────────────────────────────────────────
  'active': 'success',
  'inactive': 'neutral',
  'suspended': 'danger',
  'archived': 'neutral',

  // ── HR: employee lifecycle ───────────────────────────────────
  'probation': 'warning',
  'resigned': 'danger',
  'terminated': 'danger',

  // ── Procurement: requisition / PO / GRN ──────────────────────
  'requested': 'warning',
  'ordered': 'info',
  'received': 'success',
  'returned': 'danger',
  'partially-received': 'warning',

  // ── HR: attendance / leave / payroll ─────────────────────────
  'present': 'success',
  'absent': 'danger',
  'half-day': 'warning',
  'leave': 'info',
  'late': 'warning',
  'processed': 'success',
  'posted': 'success',
};

/** Keyword fallback — substring match when no explicit entry exists. */
const KEYWORD_TONE: Array<[RegExp, StatusTone]> = [
  [/fail|reject|cancel|void|overdue|error|block|scrap|return|absent|expire|suspend|unpaid/, 'danger'],
  [/pending|hold|wait|partial|late|review|half/, 'warning'],
  [/pass|approve|complete|done|deliver|paid|success|active|present|receiv|confirm|post/, 'success'],
  [/progress|process|sent|open|order|dispatch|cut|leave/, 'info'],
];

/** Map any status string to a semantic tone. Empty/unknown → 'neutral'. */
export const statusTone = (status: unknown): StatusTone => {
  if (typeof status !== 'string' || !status.trim()) return 'neutral';
  const key = norm(status);
  if (STATUS_TONE[key]) return STATUS_TONE[key];
  for (const [re, tone] of KEYWORD_TONE) {
    if (re.test(key)) return tone;
  }
  return 'neutral';
};

/** Tailwind classes per tone — built on design tokens. */
const TONE_BADGE: Record<StatusTone, string> = {
  success: 'bg-success-subtle text-success border border-success-border',
  warning: 'bg-warning-subtle text-warning border border-warning-border',
  danger:  'bg-danger-subtle text-danger border border-danger-border',
  info:    'bg-info-subtle text-info border border-info-border',
  neutral: 'bg-neutral-subtle text-neutral border border-neutral-border',
};

const TONE_DOT: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger:  'bg-danger',
  info:    'bg-info',
  neutral: 'bg-neutral',
};

const TONE_TEXT: Record<StatusTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger:  'text-danger',
  info:    'text-info',
  neutral: 'text-neutral',
};

/** Full pill classes for a status badge (bg + text + border). */
export const statusBadgeClass = (status: unknown): string =>
  TONE_BADGE[statusTone(status)];

/** Solid dot color class for a status (e.g. timeline / legend). */
export const statusDotClass = (status: unknown): string =>
  TONE_DOT[statusTone(status)];

/** Text-only color class for a status. */
export const statusTextClass = (status: unknown): string =>
  TONE_TEXT[statusTone(status)];

/** Register/override a status→tone mapping at runtime (rarely needed). */
export const registerStatusTone = (status: string, tone: StatusTone): void => {
  STATUS_TONE[norm(status)] = tone;
};
