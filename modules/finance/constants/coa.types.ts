// IFRS for SMEs — Shared Types
// ============================================================

export interface COAAccount {
  code: string;
  name: string;
  level: number;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  isControl?: boolean;
  isPosting?: boolean;
  normalBalance?: 'Dr' | 'Cr';
  children?: COAAccount[];
}

export const leaf = (code: string, name: string, type: COAAccount['type'], nb: 'Dr'|'Cr'): COAAccount =>
  ({ code, name, level: 5, type, isPosting: true, normalBalance: nb });
