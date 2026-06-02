import React, { useState, useEffect } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { Sun, RefreshCw, Send, ChevronDown, ChevronUp, Clock, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Briefing {
  briefing_date: string;
  briefing_text: string;
  kpis: {
    total_billed_month: number;
    active_jobs: number;
    pending_reqs: number;
    urgent_reqs: number;
    overdue_orders: number;
    open_events: number;
    stuck_jobs: number;
  };
  created_at: string;
}

const PKR = (n: number) => `PKR ${Math.round(n || 0).toLocaleString('en-PK')}`;

const KPICard = ({ label, value, icon, alert }: { label: string; value: string | number; icon: string; alert?: boolean }) => (
  <div className={`rounded-2xl p-4 border ${alert && Number(value) > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700/50 bg-slate-800/50'}`}>
    <div className="text-2xl mb-1">{icon}</div>
    <div className={`text-xl font-black ${alert && Number(value) > 0 ? 'text-red-400' : 'text-white'}`}>{value}</div>
    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
  </div>
);

const MorningBriefingModule: React.FC = () => {
  const [today, setToday]         = useState<Briefing | null>(null);
  const [history, setHistory]     = useState<Briefing[]>([]);
  const [loading, setLoading]     = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [tab, setTab]             = useState<'today' | 'history'>('today');
  const [status, setStatus]       = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('morning_briefings')
      .select('*')
      .order('briefing_date', { ascending: false })
      .limit(10);
    if (data && data.length > 0) {
      setToday(data[0]);
      setHistory(data);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const triggerManually = async () => {
    setTriggering(true);
    setStatus('Briefing generate ho rahi hai...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/morning-briefing`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ manual: true }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setStatus(`✅ Briefing ready! WhatsApp: ${data.whatsapp_sent ? 'Sent ✓' : 'Not configured'}`);
        await load();
      } else {
        setStatus(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      setStatus(`❌ ${String(err)}`);
    }
    setTriggering(false);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const isToday  = today?.briefing_date === todayStr;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center">
            <Sun size={18} className="text-white" />
          </div>
          <div>
            <div className="font-black text-white text-base">Morning Briefing</div>
            <div className="text-xs text-slate-500">Rozana subah 8 baje — automatic</div>
          </div>
        </div>
        <button
          onClick={triggerManually}
          disabled={triggering}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
        >
          {triggering ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
          {triggering ? 'Generating...' : 'Abhi Generate Karo'}
        </button>
      </div>

      {status && (
        <div className="text-xs text-slate-400 bg-slate-800/50 rounded-xl px-4 py-2 border border-slate-700/50">
          {status}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {(['today', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === t ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            {t === 'today' ? '☀️ Aaj' : '📅 History'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm text-center py-8">Loading...</div>
      ) : tab === 'today' ? (
        <>
          {/* Today's KPIs */}
          {today?.kpis && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard label="Active Jobs"      value={today.kpis.active_jobs}        icon="🏭" alert={today.kpis.stuck_jobs > 0} />
              <KPICard label="Pending Reqs"     value={today.kpis.pending_reqs}       icon="📋" alert={today.kpis.urgent_reqs > 0} />
              <KPICard label="Overdue Orders"   value={today.kpis.overdue_orders}     icon="⏰" alert />
              <KPICard label="Open Events"      value={today.kpis.open_events}        icon="⚠️" alert />
            </div>
          )}

          {/* Today's Briefing Text */}
          {today ? (
            <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isToday ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {isToday ? 'Aaj Ki Briefing' : today.briefing_date}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <Clock size={11} />
                  {new Date(today.created_at).toLocaleTimeString('en-PK', { hour:'2-digit', minute:'2-digit' })}
                </div>
              </div>
              <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {today.briefing_text}
              </div>
              {!isToday && (
                <div className="mt-3 text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
                  ⚠️ Aaj ki briefing abhi generate nahi hui — "Abhi Generate Karo" press karo
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-800/50 rounded-2xl border border-dashed border-slate-700 p-8 text-center">
              <div className="text-4xl mb-3">☀️</div>
              <div className="text-white font-bold mb-1">Koi briefing nahi mili</div>
              <div className="text-slate-500 text-sm mb-4">Pehli briefing generate karo</div>
              <button
                onClick={triggerManually}
                disabled={triggering}
                className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-all"
              >
                Generate Karo
              </button>
            </div>
          )}
        </>
      ) : (
        /* History Tab */
        <div className="space-y-2">
          {history.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-8">Koi history nahi</div>
          ) : history.map(b => (
            <div key={b.briefing_date} className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === b.briefing_date ? null : b.briefing_date)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-white">
                    {new Date(b.briefing_date).toLocaleDateString('en-PK', { weekday:'short', day:'numeric', month:'short' })}
                  </span>
                  <div className="flex gap-2">
                    {(b.kpis?.urgent_reqs || 0) > 0 && (
                      <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">
                        {b.kpis.urgent_reqs} urgent
                      </span>
                    )}
                    {(b.kpis?.overdue_orders || 0) > 0 && (
                      <span className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-bold">
                        {b.kpis.overdue_orders} overdue
                      </span>
                    )}
                  </div>
                </div>
                {expanded === b.briefing_date ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
              </button>
              {expanded === b.briefing_date && (
                <div className="px-4 pb-4 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed border-t border-slate-700/50 pt-3">
                  {b.briefing_text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Setup Info */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
        <div className="text-xs font-bold text-blue-400 mb-2">⚙️ Automatic Schedule Setup</div>
        <div className="text-xs text-slate-400 space-y-1">
          <div>1. Supabase Dashboard → Edge Functions → morning-briefing</div>
          <div>2. Schedule tab → Add cron: <code className="bg-slate-700 px-1 rounded">0 3 * * *</code> (8am PKT)</div>
          <div>3. Secrets add karo: WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_TO_NUMBER</div>
        </div>
      </div>
    </div>
  );
};

export default MorningBriefingModule;
