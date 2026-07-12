/**
 * payrollAccrual.ts — pure builder for the payroll accrual JV lines.
 *
 * Extracted from PayrollManagement so the WIP-model split can be unit-tested
 * directly (God-mode P0 #2/#3). The component wires the account ids + employee
 * lookups and passes them in; this function owns the money math and MUST stay
 * balanced by construction:
 *
 *   earned = (basic + allowances + overtime) − absent − late      (→ Dr WIP/Admin)
 *   net    = earned − loan − advance                              (→ Cr Payable)
 *   loanRec = loan + advance                                      (→ Cr Staff Loans)
 *   Σ earned == Σ net + Σ loanRec   ⇒   Σ debit == Σ credit
 *
 * The pre-fix code debited GROSS basic while crediting NET, so it drifted out of
 * balance by exactly the absent/late deductions and tripped the GL-balance gate.
 * The test locks that in: a record with an absent deduction must still balance.
 *
 * Production workers' earned labour → WIP — Direct Labour (IAS 2.10-12, released
 * to COGS at delivery); admin/office staff → Salaries — Admin (period cost).
 */

export interface PayrollAccrualRecord {
  employeeId: string;
  basicPay: number;
  allowances: number;
  overtimePay: number;
  absentDeduction: number;
  lateDeduction: number;
  loanDeduction: number;
  advanceDeduction: number;
}

export interface PayrollAccrualAccounts {
  /** 11523 WIP — Direct Labour */
  wipLabourId: string;
  /** 52111 Salaries — Admin & Management */
  adminSalaryId: string;
  /** 2211 Salaries Payable */
  payableId: string;
  /** 1121 Staff Loans & Advances */
  staffLoanId: string;
}

export interface PayrollAccrualLine {
  accountId: string;
  debit: number;
  credit: number;
  text: string;
  costCenterId?: string;
}

export interface BuildPayrollAccrualParams {
  payrolls: PayrollAccrualRecord[];
  /** department label for an employee (defaults handled by caller) */
  deptOf: (employeeId: string) => string;
  /** true when the employee's earned labour should hit WIP (production) */
  isProduction: (employeeId: string) => boolean;
  accounts: PayrollAccrualAccounts;
  monthName: string;
  /** optional cost-center resolver by department */
  costCenterOf?: (dept: string) => string | undefined;
}

/**
 * Build the balanced accrual detail lines. Production earned labour is grouped
 * by department to WIP; admin earned labour by department to the admin salary
 * expense; one payable credit for total net; one staff-loan credit for total
 * loan/advance recovery. Order matches the original inline implementation.
 */
export const buildPayrollAccrualDetails = (
  params: BuildPayrollAccrualParams,
): PayrollAccrualLine[] => {
  const { payrolls, deptOf, isProduction, accounts, monthName, costCenterOf } = params;

  const prodByDept: Record<string, number> = {};
  const adminByDept: Record<string, number> = {};
  let totalNetPay = 0;
  let totalLoanRec = 0;

  for (const p of payrolls) {
    const dept = deptOf(p.employeeId) || 'General';
    const earned = (p.basicPay + p.allowances + p.overtimePay) - p.absentDeduction - p.lateDeduction;
    const net = earned - p.loanDeduction - p.advanceDeduction;
    totalNetPay += net;
    totalLoanRec += p.loanDeduction + p.advanceDeduction;
    if (isProduction(p.employeeId)) prodByDept[dept] = (prodByDept[dept] || 0) + earned;
    else adminByDept[dept] = (adminByDept[dept] || 0) + earned;
  }

  const details: PayrollAccrualLine[] = [];
  for (const [dept, amt] of Object.entries(prodByDept)) {
    if (amt > 0) details.push({
      accountId: accounts.wipLabourId, debit: amt, credit: 0,
      text: `Production wages → WIP — ${dept} — ${monthName}`,
      costCenterId: costCenterOf?.(dept),
    });
  }
  for (const [dept, amt] of Object.entries(adminByDept)) {
    if (amt > 0) details.push({
      accountId: accounts.adminSalaryId, debit: amt, credit: 0,
      text: `Admin salaries — ${dept} — ${monthName}`,
      costCenterId: costCenterOf?.(dept),
    });
  }
  if (totalNetPay > 0) details.push({
    accountId: accounts.payableId, debit: 0, credit: totalNetPay,
    text: `Net salary payable — ${monthName}`,
  });
  if (totalLoanRec > 0) details.push({
    accountId: accounts.staffLoanId, debit: 0, credit: totalLoanRec,
    text: `Loan/advance recovery — ${monthName}`,
  });

  return details;
};
