/**
 * LabourLog.tsx — Stage 1B
 * Daily cutter productivity: sqft/day, pieces, overtime
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { LabourService, CutterDailyLog, CutterMonthlySummary } from '@/modules/production/services/labourService';
import { HRService } from '@/modules/hr/services/hrService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Plus, X, Save, Trash2, Edit2, Users, Calendar, Clock, Loader2, TrendingUp, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = (n: number, d = 0) => n.toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });

const LabourLogModule: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const user = useAuthStore(s => s.user);
  const [logs, setLogs] = useState<CutterDailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState('');

  const [form, setForm] = useState({
    logDate: new Date().toISOString().split('T')[0],
    cutterName: '', employeeId: '', shift: 'Morning' as 'Morning' | 'Evening' | 'Full',
    sqftProduced: 0, piecesCut: 0, sheetsUsed: 0,
    overtimeHours: 0, overtimeRateMultiplier: 1.5, notes: '',
  });

  // Get employee names for dropdown
  const employees = useMemo(() => {
    try { return HRService.getEmployees().filter(e => e.company === company); } catch { return []; }
  }, [company]);

  const cutterNames = useMemo(() => {
    const fromLogs = new Set(logs.map(l => l.cutterName));
    employees.forEach(e => fromLogs.add(e.personal.name));
    return Array.from(fromLogs).sort();
  }, [logs, employees]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLogs(await LabourService.getLogs(company));
    setLoading(false);
  }, [company]);
  useEffect(() => { loadData(); }, [loadData]);

  const cutterSummaries = useMemo(() => LabourService.getCutterSummary(logs, filterMonth || undefined), [logs, filterMonth]);
  
  const chartData = useMemo(() => {
    return cutterSummaries.slice(0, 8).map(s => ({
      name: s.cutterName.split(' ')[0],
      avgSqft: Math.round(s.avgSqftPerDay),
      otHours: s.totalOTHours,
    }));
  }, [cutterSummaries]);

  const filteredLogs = useMemo(() => {
    if (!filterMonth) return logs;
    return logs.filter(l => l.logDate.startsWith(filterMonth));
  }, [logs, filterMonth]);

  const availableMonths = useMemo(() => Array.from(new Set(logs.map(l => l.logDate.substring(0, 7)))).sort().reverse(), [logs]);

  const resetForm = () => {
    setForm({ logDate: new Date().toISOString().split('T')[0], cutterName: '', employeeId: '', shift: 'Morning', sqftProduced: 0, piecesCut: 0, sheetsUsed: 0, overtimeHours: 0, overtimeRateMultiplier: 1.5, notes: '' });
    setEditingId(null); setShowForm(false);
  };

  const handleEdit = (log: CutterDailyLog) => {
    setForm({ logDate: log.logDate, cutterName: log.cutterName, employeeId: log.employeeId, shift: log.shift, sqftProduced: log.sqftProduced, piecesCut: log.piecesCut, sheetsUsed: log.sheetsUsed, overtimeHours: log.overtimeHours, overtimeRateMultiplier: log.overtimeRateMultiplier, notes: log.notes });
    setEditingId(log.id); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.logDate || !form.cutterName) { toast.error('Date and cutter name required'); return; }
    if (!editingId && logs.find(l => l.logDate === form.logDate && l.cutterName === form.cutterName)) {
      toast.error(`Entry already exists for ${form.cutterName} on ${form.logDate}`); return;
    }
    await LabourService.saveLog({ id: editingId || undefined, company, ...form, enteredBy: user?.email || 'system' });
    toast.success(editingId ? 'Updated' : 'Saved');
    resetForm(); loadData();
  };

  const handleDelete = async (log: CutterDailyLog) => {
    if (!confirm(`Delete ${log.cutterName} entry for ${log.logDate}?`)) return;
    await LabourService.deleteLog(log.id, company);
    toast.success('Deleted'); loadData();
  };

  // Overall averages
  const totalSqft = filteredLogs.reduce((s, l) => s + l.sqftProduced, 0);
  const totalOT = filteredLogs.reduce((s, l) => s + l.overtimeHours, 0);
  const avgPerDay = cutterSummaries.length > 0 ? cutterSummaries.reduce((s, c) => s + c.avgSqftPerDay, 0) / cutterSummaries.length : 0;

  if (loading) return <div className="h-64 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2" size={20}/> Loading labour logs...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <Users size={20} className="text-blue-500"/> Labour Productivity Log
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{logs.length} entries | {cutterSummaries.length} cutters | {company}</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-lg">
          <Plus size={14}/> New Entry
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Total SqFt</p>
          <p className="text-2xl font-black text-blue-700 mt-1">{fmt(totalSqft, 0)}</p>
          <p className="text-[10px] text-blue-500 font-bold mt-0.5">{filteredLogs.length} entries</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Avg SqFt/Day/Cutter</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{fmt(avgPerDay, 0)}</p>
          <p className="text-[10px] text-emerald-500 font-bold mt-0.5">{cutterSummaries.length} cutters</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Total OT Hours</p>
          <p className="text-2xl font-black text-amber-700 mt-1">{fmt(totalOT, 1)}</p>
          <p className="text-[10px] text-amber-500 font-bold mt-0.5">@ 1.5x rate = 2x eff. cost</p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-purple-500 uppercase tracking-widest">Top Cutter</p>
          <p className="text-lg font-black text-purple-700 mt-1">{cutterSummaries[0]?.cutterName.split(' ')[0] || '—'}</p>
          <p className="text-[10px] text-purple-500 font-bold mt-0.5">{cutterSummaries[0] ? `${fmt(cutterSummaries[0].avgSqftPerDay, 0)} sqft/day` : '—'}</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Avg SqFt/Day by Cutter</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }}/>
              <YAxis tick={{ fontSize: 10 }}/>
              <Tooltip/>
              <Bar dataKey="avgSqft" name="Avg SqFt/Day" fill="#3b82f6" radius={[6,6,0,0]}/>
              <Bar dataKey="otHours" name="OT Hours" fill="#f59e0b" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-[500] flex items-center justify-center p-4" onClick={resetForm}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-blue-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
              <h3 className="text-sm font-black uppercase">{editingId ? 'Edit Entry' : 'New Cutter Log'}</h3>
              <button onClick={resetForm} className="p-1 hover:bg-white/20 rounded-full"><X size={18}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Date</label>
                  <input type="date" value={form.logDate} onChange={e => setForm(f => ({ ...f, logDate: e.target.value }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-400"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Shift</label>
                  <select value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value as any }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-400">
                    <option value="Morning">Morning</option>
                    <option value="Evening">Evening</option>
                    <option value="Full">Full Day</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Cutter Name</label>
                <input list="cutterList" value={form.cutterName} onChange={e => setForm(f => ({ ...f, cutterName: e.target.value }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-400" placeholder="Select or type name"/>
                <datalist id="cutterList">{cutterNames.map(n => <option key={n} value={n}/>)}</datalist>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[9px] font-black text-blue-500 uppercase">SqFt Produced</label>
                  <input type="number" min="0" step="1" value={form.sqftProduced || ''} onChange={e => setForm(f => ({ ...f, sqftProduced: Number(e.target.value) || 0 }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-400" placeholder="0"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Pieces Cut</label>
                  <input type="number" min="0" value={form.piecesCut || ''} onChange={e => setForm(f => ({ ...f, piecesCut: Number(e.target.value) || 0 }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold" placeholder="0"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">Sheets Used</label>
                  <input type="number" min="0" value={form.sheetsUsed || ''} onChange={e => setForm(f => ({ ...f, sheetsUsed: Number(e.target.value) || 0 }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold" placeholder="0"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-amber-500 uppercase flex items-center gap-1"><Clock size={10}/> Overtime Hours</label>
                  <input type="number" min="0" max="8" step="0.5" value={form.overtimeHours || ''} onChange={e => setForm(f => ({ ...f, overtimeHours: Number(e.target.value) || 0 }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold" placeholder="0"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase">OT Rate Multiplier</label>
                  <input type="number" min="1" max="3" step="0.1" value={form.overtimeRateMultiplier} onChange={e => setForm(f => ({ ...f, overtimeRateMultiplier: Number(e.target.value) || 1.5 }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold"/>
                </div>
              </div>
              {form.overtimeHours > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs font-bold text-amber-700">
                  <AlertTriangle size={12} className="inline mr-1"/> OT effective cost: {form.overtimeRateMultiplier}x pay / 0.75x output = {fmt(form.overtimeRateMultiplier / 0.75, 1)}x cost per sqft
                </div>
              )}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase">Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm" placeholder="Optional"/>
              </div>
              <button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 shadow-lg">
                <Save size={14}/> {editingId ? 'Update' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cutter Rankings */}
      {cutterSummaries.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><TrendingUp size={12}/> Cutter Rankings</p>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1">
              <option value="">All Time</option>
              {availableMonths.map(m => <option key={m} value={m}>{MONTHS_SHORT[parseInt(m.split('-')[1]) - 1]} {m.split('-')[0]}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase">
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left px-3 py-2.5">Cutter</th>
                <th className="text-right px-3 py-2.5">Days</th>
                <th className="text-right px-3 py-2.5">Total SqFt</th>
                <th className="text-right px-3 py-2.5">Avg/Day</th>
                <th className="text-right px-3 py-2.5">Pieces</th>
                <th className="text-right px-3 py-2.5">OT Hrs</th>
              </tr></thead>
              <tbody>
                {cutterSummaries.map((s, i) => (
                  <tr key={s.cutterName} className={`border-t border-slate-50 ${i % 2 ? 'bg-slate-50/50' : ''}`}>
                    <td className="px-4 py-2.5 font-black text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2.5 font-black text-slate-700">{s.cutterName}</td>
                    <td className="text-right px-3 py-2.5 font-bold text-slate-500">{s.totalDays}</td>
                    <td className="text-right px-3 py-2.5 font-black text-blue-600">{fmt(s.totalSqft, 0)}</td>
                    <td className="text-right px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${s.avgSqftPerDay >= avgPerDay ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{fmt(s.avgSqftPerDay, 0)}</span>
                    </td>
                    <td className="text-right px-3 py-2.5 font-bold text-slate-600">{s.totalPieces}</td>
                    <td className="text-right px-3 py-2.5 font-bold text-amber-600">{s.totalOTHours > 0 ? fmt(s.totalOTHours, 1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily Entries */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Daily Entries</p>
          <span className="text-[10px] font-bold text-slate-400">{filteredLogs.length} entries</span>
        </div>
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Cutter</th>
                <th className="text-center px-3 py-2.5">Shift</th>
                <th className="text-right px-3 py-2.5">SqFt</th>
                <th className="text-right px-3 py-2.5">Pieces</th>
                <th className="text-right px-3 py-2.5">Sheets</th>
                <th className="text-right px-3 py-2.5">OT</th>
                <th className="text-center px-2 py-2.5">Actions</th>
              </tr></thead>
              <tbody>
                {filteredLogs.map((log, i) => (
                  <tr key={log.id} className={`border-t border-slate-50 hover:bg-blue-50/30 ${i % 2 ? 'bg-slate-50/50' : ''}`}>
                    <td className="px-4 py-2.5 font-bold text-slate-700"><Calendar size={12} className="inline mr-1 text-slate-400"/>{new Date(log.logDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</td>
                    <td className="px-3 py-2.5 font-black text-slate-700">{log.cutterName}</td>
                    <td className="text-center px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${log.shift === 'Morning' ? 'bg-amber-100 text-amber-700' : log.shift === 'Evening' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>{log.shift}</span></td>
                    <td className="text-right px-3 py-2.5 font-black text-blue-600">{fmt(log.sqftProduced, 0)}</td>
                    <td className="text-right px-3 py-2.5 font-bold text-slate-600">{log.piecesCut}</td>
                    <td className="text-right px-3 py-2.5 font-bold text-slate-600">{log.sheetsUsed}</td>
                    <td className="text-right px-3 py-2.5 font-bold text-amber-600">{log.overtimeHours > 0 ? `${fmt(log.overtimeHours, 1)}h` : '—'}</td>
                    <td className="text-center px-2 py-2.5">
                      <button onClick={() => handleEdit(log)} className="p-1 hover:bg-blue-50 rounded-lg"><Edit2 size={13} className="text-blue-500"/></button>
                      <button onClick={() => handleDelete(log)} className="p-1 hover:bg-red-50 rounded-lg"><Trash2 size={13} className="text-red-400"/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(LabourLogModule);
