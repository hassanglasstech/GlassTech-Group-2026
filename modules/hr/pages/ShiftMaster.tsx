/**
 * ShiftMaster — Dynamic shift configuration
 * Replaces hardcoded Ramzan/Eid timings in IndividualAttendanceModal
 * Config stored in Supabase (shift_master table)
 */
import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { Clock, Plus, Trash2, X, Save, Calendar } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { toast } from 'sonner';

export interface ShiftRule {
  id: string;
  company: string;        // 'GTK' | 'Glassco' | 'GTI' | 'all'
  name: string;           // e.g. 'Ramzan Week 1', 'Eid Holiday'
  dateFrom: string;       // YYYY-MM-DD
  dateTo: string;         // YYYY-MM-DD
  inTime: string;         // HH:mm or '' for holiday
  outTime: string;        // HH:mm or '' for holiday
  lateGraceMinutes: number;
  isHoliday: boolean;
  priority: number;       // higher = overrides lower
}

// In-memory cache for fast reads
let _shiftCache: ShiftRule[] | null = null;

export const getShiftRules = (): ShiftRule[] => _shiftCache || [];

export const loadShiftRules = async (): Promise<ShiftRule[]> => {
  try {
    const { data, error } = await supabase.from('shift_master').select('*').order('date_from');
    if (error) {
      // Table may not exist yet — fail silently, use empty rules
      console.warn('[ShiftMaster] shift_master table not found — run SQL migration');
      _shiftCache = [];
      return [];
    }
    _shiftCache = (data || []).map((r: any) => ({
      id: r.id, company: r.company, name: r.name,
      dateFrom: r.date_from, dateTo: r.date_to,
      inTime: r.in_time || '', outTime: r.out_time || '',
      lateGraceMinutes: r.late_grace_minutes || 15,
      isHoliday: r.is_holiday || false,
      priority: r.priority || 10,
    }));
    return _shiftCache;
  } catch {
    _shiftCache = [];
    return [];
  }
};

export const saveShiftRules = async (rules: ShiftRule[]) => {
  _shiftCache = rules;
  // Upsert all rules
  const rows = rules.map(r => ({
    id: r.id, company: r.company, name: r.name,
    date_from: r.dateFrom, date_to: r.dateTo,
    in_time: r.inTime, out_time: r.outTime,
    late_grace_minutes: r.lateGraceMinutes,
    is_holiday: r.isHoliday, priority: r.priority,
  }));
  await supabase.from('shift_master').upsert(rows, { onConflict: 'id' });
};

export const deleteShiftRule = async (id: string) => {
  _shiftCache = (_shiftCache || []).filter(r => r.id !== id);
  await supabase.from('shift_master').delete().eq('id', id);
};

// Resolve shift for a given company + date — returns null if no rule matches (use default)
export const resolveShift = (company: string, dateStr: string): { start: string; end: string; lateGrace: number; isHoliday: boolean } | null => {
  const rules = getShiftRules();
  const co = company.toLowerCase();
  const matching = rules
    .filter(r => {
      const companyMatch = r.company === 'all' || co.includes(r.company.toLowerCase());
      const dateMatch = dateStr >= r.dateFrom && dateStr <= r.dateTo;
      return companyMatch && dateMatch;
    })
    .sort((a, b) => b.priority - a.priority);
  if (!matching.length) return null;
  const rule = matching[0];
  return { start: rule.inTime, end: rule.outTime, lateGrace: rule.lateGraceMinutes, isHoliday: rule.isHoliday };
};

const COMPANY_OPTIONS = ['all', 'Glassco', 'GTK', 'GTI', 'Factory', 'Nippon'];

