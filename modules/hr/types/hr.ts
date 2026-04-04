import { Company } from '../../shared/types/core';
import { AttendanceStatus, LoanStatus } from '../../shared/constants';

export type { AttendanceStatus, LoanStatus };

// ── Tag System ──────────────────────────────────────────────────────
export type TagCategory = 'job_title' | 'designation';

export interface TagMaster {
  id: string;
  company: Company;
  category: TagCategory;
  label: string;
  color: string;        // hex for pill bg, e.g. "#E6F1FB"
  textColor: string;    // hex for pill text, e.g. "#0C447C"
  isActive: boolean;
}

export interface EmployeeTag {
  id: string;
  employeeId: string;
  tagId: string;
  isPrimary: boolean;
}

// ── Department ──────────────────────────────────────────────────────
export interface Department {
  id: string;
  company: Company;
  name: string;
  parentDept: string | null;
  isActive: boolean;
}

// ── Employee Document ───────────────────────────────────────────────
export type DocType = 'photo' | 'cnic_front' | 'cnic_back' | 'police_verification' | 'job_letter' | 'contract' | 'other';
export type DocStatus = 'valid' | 'expired' | 'missing';

export interface EmployeeDoc {
  id: string;
  employeeId: string;
  docType: DocType;
  fileName: string;
  fileUrl: string;       // Supabase Storage path or localStorage base64
  expiryDate: string | null;
  uploadedAt: string;
  status: DocStatus;
}

// ── RBAC — Role-Based Access Control ────────────────────────────────
export type RBACModule = 'hr' | 'attendance' | 'payroll' | 'production' | 'finance' | 'store' | 'procurement' | 'sales' | 'projects' | 'logistics' | 'vendors' | 'hub' | 'md-dashboard' | 'admin';
export type RBACAction = 'create' | 'read' | 'update' | 'delete';
export type RBACScope  = 'own' | 'department' | 'company' | 'all';

export interface Role {
  id: string;
  name: string;
  company: Company;
  description: string;
  isSystem: boolean;     // true = default role, cannot be deleted
  isActive: boolean;
}

export interface Permission {
  id: string;
  module: RBACModule;
  action: RBACAction;
  scope: RBACScope;
}

export interface RolePermission {
  id: string;
  roleId: string;
  permissionId: string;
}

export interface EmployeeRole {
  id: string;
  employeeId: string;
  roleId: string;
  assignedAt: string;
  assignedBy: string;
}

// ── Employee (Enhanced) ─────────────────────────────────────────────
export interface Employee {
  id: string;
  company: Company;
  personal: {
    name: string;
    cnic: string;
    phone: string;
    address: string;
    photoUrl?: string;   // NEW: quick-access photo path
  };
  work: {
    designation: string;     // LEGACY: kept for backward compat, display-only
    department: string;      // LEGACY: free text, kept for backward compat
    departmentId: string;    // NEW: FK to Department table
    grade: string;
    joinDate: string;
    employeeCode: string;
    status?: EmployeeStatus; // NEW: probation/confirmed/etc
    site?: string;           // Site/location
    lastDate?: string;       // Last working date (for resigned/terminated)
  };
  salary: {
    basic: number;
    houseRent: number;
    conveyance: number;
    specialAllowance: number;
  };
}

export type EmployeeStatus = 'probation' | 'confirmed' | 'resigned' | 'terminated' | 'suspended';

// ── Attendance ──────────────────────────────────────────────────────
export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeHours: number;
}

// ── Loan / Advance ──────────────────────────────────────────────────
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

// ── Payroll ─────────────────────────────────────────────────────────
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
