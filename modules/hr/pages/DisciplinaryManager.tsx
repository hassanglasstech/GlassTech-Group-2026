import React, { useState, useEffect } from 'react';
import { Employee, DisciplinaryAction, DisciplinaryType } from '@/modules/hr/types/hr';
import { HRService } from '@/modules/hr/services/hrService';
import { useAppStore } from '@/modules/shared/store/appStore';
import { AlertTriangle, Plus, X, Check, FileText, Shield, ChevronDown } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { toast } from 'sonner';

const TYPE_CONFIG: Record<DisciplinaryType, { label: string; color: string; bg: string }> = {
  verbal_warning:  { label: 'Verbal Warning',  color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200'  },
  written_warning: { label: 'Written Warning', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200'},
  show_cause:      { label: 'Show Cause',      color: 'text-red-700',    bg: 'bg-red-50 border-red-200'      },
  suspension:      { label: 'Suspension',      color: 'text-rose-700',   bg: 'bg-rose-50 border-rose-200'    },
  termination:     { label: 'Termination',     color: 'text-slate-100',  bg: 'bg-slate-900 border-slate-700' },
};

// Supabase helpers
const fetchActions = async (company: string): Promise<DisciplinaryAction[]> => {
  try {
    const { data, error } = await supabase.from('disciplinary_actions').select('*').eq('company', company).order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.id, employeeId: r.employee_id, company: r.company,
      date: r.date, type: r.type, subject: r.subject, details: r.details,
      issuedBy: r.issued_by, acknowledged: r.acknowledged, acknowledgedDate: r.acknowledged_date,
    }));
  } catch { return []; }
};
const upsertAction = async (a: DisciplinaryAction) => {
  await supabase.from('disciplinary_actions').upsert({
    id: a.id, employee_id: a.employeeId, company: a.company,
    date: a.date, type: a.type, subject: a.subject, details: a.details,
    issued_by: a.issuedBy, acknowledged: a.acknowledged, acknowledged_date: a.acknowledgedDate || null,
  });
};

const DisciplinaryManager: React.FC<{ employeeId?: string }> = ({ employeeId }) => {
  const company = useAppStore(s => s.selectedCompany);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [actions, setActions] = useState<DisciplinaryAction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filterEmp, setFilterEmp] = useState('');
  const [form, setForm] = useState<Partial<DisciplinaryAction>>({
    type: 'written_warning', date: new Date().toISOString().split('T')[0],
    acknowledged: false, company: company as string,
    employeeId: employeeId || '',
  });

  useEffect(() => {
    const emps = HRService.getEmployees().filter(e => e.company === company);
    setEmployees(emps);
    fetchActions(company as string).then(all => setActions(employeeId ? all.filter(a => a.employeeId === employeeId) : all));
  }, [company]);

  const handleSave = async () => {
    if (!form.employeeId || !form.subject || !form.details) {
      toast.error('Fill all required fields'); return;
    }
    const action: DisciplinaryAction = {
      id: `DISC-${Date.now()}`,
      employeeId: form.employeeId!,
      company: company as string,
      date: form.date!,
      type: form.type as DisciplinaryType,
      subject: form.subject!,
      details: form.details!,
      issuedBy: form.issuedBy || 'HR',
      acknowledged: false,
    };
    await upsertAction(action);
    const updated = await fetchActions(company as string);
    setActions(employeeId ? updated.filter(a => a.employeeId === employeeId) : updated);
    setIsOpen(false);
    setForm({ type: 'written_warning', date: new Date().toISOString().split('T')[0], acknowledged: false, company: company as string });
    toast.success('Disciplinary action recorded');
  };

  const markAck = async (id: string) => {
    const action = actions.find(a => a.id === id);
    if (!action) return;
    const updated = { ...action, acknowledged: true, acknowledgedDate: new Date().toISOString().split('T')[0] };
    await upsertAction(updated);
    const refreshed = await fetchActions(company as string);
    setActions(employeeId ? refreshed.filter(a => a.employeeId === employeeId) : refreshed);
    toast.success('Acknowledged');
  };

  const filtered = actions.filter(a => {
    if (!filterEmp) return true;
    const emp = employees.find(e => e.id === a.employeeId);
    return emp?.personal.name.toLowerCase().includes(filterEmp.toLowerCase()) || emp?.work.employeeCode.toLowerCase().includes(filterEmp.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="text-rose-600" size={20}/>
          <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Disciplinary Actions</h3>
          <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-0.5 rounded-full">{actions.length}</span>
        </div>
        <button onClick={() => setIsOpen(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-slate-700"><Plus size={14}/> New Action</button>
      </div>

      <input type="text" placeholder="Search employee..." className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={filterEmp} onChange={e => setFilterEmp(e.target.value)} />

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400"><FileText size={32} className="mx-auto mb-2 opacity-30"/><p className="text-sm font-bold">No disciplinary actions on record</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.sort((a,b) => b.date.localeCompare(a.date)).map(action => {
            const emp = employees.find(e => e.id === action.employeeId);
            const cfg = TYPE_CONFIG[action.type];
            return (
              <div key={action.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-black text-sm shrink-0">{emp?.personal.name.charAt(0) || '?'}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-black text-slate-900 text-sm">{emp?.personal.name || '—'}</p>
                        <span className="text-[9px] text-slate-400 font-bold">{emp?.work.employeeCode}</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                        {!action.acknowledged && <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">Pending Ack</span>}
                      </div>
                      <p className="font-bold text-slate-700 text-xs mb-1">{action.subject}</p>
                      <p className="text-slate-500 text-xs leading-relaxed">{action.details}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-slate-400">{action.date}</span>
                        <span className="text-[10px] text-slate-400">Issued by: {action.issuedBy}</span>
                        {action.acknowledged && <span className="text-[10px] text-emerald-600 font-bold">✓ Acknowledged {action.acknowledgedDate}</span>}
                      </div>
                    </div>
                  </div>
                  {!action.acknowledged && (
                    <button onClick={() => markAck(action.id)} title="Mark as acknowledged" className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg shrink-0"><Check size={16}/></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[500] p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-900 rounded-t-2xl">
              <p className="text-white font-black uppercase tracking-widest text-sm">New Disciplinary Action</p>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Employee</label>
                  <select className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-bold outline-none" value={form.employeeId || ''} onChange={e => setForm({...form, employeeId: e.target.value})}>
                    <option value="">Select employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.personal.name} ({e.work.employeeCode})</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Action Type</label>
                  <select className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-bold outline-none" value={form.type} onChange={e => setForm({...form, type: e.target.value as DisciplinaryType})}>
                    {Object.entries(TYPE_CONFIG).map(([v, cfg]) => <option key={v} value={v}>{cfg.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</label>
                  <input type="date" className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-bold outline-none" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Subject</label>
                  <input type="text" placeholder="e.g. Repeated Absence Without Notification" className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm outline-none" value={form.subject || ''} onChange={e => setForm({...form, subject: e.target.value})} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Details / Description</label>
                  <textarea rows={3} className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm outline-none resize-none" placeholder="Detailed description of the incident..." value={form.details || ''} onChange={e => setForm({...form, details: e.target.value})} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Issued By</label>
                  <input type="text" placeholder="HR / Manager name" className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm outline-none" value={form.issuedBy || ''} onChange={e => setForm({...form, issuedBy: e.target.value})} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setIsOpen(false)} className="px-6 py-2.5 text-slate-500 font-black text-xs uppercase rounded-xl hover:bg-slate-50">Cancel</button>
                <button onClick={handleSave} className="bg-slate-900 text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-700">Save Action</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DisciplinaryManager;
