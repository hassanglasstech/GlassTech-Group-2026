import React, { useState, useEffect } from 'react';
import {
  Globe, Loader2, RefreshCw, Play, TrendingUp,
  TrendingDown, Minus, AlertTriangle, Info,
  Eye, CheckCircle2, Plus, ChevronDown, ChevronUp
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

interface BriefItem {
  category:        string;
  headline:        string;
  detail:          string;
  business_impact: string;
  action:          string;
  severity:        'info' | 'watch' | 'urgent';
  source:          string;
}

interface MarketBrief {
  id:           string;
  brief_date:   string;
  items:        string;
  summary:      string;
  generated_at: string;
  delivered_wa: boolean;
  acknowledged: boolean;
}

interface Price {
  id:            string;
  commodity:     string;
  price:         number;
  unit:          string;
  change_pct:    number;
  trend:         string;
  recorded_date: string;
  notes:         string;
}

const SEVERITY_CONFIG = {
  urgent: { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',     icon: AlertTriangle },
  watch:  { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: Eye },
  info:   { color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',   icon: Info },
};

const CAT_EMOJI: Record<string, string> = {
  glass: '🪟', aluminium: '🔩', fuel: '⛽', currency: '💱',
  construction: '🏗️', electricity: '⚡', competitor: '🎯', general: '📰',
};

const COMMODITY_LABELS: Record<string, string> = {
  float_glass_8mm:   '8mm Glass',
  float_glass_6mm:   '6mm Glass',
  aluminium_lme:     'Aluminium LME',
  petrol_pk:         'Petrol',
  diesel_pk:         'Diesel',
  usd_pkr:           'USD/PKR',
  electricity_nepra: 'Electricity',
};

const TREND_ICON = (t: string) =>
  t === 'up'   ? <TrendingUp size={12} className="text-red-400" /> :
  t === 'down' ? <TrendingDown size={12} className="text-green-400" /> :
  <Minus size={12} className="text-slate-400" />;

const MarketBriefModule: React.FC = () => {
  const [tab, setTab]           = useState<'brief' | 'prices' | 'history'>('brief');
  const [brief, setBrief]       = useState<MarketBrief | null>(null);
  const [prices, setPrices]     = useState<Price[]>([]);
  const [history, setHistory]   = useState<MarketBrief[]>([]);
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [priceEdit, setPriceEdit] = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (tab === 'brief')   loadBrief();
    else if (tab === 'prices')  loadPrices();
    else loadHistory();
  }, [tab]);

  const loadBrief = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('market_briefs').select('*').eq('brief_date', today).single();
    setBrief(data as MarketBrief || null);
    setLoading(false);
  };

  const loadPrices = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('market_prices').select('*')
      .order('recorded_date', { ascending: false });
    // Deduplicate by commodity (latest only)
    const seen = new Set<string>();
    const latest = (data || []).filter((p: any) => {
      if (seen.has(p.commodity)) return false;
      seen.add(p.commodity); return true;
    });
    setPrices(latest as Price[]);
    setLoading(false);
  };

  const loadHistory = async () => {
    setLoading(true);
    const { data } = await supabase.from('market_briefs').select('*').order('brief_date', { ascending: false }).limit(10);
    setHistory((data || []) as MarketBrief[]);
    setLoading(false);
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-brief`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      await loadBrief();
    } catch {}
    setGenerating(false);
  };

  const savePrice = async (commodity: string) => {
    const val = priceEdit[commodity];
    if (!val) return;
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    const prev  = prices.find(p => p.commodity === commodity);
    const changePct = prev?.price ? Math.round(((Number(val) - prev.price) / prev.price) * 100 * 10) / 10 : 0;
    await supabase.from('market_prices').upsert({
      commodity,
      price:         Number(val),
      unit:          prev?.unit || 'PKR',
      source:        'manual',
      change_pct:    changePct,
      trend:         changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'stable',
      recorded_date: today,
      created_at:    new Date().toISOString(),
    }, { onConflict: 'commodity,recorded_date' });
    setPriceEdit(p => ({ ...p, [commodity]: '' }));
    await loadPrices();
    setSaving(false);
  };

  const acknowledge = async (id: string) => {
    await supabase.from('market_briefs').update({ acknowledged: true }).eq('id', id);
    setBrief(prev => prev ? { ...prev, acknowledged: true } : null);
  };

  const parsedItems = (): BriefItem[] => {
    if (!brief?.items) return [];
    try { return JSON.parse(brief.items); } catch { return []; }
  };

  const items    = parsedItems();
  const urgent   = items.filter(i => i.severity === 'urgent').length;
  const watch    = items.filter(i => i.severity === 'watch').length;

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Market Intel</h2>
          <p className="text-xs text-slate-500 mt-0.5">Glass · Aluminium · Fuel · News</p>
        </div>
        <button onClick={() => tab === 'brief' ? loadBrief() : tab === 'prices' ? loadPrices() : loadHistory()}
          className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
        {([['brief','Today'],['prices','Prices'],['history','History']] as const).map(([t,label]) => (
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
          {/* ── TODAY'S BRIEF ── */}
          {tab === 'brief' && (
            <div className="space-y-3">
              <button onClick={generate} disabled={generating}
                className="w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-bold text-sm py-3 rounded-xl disabled:opacity-50 transition-all">
                {generating ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />}
                {generating ? 'Searching market news...' : "Generate Today's Brief"}
              </button>

              {!brief ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  Generate karo — AI market news fetch karega aur WhatsApp pe bhejega
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Status bar */}
                  <div className="flex items-center gap-2">
                    <div className={`text-xs px-3 py-1.5 rounded-full font-bold ${urgent > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                      {urgent > 0 ? `🚨 ${urgent} urgent` : '✅ All clear'}
                    </div>
                    {watch > 0 && <div className="text-xs px-3 py-1.5 rounded-full font-bold bg-yellow-500/20 text-yellow-400">👀 {watch} watch</div>}
                    {brief.delivered_wa && <div className="text-xs text-slate-500">WA sent ✓</div>}
                    {!brief.acknowledged && (
                      <button onClick={() => acknowledge(brief.id)} className="ml-auto text-xs text-slate-500 hover:text-green-400 transition-colors">
                        <CheckCircle2 size={15} />
                      </button>
                    )}
                  </div>

                  {items.length === 0 ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                      <p className="text-green-400 text-sm font-bold">✅ Koi significant news nahi aaj</p>
                      <p className="text-xs text-slate-500 mt-1">Business as usual</p>
                    </div>
                  ) : (
                    items.map((item, i) => {
                      const cfg  = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.info;
                      const Icon = cfg.icon;
                      const key  = `${i}`;
                      return (
                        <div key={key} className={`rounded-xl border overflow-hidden ${cfg.bg}`}>
                          <button onClick={() => setExpanded(expanded === key ? null : key)}
                            className="w-full p-4 text-left">
                            <div className="flex items-start gap-3">
                              <span className="text-lg shrink-0">{CAT_EMOJI[item.category] || '📰'}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold uppercase ${cfg.color}`}>{item.severity}</span>
                                  <span className="text-[10px] text-slate-500">{item.source}</span>
                                </div>
                                <div className="font-bold text-white text-sm mt-0.5">{item.headline}</div>
                                <div className={`text-xs font-bold mt-1 ${cfg.color}`}>{item.business_impact}</div>
                              </div>
                              {expanded === key ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
                            </div>
                          </button>
                          {expanded === key && (
                            <div className="px-4 pb-4 space-y-2 border-t border-slate-700/30">
                              <p className="text-xs text-slate-300">{item.detail}</p>
                              <div className="bg-slate-800 rounded-xl px-3 py-2">
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Recommended Action</div>
                                <p className="text-xs text-white mt-0.5">→ {item.action}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PRICES ── */}
          {tab === 'prices' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">Manually update karo — agent in prices se impact calculate karega</p>
              {prices.map(p => (
                <div key={p.id} className="bg-slate-800 rounded-xl p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{COMMODITY_LABELS[p.commodity] || p.commodity}</span>
                      {TREND_ICON(p.trend)}
                      {p.change_pct !== 0 && (
                        <span className={`text-[10px] font-bold ${p.change_pct > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {p.change_pct > 0 ? '+' : ''}{p.change_pct}%
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{p.recorded_date}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="font-black text-white">{p.price?.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-500">{p.unit}</div>
                    </div>
                    <div className="flex gap-1">
                      <input
                        value={priceEdit[p.commodity] || ''}
                        onChange={e => setPriceEdit(prev => ({ ...prev, [p.commodity]: e.target.value }))}
                        placeholder="New"
                        className="w-16 bg-slate-700 text-white rounded-lg px-2 py-1 text-xs outline-none"
                      />
                      <button onClick={() => savePrice(p.commodity)} disabled={saving || !priceEdit[p.commodity]}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded-lg text-xs disabled:opacity-40 transition-all">
                        ✓
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── HISTORY ── */}
          {tab === 'history' && (
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">Koi history nahi</div>
              ) : history.map(h => {
                let hItems: BriefItem[] = [];
                try { hItems = JSON.parse(h.items || '[]'); } catch {}
                const hUrgent = hItems.filter(i => i.severity === 'urgent').length;
                return (
                  <div key={h.id} className="bg-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-sm">{h.brief_date}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{hItems.length} items · {hUrgent > 0 ? `${hUrgent} urgent` : 'no urgent'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {h.delivered_wa && <span className="text-[10px] text-green-400">WA ✓</span>}
                      {h.acknowledged && <span className="text-[10px] text-slate-500">seen</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MarketBriefModule;
