/**
 * HR Service — Supabase-Primary
 * 
 * All data lives in Supabase. In-memory cache for fast reads.
 * Cache refreshes on every write and on init.
 * Pure Supabase — in-memory cache for fast reads.
 * 
 * Tables: employees, attendance, loans, payroll
 */

import { Employee, AttendanceRecord, LoanAdvance, Payroll } from '../types/hr';
import { Company } from '@/modules/shared/constants';
import { supabase } from '@/src/services/supabaseClient';
// localStorage is the offline buffer SyncService flushes to Supabase (two-tier).
// Every write MUST safeSave the table's local key — SyncService.pushTable reads
// THAT key to push, and reads fall back to it when the cloud is unreachable.
import { safeParse, safeSave } from '../../shared/services/utils';
import { SyncService } from '@/src/services/SyncService';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { FinanceService } from '@/modules/finance/services/financeService';
import { TagService } from './tagService';

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
// The `employees` table is JSONB-style: a row is { id, company, data:{personal,
// work, salary, …}, updated_at }. Unwrap `data` first, then fall back to flat
// columns so any legacy flat row (or a domain object from the localStorage
// buffer) still maps cleanly.
const rowToEmployee = (r: any): Employee => {
  // Prefer the JSONB `data` payload, but fall back to flat columns when `data`
  // is absent or an empty {} (legacy flat rows / pre-migration data).
  const d = (r.data && typeof r.data === 'object' && Object.keys(r.data).length > 0) ? r.data : r;
  return {
    id: r.id,
    company: r.company || d.company || '',
    personal: d.personal && typeof d.personal === 'object' && d.personal.name
      ? d.personal
      : {
          name: d.name || d.personal?.name || '',
          cnic: d.cnic || d.personal?.cnic || '',
          phone: d.phone || d.personal?.phone || '',
          email: d.email || d.personal?.email || '',
          address: d.address || d.personal?.address || '',
          photoUrl: d.personal?.photoUrl || '',
        },
    work: d.work && typeof d.work === 'object' && d.work.employeeCode
      ? d.work
      : {
          designation: d.designation || d.work?.designation || '',
          department: d.department || d.work?.department || '',
          departmentId: d.department_id || d.work?.departmentId || '',
          grade: d.grade || d.work?.grade || '',
          joinDate: d.join_date || d.joinDate || d.work?.joinDate || '',
          employeeCode: d.employee_code || d.employeeCode || d.work?.employeeCode || '',
          status: d.status || d.work?.status || 'confirmed',
        },
    salary: d.salary && typeof d.salary === 'object' && (d.salary.basic !== undefined)
      ? d.salary
      : {
          basic: d.basic || d.salary?.basic || 0,
          houseRent: d.house_rent || d.houseRent || d.salary?.houseRent || 0,
          conveyance: d.conveyance || d.salary?.conveyance || 0,
          specialAllowance: d.special_allowance || d.specialAllowance || d.salary?.specialAllowance || 0,
        },
  };
};

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
const attendanceToRow = (a: AttendanceRecord & { company?: string }) => {
  // Supabase enum only has: Present, Absent — map others safely
  const statusMap: Record<string, string> = {
    Present: 'Present',
    Absent:  'Absent',
    Late:    'Present', // Late = Present with late_minutes > 0
    Leave:   'Absent',  // Leave treated as Absent in DB
  };
  return {
    id: a.id,
    employee_id: a.employeeId,
    date: a.date,
    status: statusMap[a.status] || 'Present',
    late_minutes: a.lateMinutes || 0,
    early_minutes: a.earlyMinutes || 0,
    overtime_hours: a.overtimeHours || 0,
    company: (a as any).company || '',
  };
};

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

