/**
 * LeaveManagement.tsx — Phase 9
 *
 * Formal leave apply/approve workflow:
 * - Employee applies for leave (type, dates, reason)
 * - Manager approves/rejects
 * - Approved leave auto-marks attendance as 'Leave'
 * - Leave balance tracked per employee (annual: 16 days, casual: 10 days, sick: 8 days)
 * - Supabase-synced via leave_applications table
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Company } from '@/modules/shared/types/core';
import { Employee } from '@/modules/hr/types/hr';
import { HRService } from '@/modules/hr/services/hrService';
import { useAuthStore } from '@/modules/auth/authStore';
import { supabase } from '@/src/services/supabaseClient';
import { Logger } from '@/modules/shared/services/logger';
import {
  CalendarDays, Plus, X, CheckCircle2, XCircle,
  Clock, User, ChevronDown, Filter
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────

export type LeaveType = 'Annual' | 'Casual' | 'Sick' | 'Unpaid' | 'Maternity' | 'Paternity';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface LeaveApplication {
  id:           string;
  company:      Company;
  employeeId:   string;
  employeeName: string;
  type:         LeaveType;
  from:         string;  // YYYY-MM-DD
  to:           string;
  days:         number;
  reason:       string;
  status:       LeaveStatus;
  appliedAt:    string;
  reviewedBy?:  string;
  reviewedAt?:  string;
  reviewNote?:  string;
}

// ── Annual entitlements ───────────────────────────────────────────────
const ENTITLEMENTS: Record<LeaveType, number> = {
  Annual:    16,
  Casual:    10,
  Sick:       8,
  Unpaid:   999,
  Maternity: 90,
  Paternity:  3,
};

// ── Storage key ───────────────────────────────────────────────────────
const KEY = (company: Company) => `gtk_erp_leave_applications_${company}`;

const _load = (company: Company): LeaveApplication[] => {
  try { return JSON.parse(localStorage.getItem(KEY(company)) || '[]'); } catch { return []; }
};

const _save = async (company: Company, data: LeaveApplication[]): Promise<void> => {
  localStorage.setItem(KEY(company), JSON.stringify(data));
  try {
    const rows = data.map(a => ({
      id: a.id, company: a.company, employee_id: a.employeeId,
      employee_name: a.employeeName, type: a.type,
      from_date: a.from, to_date: a.to, days: a.days,
      reason: a.reason, status: a.status,
      applied_at: a.appliedAt, reviewed_by: a.reviewedBy ?? null,
      reviewed_at: a.reviewedAt ?? null, review_note: a.reviewNote ?? null,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from('leave_applications').upsert(rows);
  } catch (e) { Logger.warn('HR', 'Leave sync failed', e); }
};

// ── Helpers ───────────────────────────────────────────────────────────
const daysBetween = (from: string, to: string): number => {
  const d1 = new Date(from), d2 = new Date(to);
  let count = 0;
  const cur = new Date(d1);
  while (cur <= d2) {
    const dow = cur.getDay();
    if (dow !== 0) count++; // exclude Sundays
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count);
};

const STATUS_STYLES: Record<LeaveStatus, string> = {
  Pending:   'bg-amber-100 text-amber-700',
  Approved:  'bg-emerald-100 text-emerald-700',
  Rejected:  'bg-rose-100 text-rose-700',
  Cancelled: 'bg-slate-100 text-slate-500',
};

const TYPE_COLOR: Record<LeaveType, string> = {
  Annual:    'bg-blue-100 text-blue-700',
  Casual:    'bg-purple-100 text-purple-700',
  Sick:      'bg-orange-100 text-orange-700',
  Unpaid:    'bg-slate-100 text-slate-600',
  Maternity: 'bg-pink-100 text-pink-700',
  Paternity: 'bg-teal-100 text-teal-700',
};

// ── Leave Balance Calculator ──────────────────────────────────────────
const useLeaveBalance = (applications: LeaveApplication[], employeeId: string) => {
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const approved = applications.filter(a =>
    a.employeeId === employeeId &&
    a.status === 'Approved' &&
    a.from >= yearStart
  );
  const used: Record<LeaveType, number> = { Annual: 0, Casual: 0, Sick: 0, Unpaid: 0, Maternity: 0, Paternity: 0 };
  for (const a of approved) used[a.type] = (used[a.type] || 0) + a.days;
  return Object.fromEntries(
    (Object.keys(ENTITLEMENTS) as LeaveType[]).map(t => [t, Math.max(0, ENTITLEMENTS[t] - used[t])])
  ) as Record<LeaveType, number>;
};

// ── Main Component ────────────────────────────────────────────────────
const LeaveManagement: React.FC<{ company: Company }> = ({ company }) => {
  const { user } = useAuthStore();
  const isManager = !['glassco_cutter', 'dispatch_staff', 'glassco_production'].includes(user?.role || '');
  const reviewerName = user?.fullName || user?.email || 'Manager';

  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [employees, setEmployees]       = useState<Employee[]>([]);
  const [showForm, setShowForm]         = useState(false);
  const [filterStatus, setFilterStatus] = useState<LeaveStatus | 'All'>('All');
  const [selectedEmp, setSelectedEmp]   = useState<string | null>(null);
  const [reviewModal, setReviewModal]   = useState<LeaveApplication | null>(null);
  const [reviewNote, setReviewNote]     = useState('');

  const [form, setForm] = useState({
    employeeId: '',
    type: 'Annual' as LeaveType,
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
    reason: '',
  });

  const load = () => {
    setApplications(_load(company));
    setEmployees(HRService.getEmployees().filter(e => e.company === company));
  };
  useEffect(() => { load(); }, [company]);

  const days = daysBetween(form.from, form.to);

  const handleApply = async () => {
    if (!form.employeeId) { toast.error('Employee select karo'); return; }
    if (!form.reason) { toast.error('Reason likho'); return; }
    if (new Date(form.to) < new Date(form.from)) { toast.error('To date From se pehle nahi ho sakta'); return; }

    const emp = employees.find(e => e.id === form.employeeId);
    const app: LeaveApplication = {
      id: `LA-${Date.now()}`,
      company,
      employeeId: form.employeeId,
      employeeName: emp?.personal?.name || 'Unknown',
      type: form.type,
      from: form.from,
      to: form.to,
      days,
      reason: form.reason,
      status: 'Pending',
      appliedAt: new Date().toISOString(),
    };

    const all = [...applications, app];
    await _save(company, all);
    setApplications(all);
    setShowForm(false);
    setForm(f => ({ ...f, reason: '', employeeId: '' }));
    toast.success(`Leave application ${app.id} submitted.`);
  };

  const handleReview = async (status: 'Approved' | 'Rejected') => {
    if (!reviewModal) return;
    const all = applications.map(a =>
      a.id === reviewModal.id
        ? { ...a, status, reviewedBy: reviewerName, reviewedAt: new Date().toISOString(), reviewNote }
        : a
    );
    await _save(company, all);
    setApplications(all);

    // On approval — mark attendance as Leave for each day
    if (status === 'Approved') {
      const attendance = HRService.getAttendance();
      const cur = new Date(reviewModal.from);
      const end = new Date(reviewModal.to);
      const newEntries: any[] = [];
      while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0) { // skip Sundays
          const dateStr = cur.toISOString().split('T')[0];
          const existing = attendance.find(a => a.employeeId === reviewModal.employeeId && a.date === dateStr);
          if (!existing) {
            newEntries.push({
              id: `ATT-LEAVE-${reviewModal.employeeId}-${dateStr}`,
              employeeId: reviewModal.employeeId,
              date: dateStr,
              status: 'Leave',
              lateMinutes: 0,
              earlyMinutes: 0,
              overtimeHours: 0,
            });
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (newEntries.length > 0) {
        HRService.saveAttendance([...attendance, ...newEntries]);
      }
      toast.success(`Leave approved — ${newEntries.length} attendance days marked as Leave.`);
    } else {
      toast.success(`Leave rejected.`);
    }

    setReviewModal(null);
    setReviewNote('');
  };

  const filtered = useMemo(() => {
    let list = applications;
    if (filterStatus !== 'All') list = list.filter(a => a.status === filterStatus);
    if (selectedEmp) list = list.filter(a => a.employeeId === selectedEmp);
    return list.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  }, [applications, filterStatus, selectedEmp]);

  const pending = applications.filter(a => a.status === 'Pending').length;

  // Selected employee balance
  const empBalance = selectedEmp
    ? useLeaveBalance(applications, selectedEmp)
    : null;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10"><CalendarDays size={120}/></div>
        <div className="flex justify-between items-start relative z-10">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">Leave Management</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{company} — Apply, Approve, Balance Track</p>
          </div>
          <div className="flex gap-8 text-right">
            <div><p className="text-[9px] font-bold text-amber-400 uppercase">Pending</p><p className="text-3xl font-black text-amber-400">{pending}</p></div>
            <div><p className="text-[9px] font-bold text-slate-400 uppercase">Total Apps</p><p className="text-3xl font-black">{applications.length}</p></div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="sap-input font-bold text-xs">
          <option value="All">All Status</option>
          {(['Pending','Approved','Rejected','Cancelled'] as LeaveStatus[]).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={selectedEmp || ''} onChange={e => setSelectedEmp(e.target.value || null)} className="sap-input font-bold text-xs">
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.personal?.name}</option>)}
        </select>
        <div className="ml-auto">
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-black uppercase text-xs hover:bg-blue-700 shadow-lg">
            <Plus size={14}/> Apply Leave
          </button>
        </div>
      </div>

      {/* Employee balance strip */}
      {selectedEmp && empBalance && (
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <p className="text-[10px] font-black uppercase text-slate-400 mb-3">
            Leave Balance — {employees.find(e => e.id === selectedEmp)?.personal?.name} ({new Date().getFullYear()})
          </p>
          <div className="flex gap-4 flex-wrap">
            {(Object.entries(empBalance) as [LeaveType, number][]).map(([type, remaining]) => (
              <div key={type} className={`px-4 py-2 rounded-xl text-center min-w-[90px] ${TYPE_COLOR[type]}`}>
                <p className="text-lg font-black">{remaining}</p>
                <p className="text-[9px] font-black uppercase">{type}</p>
                <p className="text-[8px] opacity-60">of {ENTITLEMENTS[type]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Applications Table */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
            <tr>
              <th className="px-5 py-3 text-left">Application ID</th>
              <th className="px-5 py-3 text-left">Employee</th>
              <th className="px-5 py-3 text-left">Type</th>
              <th className="px-5 py-3 text-left">From</th>
              <th className="px-5 py-3 text-left">To</th>
              <th className="px-5 py-3 text-center">Days</th>
              <th className="px-5 py-3 text-left">Reason</th>
              <th className="px-5 py-3 text-center">Status</th>
              {isManager && <th className="px-5 py-3 text-center">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-12 text-center text-slate-300 font-bold uppercase text-xs italic">No leave applications found.</td></tr>
            )}
            {filtered.map(a => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-black text-blue-600">{a.id}</td>
                <td className="px-5 py-3 font-bold text-slate-800">{a.employeeName}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${TYPE_COLOR[a.type]}`}>{a.type}</span>
                </td>
                <td className="px-5 py-3 text-slate-600">{a.from}</td>
                <td className="px-5 py-3 text-slate-600">{a.to}</td>
                <td className="px-5 py-3 text-center font-black text-slate-900">{a.days}</td>
                <td className="px-5 py-3 text-slate-500 max-w-[160px] truncate">{a.reason}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${STATUS_STYLES[a.status]}`}>{a.status}</span>
                </td>
                {isManager && (
                  <td className="px-5 py-3 text-center">
                    {a.status === 'Pending' && (
                      <button onClick={() => { setReviewModal(a); setReviewNote(''); }}
                        className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase hover:bg-slate-700">
                        Review
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Apply Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[400]">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-blue-700 text-white flex justify-between items-center">
              <h3 className="text-lg font-black uppercase">Apply for Leave</h3>
              <button onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <div className="p-8 space-y-4 bg-slate-50">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Employee</label>
                <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} className="sap-input w-full font-bold">
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.personal?.name} — {e.work?.designation}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Leave Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as LeaveType }))} className="sap-input w-full font-bold">
                    {(Object.keys(ENTITLEMENTS) as LeaveType[]).map(t => (
                      <option key={t} value={t}>{t} ({ENTITLEMENTS[t]} days/year)</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <div className={`w-full text-center px-4 py-3 rounded-xl font-black text-lg ${TYPE_COLOR[form.type]}`}>
                    {days} day{days !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">From Date</label>
                  <input type="date" value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} className="sap-input w-full font-bold"/>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">To Date</label>
                  <input type="date" value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} className="sap-input w-full font-bold"/>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Reason</label>
                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3}
                  className="sap-input w-full font-bold resize-none" placeholder="Wajah likho..."/>
              </div>
            </div>
            <div className="px-8 py-5 bg-white border-t flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-6 py-2.5 text-slate-400 font-black uppercase text-xs">Cancel</button>
              <button onClick={handleApply} className="bg-blue-700 text-white px-8 py-2.5 rounded-xl font-black uppercase text-xs hover:bg-blue-800 shadow-lg">Submit Application</button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[400]">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black uppercase">Review Leave</h3>
                <p className="text-[10px] text-slate-400 uppercase">{reviewModal.employeeName} — {reviewModal.type} — {reviewModal.days} days</p>
              </div>
              <button onClick={() => setReviewModal(null)}><X size={20}/></button>
            </div>
            <div className="p-8 bg-slate-50 space-y-4">
              <div className="bg-white p-4 rounded-xl border text-sm">
                <p className="font-black text-slate-700">{reviewModal.from} → {reviewModal.to}</p>
                <p className="text-slate-500 mt-1">{reviewModal.reason}</p>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Review Note (optional)</label>
                <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={2}
                  className="sap-input w-full font-bold resize-none" placeholder="Note add karo..."/>
              </div>
            </div>
            <div className="px-8 py-5 bg-white border-t flex gap-3 justify-end">
              <button onClick={() => setReviewModal(null)} className="px-5 py-2.5 text-slate-400 font-black uppercase text-xs">Cancel</button>
              <button onClick={() => handleReview('Rejected')}
                className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 text-white rounded-xl font-black uppercase text-xs hover:bg-rose-700">
                <XCircle size={14}/> Reject
              </button>
              <button onClick={() => handleReview('Approved')}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs hover:bg-emerald-700">
                <CheckCircle2 size={14}/> Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveManagement;
