import { Employee, AttendanceRecord, LoanAdvance, Payroll } from '../types/hr';

const KEYS = {
  EMPLOYEES: 'gtk_erp_employees',
  ATTENDANCE: 'gtk_erp_attendance',
  LOANS: 'gtk_erp_loans',
  PAYROLL: 'gtk_erp_payroll',
};

import { safeParse, safeSave } from '../../shared/services/utils';
import { toast } from 'sonner';

export const HRService = {
  getEmployees: (): Employee[] => safeParse(KEYS.EMPLOYEES),
  saveEmployees: (data: Employee[]) => safeSave(KEYS.EMPLOYEES, data),
  getAttendance: (): AttendanceRecord[] => safeParse(KEYS.ATTENDANCE),
  saveAttendance: (data: AttendanceRecord[]) => safeSave(KEYS.ATTENDANCE, data),
  getLoans: (): LoanAdvance[] => safeParse(KEYS.LOANS),
  saveLoans: (data: LoanAdvance[]) => safeSave(KEYS.LOANS, data),
  getPayroll: (): Payroll[] => safeParse(KEYS.PAYROLL),
  savePayroll: (data: Payroll[]) => safeSave(KEYS.PAYROLL, data),
};
