export { Company } from '../constants';

// ── Audit Fields — mixed into all entities ──────────────────────────
export interface AuditFields {
  _createdAt?: string;     // ISO date
  _createdBy?: string;     // user email
  _updatedAt?: string;     // ISO date — auto-stamped by safeSave
  _updatedBy?: string;     // user email
  _version?: number;       // incremented on each save (optimistic locking)
}

// ── Lightweight Validation ───────────────────────────────────────────
export type ValidationRule = {
  field: string;
  check: (val: any) => boolean;
  message: string;
};

export const validate = (data: Record<string, any>, rules: ValidationRule[]): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  for (const rule of rules) {
    const val = data[rule.field];
    if (!rule.check(val)) errors.push(rule.message);
  }
  return { valid: errors.length === 0, errors };
};

// ── Common validation checks ─────────────────────────────────────────
export const V = {
  required:    (val: any) => val !== undefined && val !== null && val !== '',
  string:      (val: any) => typeof val === 'string' && val.trim().length > 0,
  number:      (val: any) => typeof val === 'number' && !isNaN(val),
  positive:    (val: any) => typeof val === 'number' && val > 0,
  nonNegative: (val: any) => typeof val === 'number' && val >= 0,
  date:        (val: any) => typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val),
  email:       (val: any) => typeof val === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
  minLen:      (n: number) => (val: any) => typeof val === 'string' && val.length >= n,
  maxLen:      (n: number) => (val: any) => typeof val === 'string' && val.length <= n,
  oneOf:       (opts: any[]) => (val: any) => opts.includes(val),
  array:       (val: any) => Array.isArray(val),
  notEmpty:    (val: any) => Array.isArray(val) && val.length > 0,
};
