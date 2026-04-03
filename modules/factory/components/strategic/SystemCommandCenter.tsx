import React, { useState, useEffect } from 'react';
import {
  Activity, Loader2, RefreshCw, CheckCircle2,
  AlertTriangle, Wrench, Play, Mic, MicOff,
  FileText, TrendingUp, TrendingDown, Minus,
  Plus, X, ChevronRight
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { logMarketIntel } from '../agent/semanticService';

const STATUS_CONFIG = {
  ok:      { color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',   icon: CheckCircle2 },
  warning: { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: AlertTriangle },
  error:   { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',       icon: AlertTriangle },
  fixed:   { color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',     icon: Wrench },
};

const TREND_ICON = (t: string) => t === 'up' ? <TrendingUp size={12} className="text-green-400" /> : t === 'down' ? <TrendingDown size={12} className="text-red-400" /> : <Minus size={12} className="text-slate-400" />;

const SystemCommandCenter: React.FC = () => {
  const [tab, setTab]             = useState<'health' | 'contracts' | 'voice'>('health');
  const [healthLog, setHealthLog] = useState<any[]>([]);
  const [repairQ, setRepairQ]     = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [voiceLogs, setVoiceLogs] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [running, setRunning]     = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showAddContract, setShowAddContract] = useState(false);
  const [contractForm, setContractForm] = useState({
    vendor_name: '', agreed_rate: '', payment_terms: 'Net 30', delivery_days: '7', renewal_date: '',
  });

  useEffect(() => {
    if (tab === 'health')     loadHealth();
    else if (tab === 'contracts') loadContracts();
    else loadVoice();
  }, [tab]);

  const loadHealth = async () => {
    setLoading(true);
    const [{ data: h }, { data: r }] = await Promise.all([
      supabase.from('system_health_log').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('repair_queue').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    ]);
    setHealthLog(h || []);
    setRepairQ(r || []);
    setLoading(false);
  };

  const loadContracts = async () => {
    setLoading(true);
    const { data } = await supabase.from('vendor_contracts').select('*').eq('status', 'active').order('current_score');
    setContracts(data || []);
    setLoading(false);
  };

  const loadVoice = async () => {
    setLoading(true);
    const { data } = await supabase.from('voice_intel_log').select('*').order('created_at', { ascending: false }).limit(20);
    setVoiceLogs(data || []);
    setLoading(false);
  };

  const runSelfHeal = async () => {
    setRunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/self-heal`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      await loadHealth();
    } catch {}
    setRunning(false);
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice not supported in this browser'); return; }
    const rec = new SR();
    rec.lang = 'ur-PK';
    rec.continuous = false;
    setListening(true);
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setTranscript(text);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend   = () => setListening(false);
    rec.start();
  };

  const processVoice = async () => {
    if (!transcript.trim()) return;
    setProcessing(true);

    // Classify with Claude
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 200,
        system: 'Classify this voice note from a Pakistani business owner. Return JSON only: { "intent": string, "market_intel": string or null, "erp_actions": array, "confidence": 0-100 }',
        messages: [{ role: 'user', content: transcript }],
      }),
    });
    const d    = await res.json();
    const text = d.content?.[0]?.text || '{}';
    let classified: any = {};
    try { classified = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch {}

    // Save to voice log
    await supabase.from('voice_intel_log').insert({
      transcription: transcript,
      source:        'owner',
      intent:        classified.intent || 'unknown',
      erp_actions:   JSON.stringify(classified.erp_actions || []),
      market_intel:  classified.market_intel || null,
      confidence:    classified.confidence || 80,
      processed:     true,
      created_at:    new Date().toISOString(),
    });

    // If market intel — save to semantic memory
    if (classified.market_intel) {
      await logMarketIntel(classified.market_intel, 'voice');
    }

    setTranscript('');
    setProcessing(false);
    await loadVoice();
  };

  const saveContract = async () => {
    if (!contractForm.vendor_name.trim()) return;
    await supabase.from('vendor_contracts').insert({
      vendor_name:   contractForm.vendor_name,
      company:       'GlassCo',
      agreed_rate:   Number(contractForm.agreed_rate) || null,
      payment_terms: contractForm.payment_terms,
      delivery_days: Number(contractForm.delivery_days),
      renewal_date:  contractForm.renewal_date || null,
      current_score: 100,
      score_trend:   'stable',
      sla_compliance: 100,
      status:        'active',
      created_at:    new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    });
    setContractForm({ vendor_name: '', agreed_rate: '', payment_terms: 'Net 30', delivery_days: '7', renewal_date: '' });
    setShowAddContract(false);
    await loadContracts();
  };

  const overallHealth = healthLog.length === 0 ? 'ok' : healthLog[0]?.status || 'ok';
  const cfg = STATUS_CONFIG[overallHealth as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.ok;
  const HealthIcon = cfg.icon;

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">System Command</h2>
          <p className="text-xs text-slate-500 mt-0.5">Health · Contracts · Voice</p>
        </div>
        <button onClick={() => tab === 'health' ? loadHealth() : tab === 'contracts' ? loadContracts() : loadVoice()}
          className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
        {([['health','Health'],['contracts','Contracts'],['voice','Voice']] as const).map(([t,label]) => (
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
          {/* ── HEALTH ── */}
          {tab === 'health' && (
            <div className="space-y-3">
              <div className={`rounded-xl border p-4 flex items-center justify-between ${cfg.bg}`}>
                <div className="flex items-center gap-3">
                  <HealthIcon size={18} className={cfg.color} />
                  <div>
                    <div className={`font-black text-sm ${cfg.color} uppercase`}>{overallHealth}</div>
                    <div className="text-xs text-slate-500">System status</div>
                  </div>
                </div>
                <button onClick={runSelfHeal} disabled={running}
                  className="flex items-center gap-1.5 bg-white text-slate-900 font-bold text-xs px-3 py-2 rounded-xl disabled:opacity-50 transition-all">
                  {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  Run Scan
                </button>
              </div>

              {repairQ.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-500 uppercase tracking-widest">Needs Attention</div>
                  {repairQ.map(r => (
                    <div key={r.id} className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
                      <div className="font-bold text-white text-sm">{r.issue_type.replace(/_/g,' ')}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{r.description}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs text-slate-500 uppercase tracking-widest">Recent Checks</div>
                {healthLog.slice(0, 8).map(h => {
                  const hcfg = STATUS_CONFIG[h.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.ok;
                  const HIcon = hcfg.icon;
                  return (
                    <div key={h.id} className="bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                      <HIcon size={14} className={hcfg.color} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white">{h.details}</div>
                        <div className="text-[10px] text-slate-600">{h.check_type} · {new Date(h.created_at).toLocaleString('en-PK')}</div>
                      </div>
                      {h.auto_fixed && <span className="text-[10px] text-blue-400 shrink-0">auto-fixed</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── LIVING CONTRACTS ── */}
          {tab === 'contracts' && (
            <div className="space-y-3">
              <button onClick={() => setShowAddContract(true)}
                className="w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-bold text-sm py-2.5 rounded-xl transition-all">
                <Plus size={14} /> Add Contract
              </button>

              {showAddContract && (
                <div className="bg-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">New Vendor Contract</span>
                    <button onClick={() => setShowAddContract(false)}><X size={14} className="text-slate-400" /></button>
                  </div>
                  {[
                    { key: 'vendor_name', label: 'Vendor Name', type: 'text' },
                    { key: 'agreed_rate', label: 'Agreed Rate (PKR)', type: 'number' },
                    { key: 'payment_terms', label: 'Payment Terms', type: 'text' },
                    { key: 'delivery_days', label: 'Delivery Days', type: 'number' },
                    { key: 'renewal_date', label: 'Renewal Date', type: 'date' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] text-slate-400 uppercase">{f.label}</label>
                      <input type={f.type} value={(contractForm as any)[f.key]}
                        onChange={e => setContractForm(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none mt-0.5" />
                    </div>
                  ))}
                  <button onClick={saveContract}
                    className="w-full bg-white text-slate-900 font-bold py-2 rounded-xl text-sm">Save</button>
                </div>
              )}

              {contracts.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">Koi contracts nahi — add karo</div>
              ) : (
                <div className="space-y-2">
                  {contracts.map(c => (
                    <div key={c.id} className="bg-slate-800 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-white text-sm">{c.vendor_name}</div>
                          <div className="text-xs text-slate-500">{c.payment_terms} · {c.delivery_days}d delivery</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-black ${c.current_score >= 80 ? 'text-green-400' : c.current_score >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {c.current_score}
                          </div>
                          <div className="flex items-center gap-1 justify-end">{TREND_ICON(c.score_trend)}<span className="text-[10px] text-slate-500">score</span></div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-slate-700 rounded-lg px-3 py-1.5 text-center">
                          <div className="text-xs font-bold text-white">{c.sla_compliance}%</div>
                          <div className="text-[9px] text-slate-500">SLA compliance</div>
                        </div>
                        {c.renewal_date && (
                          <div className={`flex-1 rounded-lg px-3 py-1.5 text-center ${new Date(c.renewal_date) < new Date(Date.now() + 30 * 86400000) ? 'bg-orange-500/20' : 'bg-slate-700'}`}>
                            <div className={`text-xs font-bold ${new Date(c.renewal_date) < new Date(Date.now() + 30 * 86400000) ? 'text-orange-400' : 'text-white'}`}>
                              {new Date(c.renewal_date).toLocaleDateString('en-PK')}
                            </div>
                            <div className="text-[9px] text-slate-500">renewal</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── VOICE INTELLIGENCE ── */}
          {tab === 'voice' && (
            <div className="space-y-3">
              <div className="bg-slate-800 rounded-xl p-4 space-y-3">
                <div className="text-xs text-slate-400">Voice note record karo — agent process karega</div>
                <div className="flex gap-2">
                  <button onClick={listening ? undefined : startVoice} disabled={processing}
                    className={`flex-1 flex items-center justify-center gap-2 font-bold text-sm py-3 rounded-xl transition-all
                      ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}>
                    {listening ? <><MicOff size={16} /> Listening...</> : <><Mic size={16} /> Start Recording</>}
                  </button>
                </div>
                {transcript && (
                  <div className="bg-slate-700 rounded-xl p-3 space-y-2">
                    <div className="text-xs text-slate-400">Transcription:</div>
                    <p className="text-sm text-white">{transcript}</p>
                    <div className="flex gap-2">
                      <button onClick={processVoice} disabled={processing}
                        className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm py-2 rounded-xl transition-all disabled:opacity-50">
                        {processing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                        Process
                      </button>
                      <button onClick={() => setTranscript('')}
                        className="px-4 bg-slate-600 text-slate-300 rounded-xl text-sm transition-all">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {voiceLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">Koi voice logs nahi</div>
              ) : (
                <div className="space-y-2">
                  {voiceLogs.map(v => (
                    <div key={v.id} className="bg-slate-800 rounded-xl p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-400 capitalize">{v.intent?.replace(/_/g,' ') || 'processed'}</span>
                        <span className="text-[10px] text-slate-600">{new Date(v.created_at).toLocaleString('en-PK')}</span>
                      </div>
                      <p className="text-sm text-white">"{v.transcription}"</p>
                      {v.market_intel && <p className="text-xs text-yellow-400">📊 Intel: {v.market_intel}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SystemCommandCenter;
