import { Company } from '../../shared/types/core';
import { AttendanceStatus, LoanStatus } from '../../shared/constants';

export type { AttendanceStatus, LoanStatus };

export interface Employee {
  id: string;
  company: Company;
  personal: {
    name: string;
    cnic: string;
    phone: string;
    address: string;
  };
  work: {
    designation: string;
    department: string;
    grade: string;
    joinDate: string;
    employeeCode: string;
  };
  salary: {
    basic: number;
    houseRent: number;
    conveyance: number;
    specialAllowance: number;
  };
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeHours: number;
}

export interface LoanAdvance {
  id: string;
  employeeId: string;
  date: string;
  amount: number;
  type: 'Loan' | 'Advance';
  repaymentAmount: number;
  status: LoanStatus;
  requisitionId?: string;
  skipMonth?: string;
}

export interface Payroll {
  id: string;
  employeeId: string;
  month: string;
  basicPay: number;
  allowances: number;
  overtimePay: number;
  overtimeHours: number;
  earlyDeductionHours: number;
  lateDeduction: number;
  absentDeduction: number;
  loanDeduction: number;
  advanceDeduction: number;
  netSalary: number;
  absentDates: string[];
  lateDates: { date: string; minutes: number }[];
  loanRepayments: { date: string; amount: number; type: 'Loan' | 'Advance' }[];
  isSalaryPaid?: boolean;
  isOvertimePaid?: boolean;
  allowedAbsentCount?: number; 
  loanWaived?: boolean;
}
