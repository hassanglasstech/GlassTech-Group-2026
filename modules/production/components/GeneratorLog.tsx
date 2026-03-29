/**
 * GeneratorLog.tsx — Stage 1A
 * Daily generator / WAPDA hours + fuel tracking
 * 
 * Features:
 *  - Daily entry form (date, generator hrs, WAPDA hrs, fuel, sqft produced)
 *  - Auto-validation: generator + WAPDA <= 24 hrs
 *  - Monthly summary cards with cost/sqft, cost/hour, generator %
 *  - Recharts bar chart: monthly fuel cost trend
 *  - Edit/delete existing entries
 *  - Duplicate date prevention per company
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { GeneratorService, GeneratorLog as GenLog } from '@/modules/production/services/generatorService';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Plus, X, Save, Trash2, Edit2, Zap, Fuel, Clock,
  Calendar, AlertTriangle, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = (n: number, d = 0) => n.toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPKR = (n: number) => `PKR ${fmt(n, 0)}`;

const GeneratorLogModule: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const user = useAuthStore(s => s.user);

  const [logs, setLogs] = useState<GenLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState<string>('');

  const [form, setForm] = useState({
    logDate: new Date().toISOString().split('T')[0],
    wapdaHours: 0,
    generatorHours: 0,
    fuelLitresUsed: 0,
    fuelRatePerLitre: 350,
    cuttingSqftProduced: 0,
    notes: '',
  });

  // ── Load data ───────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    const data = await GeneratorService.getLogs(company);
    setLogs(data);
    setLoading(false);
  }, [company]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Summaries ───────────────────────────────────────────────────
  const monthlySummaries = useMemo(() => GeneratorService.getMonthlySummary(logs), [logs]);
  const currentMonth = new Date().toISOString().substring(0, 7);
  const currentSummary = monthlySummaries.find(s => s.month === currentMonth);

  const chartData = useMemo(() => {
    return monthlySummaries.slice(0, 6).reverse().map(s => ({
      month: MONTHS_SHORT[parseInt(s.month.split('-')[1]) - 1] + ' ' + s.month.split('-')[0].slice(2),
      fuelCost: Math.round(s.totalFuelCost),
      genHours: Math.round(s.totalGeneratorHours),
      costPerSqft: Number(s.avgCostPerSqft.toFixed(1)),
    }));
  }, [monthlySummaries]);

  const filteredLogs = useMemo(() => {
    if (!filterMonth) return logs;
    return logs.filter(l => l.logDate.startsWith(filterMonth));
  }, [logs, filterMonth]);

  const availableMonths = useMemo(() => {
    const months = new Set(logs.map(l => l.logDate.substring(0, 7)));
    return Array.from(months).sort().reverse();
  }, [logs]);

  // ── Form handlers ──────────────────────────────────────────────
  const resetForm = () => {
    setForm({ logDate: new Date().toISOString().split('T')[0], wapdaHours: 0, generatorHours: 0, fuelLitresUsed: 0, fuelRatePerLitre: 350, cuttingSqftProduced: 0, notes: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (log: GenLog) => {
    setForm({ logDate: log.logDate, wapdaHours: log.wapdaHours, generatorHours: log.generatorHours, fuelLitresUsed: log.fuelLitresUsed, fuelRatePerLitre: log.fuelRatePerLitre, cuttingSqftProduced: log.cuttingSqftProduced, notes: log.notes });
    setEditingId(log.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.logDate) { toast.error('Date is required'); return; }
    if (form.wapdaHours + form.generatorHours > 24) { toast.error('WAPDA + Generator hours cannot exceed 24'); return; }
    if (form.wapdaHours < 0 || form.generatorHours < 0) { toast.error('Hours cannot be negative'); return; }
    if (form.generatorHours > 0 && form.fuelLitresUsed <= 0) { toast.error('Enter fuel litres used for generator hours'); return; }
    if (!editingId) {
      const existing = logs.find(l => l.logDate === form.logDate);
      if (existing) { toast.error(`Entry already exists for ${form.logDate}. Edit it instead.`); return; }
    }

    const result = await GeneratorService.saveLog({
      id: editingId || undefined,
      company,
      logDate: form.logDate,
      wapdaHours: form.wapdaHours,
      generatorHours: form.generatorHours,
      fuelLitresUsed: form.fuelLitresUsed,
      fuelRatePerLitre: form.fuelRatePerLitre,
      cuttingSqftProduced: form.cuttingSqftProduced,
      notes: form.notes,
      enteredBy: user?.email || 'system',
    });

    if (result) {
      toast.success(editingId ? 'Entry updated' : 'Entry saved');
      resetForm();
      loadData();
    }
  };

  const handleDelete = async (log: GenLog) => {
    if (!confirm(`Delete entry for ${log.logDate}?`)) return;
    await GeneratorService.deleteLog(log.id, company);
    toast.success('Entry deleted');
    loadData();
  };

  const fuelCostPreview = form.fuelLitresUsed * form.fuelRatePerLitre;
  const costPerSqftPreview = form.cuttingSqftProduced > 0 ? fuelCostPreview / form.cuttingSqftProduced : 0;
  const totalHours = form.wapdaHours + form.generatorHours;
  const hoursValid = totalHours <= 24;

  if (loading) return <div className="h-64 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2" size={20}/> Loading generator logs...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <Zap size={20} className="text-amber-500"/> Generator & Energy Log
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{logs.length} entries | {company}</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-lg">
          <Plus size={14}/> New Entry
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Generator Hours</p>
          <p className="text-2xl font-black text-amber-700 mt-1">{fmt(currentSummary?.totalGeneratorHours || 0, 1)}</p>
          <p className="text-[10px] text-amber-500 font-bold mt-0.5">{currentSummary ? `${fmt(currentSummary.generatorPercentage, 0)}% of total` : 'No data this month'}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">WAPDA Hours</p>
          <p className="text-2xl font-black text-blue-700 mt-1">{fmt(currentSummary?.totalWapdaHours || 0, 1)}</p>
          <p className="text-[10px] text-blue-500 font-bold mt-0.5">{currentSummary ? `${fmt(100 - currentSummary.generatorPercentage, 0)}% of total` : '—'}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Fuel Cost (Month)</p>
          <p className="text-2xl font-black text-red-700 mt-1">{fmtPKR(currentSummary?.totalFuelCost || 0)}</p>
          <p className="text-[10px] text-red-500 font-bold mt-0.5">{currentSummary ? `${fmt(currentSummary.totalFuelLitres, 0)} litres` : '—'}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Cost / SqFt</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{currentSummary && currentSummary.avgCostPerSqft > 0 ? `PKR ${fmt(currentSummary.avgCostPerSqft, 1)}` : '—'}</p>
          <p className="text-[10px] text-emerald-500 font-bold mt-0.5">{currentSummary ? `${fmt(currentSummary.totalSqftProduced, 0)} sqft produced` : 'Enter sqft data'}</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Monthly Fuel Cost & Generator Hours</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700 }}/>
              <YAxis yAxisId="cost" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`}/>
              <YAxis yAxisId="hours" orientation="right" tick={{ fontSize: 10 }}/>
              <Tooltip formatter={(v: number, name: string) => [name === 'fuelCost' ? fmtPKR(v) : `${v} hrs`, name === 'fuelCost' ? 'Fuel Cost' : 'Gen Hours']}/>
              <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }}/>
              <Bar yAxisId="cost" dataKey="fuelCost" name="Fuel Cost" fill="#f59e0b" radius={[6,6,0,0]}/>
              <Bar yAxisId="hours" dataKey="genHours" name="Gen Hours" fill="#3b82f6" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Entry Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-[500] flex items-center justify-center p-4" onClick={() => resetForm()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-amber-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
              <h3 className="text-sm font-black uppercase">{editingId ? 'Edit Entry' : 'New Generator Log'}</h3>
              <button onClick={resetForm} className="p-1 hover:bg-white/20 rounded-full"><X size={18}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</label>
                <input type="date" value={form.logDate} onChange={e => setForm(f => ({ ...f, logDate: e.target.value }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-amber-400 focus:border-amber-400"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-1"><Zap size={10}/> WAPDA Hours</label>
                  <input type="number" min="0" max="24" step="0.5" value={form.wapdaHours || ''} onChange={e => setForm(f => ({ ...f, wapdaHours: Number(e.target.value) || 0 }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-400" placeholder="0"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1"><Fuel size={10}/> Generator Hours</label>
                  <input type="number" min="0" max="24" step="0.5" value={form.generatorHours || ''} onChange={e => setForm(f => ({ ...f, generatorHours: Number(e.target.value) || 0 }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-amber-400" placeholder="0"/>
                </div>
              </div>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${hoursValid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {hoursValid ? <Clock size={13}/> : <AlertTriangle size={13}/>}
                Total: {totalHours} / 24 hours {!hoursValid && '— exceeds 24!'}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fuel Used (Litres)</label>
                  <input type="number" min="0" step="0.5" value={form.fuelLitresUsed || ''} onChange={e => setForm(f => ({ ...f, fuelLitresUsed: Number(e.target.value) || 0 }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-400" placeholder="0"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rate / Litre (PKR)</label>
                  <input type="number" min="0" step="1" value={form.fuelRatePerLitre || ''} onChange={e => setForm(f => ({ ...f, fuelRatePerLitre: Number(e.target.value) || 0 }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-400" placeholder="350"/>
                </div>
              </div>
              {fuelCostPreview > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="text-[10px] font-black text-red-500 uppercase">Fuel Cost</span>
                  <span className="text-sm font-black text-red-700">{fmtPKR(fuelCostPreview)}</span>
                </div>
              )}
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cutting SqFt Produced (Optional)</label>
                <input type="number" min="0" step="1" value={form.cuttingSqftProduced || ''} onChange={e => setForm(f => ({ ...f, cuttingSqftProduced: Number(e.target.value) || 0 }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-slate-400" placeholder="0"/>
                {costPerSqftPreview > 0 && <p className="text-[10px] font-bold text-emerald-600 mt-1">Energy cost: PKR {fmt(costPerSqftPreview, 2)} / sqft</p>}
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-400" placeholder="e.g. Full day loadshedding"/>
              </div>
              <button onClick={handleSave} disabled={!hoursValid} className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white py-2.5 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 shadow-lg">
                <Save size={14}/> {editingId ? 'Update Entry' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entries Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Daily Entries</p>
          <div className="flex items-center gap-2">
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-amber-400">
              <option value="">All Months</option>
              {availableMonths.map(m => <option key={m} value={m}>{MONTHS_SHORT[parseInt(m.split('-')[1]) - 1]} {m.split('-')[0]}</option>)}
            </select>
            <span className="text-[10px] font-bold text-slate-400">{filteredLogs.length} entries</span>
          </div>
        </div>
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No entries yet. Click "New Entry" to start tracking.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-right px-3 py-2.5">WAPDA</th>
                  <th className="text-right px-3 py-2.5">Generator</th>
                  <th className="text-right px-3 py-2.5">Fuel (L)</th>
                  <th className="text-right px-3 py-2.5">Fuel Cost</th>
                  <th className="text-right px-3 py-2.5">SqFt</th>
                  <th className="text-right px-3 py-2.5">Cost/SqFt</th>
                  <th className="text-center px-2 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, i) => {
                  const cps = log.cuttingSqftProduced > 0 ? log.fuelCost / log.cuttingSqftProduced : 0;
                  return (
                    <tr key={log.id} className={`border-t border-slate-50 hover:bg-amber-50/30 ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                      <td className="px-4 py-2.5 font-bold text-slate-700"><div className="flex items-center gap-2"><Calendar size={12} className="text-slate-400"/>{new Date(log.logDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: '2-digit' })}</div></td>
                      <td className="text-right px-3 py-2.5 font-bold text-blue-600">{fmt(log.wapdaHours, 1)}h</td>
                      <td className="text-right px-3 py-2.5 font-black text-amber-600">{fmt(log.generatorHours, 1)}h</td>
                      <td className="text-right px-3 py-2.5 font-bold text-slate-600">{fmt(log.fuelLitresUsed, 1)}</td>
                      <td className="text-right px-3 py-2.5 font-black text-red-600">{fmtPKR(log.fuelCost)}</td>
                      <td className="text-right px-3 py-2.5 font-bold text-slate-600">{log.cuttingSqftProduced > 0 ? fmt(log.cuttingSqftProduced, 0) : '—'}</td>
                      <td className="text-right px-3 py-2.5 font-black text-emerald-600">{cps > 0 ? fmt(cps, 1) : '—'}</td>
                      <td className="text-center px-2 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleEdit(log)} className="p-1 hover:bg-blue-50 rounded-lg" title="Edit"><Edit2 size={13} className="text-blue-500"/></button>
                          <button onClick={() => handleDelete(log)} className="p-1 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 size={13} className="text-red-400"/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Monthly Summary Table */}
      {monthlySummaries.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monthly Summary</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="text-left px-4 py-2.5">Month</th>
                  <th className="text-right px-3 py-2.5">Days</th>
                  <th className="text-right px-3 py-2.5">Gen Hrs</th>
                  <th className="text-right px-3 py-2.5">WAPDA Hrs</th>
                  <th className="text-right px-3 py-2.5">Gen %</th>
                  <th className="text-right px-3 py-2.5">Fuel (L)</th>
                  <th className="text-right px-3 py-2.5">Fuel Cost</th>
                  <th className="text-right px-3 py-2.5">SqFt</th>
                  <th className="text-right px-3 py-2.5">Cost/SqFt</th>
                  <th className="text-right px-3 py-2.5">Cost/Hr</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummaries.map((s, i) => (
                  <tr key={s.month} className={`border-t border-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                    <td className="px-4 py-2.5 font-black text-slate-700">{MONTHS_SHORT[parseInt(s.month.split('-')[1]) - 1]} {s.month.split('-')[0]}</td>
                    <td className="text-right px-3 py-2.5 font-bold text-slate-500">{s.totalDays}</td>
                    <td className="text-right px-3 py-2.5 font-black text-amber-600">{fmt(s.totalGeneratorHours, 1)}</td>
                    <td className="text-right px-3 py-2.5 font-bold text-blue-600">{fmt(s.totalWapdaHours, 1)}</td>
                    <td className="text-right px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${s.generatorPercentage > 50 ? 'bg-red-100 text-red-700' : s.generatorPercentage > 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{fmt(s.generatorPercentage, 0)}%</span>
                    </td>
                    <td className="text-right px-3 py-2.5 font-bold text-slate-600">{fmt(s.totalFuelLitres, 0)}</td>
                    <td className="text-right px-3 py-2.5 font-black text-red-600">{fmtPKR(s.totalFuelCost)}</td>
                    <td className="text-right px-3 py-2.5 font-bold text-slate-600">{s.totalSqftProduced > 0 ? fmt(s.totalSqftProduced, 0) : '—'}</td>
                    <td className="text-right px-3 py-2.5 font-black text-emerald-600">{s.avgCostPerSqft > 0 ? fmt(s.avgCostPerSqft, 1) : '—'}</td>
                    <td className="text-right px-3 py-2.5 font-bold text-slate-600">{s.avgCostPerHour > 0 ? fmtPKR(s.avgCostPerHour) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(GeneratorLogModule);
