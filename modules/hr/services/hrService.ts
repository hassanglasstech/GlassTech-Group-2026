import { Employee, AttendanceRecord, LoanAdvance, Payroll } from '../types/hr';
import { safeParse, safeSave } from '../../shared/services/utils';
import { SyncService } from '@/src/services/SyncService';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';

const KEYS = {
  EMPLOYEES: 'gtk_erp_employees',
  ATTENDANCE: 'gtk_erp_attendance',
  LOANS: 'gtk_erp_loans',
  PAYROLL: 'gtk_erp_payroll',
};

export const HRService = {
  getEmployees: (): Employee[] => safeParse(KEYS.EMPLOYEES),
  saveEmployees: (data: Employee[]) => {
    safeSave(KEYS.EMPLOYEES, data);
    SyncService.markDirty('employees');
    Logger.action('HR', 'SAVE_EMPLOYEES', `${data.length} employees saved`);
  },
  getAttendance: (): AttendanceRecord[] => safeParse(KEYS.ATTENDANCE),
  saveAttendance: (data: AttendanceRecord[]) => {
    safeSave(KEYS.ATTENDANCE, data);
    SyncService.markDirty('attendance');
  },
  getLoans: (): LoanAdvance[] => safeParse(KEYS.LOANS),
  saveLoans: (data: LoanAdvance[]) => {
    safeSave(KEYS.LOANS, data);
    SyncService.markDirty('loans');
  },
  getPayroll: (): Payroll[] => safeParse(KEYS.PAYROLL),
  savePayroll: (data: Payroll[]) => {
    safeSave(KEYS.PAYROLL, data);
    SyncService.markDirty('payroll');
    Logger.action('HR', 'SAVE_PAYROLL', `Payroll updated for ${data.length} records`);
  },
};