const ShiftMaster: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [rules, setRules] = useState<ShiftRule[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<Partial<ShiftRule>>({
    company: 'all', inTime: '08:00', outTime: '16:00',
    lateGraceMinutes: 15, isHoliday: false, priority: 10,
    dateFrom: '', dateTo: '', name: '',
  });

  useEffect(() => { loadShiftRules().then(setRules); }, []);

  const handleSave = async () => {
    if (!form.name || !form.dateFrom || !form.dateTo) { toast.error('Fill name and date range'); return; }
    const rule: ShiftRule = {
      id: `SHIFT-${Date.now()}`,
      company: form.company || 'all',
      name: form.name!,
      dateFrom: form.dateFrom!,
      dateTo: form.dateTo!,
      inTime: form.isHoliday ? '' : form.inTime || '08:00',
      outTime: form.isHoliday ? '' : form.outTime || '16:00',
      lateGraceMinutes: form.lateGraceMinutes || 15,
      isHoliday: form.isHoliday || false,
      priority: form.priority || 10,
    };
    const updated = [...rules, rule].sort((a,b) => a.dateFrom.localeCompare(b.dateFrom));
    await saveShiftRules(updated);
    setRules(updated);
    setIsOpen(false);
    toast.success('Shift rule saved');
  };

  const handleDelete = async (id: string) => {
    await deleteShiftRule(id);
    setRules(prev => prev.filter(r => r.id !== id));
    toast.success('Rule deleted');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="text-blue-600" size={20}/>
          <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Shift Master</h3>
          <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">{rules.length} rules</span>
        </div>
        <button onClick={() => setIsOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-blue-700">
          <Plus size={14}/> Add Rule
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 font-bold">
        Rules override default shift (09:00–18:00). Higher priority = takes precedence. Holiday rules block attendance.
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Calendar size={32} className="mx-auto mb-2 opacity-30"/>
          <p className="text-sm font-bold">No custom shift rules — using system defaults</p>
          <p className="text-xs mt-1">Add Ramzan, Eid, or any special shift timings here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className={`flex items-center justify-between p-3 rounded-xl border ${rule.isHoliday ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-4 flex-1">
                <div className={`w-2 h-10 rounded-full ${rule.isHoliday ? 'bg-red-400' : 'bg-blue-400'}`}/>
                <div>
                  <p className="font-black text-slate-900 text-sm">{rule.name}</p>
                  <p className="text-[10px] text-slate-500 font-bold">{rule.dateFrom} → {rule.dateTo} · {rule.company === 'all' ? 'All Companies' : rule.company}</p>
                </div>
                {rule.isHoliday ? (
                  <span className="px-3 py-1 bg-red-100 text-red-700 text-[10px] font-black rounded-full border border-red-200">HOLIDAY</span>
                ) : (
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full border border-blue-200">{rule.inTime} – {rule.outTime} · Grace {rule.lateGraceMinutes}min</span>
                )}
                <span className="text-[10px] text-slate-400 font-bold">P{rule.priority}</span>
              </div>
              <button onClick={() => handleDelete(rule.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg ml-2"><Trash2 size={14}/></button>
            </div>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[500] p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-900 rounded-t-2xl">
              <p className="text-white font-black uppercase tracking-widest text-sm">Add Shift Rule</p>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rule Name</label>
                  <input type="text" placeholder="e.g. Ramzan 2027 Week 1, Eid ul Fitr" className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm outline-none" value={form.name||''} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">From Date</label>
                  <input type="date" className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-bold outline-none" value={form.dateFrom||''} onChange={e => setForm({...form, dateFrom: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">To Date</label>
                  <input type="date" className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-bold outline-none" value={form.dateTo||''} onChange={e => setForm({...form, dateTo: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Company</label>
                  <select className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-bold outline-none" value={form.company||'all'} onChange={e => setForm({...form, company: e.target.value})}>
                    {COMPANY_OPTIONS.map(c => <option key={c} value={c}>{c === 'all' ? 'All Companies' : c}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Priority</label>
                  <input type="number" className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-bold outline-none" value={form.priority||10} onChange={e => setForm({...form, priority: Number(e.target.value)})} />
                </div>

                <div className="col-span-2 flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <input type="checkbox" id="isHoliday" checked={form.isHoliday||false} onChange={e => setForm({...form, isHoliday: e.target.checked})} className="w-4 h-4 accent-red-600"/>
                  <label htmlFor="isHoliday" className="text-xs font-black text-red-700 uppercase tracking-widest cursor-pointer">Mark as Holiday (no attendance required)</label>
                </div>

                {!form.isHoliday && <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">In Time</label>
                    <input type="time" className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-bold outline-none" value={form.inTime||'08:00'} onChange={e => setForm({...form, inTime: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Out Time</label>
                    <input type="time" className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-bold outline-none" value={form.outTime||'16:00'} onChange={e => setForm({...form, outTime: e.target.value})} />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Late Grace (minutes)</label>
                    <input type="number" className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-bold outline-none" value={form.lateGraceMinutes||15} onChange={e => setForm({...form, lateGraceMinutes: Number(e.target.value)})} />
                  </div>
                </>}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setIsOpen(false)} className="px-6 py-2.5 text-slate-500 font-black text-xs uppercase rounded-xl hover:bg-slate-50">Cancel</button>
                <button onClick={handleSave} className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 flex items-center gap-2"><Save size={14}/> Save Rule</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftMaster;
