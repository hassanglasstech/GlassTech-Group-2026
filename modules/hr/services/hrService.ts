/**
 * HR Service — Supabase-Primary
 * 
 * All data lives in Supabase. In-memory cache for fast reads.
 * Cache refreshes on every write and on init.
 * Falls back to localStorage if Supabase is unreachable.
 * 
 * Tables: employees, attendance, loans, payroll
 */

import { Employee, AttendanceRecord, LoanAdvance, Payroll } from '../types/hr';
import { supabase } from '@/src/services/supabaseClient';
import { safeParse, safeSave } from '../../shared/services/utils';
import { SyncService } from '@/src/services/SyncService';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';

// ── Local cache keys (fallback + offline buffer) ────────────────────
const KEYS = {
  EMPLOYEES:  'gtk_erp_employees',
  ATTENDANCE: 'gtk_erp_attendance',
  LOANS:      'gtk_erp_loans',
  PAYROLL:    'gtk_erp_payroll',
};

// ── In-Memory Cache ─────────────────────────────────────────────────
let _cache = {
  employees: [] as Employee[],
  attendance: [] as AttendanceRecord[],
  loans: [] as LoanAdvance[],
  payroll: [] as Payroll[],
  loaded: false,
};

// ── Mappers: Supabase row → App object ──────────────────────────────
const rowToEmployee = (r: any): Employee => ({
  id: r.id,
  company: r.company || '',
  personal: r.personal && typeof r.personal === 'object' && r.personal.name
    ? r.personal
    : {
        name: r.name || r.personal?.name || '',
        cnic: r.cnic || r.personal?.cnic || '',
        phone: r.phone || r.personal?.phone || '',
        address: r.address || r.personal?.address || '',
        photoUrl: r.personal?.photoUrl || '',
      },
  work: r.work && typeof r.work === 'object' && r.work.employeeCode
    ? r.work
    : {
        designation: r.designation || r.work?.designation || '',
        department: r.department || r.work?.department || '',
        departmentId: r.department_id || r.work?.departmentId || '',
        grade: r.grade || r.work?.grade || '',
        joinDate: r.join_date || r.joinDate || r.work?.joinDate || '',
        employeeCode: r.employee_code || r.employeeCode || r.work?.employeeCode || '',
        status: r.status || r.work?.status || 'confirmed',
      },
  salary: r.salary && typeof r.salary === 'object' && (r.salary.basic !== undefined)
    ? r.salary
    : {
        basic: r.basic || r.salary?.basic || 0,
        houseRent: r.house_rent || r.houseRent || r.salary?.houseRent || 0,
        conveyance: r.conveyance || r.salary?.conveyance || 0,
        specialAllowance: r.special_allowance || r.specialAllowance || r.salary?.specialAllowance || 0,
      },
});

const rowToAttendance = (r: any): AttendanceRecord => ({
  id: r.id,
  employeeId: r.employee_id || r.employeeId || '',
  date: r.date || '',
  status: r.status || 'Present',
  lateMinutes: r.late_minutes || r.lateMinutes || 0,
  earlyMinutes: r.early_minutes || r.earlyMinutes || 0,
  overtimeHours: r.overtime_hours || r.overtimeHours || 0,
});

const rowToLoan = (r: any): LoanAdvance => ({
  id: r.id,
  employeeId: r.employee_id || r.employeeId || '',
  date: r.date || '',
  amount: r.amount || 0,
  type: r.type || 'Loan',
  repaymentAmount: r.repayment_amount || r.repaymentAmount || 0,
  status: r.status || 'Active',
  requisitionId: r.requisition_id || r.requisitionId || '',
  skipMonth: r.skip_month || r.skipMonth || '',
});

