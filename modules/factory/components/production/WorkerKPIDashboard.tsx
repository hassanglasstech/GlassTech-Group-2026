import React, { useEffect, useState, useMemo } from 'react';
import {
  Users, Plus, Loader2, X, Star,
  TrendingUp, TrendingDown, Award, RefreshCw, BarChart2
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { HRService } from '@/modules/hr/services/hrService';

// ── Types ─────────────────────────────────────────────────────────────
interface WorkerKPI {
  id: string;
  employee_id: string;
  employee_name: string;
  company: string;
  date: string;
  pieces_cut: number;
  sqft_cut: number;
  qc_pass_count: number;
  qc_fail_count: number;
  breakage_count: number;
  hours_worked: number;
  station: string;
  notes?: string;
}

interface TeamPair {
  id: string;
  company: string;
  worker_a_id: string;
  worker_a_name: string;
  worker_b_id: string;
  worker_b_name: string;
  station: string;
  pair_score: number;
  recommended: boolean;
  notes?: string;
}

interface WorkerSummary {
  employee_id: string;
  employee_name: string;
  totalSqft: number;
  totalPieces: number;
  avgQcPass: number;
  breakages: number;
  sqftPerHour: number;
  daysLogged: number;
}

const STATIONS = ['Cutting', 'Processing', 'Dispatch'];

const EMPTY_KPI = {
  employee_id: '', employee_name: '', date: new Date().toISOString().split('T')[0],
  pieces_cut: 0, sqft_cut: 0, qc_pass_count: 0, qc_fail_count: 0,
  breakage_count: 0, hours_worked: 8, station: 'Cutting', notes: '',
};

const EMPTY_PAIR = {
  worker_a_id: '', worker_a_name: '', worker_b_id: '', worker_b_name: '',
  station: 'Cutting', notes: '',
};

type Tab = 'kpi' | 'pairs' | 'log';

// ── Component ─────────────────────────────────────────────────────────
const WorkerKPIDashboard: React.FC = () => {
  const [tab, setTab]             = useState<Tab>('kpi');
  const [kpis, setKpis]           = useState<WorkerKPI[]>([]);
  const [pairs, setPairs]         = useState<TeamPair[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [showPairForm, setShowPairForm] = useState(false);
  const [kpiForm, setKpiForm]     = useState({ ...EMPTY_KPI });
  const [pairForm, setPairForm]   = useState({ ...EMPTY_PAIR });
  const [saving, setSaving]       = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  // Load employees from HR
  const employees = useMemo(() => {
    try {
      return HRService.getEmployees().filter(e =>
        e.company === 'Glassco' &&
        !['resigned', 'terminated'].includes(e.work?.status as string ?? '')
      );
    } catch { return []; }
  }, []);

  const filteredEmps = useMemo(() =>
    employees.filter(e =>
      e.personal.name.toLowerCase().includes(empSearch.toLowerCase())
    ).slice(0, 8),
    [employees, empSearch]
  );

  useEffect(() => { load(); }, [tab]);

  const load = async () => {
    setLoading(true);
    if (tab === 'kpi' || tab === 'log') {
      const { data } = await supabase
        .from('worker_kpi')
        .select('*')
        .eq('company', 'Glassco')
        .order('date', { ascending: false })
        .limit(100);
      if (data) setKpis(data as WorkerKPI[]);
    }
    if (tab === 'pairs') {
      const { data } = await supabase
        .from('team_pairs')
        .select('*')
        .eq('company', 'Glassco')
        .order('pair_score', { ascending: false });
      if (data) setPairs(data as TeamPair[]);
    }
    setLoading(false);
  };

  // Aggregate KPIs by worker
  const workerSummaries: WorkerSummary[] = useMemo(() => {
    const map: Record<string, WorkerKPI[]> = {};
    kpis.forEach(k => {
      if (!map[k.employee_id]) map[k.employee_id] = [];
      map[k.employee_id].push(k);
    });
    return Object.entries(map).map(([id, records]) => {
      const totalSqft   = records.reduce((s, r) => s + r.sqft_cut, 0);
      const totalPieces = records.reduce((s, r) => s + r.pieces_cut, 0);
      const totalHours  = records.reduce((s, r) => s + r.hours_worked, 0);
      const qcPass      = records.reduce((s, r) => s + r.qc_pass_count, 0);
      const qcTotal     = records.reduce((s, r) => s + r.qc_pass_count + r.qc_fail_count, 0);
      const breakages   = records.reduce((s, r) => s + r.breakage_count, 0);
      return {
        employee_id:   id,
        employee_name: records[0].employee_name,
        totalSqft:     parseFloat(totalSqft.toFixed(1)),
        totalPieces,
        avgQcPass:     qcTotal > 0 ? Math.round((qcPass / qcTotal) * 100) : 100,
        breakages,
        sqftPerHour:   totalHours > 0 ? parseFloat((totalSqft / totalHours).toFixed(1)) : 0,
        daysLogged:    records.length,
      };
    }).sort((a, b) => b.sqftPerHour - a.sqftPerHour);
  }, [kpis]);

  const saveKPI = async () => {
    if (!kpiForm.employee_id) return;
    setSaving(true);
    await supabase.from('worker_kpi').upsert({
      ...kpiForm,
      company:    'Glassco',
      created_at: new Date().toISOString(),
    }, { onConflict: 'employee_id,date' });
    setKpiForm({ ...EMPTY_KPI });
    setShowKpiForm(false);
    await load();
    setSaving(false);
  };

  const savePair = async () => {
    if (!pairForm.worker_a_id || !pairForm.worker_b_id) return;
    setSaving(true);
    await supabase.from('team_pairs').insert({
      ...pairForm,
      company:    'Glassco',
      pair_score: 0,
      recommended: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setPairForm({ ...EMPTY_PAIR });
    setShowPairForm(false);
    await load();
    setSaving(false);
  };

  const toggleRecommended = async (pair: TeamPair) => {
    await supabase.from('team_pairs').update({ recommended: !pair.recommended }).eq('id', pair.id);
    setPairs(prev => prev.map(p => p.id === pair.id ? { ...p, recommended: !p.recommended } : p));
  };

  const topWorker = workerSummaries[0];

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Worker KPI</h2>
          <p className="text-xs text-slate-500 mt-0.5">Performance · Team pairs · Supervisor insights</p>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
        {([['kpi', 'KPI Board'], ['pairs', 'Team Pairs'], ['log', 'Log Entry']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
              ${tab === t ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : tab === 'kpi' ? (

        // ── KPI BOARD ───────────────────────────────────────────────
        <div className="space-y-3">
          {topWorker && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center gap-3">
              <Award size={20} className="text-yellow-400 shrink-0" />
              <div>
                <div className="text-xs text-yellow-400 uppercase tracking-widest">Top Performer</div>
                <div className="font-black text-white mt-0.5">{topWorker.employee_name}</div>
                <div className="text-xs text-slate-400">{topWorker.sqftPerHour} sqft/hr · {topWorker.avgQcPass}% QC pass</div>
              </div>
            </div>
          )}

          {workerSummaries.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              Koi KPI data nahi — Log Entry se start karo
            </div>
          ) : (
            workerSummaries.map((w, idx) => (
              <div key={w.employee_id} className="bg-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0
                    ${idx === 0 ? 'bg-yellow-500 text-slate-900' :
                      idx === 1 ? 'bg-slate-400 text-slate-900' :
                      idx === 2 ? 'bg-orange-700 text-white' : 'bg-slate-700 text-slate-300'}`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm">{w.employee_name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {w.daysLogged} days · {w.totalPieces} pieces · {w.totalSqft} sqft
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-black text-white text-sm">{w.sqftPerHour}</div>
                    <div className="text-[10px] text-slate-500">sqft/hr</div>
                  </div>
                </div>

                {/* Mini bars */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                      <span>QC Pass</span><span>{w.avgQcPass}%</span>
                    </div>
                    <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${w.avgQcPass >= 90 ? 'bg-green-500' : w.avgQcPass >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${w.avgQcPass}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                      <span>Breakages</span><span>{w.breakages}</span>
                    </div>
                    <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${w.breakages === 0 ? 'bg-green-500' : w.breakages <= 2 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, w.breakages * 20)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      ) : tab === 'pairs' ? (

        // ── TEAM PAIRS ──────────────────────────────────────────────
        <div className="space-y-3">
          <button onClick={() => setShowPairForm(true)}
            className="w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-bold text-xs py-3 rounded-xl hover:bg-slate-100 transition-all">
            <Plus size={14} /> Add Team Pair
          </button>

          {showPairForm && (
            <div className="bg-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">New Team Pair</span>
                <button onClick={() => setShowPairForm(false)}><X size={16} className="text-slate-400" /></button>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Worker A</label>
                <select value={pairForm.worker_a_id}
                  onChange={e => {
                    const emp = employees.find(x => x.id === e.target.value);
                    setPairForm(p => ({ ...p, worker_a_id: e.target.value, worker_a_name: emp?.personal.name ?? '' }));
                  }}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                  <option value="">Select worker...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.personal.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Worker B</label>
                <select value={pairForm.worker_b_id}
                  onChange={e => {
                    const emp = employees.find(x => x.id === e.target.value);
                    setPairForm(p => ({ ...p, worker_b_id: e.target.value, worker_b_name: emp?.personal.name ?? '' }));
                  }}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                  <option value="">Select worker...</option>
                  {employees.filter(e => e.id !== pairForm.worker_a_id).map(e => <option key={e.id} value={e.id}>{e.personal.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Station</label>
                <select value={pairForm.station} onChange={e => setPairForm(p => ({ ...p, station: e.target.value }))}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                  {STATIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Notes</label>
                <input value={pairForm.notes} onChange={e => setPairForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Kyu achhe hain saath mein?"
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
              <button onClick={savePair} disabled={saving || !pairForm.worker_a_id || !pairForm.worker_b_id}
                className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Pair'}
              </button>
            </div>
          )}

          {pairs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">Koi team pairs nahi</div>
          ) : (
            pairs.map(pair => (
              <div key={pair.id} className={`bg-slate-800 rounded-xl p-4 space-y-2 ${pair.recommended ? 'border border-yellow-500/30' : ''}`}>
                <div className="flex items-center gap-2">
                  <Users size={14} className={pair.recommended ? 'text-yellow-400' : 'text-slate-400'} />
                  <span className="font-bold text-white text-sm flex-1">
                    {pair.worker_a_name} + {pair.worker_b_name}
                  </span>
                  <button onClick={() => toggleRecommended(pair)}
                    className={`shrink-0 transition-colors ${pair.recommended ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`}>
                    <Star size={14} fill={pair.recommended ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span>{pair.station}</span>
                  {pair.pair_score > 0 && <span>{pair.pair_score} sqft/hr combined</span>}
                  {pair.recommended && <span className="text-yellow-400 font-bold">★ Recommended</span>}
                </div>
                {pair.notes && <p className="text-xs text-slate-400">{pair.notes}</p>}
              </div>
            ))
          )}
        </div>

      ) : (

        // ── LOG ENTRY ───────────────────────────────────────────────
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Worker</label>
            <div className="relative">
              <input value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                placeholder="Search worker name..."
                className="w-full bg-slate-800 text-white rounded-xl px-4 py-2.5 text-sm placeholder-slate-500 outline-none" />
              {empSearch && filteredEmps.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-slate-700 rounded-xl mt-1 z-10 overflow-hidden shadow-xl">
                  {filteredEmps.map(e => (
                    <button key={e.id} onClick={() => {
                      setKpiForm(p => ({ ...p, employee_id: e.id, employee_name: e.personal.name }));
                      setEmpSearch(e.personal.name);
                    }}
                      className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-slate-600 transition-colors">
                      {e.personal.name}
                      <span className="text-xs text-slate-400 ml-2">{e.work?.designation}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {kpiForm.employee_name && (
              <div className="text-xs text-green-400 mt-1">✓ {kpiForm.employee_name}</div>
            )}
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Date</label>
            <input type="date" value={kpiForm.date}
              onChange={e => setKpiForm(p => ({ ...p, date: e.target.value }))}
              className="w-full bg-slate-800 text-white rounded-xl px-4 py-2.5 text-sm outline-none" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Station</label>
            <select value={kpiForm.station} onChange={e => setKpiForm(p => ({ ...p, station: e.target.value }))}
              className="w-full bg-slate-800 text-white rounded-xl px-4 py-2.5 text-sm outline-none">
              {STATIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Pieces Cut',   key: 'pieces_cut'    },
              { label: 'Sqft Cut',     key: 'sqft_cut'      },
              { label: 'QC Pass',      key: 'qc_pass_count' },
              { label: 'QC Fail',      key: 'qc_fail_count' },
              { label: 'Breakages',    key: 'breakage_count'},
              { label: 'Hours Worked', key: 'hours_worked'  },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-slate-400 mb-1 block">{f.label}</label>
                <input type="number" min="0" value={(kpiForm as any)[f.key]}
                  onChange={e => setKpiForm(p => ({ ...p, [f.key]: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-800 text-white rounded-xl px-3 py-2 text-sm outline-none" />
              </div>
            ))}
          </div>

          <button onClick={saveKPI} disabled={saving || !kpiForm.employee_id}
            className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save KPI Entry'}
          </button>

          {/* Recent logs */}
          {kpis.slice(0, 5).map(k => (
            <div key={k.id} className="bg-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-white text-sm">{k.employee_name}</div>
                <div className="text-[10px] text-slate-500">{k.date} · {k.station}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-white">{k.sqft_cut} sqft</div>
                <div className="text-[10px] text-slate-500">{k.pieces_cut} pcs</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkerKPIDashboard;
