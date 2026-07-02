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
// BUG-2 Fix (Phase 7): The interface previously contained two `personal: { ... }`
// blocks. TypeScript silently uses the LAST definition of a duplicate key, so the
// first block (name/cnic/phone/address) was shadowed and its fields could not be
// reliably accessed at runtime. The two blocks have been merged into one.
// emergencyContact and emergencyPhone are now a properly nested object so they are
// type-safe and unreachable from the old shadowed path is eliminated.
export interface Employee {
  id: string;
  company: Company;
  personal: {
    name: string;
    cnic: string;
    phone: string;
    address: string;
    email?: string;             // Optional contact email
    photoUrl?: string;          // Quick-access photo path
    emergencyContact?: {        // BUG-2 Fix: was two separate `?:string` fields
      name: string;             //   on a shadowed duplicate key block. Now a
      phone: string;            //   first-class nested object on the canonical key.
    };
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
    medicalAllowance?: number;
    fuelAllowance?: number;
    eobi?: boolean;          // EOBI registered (PKR 370/month deduction)
  };
  transferHistory?: {
    date: string;
    fromCompany: string;
    toCompany: string;
    reason: string;
    approvedBy: string;
  }[];
  salaryHistory?: {
    date: string;
    basic: number;
    gross: number;
    reason: string;
    changedBy: string;
  }[];
}

export type EmployeeStatus = 'probation' | 'confirmed' | 'resigned' | 'terminated' | 'suspended';

// ── Disciplinary Actions ─────────────────────────────────────────────
export type DisciplinaryType = 'verbal_warning' | 'written_warning' | 'show_cause' | 'suspension' | 'termination';

export interface DisciplinaryAction {
  id: string;
  employeeId: string;
  company: string;
  date: string;
  type: DisciplinaryType;
  subject: string;
  details: string;
  issuedBy: string;
  acknowledged: boolean;
  acknowledgedDate?: string;
}

// ── Leave Balance ───────────────────────────────────────────────────
export interface LeaveBalance {
  id: string;
  employeeId: string;
  year: number;
  company: string;
  annualEntitlement: number;  // default 18 days
  used: number;
  remaining: number;
  lastUpdated: string;
}

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