const rowToPayroll = (r: any): Payroll => ({
  id: r.id,
  employeeId: r.employee_id || r.employeeId || '',
  month: r.month || '',
  basicPay: r.basic_pay || r.basicPay || 0,
  allowances: r.allowances || 0,
  overtimePay: r.overtime_pay || r.overtimePay || 0,
  overtimeHours: r.overtime_hours || r.overtimeHours || 0,
  earlyDeductionHours: r.early_deduction_hours || r.earlyDeductionHours || 0,
  lateDeduction: r.late_deduction || r.lateDeduction || 0,
  absentDeduction: r.absent_deduction || r.absentDeduction || 0,
  loanDeduction: r.loan_deduction || r.loanDeduction || 0,
  advanceDeduction: r.advance_deduction || r.advanceDeduction || 0,
  netSalary: r.net_salary || r.netSalary || 0,
  absentDates: r.absent_dates || r.absentDates || [],
  lateDates: r.late_dates || r.lateDates || [],
  loanRepayments: r.loan_repayments || r.loanRepayments || [],
  isSalaryPaid: r.is_salary_paid || r.isSalaryPaid || false,
  isOvertimePaid: r.is_overtime_paid || r.isOvertimePaid || false,
  allowedAbsentCount: r.allowed_absent_count || r.allowedAbsentCount || 0,
  loanWaived: r.loan_waived || r.loanWaived || false,
});

// ── Mappers: App object → Supabase row ──────────────────────────────
const attendanceToRow = (a: AttendanceRecord & { company?: string }) => ({
  id: a.id,
  employee_id: a.employeeId,
  date: a.date,
  status: a.status,
  late_minutes: a.lateMinutes || 0,
  early_minutes: a.earlyMinutes || 0,
  overtime_hours: a.overtimeHours || 0,
  company: (a as any).company || '',
});

const loanToRow = (l: LoanAdvance & { company?: string }) => ({
  id: l.id,
  employee_id: l.employeeId,
  date: l.date,
  amount: l.amount,
  type: l.type,
  repayment_amount: l.repaymentAmount,
  status: l.status,
  requisition_id: l.requisitionId || null,
  skip_month: l.skipMonth || null,
  company: (l as any).company || '',
});

const payrollToRow = (p: Payroll & { company?: string }) => ({
  id: p.id,
  employee_id: p.employeeId,
  month: p.month,
  basic_pay: p.basicPay,
  allowances: p.allowances,
  overtime_pay: p.overtimePay,
  overtime_hours: p.overtimeHours,
  early_deduction_hours: p.earlyDeductionHours,
  late_deduction: p.lateDeduction,
  absent_deduction: p.absentDeduction,
  loan_deduction: p.loanDeduction,
  advance_deduction: p.advanceDeduction,
  net_salary: p.netSalary,
  absent_dates: p.absentDates || [],
  late_dates: p.lateDates || [],
  loan_repayments: p.loanRepayments || [],
  is_salary_paid: p.isSalaryPaid || false,
  is_overtime_paid: p.isOvertimePaid || false,
  allowed_absent_count: p.allowedAbsentCount || 0,
  loan_waived: p.loanWaived || false,
  company: (p as any).company || '',
});

// ── Cache Loader ────────────────────────────────────────────────────
const refreshCache = async (): Promise<void> => {
  try {
    // Employees
    const empRes = await supabase.from('employees').select('*');
    if (empRes.data && empRes.data.length > 0) {
      _cache.employees = empRes.data.map(rowToEmployee);
      safeSave(KEYS.EMPLOYEES, _cache.employees);
    }
  } catch (e: any) { console.warn('[HRService] employees pull failed:', e.message); }

  try {
    const attRes = await supabase.from('attendance').select('*');
    if (attRes.data && attRes.data.length > 0) {
      _cache.attendance = attRes.data.map(rowToAttendance);
      safeSave(KEYS.ATTENDANCE, _cache.attendance);
    }
  } catch (e: any) { console.warn('[HRService] attendance pull failed:', e.message); }

  try {
    const loanRes = await supabase.from('loans').select('*');
    if (loanRes.data && loanRes.data.length > 0) {
      _cache.loans = loanRes.data.map(rowToLoan);
      safeSave(KEYS.LOANS, _cache.loans);
    }
  } catch (e: any) { console.warn('[HRService] loans pull failed:', e.message); }

  try {
    const payRes = await supabase.from('payroll').select('*');
    if (payRes.data && payRes.data.length > 0) {
      _cache.payroll = payRes.data.map(rowToPayroll);
      safeSave(KEYS.PAYROLL, _cache.payroll);
    }
  } catch (e: any) { console.warn('[HRService] payroll pull failed:', e.message); }

  // Fallback: if Supabase had nothing, use localStorage
  if (_cache.employees.length === 0) {
    _cache.employees = safeParse(KEYS.EMPLOYEES).filter(Boolean).map((e: any) => ({
      ...e,
      personal: e.personal ?? { name: '', cnic: '', phone: '', address: '' },
      work: e.work ?? { designation: '', department: '', grade: '', joinDate: '', employeeCode: '' },
      salary: e.salary ?? { basic: 0, houseRent: 0, conveyance: 0, specialAllowance: 0 },
    }));
  }
  if (_cache.attendance.length === 0) _cache.attendance = safeParse(KEYS.ATTENDANCE);
  if (_cache.loans.length === 0) _cache.loans = safeParse(KEYS.LOANS);
  if (_cache.payroll.length === 0) _cache.payroll = safeParse(KEYS.PAYROLL);

  _cache.loaded = true;
};

