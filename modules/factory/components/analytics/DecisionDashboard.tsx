// ═══════════════════════════════════════════════════════════════════
// Decision Dashboard — Agent accuracy, confidence trends, overrides
// Shows learning maturity, outcome distribution, rule performance
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, AlertTriangle, Brain, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

interface AgentStats {
  agent_type:     string;
  total:          number;
  confirmed:      number;
  overridden:     number;
  amended:        number;
  with_outcome:   number;
  good_outcomes:  number;
  accuracy:       number;
  avg_confidence: number;
  maturity:       string;
}

interface OverriddenRule {
  rule_id:        string;
  condition_text: string;
  override_count: number;
  success_rate:   number;
}

const MATURITY_LABEL = (total: number): string =>
  total < 5 ? 'New' : total < 20 ? 'Learning' : total < 50 ? 'Competent' : 'Expert';

const MATURITY_COLOR: Record<string, string> = {
  New: 'bg-red-500/20 text-red-400', Learning: 'bg-yellow-500/20 text-yellow-400',
  Competent: 'bg-blue-500/20 text-blue-400', Expert: 'bg-green-500/20 text-green-400',
};

const DecisionDashboard: React.FC = () => {
  const [stats, setStats]         = useState<AgentStats[]>([]);
  const [overrides, setOverrides] = useState<OverriddenRule[]>([]);
  const [loading, setLoading]     = useState(true);
  const [period, setPeriod]       = useState<30 | 60 | 90>(30);

  useEffect(() => { load(); }, [period]);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - period * 86400000).toISOString();

    // Fetch all decisions in period
    const { data: decisions } = await supabase
      .from('agent_episodic_memory')
      .select('agent_type, decision_type, confidence_score, outcome, owner_feedback')
      .gte('created_at', since);

    // Group by agent
    const grouped: Record<string, typeof decisions> = {};
    (decisions || []).forEach((d: any) => {
      if (!grouped[d.agent_type]) grouped[d.agent_type] = [];
      grouped[d.agent_type].push(d);
    });

    const agentStats: AgentStats[] = Object.entries(grouped).map(([agent, decs]) => {
      const confirmed  = decs.filter((d: any) => d.owner_feedback === 'confirmed').length;
      const overridden = decs.filter((d: any) => d.owner_feedback === 'overridden').length;
      const amended    = decs.filter((d: any) => d.owner_feedback === 'amended').length;
      const withOutcome = decs.filter((d: any) => d.outcome).length;
      const goodOutcomes = decs.filter((d: any) => ['success', 'paid'].includes(d.outcome)).length;
      const avgConf = decs.reduce((s: number, d: any) => s + (d.confidence_score || 0), 0) / Math.max(1, decs.length);

      return {
        agent_type:     agent,
        total:          decs.length,
        confirmed,
        overridden,
        amended,
        with_outcome:   withOutcome,
        good_outcomes:  goodOutcomes,
        accuracy:       withOutcome > 0 ? Math.round((goodOutcomes / withOutcome) * 100) : 0,
        avg_confidence: Math.round(avgConf * 100) / 100,
        maturity:       MATURITY_LABEL(decs.length),
      };
    });

    setStats(agentStats);

    // Fetch most overridden rules
    const { data: rules } = await supabase
      .from('agent_procedural_memory')
      .select('rule_id, condition_text, override_count, success_rate')
      .gt('override_count', 0)
      .order('override_count', { ascending: false })
      .limit(5);
    setOverrides((rules || []) as OverriddenRule[]);

    setLoading(false);
  };

  const totals = stats.reduce((acc, s) => ({
    decisions: acc.decisions + s.total,
    confirmed: acc.confirmed + s.confirmed,
    overridden: acc.overridden + s.overridden,
  }), { decisions: 0, confirmed: 0, overridden: 0 });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-purple-400" />
          <span className="font-bold text-white text-sm">Decision Intelligence</span>
        </div>
        <div className="flex items-center gap-2">
          {[30, 60, 90].map(p => (
            <button key={p} onClick={() => setPeriod(p as any)}
              className={`text-[10px] px-2 py-1 rounded ${period === p ? 'bg-purple-500/20 text-purple-300' : 'text-slate-500 hover:text-slate-300'}`}>
              {p}d
            </button>
          ))}
          <button onClick={load} className="text-slate-400 hover:text-white ml-1">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-xl px-3 py-2.5">
          <div className="text-[10px] text-slate-500">Total Decisions</div>
          <div className="text-lg font-bold text-white">{totals.decisions}</div>
        </div>
        <div className="bg-slate-800 rounded-xl px-3 py-2.5">
          <div className="text-[10px] text-slate-500">Confirmed</div>
          <div className="text-lg font-bold text-green-400">{totals.confirmed}</div>
        </div>
        <div className="bg-slate-800 rounded-xl px-3 py-2.5">
          <div className="text-[10px] text-slate-500">Overridden</div>
          <div className="text-lg font-bold text-red-400">{totals.overridden}</div>
        </div>
      </div>

      {/* Per-Agent Stats */}
      <div className="space-y-2">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest">Agent Performance</div>
        {stats.length === 0 ? (
          <p className="text-xs text-slate-600 py-4 text-center">No decisions recorded yet in this period</p>
        ) : stats.map(s => (
          <div key={s.agent_type} className="bg-slate-800 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white capitalize">{s.agent_type}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${MATURITY_COLOR[s.maturity]}`}>
                  {s.maturity}
                </span>
              </div>
              <span className="text-xs text-slate-400">{s.total} decisions</span>
            </div>

            {/* Accuracy bar */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-16">Accuracy</span>
              <div className="flex-1 bg-slate-700 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${s.accuracy >= 75 ? 'bg-green-500' : s.accuracy >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, s.accuracy)}%` }} />
              </div>
              <span className="text-[10px] text-slate-400 w-8 text-right">{s.accuracy}%</span>
            </div>

            {/* Confidence bar */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-16">Confidence</span>
              <div className="flex-1 bg-slate-700 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-purple-500"
                  style={{ width: `${Math.min(100, s.avg_confidence * 100)}%` }} />
              </div>
              <span className="text-[10px] text-slate-400 w-8 text-right">{Math.round(s.avg_confidence * 100)}%</span>
            </div>

            {/* Feedback breakdown */}
            <div className="flex gap-3 text-[10px]">
              <span className="text-green-400">{s.confirmed} confirmed</span>
              <span className="text-yellow-400">{s.amended} amended</span>
              <span className="text-red-400">{s.overridden} overridden</span>
            </div>
          </div>
        ))}
      </div>

      {/* Most Overridden Rules */}
      {overrides.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-[10px] text-orange-400 uppercase tracking-widest">
            <AlertTriangle size={10} />
            Rules Most Overridden (review needed)
          </div>
          {overrides.map(r => (
            <div key={r.rule_id} className="bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-300 font-mono">{r.rule_id}</span>
                <span className="text-[10px] text-orange-400">{r.override_count}x overridden</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">{r.condition_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DecisionDashboard;
