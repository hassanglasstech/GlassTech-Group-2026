import React, { useState, useEffect } from 'react';
import {
  Brain, Loader2, RefreshCw, Plus, X,
  TrendingUp, Clock, AlertTriangle,
  BookOpen, Zap, ChevronRight, Check,
  Eye, Shield
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { analyzeDecisionPatterns, addOrgMemory, searchOrgMemory } from '../agent/decisionLearning';
import { generateUncomfortableTruths } from '../agent/adversarialIntelligence';

const IMPORTANCE_STYLE: Record<string, string> = {
  critical: 'border-red-500/30 bg-red-500/5 text-red-400',
  high:     'border-orange-500/30 bg-orange-500/5 text-orange-400',
  medium:   'border-blue-500/30 bg-blue-500/5 text-blue-400',
  low:      'border-slate-600 bg-slate-800 text-slate-400',
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-400', high: 'text-orange-400', medium: 'text-yellow-400', low: 'text-slate-400',
};

const ORG_CATEGORIES = ['vendor','client','process','lesson','rule','context'];

const IntelligenceDashboard: React.FC = () => {
  const [tab, setTab]             = useState<'patterns' | 'memory' | 'truths'>('truths');
  const [loading, setLoading]     = useState(false);
  const [patterns, setPatterns]   = useState<any>(null);
  const [memory, setMemory]       = useState<any[]>([]);
  const [truths, setTruths]       = useState<any[]>([]);
  const [searchQ, setSearchQ]     = useState('');
  const [searching, setSearching] = useState(false);
  const [showAdd, setShowAdd]     = useState(false);
  const [genTruths, setGenTruths] = useState(false);
  const [form, setForm]           = useState({ category: 'vendor', title: '', content: '', importance: 'medium' });

  // ERP context for truth generation
  const [erpCtx, setErpCtx]       = useState('');

  useEffect(() => {
    if (tab === 'patterns') loadPatterns();
    else if (tab === 'memory') loadMemory();
    else loadTruths();
  }, [tab]);

  const loadPatterns = async () => {
    setLoading(true);
    const p = await analyzeDecisionPatterns();
    setPatterns(p);
    setLoading(false);
  };

  const loadMemory = async () => {
    setLoading(true);
    const { data } = await supabase.from('org_memory').select('*').order('importance').order('created_at', { ascending: false }).limit(30);
    setMemory(data || []);
    setLoading(false);
  };

  const loadTruths = async () => {
    setLoading(true);
    const { data } = await supabase.from('uncomfortable_truths').select('*').eq('acknowledged', false).order('created_at', { ascending: false });
    setTruths(data || []);
    setLoading(false);
  };

  const doSearch = async () => {
    if (!searchQ.trim()) { await loadMemory(); return; }
    setSearching(true);
    const res = await searchOrgMemory(searchQ);
    setMemory(res);
    setSearching(false);
  };

  const saveMemory = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    await addOrgMemory({ ...form });
    setForm({ category: 'vendor', title: '', content: '', importance: 'medium' });
    setShowAdd(false);
    await loadMemory();
  };

  const acknowledge = async (id: string) => {
    await supabase.from('uncomfortable_truths').update({ acknowledged: true }).eq('id', id);
    setTruths(prev => prev.filter(t => t.id !== id));
  };

  const generateTruths = async () => {
    setGenTruths(true);
    // Build basic ERP context
    const { count: openEvents } = await supabase.from('factory_events').select('id', { count: 'exact', head: true }).in('status', ['Open','Pending']);
    const { count: openTasks  } = await supabase.from('agent_tasks').select('id', { count: 'exact', head: true }).in('status', ['Open','In Progress']);
    const ctx = `Open factory events: ${openEvents || 0}\nOpen tasks: ${openTasks || 0}`;
    await generateUncomfortableTruths(ctx);
    await loadTruths();
    setGenTruths(false);
  };

  const HOUR_LABELS = ['12am','1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm'];

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Intelligence</h2>
          <p className="text-xs text-slate-500 mt-0.5">Decision patterns · Org memory · Truth engine</p>
        </div>
        <button onClick={() => tab === 'patterns' ? loadPatterns() : tab === 'memory' ? loadMemory() : loadTruths()}
          className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
        {([['truths','Truths'],['patterns','Decisions'],['memory','Org Memory']] as const).map(([t,label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all
              ${tab === t ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── UNCOMFORTABLE TRUTHS ── */}
      {tab === 'truths' && (
        <div className="space-y-3">
          <button onClick={generateTruths} disabled={genTruths}
            className="w-full flex items-center justify-center gap-2 bg-orange-500/20 border border-orange-500/30 text-orange-400 font-bold text-sm py-3 rounded-xl transition-all disabled:opacity-50">
            {genTruths ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            Generate Uncomfortable Truths
          </button>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-500" /></div>
          ) : truths.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Shield size={32} className="text-green-400 mx-auto" />
              <p className="text-slate-400 text-sm">Koi uncomfortable truths nahi — ya sab acknowledged hain</p>
            </div>
          ) : (
            <div className="space-y-3">
              {truths.map(t => (
                <div key={t.id} className={`rounded-xl border p-4 space-y-2`}
                  style={{ borderColor: t.severity === 'critical' ? 'rgba(239,68,68,0.3)' : t.severity === 'high' ? 'rgba(234,88,12,0.3)' : 'rgba(71,85,105,0.5)', background: t.severity === 'critical' ? 'rgba(239,68,68,0.05)' : 'rgba(30,41,59,1)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className={`text-xs font-bold uppercase tracking-widest ${SEVERITY_COLOR[t.severity]}`}>{t.severity} · {t.category}</div>
                      <div className="font-bold text-white text-sm mt-1">{t.title}</div>
                    </div>
                    <button onClick={() => acknowledge(t.id)} className="text-slate-500 hover:text-green-400 transition-colors shrink-0 mt-1">
                      <Check size={15} />
                    </button>
                  </div>
                  <p className="text-sm text-slate-300">{t.finding}</p>
                  <div className="text-[10px] text-slate-600">{new Date(t.created_at).toLocaleDateString('en-PK')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DECISION PATTERNS ── */}
      {tab === 'patterns' && (
        loading ? <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
        : !patterns ? null : (
          <div className="space-y-3">
            <div className="bg-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs text-slate-500 uppercase tracking-widest">Overview</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="text-2xl font-black text-white">{patterns.totalDecisions}</div>
                  <div className="text-[10px] text-slate-500">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-white">{100 - patterns.overrideRate}%</div>
                  <div className="text-[10px] text-slate-500">Agent Accuracy</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-white">
                    {patterns.speedPattern.avgSeconds > 3600
                      ? `${Math.round(patterns.speedPattern.avgSeconds / 3600)}h`
                      : patterns.speedPattern.avgSeconds > 60
                      ? `${Math.round(patterns.speedPattern.avgSeconds / 60)}m`
                      : `${patterns.speedPattern.avgSeconds}s`}
                  </div>
                  <div className="text-[10px] text-slate-500">Avg Decision</div>
                </div>
              </div>
            </div>

            {/* Best/Worst time */}
            <div className="bg-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs text-slate-500 uppercase tracking-widest">Decision Timing</div>
              <div className="flex gap-2">
                <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                  <div className="text-lg font-black text-green-400">{HOUR_LABELS[patterns.timePattern.bestHour]}</div>
                  <div className="text-[10px] text-green-400">Best time</div>
                </div>
                <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                  <div className="text-lg font-black text-red-400">{HOUR_LABELS[patterns.timePattern.worstHour]}</div>
                  <div className="text-[10px] text-red-400">Avoid</div>
                </div>
              </div>
            </div>

            {/* Insights */}
            {patterns.insights.length > 0 && (
              <div className="space-y-2">
                {patterns.insights.map((insight: string, i: number) => (
                  <div key={i} className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
                    <p className="text-sm text-blue-300">{insight}</p>
                  </div>
                ))}
              </div>
            )}

            {patterns.totalDecisions < 10 && (
              <p className="text-center text-xs text-slate-600 py-4">
                {10 - patterns.totalDecisions} aur decisions ke baad deeper patterns milenge
              </p>
            )}
          </div>
        )
      )}

      {/* ── ORG MEMORY ── */}
      {tab === 'memory' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="Search org memory..."
              className="flex-1 bg-slate-800 text-white rounded-xl px-4 py-2.5 text-sm outline-none placeholder-slate-500" />
            <button onClick={() => setShowAdd(true)}
              className="bg-white text-slate-900 px-4 rounded-xl font-bold text-sm transition-all">
              <Plus size={15} />
            </button>
          </div>

          {showAdd && (
            <div className="bg-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">Add to Org Memory</span>
                <button onClick={() => setShowAdd(false)}><X size={14} className="text-slate-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="bg-slate-700 text-white rounded-lg px-3 py-2 text-xs outline-none">
                  {ORG_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <select value={form.importance} onChange={e => setForm(p => ({ ...p, importance: e.target.value }))}
                  className="bg-slate-700 text-white rounded-lg px-3 py-2 text-xs outline-none">
                  {['low','medium','high','critical'].map(i => <option key={i}>{i}</option>)}
                </select>
              </div>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Title" className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
              <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                rows={3} placeholder="Content — kya yaad rakhna chahiye..."
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none" />
              <button onClick={saveMemory} disabled={!form.title.trim() || !form.content.trim()}
                className="w-full bg-white text-slate-900 font-bold py-2 rounded-xl text-sm disabled:opacity-40">
                Save
              </button>
            </div>
          )}

          {loading || searching ? (
            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-500" /></div>
          ) : memory.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">Koi org memory nahi — add karo</div>
          ) : (
            <div className="space-y-2">
              {memory.map(m => (
                <div key={m.id} className={`rounded-xl border p-4 space-y-1 ${IMPORTANCE_STYLE[m.importance] || IMPORTANCE_STYLE.medium}`}
                  style={{ borderColor: 'rgba(71,85,105,0.4)', background: 'rgba(30,41,59,1)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{m.category}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${IMPORTANCE_STYLE[m.importance]}`}>{m.importance}</span>
                  </div>
                  <div className="font-bold text-white text-sm">{m.title}</div>
                  <p className="text-xs text-slate-400">{m.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IntelligenceDashboard;
