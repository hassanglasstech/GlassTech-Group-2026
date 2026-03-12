import { Employee, AttendanceRecord, LoanAdvance, Payroll } from '../types/hr';

const KEYS = {
  EMPLOYEES: 'gtk_erp_employees',
  ATTENDANCE: 'gtk_erp_attendance',
  LOANS: 'gtk_erp_loans',
  PAYROLL: 'gtk_erp_payroll',
};

import { safeParse } from '../../shared/services/utils';

export const HRService = {
  getEmployees: (): Employee[] => safeParse(KEYS.EMPLOYEES),
  saveEmployees: (data: Employee[]) => localStorage.setItem(KEYS.EMPLOYEES, JSON.stringify(data)),
  getAttendance: (): AttendanceRecord[] => safeParse(KEYS.ATTENDANCE),
  saveAttendance: (data: AttendanceRecord[]) => localStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(data)),
  getLoans: (): LoanAdvance[] => safeParse(KEYS.LOANS),
  saveLoans: (data: LoanAdvance[]) => localStorage.setItem(KEYS.LOANS, JSON.stringify(data)),
  getPayroll: (): Payroll[] => safeParse(KEYS.PAYROLL),
  savePayroll: (data: Payroll[]) => localStorage.setItem(KEYS.PAYROLL, JSON.stringify(data)),
};