// Coerce values before the Supabase upsert. Legacy payroll rows can store the
// STRING "false" (or other non-numbers) in numeric fields from an old buggy
// import — `"false"` reaches Postgres and 400s ("invalid input syntax for type
// numeric: false"). num() forces a real number; bool() a real boolean. Mirrors
// the SyncService payroll push mapper.
const _num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : 0; };
const _bool = (v: unknown): boolean => v === true || v === 'true' || v === 1 || v === '1';
const payrollToRow = (p: Payroll & { company?: string }) => ({
  id: p.id,
  employee_id: p.employeeId,
  month: p.month,
  basic_pay: _num(p.basicPay),
  allowances: _num(p.allowances),
  overtime_pay: _num(p.overtimePay),
  overtime_hours: _num(p.overtimeHours),
  early_deduction_hours: _num(p.earlyDeductionHours),
  late_deduction: _num(p.lateDeduction),
  absent_deduction: _num(p.absentDeduction),
  loan_deduction: _num(p.loanDeduction),
  advance_deduction: _num(p.advanceDeduction),
  net_salary: _num(p.netSalary),
  absent_dates: p.absentDates || [],
  late_dates: p.lateDates || [],
  loan_repayments: p.loanRepayments || [],
  is_salary_paid: _bool(p.isSalaryPaid),
  is_overtime_paid: _bool(p.isOvertimePaid),
  allowed_absent_count: _num(p.allowedAbsentCount),
  loan_waived: _bool(p.loanWaived),
  company: (p as any).company || '',
});

// ── Cache Loader ────────────────────────────────────────────────────
// SEC-2: all four HR queries are scoped to the authenticated user's company.
// RLS on the DB enforces the same constraint; this is a defence-in-depth
// application-layer guard so no cross-tenant rows ever enter the cache.
const refreshCache = async (): Promise<void> => {
  // BUGFIX: the reliable company for this single-tenant deploy is the
  // app-selected company, NOT profile.company — user_profiles has NO `company`
  // column here, so profile.company is always empty and the old guard skipped
  // EVERY HR load. Result: employees saved to Supabase fine (POST 201) but never
  // re-appeared after refresh. Mirror the sales module's activeCompany(): prefer
  // the switcher's selected company (multitenant), then profile.company.
  const company = useAppStore.getState().selectedCompany
    || useAuthStore.getState().profile?.company
    || '';
  if (!company) {
    console.warn('[HRService] refreshCache called with no company — skipping Supabase load');
    _cache.loaded = true;
    return;
  }

  // Two-tier read: Supabase primary → localStorage buffer fallback on failure.
  // The row mappers handle BOTH shapes (domain objects written by our safeSave
  // AND raw cloud rows written by SyncService.pullTable), so the fallback is safe.
  try {
    const empRes = await supabase.from('employees').select('*').eq('company', company);
    if (empRes.data) {
      _cache.employees = empRes.data.map(rowToEmployee);
    }
  } catch (e: any) {
    console.warn('[HRService] employees pull failed — using local buffer:', e.message);
    const local = safeParse(KEYS.EMPLOYEES);
    if (local.length) _cache.employees = local.map(rowToEmployee);
  }

  try {
    const attRes = await supabase.from('attendance').select('*').eq('company', company);
    if (attRes.data) {
      _cache.attendance = attRes.data.map(rowToAttendance);
    }
  } catch (e: any) {
    console.warn('[HRService] attendance pull failed — using local buffer:', e.message);
    const local = safeParse(KEYS.ATTENDANCE);
    if (local.length) _cache.attendance = local.map(rowToAttendance);
  }

  try {
    const loanRes = await supabase.from('loans').select('*').eq('company', company);
    if (loanRes.data) {
      _cache.loans = loanRes.data.map(rowToLoan);
    }
  } catch (e: any) {
    console.warn('[HRService] loans pull failed — using local buffer:', e.message);
    const local = safeParse(KEYS.LOANS);
    if (local.length) _cache.loans = local.map(rowToLoan);
  }

  try {
    const payRes = await supabase.from('payroll').select('*').eq('company', company);
    if (payRes.data) {
      _cache.payroll = payRes.data.map(rowToPayroll);
    }
  } catch (e: any) {
    console.warn('[HRService] payroll pull failed — using local buffer:', e.message);
    const local = safeParse(KEYS.PAYROLL);
    if (local.length) _cache.payroll = local.map(rowToPayroll);
  }

  _cache.loaded = true;
};

