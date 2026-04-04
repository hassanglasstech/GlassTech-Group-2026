/**
 * IndividualAttendanceModal
 * 
 * Ek employee ka poora mahina — har din alag row
 * In/Out timing, Late mark, Absent mark, OT, Sunday sandwich rule — sab yahan
 * Monthly view mein "Edit" button se open hoga
 * Data payroll aur employee card mein use hoga
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Clock, Calendar, CheckCircle2, XCircle, AlertTriangle,
  Coffee, Moon, Zap, ChevronLeft, ChevronRight, Save, User,
  Sunrise, Sunset, Timer
} from 'lucide-react';
import { Employee, AttendanceRecord, AttendanceStatus } from '@/modules/shared/types';
import { HRService } from '@/modules/hr/services/hrService';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────
interface DayEntry {
  date: string;           // YYYY-MM-DD
  status: AttendanceStatus;
  inTime: string;         // HH:mm  e.g. "09:15"
  outTime: string;        // HH:mm  e.g. "18:30"
  lateMinutes: number;
  earlyMinutes: number;
  overtimeHours: number;
  isSunday: boolean;
  isSandwichAbsent: boolean;
  isNA: boolean; // before join date or after last working date // calculated
  notes: string;
}

interface Props {
  employee: Employee;
  month: string;          // YYYY-MM
  onClose: () => void;
  onSaved: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────
const getDaysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

// ── Shift config — date-aware ─────────────────────────────────────────
// March 2026 special: Ramzan + Eid timings per company
const getShift = (company?: string, dateStr?: string): { start: string; end: string; lateGrace: number } => {
  const DEFAULT = { start: '09:00', end: '18:00', lateGrace: 15 };

  if (!dateStr) return DEFAULT;
  const date = new Date(dateStr);
  const day   = date.getDate();
  const month = date.getMonth() + 1; // 1-based
  const year  = date.getFullYear();

  // March 2026 — Ramzan / Eid special timings
  if (year === 2026 && month === 3) {
    const co = (company || '').toLowerCase();
    const isGlassco = co.includes('glassco') || co.includes('glass fabrication');
    const isGTK     = co.includes('gtk') || co.includes('gti') || co.includes('aluminum fabrication') || co.includes('netting') || co.includes('factory') || co.includes('nippon');
    const isAdmin   = co.includes('admin') || co.includes('management');

    // Eid holidays 20-23 March
    if (day >= 20 && day <= 23) return { start: '00:00', end: '00:00', lateGrace: 0 };

    // 24 March onward — all companies 09:00-18:00
    if (day >= 24) return { start: '09:00', end: '18:00', lateGrace: 15 };

    // GlassCo Ramzan shift (1-19)
    if (isGlassco) {
      if (day >= 1  && day <= 7)  return { start: '08:00', end: '16:00', lateGrace: 15 };
      if (day >= 9  && day <= 19) return { start: '07:00', end: '14:00', lateGrace: 15 };
    }

    // GTK / Admin Ramzan shift (1-19)
    if (isGTK || isAdmin) {
      if (day >= 1  && day <= 19) return { start: '08:00', end: '16:00', lateGrace: 15 };
    }
  }

  return DEFAULT;
};

const calcLateMinutes = (inTime: string, company?: string, dateStr?: string): number => {
  if (!inTime) return 0;
  const [h, m] = inTime.split(':').map(Number);
  const actualMins = h * 60 + m;
  const shift = getShift(company, dateStr);
  const [sh, sm] = shift.start.split(':').map(Number);
  const shiftStartMins = sh * 60 + sm + shift.lateGrace;
  return Math.max(0, actualMins - shiftStartMins);
};

const calcOT = (outTime: string, company?: string, dateStr?: string): number => {
  if (!outTime) return 0;
  const [h, m] = outTime.split(':').map(Number);
  const actualMins = h * 60 + m;
  const shift = getShift(company, dateStr);
  const [eh, em] = shift.end.split(':').map(Number);
  const shiftEndMins = eh * 60 + em;
  const extraMins = Math.max(0, actualMins - shiftEndMins);
  return Math.round((extraMins / 60) * 10) / 10;
};

const statusConfig: Record<AttendanceStatus, { label: string; color: string; bg: string; icon: any }> = {
  Present: { label: 'P', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  Absent:  { label: 'A', color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200',       icon: XCircle },
  Late:    { label: 'L', color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     icon: AlertTriangle },
  Leave:   { label: 'V', color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       icon: Coffee },
};

// ── Main Component ────────────────────────────────────────────────────
const IndividualAttendanceModal: React.FC<Props> = ({ employee, month, onClose, onSaved }) => {
  const numDays = getDaysInMonth(month);
  const empName = employee?.personal?.name ?? '—';
  const empCode = employee?.work?.employeeCode ?? '—';

  // Build initial entries from existing attendance records
  const buildInitialEntries = (): DayEntry[] => {
    const existing = HRService.getAttendance().filter(
      r => r.employeeId === employee.id && r.date?.startsWith(month)
    );

    const joinDate  = employee?.work?.joinDate  ? new Date(employee.work.joinDate)  : null;
    const lastDate  = (employee?.work as any)?.lastDate ? new Date((employee.work as any).lastDate) : null;

    return Array.from({ length: numDays }, (_, i) => {
      const day = i + 1;
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(date);
      const isSunday = dateObj.getDay() === 0;
      const rec = existing.find(r => r.date === date);

      // Day is N/A if before join date or after last working date
      const beforeJoin = joinDate ? dateObj < new Date(joinDate.toISOString().split('T')[0]) : false;
      const afterLast  = lastDate ? dateObj > new Date(lastDate.toISOString().split('T')[0])  : false;
      const isNA = beforeJoin || afterLast;

      return {
        date,
        status: isNA ? 'Absent' : rec?.status ?? (isSunday ? 'Present' : 'Present'),
        inTime: isNA ? '' : (rec as any)?.inTime ?? (isSunday ? '' : getShift(employee?.company, date).start),
        outTime: isNA ? '' : (rec as any)?.outTime ?? (isSunday ? '' : getShift(employee?.company, date).end),
        lateMinutes: isNA ? 0 : rec?.lateMinutes ?? 0,
        earlyMinutes: isNA ? 0 : rec?.earlyMinutes ?? 0,
        overtimeHours: isNA ? 0 : rec?.overtimeHours ?? 0,
        isSunday,
        isSandwichAbsent: false,
        isNA,
        notes: isNA
          ? (beforeJoin ? 'Before joining' : 'After resignation')
          : (rec as any)?.notes ?? '',
      };
    });
  };

  const [entries, setEntries] = useState<DayEntry[]>(buildInitialEntries);
  const [activeDay, setActiveDay] = useState<number | null>(null);

  // ── Sandwich Sunday Rule ─────────────────────────────────────────
  const entriesWithSandwich = useMemo(() => {
    return entries.map((entry, idx) => {
      if (!entry.isSunday) return { ...entry, isSandwichAbsent: false };
      const prev = entries[idx - 1]; // Saturday
      const next = entries[idx + 1]; // Monday
      const sandwich = (prev?.status === 'Absent') || (next?.status === 'Absent');
      return { ...entry, isSandwichAbsent: sandwich };
    });
  }, [entries]);

  // ── Summary Calculations ─────────────────────────────────────────
  const summary = useMemo(() => {
    let present = 0, absent = 0, late = 0, leave = 0, ot = 0, sundays = 0, sandwichPenalty = 0;
    entriesWithSandwich.forEach(e => {
      if (e.isSunday) {
        sundays++;
        if (e.isSandwichAbsent) sandwichPenalty += 2; // 2 extra absent days
      } else {
        if (e.status === 'Present') present++;
        else if (e.status === 'Absent') absent++;
        else if (e.status === 'Late') { present++; late++; }
        else if (e.status === 'Leave') leave++;
        ot += Number(e.overtimeHours || 0);
      }
    });
    const latePenalty = Math.floor(late / 3);
    const totalAbsent = absent + latePenalty + sandwichPenalty;
    return { present, absent, late, leave, ot: ot.toFixed(1), sundays, sandwichPenalty, latePenalty, totalAbsent };
  }, [entriesWithSandwich]);

  // ── Update a single day ──────────────────────────────────────────
  const updateDay = (idx: number, patch: Partial<DayEntry>) => {
    setEntries(prev => prev.map((e, i) => {
      if (i !== idx) return e;
      const updated = { ...e, ...patch };

      // Auto-calc late minutes from in time if provided
      if (patch.inTime !== undefined) {
        const dateStr2 = entries[idx] ? `${month.slice(0,7)}-${String(idx+1).padStart(2,'0')}` : '';
        const lm = calcLateMinutes(patch.inTime, employee?.company, dateStr2);
        updated.lateMinutes = lm;
        if (lm > 0 && updated.status === 'Present') updated.status = 'Late';
        if (lm === 0 && updated.status === 'Late') updated.status = 'Present';
      }

      // Auto-calc OT from out time if provided
      if (patch.outTime !== undefined) {
        const dateStr3 = entries[idx] ? `${month.slice(0,7)}-${String(idx+1).padStart(2,'0')}` : '';
        updated.overtimeHours = calcOT(patch.outTime, employee?.company, dateStr3);
      }

      return updated;
    }));
  };

  const markAll = (status: AttendanceStatus) => {
    setEntries(prev => prev.map(e =>
      e.isSunday ? e : {
        ...e,
        status,
        lateMinutes: 0,
        overtimeHours: 0,
        inTime: status === 'Absent' || status === 'Leave' ? '' : '09:00',
        outTime: status === 'Absent' || status === 'Leave' ? '' : '18:00',
      }
    ));
    toast.success(`All weekdays marked as ${status}`);
  };

  // ── Save ─────────────────────────────────────────────────────────
  const handleSave = () => {
    const allStorage = HRService.getAttendance();
    // Remove this employee's records for this month
    const filtered = allStorage.filter(
      r => !(r.employeeId === employee.id && r.date?.startsWith(month))
    );

    const newRecords: AttendanceRecord[] = entriesWithSandwich.map(e => ({
      id: `ATT-${employee.id}-${e.date}`,
      employeeId: employee.id,
      date: e.date,
      status: e.status,
      lateMinutes: e.lateMinutes,
      earlyMinutes: e.earlyMinutes,
      overtimeHours: e.overtimeHours,
      // Extended fields stored alongside
      ...(e.inTime  ? { inTime: e.inTime }   : {}),
      ...(e.outTime ? { outTime: e.outTime }  : {}),
      ...(e.notes   ? { notes: e.notes }      : {}),
      company: employee.company,
    } as AttendanceRecord));

    HRService.saveAttendance([...filtered, ...newRecords]);
    toast.success(`${empName} ki attendance save ho gayi — ${month}`);
    onSaved();
    onClose();
  };

  // ── Day names ─────────────────────────────────────────────────────
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[600] animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-8 py-5 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-lg">
              {empName.charAt(0)}
            </div>
            <div>
              <p className="font-black text-base leading-none">{empName}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {empCode} · {month}
              </p>
            </div>
          </div>

          {/* Quick Mark Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-slate-500 uppercase mr-1">Mark All:</span>
            {(['Present', 'Absent', 'Leave'] as AttendanceStatus[]).map(s => (
              <button
                key={s}
                onClick={() => markAll(s)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                  s === 'Present' ? 'border-emerald-500 text-emerald-400 hover:bg-emerald-500 hover:text-white' :
                  s === 'Absent'  ? 'border-rose-500 text-rose-400 hover:bg-rose-500 hover:text-white' :
                  'border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
            <button onClick={onClose} className="ml-4 p-2 hover:bg-white/10 rounded-xl transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Summary Bar ── */}
        <div className="flex items-center gap-0 bg-slate-50 border-b divide-x divide-slate-200 shrink-0 overflow-x-auto">
          {[
            { label: 'Present', value: summary.present, color: 'text-emerald-600' },
            { label: 'Absent', value: summary.absent, color: 'text-rose-600' },
            { label: 'Late', value: summary.late, color: 'text-amber-600' },
            { label: 'Leave', value: summary.leave, color: 'text-blue-600' },
            { label: 'OT Hrs', value: summary.ot, color: 'text-indigo-600' },
            { label: 'Sandwich', value: summary.sandwichPenalty + ' days', color: 'text-orange-600' },
            { label: 'Net Deduct', value: summary.totalAbsent + ' days', color: 'text-rose-800' },
          ].map(s => (
            <div key={s.label} className="flex-1 text-center py-3 px-4 min-w-[90px]">
              <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Days Grid ── */}
        <div className="overflow-y-auto flex-1 scrollbar-thin">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-800 text-white text-[9px] font-black uppercase tracking-widest">
              <tr>
                <th className="px-4 py-3 w-28">Day</th>
                <th className="px-4 py-3 w-36">Status</th>
                <th className="px-4 py-3 w-28">
                  <div className="flex items-center gap-1"><Sunrise size={10}/> In Time</div>
                </th>
                <th className="px-4 py-3 w-28">
                  <div className="flex items-center gap-1"><Sunset size={10}/> Out Time</div>
                </th>
                <th className="px-4 py-3 w-24">
                  <div className="flex items-center gap-1"><AlertTriangle size={10}/> Late (m)</div>
                </th>
                <th className="px-4 py-3 w-24">
                  <div className="flex items-center gap-1"><Zap size={10}/> OT (h)</div>
                </th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entriesWithSandwich.map((entry, idx) => {
                const dayNum = idx + 1;
                const dayName = DAY_NAMES[new Date(entry.date).getDay()];
                const cfg = statusConfig[entry.status];
                const isActive = activeDay === idx;

                if (entry.isNA) {
                  return (
                    <tr key={entry.date} className="bg-slate-100/60 opacity-50">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-slate-200 text-slate-400 flex items-center justify-center text-xs font-black">{dayNum}</span>
                          <span className="text-[10px] font-black text-slate-400 uppercase">{dayName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2" colSpan={5}>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[9px] font-black text-slate-400 uppercase">
                          {entry.notes || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  );
                }

                if (entry.isSunday) {
                  return (
                    <tr key={entry.date} className="bg-slate-50/80">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-rose-100 text-rose-500 flex items-center justify-center text-xs font-black">{dayNum}</span>
                          <span className="text-[10px] font-black text-rose-400 uppercase">{dayName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5" colSpan={5}>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 border border-rose-100 text-[9px] font-black text-rose-500 uppercase">
                            <Coffee size={9}/> Sunday
                          </span>
                          {entry.isSandwichAbsent && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-50 border border-orange-200 text-[9px] font-black text-orange-600 uppercase">
                              🥪 Sandwich Penalty (+2 days)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5"></td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={entry.date}
                    className={`transition-colors cursor-pointer ${
                      isActive ? 'bg-blue-50/60' : 'hover:bg-slate-50/50'
                    }`}
                    onClick={() => setActiveDay(isActive ? null : idx)}
                  >
                    {/* Day */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                          entry.status === 'Absent' ? 'bg-rose-100 text-rose-700' :
                          entry.status === 'Late'   ? 'bg-amber-100 text-amber-700' :
                          entry.status === 'Leave'  ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{dayNum}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase">{dayName}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {(['Present', 'Absent', 'Late', 'Leave'] as AttendanceStatus[]).map(s => (
                          <button
                            key={s}
                            onClick={() => updateDay(idx, { status: s })}
                            className={`w-7 h-7 rounded-lg text-[9px] font-black transition-all border ${
                              entry.status === s
                                ? statusConfig[s].bg + ' ' + statusConfig[s].color + ' shadow-sm scale-110'
                                : 'border-slate-100 text-slate-300 hover:border-slate-300'
                            }`}
                          >
                            {statusConfig[s].label}
                          </button>
                        ))}
                      </div>
                    </td>

                    {/* In Time */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {entry.status === 'Absent' || entry.status === 'Leave' ? (
                        <span className="text-[9px] text-slate-300 font-bold">—</span>
                      ) : (
                        <input
                          type="time"
                          value={entry.inTime}
                          onChange={e => updateDay(idx, { inTime: e.target.value })}
                          className="w-24 text-[11px] font-bold border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white text-emerald-700"
                        />
                      )}
                    </td>

                    {/* Out Time */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {entry.status === 'Absent' || entry.status === 'Leave' ? (
                        <span className="text-[9px] text-slate-300 font-bold">—</span>
                      ) : (
                        <input
                          type="time"
                          value={entry.outTime}
                          onChange={e => updateDay(idx, { outTime: e.target.value })}
                          className="w-24 text-[11px] font-bold border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white text-rose-700"
                        />
                      )}
                    </td>

                    {/* Late minutes */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="number"
                        min={0}
                        value={entry.lateMinutes || ''}
                        placeholder="0"
                        onChange={e => {
                          const val = Number(e.target.value);
                          updateDay(idx, {
                            lateMinutes: val,
                            status: val > 0 ? 'Late' : (entry.status === 'Late' ? 'Present' : entry.status)
                          });
                        }}
                        className={`w-16 text-[11px] font-bold border rounded-lg px-2 py-1 outline-none text-center transition-all ${
                          entry.lateMinutes > 0
                            ? 'border-amber-300 bg-amber-50 text-amber-700 focus:ring-1 focus:ring-amber-200'
                            : 'border-slate-200 bg-white text-slate-500 focus:border-amber-300'
                        }`}
                      />
                    </td>

                    {/* OT hours */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={entry.overtimeHours || ''}
                        placeholder="0"
                        onChange={e => updateDay(idx, { overtimeHours: Number(e.target.value) })}
                        className={`w-16 text-[11px] font-bold border rounded-lg px-2 py-1 outline-none text-center transition-all ${
                          entry.overtimeHours > 0
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700 focus:ring-1 focus:ring-indigo-200'
                            : 'border-slate-200 bg-white text-slate-500 focus:border-indigo-300'
                        }`}
                      />
                    </td>

                    {/* Notes */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        value={entry.notes}
                        placeholder="Optional note..."
                        onChange={e => updateDay(idx, { notes: e.target.value })}
                        className="w-full text-[10px] border border-slate-100 rounded-lg px-2 py-1 outline-none focus:border-slate-300 bg-white text-slate-600 placeholder:text-slate-300"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer ── */}
        <div className="px-8 py-5 bg-white border-t flex items-center justify-between shrink-0">
          {/* Live penalty preview */}
          <div className="flex items-center gap-6 text-[10px] font-black uppercase">
            <div className="flex items-center gap-2 text-rose-600">
              <div className="w-2 h-2 rounded-full bg-rose-500"/>
              <span>Net Deductible: {summary.totalAbsent} days</span>
            </div>
            {summary.sandwichPenalty > 0 && (
              <div className="flex items-center gap-2 text-orange-600">
                <div className="w-2 h-2 rounded-full bg-orange-500"/>
                <span>Sandwich: +{summary.sandwichPenalty} days</span>
              </div>
            )}
            {summary.latePenalty > 0 && (
              <div className="flex items-center gap-2 text-amber-600">
                <div className="w-2 h-2 rounded-full bg-amber-500"/>
                <span>Late Penalty: +{summary.latePenalty} days</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 bg-slate-900 hover:bg-blue-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all"
            >
              <Save size={14} />
              Save Attendance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndividualAttendanceModal;
