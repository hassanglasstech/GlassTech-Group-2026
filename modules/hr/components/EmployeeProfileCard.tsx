/**
 * Employee Profile Card — Full Page View
 * 
 * Shows complete employee profile at a glance:
 *   - Personal info + photo + status badge
 *   - Tenure & joining info
 *   - Attendance summary (current month)
 *   - Financial snapshot (salary + active loans/advances)
 *   - Document completeness
 *   - Tags & department
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Employee, AttendanceRecord, LoanAdvance, Payroll, EmployeeStatus } from '@/modules/shared/types';
import { HRService } from '@/modules/hr/services/hrService';
import { TagService } from '@/modules/hr/services/tagService';
import { EmployeeDocService } from '@/modules/hr/services/employeeDocService';
import { EmployeeTagPills } from '@/modules/hr/components/TagPills';
import {
  X, User, Calendar, Clock, Briefcase, Wallet, FileCheck,
  TrendingUp, AlertTriangle, CheckCircle2, XCircle, ArrowLeft,
  Building2, CreditCard, Landmark, CalendarDays, Timer, Shield
} from 'lucide-react';

// ── Status Config ───────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  probation:  { label: 'Probation',  color: 'text-amber-700',   bg: 'bg-amber-100 border-amber-200' },
  confirmed:  { label: 'Confirmed',  color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-200' },
  resigned:   { label: 'Resigned',   color: 'text-red-700',     bg: 'bg-red-100 border-red-200' },
  terminated: { label: 'Terminated', color: 'text-red-700',     bg: 'bg-red-100 border-red-200' },
  suspended:  { label: 'Suspended',  color: 'text-orange-700',  bg: 'bg-orange-100 border-orange-200' },
};

// ── Helpers ─────────────────────────────────────────────────────────
const calcTenure = (joinDate: string): { years: number; months: number; days: number; totalDays: number } => {
  if (!joinDate) return { years: 0, months: 0, days: 0, totalDays: 0 };
  const join = new Date(joinDate);
  const now = new Date();
  const totalDays = Math.floor((now.getTime() - join.getTime()) / (1000 * 60 * 60 * 24));
  const years = Math.floor(totalDays / 365);
  const months = Math.floor((totalDays % 365) / 30);
  const days = totalDays % 30;
  return { years, months, days, totalDays };
};

const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatPKR = (n: number) => `PKR ${n.toLocaleString()}`;

// ── Stat Card Component ─────────────────────────────────────────────
const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}> = ({ icon, label, value, sub, color = 'text-slate-800' }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
    </div>
    <p className={`text-xl font-black ${color}`}>{value}</p>
    {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
  </div>
);

// ═════════════════════════════════════════════════════════════════════
interface Props {
  employee: Employee;
  onClose: () => void;
}

const EmployeeProfileCard: React.FC<Props> = ({ employee, onClose }) => {
  const emp = employee;
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loans, setLoans] = useState<LoanAdvance[]>([]);
  const [payroll, setPayroll] = useState<Payroll[]>([]);
  const [docCompleteness, setDocCompleteness] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      // Ensure cache is loaded from Supabase
      if (!HRService.isCacheLoaded()) await HRService.loadCache();
      
      const allAttendance = HRService.getAttendance().filter(a => a.employeeId === emp.id);
      setAttendance(allAttendance);
      setLoans(HRService.getLoans().filter(l => l.employeeId === emp.id));
      setPayroll(HRService.getPayroll().filter(p => p.employeeId === emp.id));
      setDocCompleteness(EmployeeDocService.getCompleteness(emp.id));

      // Load photo async
      EmployeeDocService.getPhotoUrlAsync(emp.id).then(url => {
        if (url) setPhotoUrl(url);
      });
    };
    loadData();
  }, [emp.id]);

  // ── Computed Values ────────────────────────────────────────────────
  const tenure = useMemo(() => calcTenure(emp.work.joinDate), [emp.work.joinDate]);
  const grossSalary = emp.salary.basic + emp.salary.houseRent + emp.salary.conveyance + emp.salary.specialAllowance;
  const status = emp.work.status || 'confirmed';
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.confirmed;

  // Attendance this month
  const currentMonth = getCurrentMonth();
  const monthAttendance = useMemo(() => {
    const records = attendance.filter(a => a.date?.startsWith(currentMonth));
    const present = records.filter(a => a.status === 'Present' || a.status === 'Late').length;
    const absent = records.filter(a => a.status === 'Absent').length;
    const late = records.filter(a => a.status === 'Late').length;
    const leave = records.filter(a => a.status === 'Leave').length;
    const totalWorking = present + absent + late + leave;
    const rate = totalWorking > 0 ? Math.round((present / totalWorking) * 100) : 0;
    const totalOT = records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
    return { present, absent, late, leave, rate, totalOT, totalWorking };
  }, [attendance, currentMonth]);

  // Loans & advances
  const activeLoanData = useMemo(() => {
    const active = loans.filter(l => l.status === 'Active');
    const totalBorrowed = active.reduce((sum, l) => sum + l.amount, 0);
    const totalRepaid = active.reduce((sum, l) => sum + (l.amount - l.repaymentAmount), 0);
    const monthlyDeduction = active.reduce((sum, l) => sum + l.repaymentAmount, 0);
    const loanCount = active.filter(l => l.type === 'Loan').length;
    const advanceCount = active.filter(l => l.type === 'Advance').length;
    return { active, totalBorrowed, totalRepaid, monthlyDeduction, loanCount, advanceCount };
  }, [loans]);

  // Last payroll
  const lastPayroll = useMemo(() => {
    const sorted = [...payroll].sort((a, b) => b.month.localeCompare(a.month));
    return sorted[0] || null;
  }, [payroll]);

  // Department
  const dept = useMemo(() => {
    return TagService.getDeptById(emp.work.departmentId || '');
  }, [emp.work.departmentId]);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[500] flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-4xl my-6 mx-4">

        {/* Back button */}
        <button onClick={onClose}
          className="flex items-center gap-2 text-white/80 hover:text-white mb-4 text-sm font-medium transition-colors">
          <ArrowLeft size={16} /> Back to Registry
        </button>

        {/* ── Header Card ──────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 mb-4 shadow-xl">
          <div className="flex items-start gap-5">
            {/* Photo */}
            {photoUrl ? (
              <img src={photoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover border-2 border-white/20 shadow-lg" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-blue-500/20 border-2 border-blue-400/30 flex items-center justify-center shadow-lg">
                <span className="text-2xl font-black text-blue-300">{emp.personal.name.charAt(0)}</span>
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-black text-white">{emp.personal.name}</h1>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusConfig.bg} ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <span className="text-xs text-slate-400 font-mono font-bold">{emp.work.employeeCode}</span>
                {dept && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Building2 size={12} /> {dept.name}
                  </span>
                )}
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar size={12} /> Joined {emp.work.joinDate || 'N/A'}
                </span>
              </div>
              <div className="mt-3">
                <EmployeeTagPills employeeId={emp.id} size="sm" maxDisplay={6} />
              </div>
            </div>

            {/* Tenure badge */}
            <div className="text-right shrink-0 hidden md:block">
              <div className="bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Tenure</p>
                <p className="text-lg font-black text-white">
                  {tenure.years > 0 ? `${tenure.years}y ` : ''}{tenure.months}m
                </p>
                <p className="text-[10px] text-slate-500">{tenure.totalDays} days</p>
              </div>
            </div>
          </div>

          {/* Contact row */}
          <div className="flex gap-6 mt-4 pt-4 border-t border-white/10 flex-wrap">
            {emp.personal.phone && (
              <span className="text-xs text-slate-400">📱 {emp.personal.phone}</span>
            )}
            {emp.personal.cnic && (
              <span className="text-xs text-slate-400">🪪 {emp.personal.cnic}</span>
            )}
            {emp.personal.address && (
              <span className="text-xs text-slate-400 truncate max-w-xs">📍 {emp.personal.address}</span>
            )}
          </div>
        </div>

        {/* ── Stats Grid ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard
            icon={<Wallet size={16} className="text-blue-500" />}
            label="Gross Salary"
            value={formatPKR(grossSalary)}
            sub={`Base: ${formatPKR(emp.salary.basic)}`}
            color="text-blue-700"
          />
          <StatCard
            icon={<CheckCircle2 size={16} className="text-emerald-500" />}
            label="Attendance Rate"
            value={monthAttendance.rate > 0 ? `${monthAttendance.rate}%` : '—'}
            sub={`${monthAttendance.present}P · ${monthAttendance.absent}A · ${monthAttendance.late}L`}
            color={monthAttendance.rate >= 90 ? 'text-emerald-700' : monthAttendance.rate >= 75 ? 'text-amber-700' : 'text-red-700'}
          />
          <StatCard
            icon={<Landmark size={16} className="text-violet-500" />}
            label="Active Loans"
            value={activeLoanData.active.length > 0 ? formatPKR(activeLoanData.totalBorrowed) : 'None'}
            sub={activeLoanData.active.length > 0 ? `${activeLoanData.loanCount} loan, ${activeLoanData.advanceCount} advance` : 'No outstanding balance'}
            color={activeLoanData.active.length > 0 ? 'text-violet-700' : 'text-emerald-700'}
          />
          <StatCard
            icon={<FileCheck size={16} className="text-sky-500" />}
            label="Documents"
            value={`${docCompleteness}%`}
            sub={docCompleteness === 100 ? 'All documents uploaded' : 'Missing documents'}
            color={docCompleteness === 100 ? 'text-emerald-700' : docCompleteness >= 60 ? 'text-amber-700' : 'text-red-700'}
          />
        </div>

        {/* ── Detail Sections ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

          {/* Attendance Detail */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-800">Attendance — {new Date().toLocaleString('en-PK', { month: 'long', year: 'numeric' })}</h3>
            </div>

            {monthAttendance.totalWorking === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No attendance recorded this month</p>
            ) : (
              <>
                {/* Attendance bar */}
                <div className="flex rounded-full overflow-hidden h-3 mb-4">
                  {monthAttendance.present > 0 && (
                    <div className="bg-emerald-500" style={{ width: `${(monthAttendance.present / monthAttendance.totalWorking) * 100}%` }} title={`Present: ${monthAttendance.present}`} />
                  )}
                  {monthAttendance.late > 0 && (
                    <div className="bg-amber-400" style={{ width: `${(monthAttendance.late / monthAttendance.totalWorking) * 100}%` }} title={`Late: ${monthAttendance.late}`} />
                  )}
                  {monthAttendance.absent > 0 && (
                    <div className="bg-red-400" style={{ width: `${(monthAttendance.absent / monthAttendance.totalWorking) * 100}%` }} title={`Absent: ${monthAttendance.absent}`} />
                  )}
                  {monthAttendance.leave > 0 && (
                    <div className="bg-blue-400" style={{ width: `${(monthAttendance.leave / monthAttendance.totalWorking) * 100}%` }} title={`Leave: ${monthAttendance.leave}`} />
                  )}
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-emerald-50 rounded-lg py-2">
                    <p className="text-lg font-black text-emerald-700">{monthAttendance.present}</p>
                    <p className="text-[9px] font-bold text-emerald-600 uppercase">Present</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg py-2">
                    <p className="text-lg font-black text-amber-700">{monthAttendance.late}</p>
                    <p className="text-[9px] font-bold text-amber-600 uppercase">Late</p>
                  </div>
                  <div className="bg-red-50 rounded-lg py-2">
                    <p className="text-lg font-black text-red-700">{monthAttendance.absent}</p>
                    <p className="text-[9px] font-bold text-red-600 uppercase">Absent</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg py-2">
                    <p className="text-lg font-black text-blue-700">{monthAttendance.leave}</p>
                    <p className="text-[9px] font-bold text-blue-600 uppercase">Leave</p>
                  </div>
                </div>

                {monthAttendance.totalOT > 0 && (
                  <div className="mt-3 flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                    <Timer size={14} className="text-slate-500" />
                    <span className="text-xs font-bold text-slate-600">Overtime: {monthAttendance.totalOT} hrs this month</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Financial Detail */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={18} className="text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800">Financial Summary</h3>
            </div>

            {/* Salary breakdown */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Basic Salary</span>
                <span className="font-bold text-slate-700">{formatPKR(emp.salary.basic)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">House Rent</span>
                <span className="font-bold text-slate-700">{formatPKR(emp.salary.houseRent)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Conveyance</span>
                <span className="font-bold text-slate-700">{formatPKR(emp.salary.conveyance)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Special Allowance</span>
                <span className="font-bold text-slate-700">{formatPKR(emp.salary.specialAllowance)}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                <span className="font-bold text-slate-800">Gross Monthly</span>
                <span className="font-black text-blue-700">{formatPKR(grossSalary)}</span>
              </div>
            </div>

            {/* Active loans */}
            {activeLoanData.active.length > 0 ? (
              <div className="bg-violet-50 rounded-xl p-3 border border-violet-100">
                <p className="text-[10px] font-bold text-violet-700 uppercase mb-2">Active Loans / Advances</p>
                <div className="space-y-2">
                  {activeLoanData.active.map(loan => (
                    <div key={loan.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${loan.type === 'Loan' ? 'bg-violet-200 text-violet-800' : 'bg-sky-200 text-sky-800'}`}>
                          {loan.type}
                        </span>
                        <span className="text-slate-600">{loan.date}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-700">{formatPKR(loan.amount)}</span>
                        <span className="text-slate-400 ml-1">@ {formatPKR(loan.repaymentAmount)}/mo</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 pt-2 border-t border-violet-200 text-xs">
                  <span className="font-bold text-violet-800">Monthly Deduction</span>
                  <span className="font-black text-violet-700">{formatPKR(activeLoanData.monthlyDeduction)}</span>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
                <CheckCircle2 size={16} className="text-emerald-500 mx-auto mb-1" />
                <p className="text-xs font-bold text-emerald-700">No outstanding loans or advances</p>
              </div>
            )}

            {/* Last payroll */}
            {lastPayroll && (
              <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Last Payroll — {lastPayroll.month}</p>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Net Salary Paid</span>
                  <span className="font-black text-emerald-700">{formatPKR(lastPayroll.netSalary)}</span>
                </div>
                {lastPayroll.loanDeduction > 0 && (
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-slate-500">Loan Deduction</span>
                    <span className="font-bold text-red-600">-{formatPKR(lastPayroll.loanDeduction)}</span>
                  </div>
                )}
                {lastPayroll.absentDeduction > 0 && (
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-slate-500">Absent Deduction</span>
                    <span className="font-bold text-red-600">-{formatPKR(lastPayroll.absentDeduction)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Document Completeness Bar ─────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileCheck size={18} className="text-sky-600" />
              <h3 className="text-sm font-bold text-slate-800">Document Status</h3>
            </div>
            <span className={`text-sm font-black ${docCompleteness === 100 ? 'text-emerald-600' : docCompleteness >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
              {docCompleteness}% Complete
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${docCompleteness === 100 ? 'bg-emerald-500' : docCompleteness >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${docCompleteness}%` }}
            />
          </div>
          {docCompleteness < 100 && (
            <p className="text-[10px] text-slate-400 mt-2">Open employee edit → Documents tab to upload missing files</p>
          )}
        </div>

      </div>
    </div>
  );
};

export default React.memo(EmployeeProfileCard);