const ensureCache = async () => {
  if (!_cache.loaded) await refreshCache();
};

// ═════════════════════════════════════════════════════════════════════
// HR SERVICE — Pure Supabase + in-memory cache
// ═════════════════════════════════════════════════════════════════════
export const HRService = {

  /** Initialize cache — call on app start or module mount */
  loadCache: refreshCache,
  isCacheLoaded: () => _cache.loaded,

  // ── EMPLOYEES ─────────────────────────────────────────────────────
  getEmployees: (): Employee[] => {
    return _cache.employees;
  },

  /**
   * Cutter roster — active employees TAGGED "Cutter" or "Senior Cutter"
   * (HR job-title tag), with a legacy free-text `designation` fallback for
   * anyone not yet tagged. Shared by the Production Job Orders "Assign Cutter"
   * dropdown and the Cutter Workbench "act as cutter" picker so both resolve
   * the same people. The returned name matches the cutter's login full name
   * used by the Cut Queue. Reads the in-memory employee cache (call
   * loadCache() first) + the tag cache (hydrated into localStorage at boot).
   */
  getCutters: (company?: string): Employee[] => {
    return _cache.employees.filter(e => {
      const st = e.work?.status;
      const active = st !== 'resigned' && st !== 'terminated' && st !== 'suspended';
      if (!active) return false;
      if (company && e.company && e.company !== company) return false;
      const taggedCutter = TagService.getEmployeeTagsResolved(e.id)
        .some(t => /cutter/i.test(t.tag?.label || ''));   // matches "Cutter" + "Senior Cutter"
      const desigCutter = /cutter|cutting/i.test(e.work?.designation || '');
      return taggedCutter || desigCutter;
    });
  },

  getCutterNames: (company?: string): string[] => {
    const names = HRService.getCutters(company).map(e => e.personal?.name || '').filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  },

  saveEmployees: (data: Employee[]) => {
    _cache.employees = data;
    // BUGFIX: write the offline buffer that SyncService.pushTable('employees')
    // reads. Previously this only set the in-memory cache and called markDirty,
    // but pushTable reads localStorage('gtk_erp_employees') — which was empty —
    // so it pushed nothing, cleared the pending marker, and the new employee
    // never reached Supabase (no error: the empty push "succeeds"). On refresh,
    // refreshCache re-pulled from the cloud and the employee was gone. This is
    // the safeSave-then-markDirty idiom every other service uses.
    safeSave(KEYS.EMPLOYEES, data);
    SyncService.markDirty('employees');
    Logger.action('HR', 'SAVE_EMPLOYEES', `${data.length} employees saved`);
  },

  // ── ATTENDANCE ────────────────────────────────────────────────────
  getAttendance: (): AttendanceRecord[] => {
    return _cache.attendance;
  },

  saveAttendance: async (data: AttendanceRecord[]) => {
    _cache.attendance = data;
    safeSave(KEYS.ATTENDANCE, data);   // offline buffer for the sync-retry fallback
    try {
      const rows = data.map(attendanceToRow);
      const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    } catch (err: any) {
      console.warn('[HRService] Attendance push failed:', err.message);
      SyncService.markDirty('attendance');   // retry on next online sync (buffer now has the data)
    }
  },

  // ── LOANS ─────────────────────────────────────────────────────────
  getLoans: (): LoanAdvance[] => {
    return _cache.loans;
  },

  saveLoans: async (data: LoanAdvance[]) => {
    _cache.loans = data;
    safeSave(KEYS.LOANS, data);   // offline buffer for the sync-retry fallback

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
    return _cache.payroll;
  },

  savePayroll: async (data: Payroll[]) => {
    _cache.payroll = data;
    safeSave(KEYS.PAYROLL, data);   // offline buffer for the sync-retry fallback

    try {
      const rows = data.map(payrollToRow);
      const { error } = await supabase.from('payroll').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    } catch (err: any) {
      console.warn('[HRService] Payroll push failed:', err.message);
      SyncService.markDirty('payroll');
    }
    Logger.action('HR', 'SAVE_PAYROLL', `Payroll updated for ${data.length} records`);

    // ── GL: post wages journal for newly-paid payroll records ────────
    // Debit  : 51311 Wages — Cutting Dept  (production workers)
    //          51312 Wages — Processing Dept (polish/grind/notch workers)
    //          52111 Salaries — Admin & Management (admin/non-production)
    // Credit : 21311 Salary Payable
    //
    // Triggered only for records where isSalaryPaid is being set true.
    // Production workers identified by department/designation keyword.
    //
    // IAS 19: employee benefit costs recognised in the period incurred.
    const PROD_KEYWORDS = ['production', 'cutting', 'polish', 'grind', 'operator', 'helper', 'factory', 'floor', 'processing'];
    const isProductionWorker = (emp: any): boolean => {
      const dept  = (emp?.work?.department  || '').toLowerCase();
      const desig = (emp?.work?.designation || '').toLowerCase();
      return PROD_KEYWORDS.some(k => dept.includes(k) || desig.includes(k));
    };
    const isCutter = (emp: any): boolean => {
      const desig = (emp?.work?.designation || '').toLowerCase();
      return desig.includes('cutter') || desig.includes('cutting');
    };

    // Group newly-paid records by company+month
    const byCompanyMonth: Record<string, { company: string; month: string; records: (Payroll & { company?: string })[] }> = {};
    data.filter(p => p.isSalaryPaid).forEach((p: any) => {
      const key = `${p.company || 'Glassco'}_${p.month}`;
      if (!byCompanyMonth[key]) byCompanyMonth[key] = { company: p.company || 'Glassco', month: p.month, records: [] };
      byCompanyMonth[key].records.push(p);
    });

    Object.values(byCompanyMonth).forEach(({ company: _co, month, records }) => {
      const company = _co as Company;
      const employees = HRService.getEmployees().filter((e: any) => e.company === company);
      const empMap = new Map(employees.map((e: any) => [e.id, e]));

      let cuttingWages    = 0;
      let processingWages = 0;
      let adminSalaries   = 0;

      records.forEach((rec: any) => {
        const emp  = empMap.get(rec.employeeId);
        const net  = rec.netSalary || 0;
        if (!emp) { adminSalaries += net; return; }
        if (isCutter(emp))            cuttingWages    += net;
        else if (isProductionWorker(emp)) processingWages += net;
        else                              adminSalaries   += net;
      });

      const txId = `GL-PAY-${company}-${month}`;
      // Guard: don't double-post
      if (FinanceService.getLedger().some((t: any) => t.id === txId)) return;

      const today = new Date().toISOString().split('T')[0];
      const glDetails: any[] = [];

      // ── Option B: Production wages → 11514 WIP — Direct Labour ────────
      //
      // IAS 2.10-12: Direct labour is a conversion cost of inventory.
      // It must NOT be expensed at payroll time — it should flow through WIP
      // and reach P&L only when the finished goods are delivered (COGS).
      //
      // Flow:
      //   Payroll:  Dr 11514 WIP — Direct Labour  / Cr 21311 Salary Payable
      //   Delivery: Dr 51311/51312 COGS Labour    / Cr 11514 WIP — Direct Labour
      //
      // Admin salaries remain a PERIOD cost (IAS 2.16) → Dr 52111 / Cr Payable.
      const addProductionWipLine = (amount: number) => {
        if (amount <= 0) return;
        // Balance-sheet path: ASSETS > CURRENT ASSETS > INVENTORY > WIP-Direct-Labour
        const assets    = FinanceService.ensureAccount(company, 'ASSETS',              1, null,       'Asset', '10');
        const current   = FinanceService.ensureAccount(company, 'CURRENT ASSETS',      2, assets.id,  'Asset', '11');
        const inv       = FinanceService.ensureAccount(company, 'INVENTORY',           3, current.id, 'Asset', '115');
        // Audit #7 fix: code was '11514', colliding with 'Laminated Glass
        // Stock' (ensureAccount dedupes by code, so both concepts shared one
        // balance). Own code now — see coa.glassco.ts 1152 WIP bucket.
        const wipLabour = FinanceService.ensureAccount(company, 'WIP — Direct Labour', 4, inv.id,     'Asset', '11523');
        glDetails.push({
          accountId: wipLabour.id, debit: amount, credit: 0,
          text: `Production wages → WIP Labour ${month}: Cutting PKR ${cuttingWages.toLocaleString()} + Processing PKR ${processingWages.toLocaleString()}`,
        });
      };

      const addAdminLine = (amount: number) => {
        if (amount <= 0) return;
        // Period cost: Admin salaries go directly to P&L (IAS 2.16 — not COGS)
        const revParent  = FinanceService.ensureAccount(company, 'EXPENSES',           1, null,          'Expense', '50');
        const opex       = FinanceService.ensureAccount(company, 'OPERATING EXPENSES', 2, revParent.id,  'Expense', '52');
        const staffCosts = FinanceService.ensureAccount(company, 'STAFF COSTS',        3, opex.id,       'Expense', '521');
        const salaries   = FinanceService.ensureAccount(company, 'SALARIES',           4, staffCosts.id, 'Expense', '5211');
        const adminAcc   = FinanceService.ensureAccount(company, 'Salaries — Admin & Management', 5, salaries.id, 'Expense', '52111');
        glDetails.push({
          accountId: adminAcc.id, debit: amount, credit: 0,
          text: `Admin salaries ${month}: PKR ${amount.toLocaleString()}`,
        });
      };

      // All production workers (cutters + processing) → single WIP-Labour debit
      addProductionWipLine(cuttingWages + processingWages);
      addAdminLine(adminSalaries);

      if (glDetails.length === 0) return;

      // Credit: Salary Payable
      const liab      = FinanceService.ensureAccount(company, 'LIABILITIES', 1, null, 'Liability', '20');
      const currLiab  = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES', 2, liab.id, 'Liability', '22');
      const empLiab   = FinanceService.ensureAccount(company, 'EMPLOYEE LIABILITIES', 3, currLiab.id, 'Liability', '213');
      const payroll2  = FinanceService.ensureAccount(company, 'PAYROLL', 4, empLiab.id, 'Liability', '2131');
      const salPayable = FinanceService.ensureAccount(company, 'Salary Payable', 5, payroll2.id, 'Liability', '21311');
      const totalWages = cuttingWages + processingWages + adminSalaries;
      glDetails.push({ accountId: salPayable.id, debit: 0, credit: totalWages, text: `Salary payable ${month}: PKR ${totalWages.toLocaleString()}` });

      try {
        FinanceService.recordTransaction({
          id: txId, company, docType: 'JV',
          docDate: today, date: today,
          description: `Payroll Journal — ${company} — ${month} | Cutting PKR ${cuttingWages.toLocaleString()} | Processing PKR ${processingWages.toLocaleString()} | Admin PKR ${adminSalaries.toLocaleString()}`,
          referenceId: month, status: 'Posted',
          details: glDetails,
        } as any);
      } catch (e: any) {
        console.warn('[HRService] Payroll GL posting failed:', e?.message);
      }
    });
  },
};
