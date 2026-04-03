import React, { useState, useEffect } from 'react';
import {
  Brain, Search, Loader2, RefreshCw, Plus,
  Mic, MessageCircle, TrendingUp, AlertTriangle,
  ChevronRight, X, CheckCircle2, Zap
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { semanticSearch, logMarketIntel, getNarrativeForTopic, logCausalChain } from '../agent/semanticService';

interface MarketIntel {
  id:         string;
  content:    string;
  source:     string;
  topic:      string;
  confidence: number;
  actioned:   boolean;
  created_at: string;
}

interface SemanticResult {
  id:            string;
  table_name:    string;
  summary:       string;
  semantic_tags: string[];
  risk_flags:    string[];
  entities:      Record<string, any>;
  created_at:    string;
}

const TOPIC_COLOR: Record<string, string> = {
  supply:      'bg-blue-500/20 text-blue-400',
  pricing:     'bg-yellow-500/20 text-yellow-400',
  competition: 'bg-red-500/20 text-red-400',
  regulation:  'bg-purple-500/20 text-purple-400',
  general:     'bg-slate-500/20 text-slate-400',
};

const SOURCE_ICON: Record<string, string> = {
  manual: '✍️', voice: '🎤', whatsapp: '💬', agent: '🤖',
};

const SemanticMemoryModule: React.FC = () => {
  const [tab, setTab]               = useState<'search' | 'intel' | 'causal'>('intel');
  const [query, setQuery]           = useState('');
  const [searching, setSearching]   = useState(false);
  const [results, setResults]       = useState<SemanticResult[]>([]);
  const [intel, setIntel]           = useState<MarketIntel[]>([]);
  const [loading, setLoading]       = useState(true);
  const [newIntel, setNewIntel]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [narrative, setNarrative]   = useState('');
  const [narrativeTopic, setNarrativeTopic] = useState('');
  const [genNarrative, setGenNarrative] = useState(false);
  const [listening, setListening]   = useState(false);
  const [causal, setCausal]         = useState<any[]>([]);

  useEffect(() => { if (tab === 'intel') loadIntel(); else if (tab === 'causal') loadCausal(); }, [tab]);

  const loadIntel = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('market_intelligence')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setIntel(data as MarketIntel[]);
    setLoading(false);
  };

  const loadCausal = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('causal_chains')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setCausal(data);
    setLoading(false);
  };

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    const res = await semanticSearch(query);
    setResults(res);
    setSearching(false);
  };

  const addIntel = async () => {
    if (!newIntel.trim()) return;
    setSaving(true);
    await logMarketIntel(newIntel.trim(), 'manual');
    setNewIntel('');
    await loadIntel();
    setSaving(false);
  };

  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Voice not supported in this browser');
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'ur-PK';
    rec.continuous = false;
    setListening(true);
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setNewIntel(text);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend   = () => setListening(false);
    rec.start();
  };

  const generateNarrative = async () => {
    if (!narrativeTopic.trim()) return;
    setGenNarrative(true);
    const n = await getNarrativeForTopic(narrativeTopic);
    setNarrative(n);
    setGenNarrative(false);
  };

  const markActioned = async (id: string) => {
    await supabase.from('market_intelligence').update({ actioned: true }).eq('id', id);
    setIntel(prev => prev.map(i => i.id === id ? { ...i, actioned: true } : i));
  };

  const byTopic = intel.reduce((acc: Record<string, number>, i) => {
    acc[i.topic] = (acc[i.topic] || 0) + 1; return acc;
  }, {});

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Semantic Memory</h2>
          <p className="text-xs text-slate-500 mt-0.5">Market intel · Causal chains · Smart search</p>
        </div>
        <button onClick={() => tab === 'intel' ? loadIntel() : loadCausal()}
          className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Topic pills */}
      {tab === 'intel' && Object.keys(byTopic).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(byTopic).map(([topic, count]) => (
            <button key={topic} onClick={() => { setNarrativeTopic(topic); setTab('intel'); }}
              className={`text-[11px] px-2.5 py-1 rounded-full font-bold ${TOPIC_COLOR[topic] || TOPIC_COLOR.general}`}>
              {topic} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
        {([['intel', 'Market Intel'], ['search', 'Semantic Search'], ['causal', 'Causal']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all
              ${tab === t ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── MARKET INTEL ── */}
      {tab === 'intel' && (
        <div className="space-y-3">
          {/* Add new */}
          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex gap-2">
              <textarea value={newIntel} onChange={e => setNewIntel(e.target.value)}
                rows={2} placeholder="Market intel type karo ya voice mein bolo..."
                className="flex-1 bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none resize-none placeholder-slate-500" />
              <button onClick={startVoice} disabled={listening}
                className={`px-3 rounded-xl transition-all ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-600 hover:bg-slate-500 text-slate-300'}`}>
                <Mic size={16} />
              </button>
            </div>
            <button onClick={addIntel} disabled={saving || !newIntel.trim()}
              className="w-full bg-white text-slate-900 font-bold py-2 rounded-xl text-sm disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save Intel
            </button>
          </div>

          {/* Narrative generator */}
          <div className="bg-slate-800 rounded-xl p-4 space-y-2">
            <div className="text-xs text-slate-400">AI Narrative — kisi topic ka summary</div>
            <div className="flex gap-2">
              <input value={narrativeTopic} onChange={e => setNarrativeTopic(e.target.value)}
                placeholder="e.g. 8mm glass, Ali Glass, rate..."
                className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
              <button onClick={generateNarrative} disabled={genNarrative || !narrativeTopic.trim()}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 rounded-lg text-sm disabled:opacity-40 flex items-center gap-1 transition-all">
                {genNarrative ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              </button>
            </div>
            {narrative && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-slate-300 leading-relaxed">
                {narrative}
              </div>
            )}
          </div>

          {/* Intel list */}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-500" /></div>
          ) : intel.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">Koi market intel nahi — add karo</div>
          ) : (
            <div className="space-y-2">
              {intel.map(item => (
                <div key={item.id} className={`bg-slate-800 rounded-xl p-4 space-y-2 ${item.actioned ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-white flex-1">{item.content}</p>
                    {!item.actioned && (
                      <button onClick={() => markActioned(item.id)}
                        className="text-slate-500 hover:text-green-400 transition-colors shrink-0">
                        <CheckCircle2 size={15} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm">{SOURCE_ICON[item.source] || '📝'}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${TOPIC_COLOR[item.topic] || TOPIC_COLOR.general}`}>
                      {item.topic}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      {new Date(item.created_at).toLocaleDateString('en-PK')}
                    </span>
                    {item.actioned && <span className="text-[10px] text-green-400">actioned ✓</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SEMANTIC SEARCH ── */}
      {tab === 'search' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="e.g. 8mm glass loss, Ali Glass delay, client payment..."
              className="flex-1 bg-slate-800 text-white rounded-xl px-4 py-3 text-sm outline-none placeholder-slate-500" />
            <button onClick={doSearch} disabled={searching}
              className="bg-white text-slate-900 px-4 rounded-xl font-bold text-sm disabled:opacity-40 flex items-center gap-1 transition-all">
              {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </div>
          {results.length === 0 && !searching && (
            <div className="text-center py-12 text-slate-500 text-sm">Search karo — semantic memory mein dhundh hoga</div>
          )}
          {results.map(r => (
            <div key={r.id} className="bg-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-white">{r.summary}</p>
                <span className="text-[10px] text-slate-500 shrink-0">{r.table_name}</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {r.semantic_tags?.map(tag => (
                  <span key={tag} className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">#{tag}</span>
                ))}
                {r.risk_flags?.map(flag => (
                  <span key={flag} className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">⚠️ {flag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CAUSAL CHAINS ── */}
      {tab === 'causal' && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-500" /></div>
          ) : causal.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">Koi active causal chains nahi</div>
          ) : (
            causal.map(c => (
              <div key={c.id} className="bg-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-orange-400 shrink-0" />
                  <span className="font-bold text-white text-sm capitalize">{c.trigger_event.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="bg-slate-700 px-2 py-0.5 rounded">{c.trigger_table}</span>
                  <ChevronRight size={12} />
                  <span className="bg-slate-700 px-2 py-0.5 rounded">{c.impact_type.replace(/_/g, ' ')}</span>
                </div>
                {c.impact_amount > 0 && (
                  <div className="text-sm text-red-400 font-bold">PKR {c.impact_amount.toLocaleString()} impact</div>
                )}
                <button onClick={async () => {
                  await supabase.from('causal_chains').update({ resolved: true }).eq('id', c.id);
                  setCausal(prev => prev.filter(x => x.id !== c.id));
                }} className="text-xs text-green-400 hover:text-green-300 transition-colors">
                  Mark resolved ✓
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SemanticMemoryModule;
