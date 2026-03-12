import { Employee, AttendanceRecord, LoanAdvance, Payroll } from '../types/hr';

const KEYS = {
  EMPLOYEES: 'gtk_erp_employees',
  ATTENDANCE: 'gtk_erp_attendance',
  LOANS:      'gtk_erp_loans',
  PAYROLL:    'gtk_erp_payroll',
};

import { safeParse } from '../../shared/services/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Normalizer: handles BOTH formats
//   • Nested  (correct): { personal:{name}, work:{designation}, salary:{basic} }
//   • Flat    (Supabase raw / old sync): { name, designation, basic, ... }
// ─────────────────────────────────────────────────────────────────────────────
function normalizeEmployee(e: any): Employee {
  if (e?.personal && e?.work && e?.salary) return e as Employee; // already correct ✅

  return {
    id:      e.id,
    company: e.company,
    personal: {
      name:    e.name             ?? e.personal?.name    ?? '',
      cnic:    e.cnic             ?? e.personal?.cnic    ?? '',
      phone:   e.phone            ?? e.personal?.phone   ?? '',
      address: e.address          ?? e.personal?.address ?? '',
    },
    work: {
      designation:  e.designation   ?? e.work?.designation  ?? '',
      department:   e.department    ?? e.work?.department   ?? '',
      grade:        e.grade         ?? e.work?.grade        ?? '',
      joinDate:     e.join_date     ?? e.joinDate           ?? e.work?.joinDate     ?? '',
      employeeCode: e.employee_code ?? e.employeeCode       ?? e.work?.employeeCode ?? '',
    },
    salary: {
      basic:            Number(e.basic             ?? e.salary?.basic            ?? 0),
      houseRent:        Number(e.house_rent        ?? e.houseRent                ?? e.salary?.houseRent        ?? 0),
      conveyance:       Number(e.conveyance        ?? e.salary?.conveyance       ?? 0),
      specialAllowance: Number(e.special_allowance ?? e.specialAllowance         ?? e.salary?.specialAllowance ?? 0),
    },
  };
}

export const HRService = {
  getEmployees: (): Employee[] =>
    (safeParse(KEYS.EMPLOYEES) as any[]).map(normalizeEmployee),

  saveEmployees: (data: Employee[]) =>
    localStorage.setItem(KEYS.EMPLOYEES, JSON.stringify(data)),

  getAttendance: (): AttendanceRecord[] => safeParse(KEYS.ATTENDANCE),
  saveAttendance: (data: AttendanceRecord[]) =>
    localStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(data)),

  getLoans: (): LoanAdvance[] => safeParse(KEYS.LOANS),
  saveLoans: (data: LoanAdvance[]) =>
    localStorage.setItem(KEYS.LOANS, JSON.stringify(data)),

  getPayroll: (): Payroll[] => safeParse(KEYS.PAYROLL),
  savePayroll: (data: Payroll[]) =>
    localStorage.setItem(KEYS.PAYROLL, JSON.stringify(data)),
};
