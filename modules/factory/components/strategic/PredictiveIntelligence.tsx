import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Loader2,
  RefreshCw, Zap, AlertTriangle, CheckCircle2,
  Building2, ChevronDown, ChevronUp, Target
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { generateScenarios, detectCrossEntitySignals, buildTemporalPredictions } from '../agent/scenarioEngine';

const SCENARIO_CONFIG = {
  optimistic:  { color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',   emoji: '📈' },
  base:        { color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',     emoji: '📊' },
  pessimistic: { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',       emoji: '📉' },
  risk:        { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', emoji: '⚠️' },
};

const SEVERITY_COLOR = { low: 'text-slate-400', medium: 'text-yellow-400', high: 'text-red-400', critical: 'text-red-500' };

const fmt = (n: number) => Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(Math.round(n));

const PredictiveIntelligence: React.FC = () => {
  const [tab, setTab]             = useState<'scenarios' | 'cross' | 'trends'>('scenarios');
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [signals, setSignals]     = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded]   = useState<string | null>(null);

  useEffect(() => {
    if (tab === 'scenarios') loadScenarios();
    else if (tab === 'cross') loadSignals();
    else loadPredictions();
  }, [tab]);

  const loadScenarios = async () => {
    setLoading(true);
    const { data } = await supabase.from('business_scenarios').select('*').eq('status', 'active').order('probability', { ascending: false });
    setScenarios(data || []);
    setLoading(false);
  };

  const loadSignals = async () => {
    setLoading(true);
    const { data } = await supabase.from('cross_entity_signals').select('*').eq('resolved', false).order('created_at', { ascending: false });
    setSignals(data || []);
    setLoading(false);
  };

  const loadPredictions = async () => {
    setLoading(true);
    const { data } = await supabase.from('temporal_predictions').select('*').order('created_at', { ascending: false }).limit(10);
    setPredictions(data || []);
    setLoading(false);
  };

  const runAll = async () => {
    setGenerating(true);
    await Promise.all([generateScenarios(), detectCrossEntitySignals(), buildTemporalPredictions()]);
    if (tab === 'scenarios') await loadScenarios();
    else if (tab === 'cross') await loadSignals();
    else await loadPredictions();
    setGenerating(false);
  };

  const acknowledgeScenario = async (id: string) => {
    await supabase.from('business_scenarios').update({ acknowledged: true, status: 'expired' }).eq('id', id);
    setScenarios(prev => prev.filter(s => s.id !== id));
  };

  const resolveSignal = async (id: string) => {
    await supabase.from('cross_entity_signals').update({ resolved: true }).eq('id', id);
    setSignals(prev => prev.filter(s => s.id !== id));
  };

  const TREND_ICON = (d: string) => d === 'up' ? <TrendingUp size={14} className="text-green-400" /> : d === 'down' ? <TrendingDown size={14} className="text-red-400" /> : <Minus size={14} className="text-slate-400" />;

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Predictive Intel</h2>
          <p className="text-xs text-slate-500 mt-0.5">Scenarios · Cross-entity · Trends</p>
        </div>
        <button onClick={runAll} disabled={generating}
          className="flex items-center gap-1.5 bg-white text-slate-900 font-bold text-xs px-3 py-2 rounded-xl disabled:opacity-50 transition-all">
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
          Generate
        </button>
      </div>

      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
        {([['scenarios','Scenarios'],['cross','Cross-Entity'],['trends','Trends']] as const).map(([t,label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all
              ${tab === t ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : (

        <>
          {/* ── SCENARIOS ── */}
          {tab === 'scenarios' && (
            scenarios.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <Target size={32} className="text-slate-600 mx-auto" />
                <p className="text-slate-500 text-sm">Generate button se scenarios banao</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scenarios.map(s => {
                  const cfg = SCENARIO_CONFIG[s.scenario_type as keyof typeof SCENARIO_CONFIG] || SCENARIO_CONFIG.base;
                  const isOpen = expanded === s.id;
                  const assumptions = (() => { try { return JSON.parse(s.key_assumptions || '[]'); } catch { return []; } })();
                  const actions     = (() => { try { return JSON.parse(s.actions || '[]'); } catch { return []; } })();

                  return (
                    <div key={s.id} className={`rounded-xl border overflow-hidden ${cfg.bg}`}>
                      <button onClick={() => setExpanded(isOpen ? null : s.id)}
                        className="w-full p-4 text-left space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{cfg.emoji}</span>
                            <div>
                              <div className={`font-black text-sm ${cfg.color} capitalize`}>{s.scenario_type}</div>
                              <div className="font-bold text-white text-sm">{s.title}</div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-xl font-black ${cfg.color}`}>{s.probability}%</div>
                            <div className="text-[10px] text-slate-500">{s.time_horizon}</div>
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 text-left">{s.description}</p>
                        <div className="flex items-center justify-between">
                          <div className={`text-sm font-bold ${s.financial_impact >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {s.financial_impact >= 0 ? '+' : ''}PKR {fmt(s.financial_impact)}
                          </div>
                          {isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/30">
                          {assumptions.length > 0 && (
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Key Assumptions</div>
                              {assumptions.map((a: string, i: number) => <p key={i} className="text-xs text-slate-400">• {a}</p>)}
                            </div>
                          )}
                          {actions.length > 0 && (
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Recommended Actions</div>
                              {actions.map((a: string, i: number) => <p key={i} className="text-xs text-white">→ {a}</p>)}
                            </div>
                          )}
                          <button onClick={() => acknowledgeScenario(s.id)}
                            className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold py-2 rounded-xl transition-all">
                            <CheckCircle2 size={13} /> Acknowledged
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ── CROSS-ENTITY ── */}
          {tab === 'cross' && (
            signals.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <Building2 size={32} className="text-slate-600 mx-auto" />
                <p className="text-slate-500 text-sm">Generate karo — cross-entity patterns dhundhe jaenge</p>
              </div>
            ) : (
              <div className="space-y-3">
                {signals.map(s => (
                  <div key={s.id} className="bg-slate-800 rounded-xl p-4 space-y-2 border border-slate-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {(s.entities || []).map((e: string) => (
                            <span key={e} className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{e}</span>
                          ))}
                        </div>
                        <div className="font-bold text-white text-sm">{s.title}</div>
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${SEVERITY_COLOR[s.severity] || ''}`}>{s.severity}</span>
                    </div>
                    <p className="text-xs text-slate-400">{s.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-500">
                        {s.days_to_impact && `Impact in ~${s.days_to_impact} days`}
                        {s.financial_impact > 0 && ` · PKR ${fmt(s.financial_impact)}`}
                      </div>
                      <button onClick={() => resolveSignal(s.id)}
                        className="text-xs text-green-400 hover:text-green-300 transition-colors">
                        Resolve ✓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── TRENDS ── */}
          {tab === 'trends' && (
            predictions.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <TrendingUp size={32} className="text-slate-600 mx-auto" />
                <p className="text-slate-500 text-sm">Generate karo — trend predictions banegi</p>
              </div>
            ) : (
              <div className="space-y-2">
                {predictions.map(p => (
                  <div key={p.id} className="bg-slate-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="shrink-0">{TREND_ICON(p.trend_direction)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-sm capitalize">{p.metric} — {p.entity}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{p.basis}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-white">PKR {fmt(p.predicted_value)}</div>
                      <div className="text-[10px] text-slate-500">{p.confidence}% confident</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
};

export default PredictiveIntelligence;
