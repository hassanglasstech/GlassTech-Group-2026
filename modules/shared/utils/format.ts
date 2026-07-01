/**
 * format.ts — shared display formatters (single source of truth).
 *
 * The sales/finance surfaces each formatted money & dates independently —
 * raw ISO strings in some tables, `toLocaleString()` (machine locale) in
 * others, `en-PK`/`en-GB` elsewhere — so the same value read differently on
 * the list, the editor and the printed document. Route all display formatting
 * through these helpers so every surface agrees.
 */

/** Grouped integer amount, e.g. 145000 -> "145,000". Non-finite -> "0". */
export const formatNumber = (value: unknown): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

/** PKR-prefixed amount, e.g. 145000 -> "PKR 145,000". */
export const formatPKR = (value: unknown): string => `PKR ${formatNumber(value)}`;

/**
 * Unambiguous date as "14 Jun 2026" (en-GB, day-first) to avoid the
 * US MM/DD vs DD/MM confusion on customer-facing documents.
 * Accepts ISO strings / Date / epoch. Empty/invalid -> "—".
 */
export const formatDate = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Date + time as "14 Jun 2026, 15:04" — for audit/system timestamps where the
 * time matters (posted-at, closed-at, imported-at). Empty/invalid -> "—".
 */
export const formatDateTime = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Month + year as "June 2026" — for period/month pickers and section labels
 * (payroll month, attendance month). Accepts ISO "2026-06", Date, or epoch.
 * Empty/invalid -> "—".
 */
export const formatMonthYear = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  // Bare "YYYY-MM" needs a day to parse reliably across engines.
  const v = typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  const d = v instanceof Date ? v : new Date(v as string | number);
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '—';
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};
