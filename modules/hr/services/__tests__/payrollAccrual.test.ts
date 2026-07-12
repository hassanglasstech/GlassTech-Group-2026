/**
 * payrollAccrual.test.ts — REAL tests for the payroll WIP-model accrual math
 * (God-mode P0 #2/#3). Imports the ACTUAL builder PayrollManagement now calls.
 *
 * The critical regression: the pre-fix code debited GROSS while crediting NET,
 * so any absent/late deduction pushed the JV out of balance and tripped the
 * GL-balance gate → payroll never posted → WIP-Direct-Labour understated.
 * These tests lock the invariant Σ debit == Σ credit even with deductions, and
 * the production→WIP / admin→expense split.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPayrollAccrualDetails,
  type PayrollAccrualRecord,
  type PayrollAccrualAccounts,
  type BuildPayrollAccrualParams,
} from '@/modules/hr/services/payrollAccrual';

const ACC: PayrollAccrualAccounts = {
  wipLabourId: '11523',
  adminSalaryId: '52111',
  payableId: '2211',
  staffLoanId: '1121',
};

const rec = (over: Partial<PayrollAccrualRecord> & { employeeId: string }): PayrollAccrualRecord => ({
  basicPay: 0, allowances: 0, overtimePay: 0,
  absentDeduction: 0, lateDeduction: 0, loanDeduction: 0, advanceDeduction: 0,
  ...over,
});

const build = (
  payrolls: PayrollAccrualRecord[],
  opts: Partial<Omit<BuildPayrollAccrualParams, 'payrolls'>> = {},
) => buildPayrollAccrualDetails({
  payrolls,
  deptOf: opts.deptOf ?? (() => 'General'),
  isProduction: opts.isProduction ?? (() => false),
  accounts: opts.accounts ?? ACC,
  monthName: opts.monthName ?? 'July 2026',
  costCenterOf: opts.costCenterOf,
});

const sum = (lines: { debit: number; credit: number }[], k: 'debit' | 'credit') =>
  lines.reduce((s, l) => s + l[k], 0);

describe('buildPayrollAccrualDetails — balance invariant', () => {
  it('balances (Σ debit == Σ credit) for a clean admin payroll', () => {
    const lines = build([rec({ employeeId: 'e1', basicPay: 50000, allowances: 5000 })]);
    expect(sum(lines, 'debit')).toBe(sum(lines, 'credit'));
    expect(sum(lines, 'debit')).toBe(55000);
  });

  it('STILL balances when there are absent + late deductions (the audit bug)', () => {
    const lines = build([rec({
      employeeId: 'e1', basicPay: 50000, allowances: 10000, overtimePay: 4000,
      absentDeduction: 3000, lateDeduction: 1000,
    })]);
    // earned = 64000 − 4000 = 60000 ; net = 60000 (no loans)
    expect(sum(lines, 'debit')).toBe(60000);
    expect(sum(lines, 'credit')).toBe(60000);
    expect(sum(lines, 'debit')).toBe(sum(lines, 'credit'));
  });

  it('balances with loan + advance recovery split off to staff loans', () => {
    const lines = build([rec({
      employeeId: 'e1', basicPay: 40000, loanDeduction: 5000, advanceDeduction: 2000,
    })]);
    // earned = 40000 → Dr ; net = 33000 → Cr payable ; loanRec = 7000 → Cr staff loans
    expect(sum(lines, 'debit')).toBe(40000);
    expect(sum(lines, 'credit')).toBe(40000);
    const payable = lines.find(l => l.accountId === ACC.payableId);
    const staffLoan = lines.find(l => l.accountId === ACC.staffLoanId);
    expect(payable?.credit).toBe(33000);
    expect(staffLoan?.credit).toBe(7000);
  });
});

describe('buildPayrollAccrualDetails — production vs admin split', () => {
  it('routes production earned labour to WIP and admin to the salary expense', () => {
    const lines = build(
      [
        rec({ employeeId: 'prod1', basicPay: 30000 }),
        rec({ employeeId: 'adm1', basicPay: 70000 }),
      ],
      {
        deptOf: (id) => (id === 'prod1' ? 'Cutting' : 'Accounts'),
        isProduction: (id) => id === 'prod1',
      },
    );
    const wip = lines.find(l => l.accountId === ACC.wipLabourId);
    const admin = lines.find(l => l.accountId === ACC.adminSalaryId);
    expect(wip?.debit).toBe(30000);
    expect(admin?.debit).toBe(70000);
    expect(sum(lines, 'debit')).toBe(sum(lines, 'credit'));   // 100000 == 100000
  });

  it('groups multiple production workers of the same dept into one WIP line', () => {
    const lines = build(
      [
        rec({ employeeId: 'p1', basicPay: 20000 }),
        rec({ employeeId: 'p2', basicPay: 25000 }),
      ],
      { deptOf: () => 'Tempering', isProduction: () => true },
    );
    const wipLines = lines.filter(l => l.accountId === ACC.wipLabourId);
    expect(wipLines).toHaveLength(1);
    expect(wipLines[0].debit).toBe(45000);
  });

  it('passes the cost-center id through for grouped dept lines', () => {
    const lines = build(
      [rec({ employeeId: 'p1', basicPay: 10000 })],
      { deptOf: () => 'Cutting', isProduction: () => true, costCenterOf: (d) => `CC-${d}` },
    );
    expect(lines[0].costCenterId).toBe('CC-Cutting');
  });
});

describe('buildPayrollAccrualDetails — edge cases', () => {
  it('emits no staff-loan line when there is no loan/advance recovery', () => {
    const lines = build([rec({ employeeId: 'e1', basicPay: 30000 })]);
    expect(lines.some(l => l.accountId === ACC.staffLoanId)).toBe(false);
  });

  it('returns no lines for an empty payroll run', () => {
    expect(build([])).toEqual([]);
  });

  it('drops a zero/negative earned dept from the debit side but stays balanced', () => {
    // fully-absent worker: earned = 0 → no debit line, net = 0 → no payable line
    const lines = build([rec({ employeeId: 'e1', basicPay: 20000, absentDeduction: 20000 })]);
    expect(lines).toEqual([]);
  });
});
