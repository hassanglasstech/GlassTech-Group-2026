/**
 * money.ts — NaN-safe money coercion + validation
 *
 * Raw `Number(input)` / `parseFloat(input)` at form + mapper boundaries yields
 * NaN on blank/garbage input. NaN slips past the usual `x <= 0` / `x > balance`
 * guards (every comparison with NaN is false), then propagates into GL math
 * where it only surfaces later as a cryptic LedgerImbalanceError. These helpers
 * stop NaN at the boundary and give a friendly, specific error instead.
 */

/** Coerce any input to a finite number; NaN / Infinity / '' / null → fallback. */
export const toNum = (val: unknown, fallback = 0): number => {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
};

export interface MoneyCheck {
  valid: boolean;
  value: number;
  error?: string;
}

/**
 * Validate a money amount at a commit boundary (before it reaches the GL).
 *
 * @param opts.min       minimum allowed value (default 0)
 * @param opts.allowZero accept exactly `min` as well (default false → must exceed min)
 * @param opts.max       optional upper bound (e.g. invoice balance)
 * @param opts.label     field label used in the error message
 */
export const validateMoney = (
  val: unknown,
  opts: { min?: number; allowZero?: boolean; max?: number; label?: string } = {},
): MoneyCheck => {
  const { min = 0, allowZero = false, max, label = 'Amount' } = opts;
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? '').replace(/,/g, ''));

  if (!Number.isFinite(n)) return { valid: false, value: 0, error: `${label} must be a valid number.` };
  if (allowZero ? n < min : n <= min) {
    return {
      valid: false,
      value: n,
      error: allowZero ? `${label} cannot be below ${min.toLocaleString('en-PK')}.` : `${label} must be greater than ${min.toLocaleString('en-PK')}.`,
    };
  }
  if (max !== undefined && n > max) {
    return { valid: false, value: n, error: `${label} cannot exceed PKR ${max.toLocaleString('en-PK')}.` };
  }
  return { valid: true, value: n };
};