const ensureCache = async () => {
  if (!_cache.loaded) await refreshCache();
};

// ═════════════════════════════════════════════════════════════════════
// HR SERVICE — Supabase-primary, localStorage fallback
// ═════════════════════════════════════════════════════════════════════
export const HRService = {

  /** Initialize cache — call on app start or module mount */
  loadCache: refreshCache,
  isCacheLoaded: () => _cache.loaded,

  // ── EMPLOYEES ─────────────────────────────────────────────────────
  getEmployees: (): Employee[] => {
    if (_cache.loaded && _cache.employees.length > 0) return _cache.employees;
    // Fallback to localStorage if cache not loaded yet
    const raw: any[] = safeParse(KEYS.EMPLOYEES);
    return raw.filter(Boolean).map(e => ({
      ...e,
      personal: e.personal ?? { name: '', cnic: '', phone: '', address: '' },
      work: e.work ?? { designation: '', department: '', grade: '', joinDate: '', employeeCode: '' },
      salary: e.salary ?? { basic: 0, houseRent: 0, conveyance: 0, specialAllowance: 0 },
    }));
  },

  saveEmployees: (data: Employee[]) => {
    // Write to localStorage immediately (fast UI)
    safeSave(KEYS.EMPLOYEES, data);
    _cache.employees = data;
    // Push to Supabase in background
    SyncService.markDirty('employees');
    Logger.action('HR', 'SAVE_EMPLOYEES', `${data.length} employees saved`);
  },

  // ── ATTENDANCE ────────────────────────────────────────────────────
  getAttendance: (): AttendanceRecord[] => {
    if (_cache.loaded && _cache.attendance.length > 0) return _cache.attendance;
    return safeParse(KEYS.ATTENDANCE);
  },

  saveAttendance: async (data: AttendanceRecord[]) => {
    // Save to localStorage
    safeSave(KEYS.ATTENDANCE, data);
    _cache.attendance = data;

    // Push to Supabase
    try {
      const rows = data.map(attendanceToRow);
      const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    } catch (err: any) {
      console.warn('[HRService] Attendance push failed:', err.message);
      SyncService.markDirty('attendance'); // queue for later
    }
  },

  // ── LOANS ─────────────────────────────────────────────────────────
  getLoans: (): LoanAdvance[] => {
    if (_cache.loaded && _cache.loans.length > 0) return _cache.loans;
    return safeParse(KEYS.LOANS);
  },

  saveLoans: async (data: LoanAdvance[]) => {
    safeSave(KEYS.LOANS, data);
    _cache.loans = data;

    try {
      const rows = data.map(loanToRow);
      const { error } = await supabase.from('loans').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    } catch (err: any) {
      console.warn('[HRService] Loans push failed:', err.message);
      SyncService.markDirty('loans');
    }
  },

  // ── PAYROLL ───────────────────────────────────────────────────────
  getPayroll: (): Payroll[] => {
    if (_cache.loaded && _cache.payroll.length > 0) return _cache.payroll;
    return safeParse(KEYS.PAYROLL);
  },

  savePayroll: async (data: Payroll[]) => {
    safeSave(KEYS.PAYROLL, data);
    _cache.payroll = data;

    try {
      const rows = data.map(payrollToRow);
      const { error } = await supabase.from('payroll').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    } catch (err: any) {
      console.warn('[HRService] Payroll push failed:', err.message);
      SyncService.markDirty('payroll');
    }
    Logger.action('HR', 'SAVE_PAYROLL', `Payroll updated for ${data.length} records`);
  },
};
