/**
 * AIActivationDashboard.tsx — Phase 8
 * 
 * Shows live status of all AI features:
 * - Morning Briefing (Edge Function + cron)
 * - Telegram Bot (webhook status)
 * - Predictive Alerts (hourly cron)
 * - AI Chat (claude-proxy)
 * - WhatsApp Integration
 * 
 * Test buttons to fire each function manually.
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import {
  Bot, Sun, Bell, MessageCircle, Send, CheckCircle2,
  AlertTriangle, Loader2, RefreshCw, Zap, Clock,
  ExternalLink, Copy, Check
} from 'lucide-react';
import { toast } from 'sonner';

interface FeatureStatus {
  name:        string;
  description: string;
  icon:        React.ReactNode;
  status:      'active' | 'partial' | 'inactive' | 'checking';
  lastRun?:    string;
  detail?:     string;
  envVars:     string[];
  testFn?:     () => Promise<void>;
  setupUrl?:   string;
}

const StatusBadge: React.FC<{ status: FeatureStatus['status'] }> = ({ status }) => {
  const styles = {
    active:   'bg-emerald-100 text-emerald-700 border-emerald-200',
    partial:  'bg-amber-100  text-amber-700  border-amber-200',
    inactive: 'bg-rose-100   text-rose-700   border-rose-200',
    checking: 'bg-slate-100  text-slate-500  border-slate-200',
  };
  const labels = { active: '✓ Active', partial: '⚠ Partial', inactive: '✗ Not Set', checking: '…' };
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
};

const CopyBlock: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 bg-slate-900 text-slate-300 px-3 py-2 rounded-lg text-xs font-mono">
      <span className="flex-1 truncate">{text}</span>
      <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="shrink-0 text-slate-400 hover:text-white">
        {copied ? <Check size={12}/> : <Copy size={12}/>}
      </button>
    </div>
  );
};

const AIActivationDashboard: React.FC = () => {
  const [features, setFeatures]   = useState<FeatureStatus[]>([]);
  const [testing, setTesting]     = useState<string | null>(null);
  const [alerts, setAlerts]       = useState<any[]>([]);
  const [briefing, setBriefing]   = useState<any | null>(null);
  const [tasks, setTasks]         = useState<any[]>([]);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const funcBase    = `${supabaseUrl}/functions/v1`;

  const callEdgeFunction = async (name: string): Promise<any> => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${funcBase}/${name}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ manual: true }),
    });
    return res.json();
  };

  const checkStatuses = async () => {
    // Check morning briefing
    const { data: briefingData } = await supabase
      .from('morning_briefings')
      .select('briefing_date, briefing_text, kpis')
      .order('briefing_date', { ascending: false })
      .limit(1);

    const latestBriefing = briefingData?.[0] || null;
    setBriefing(latestBriefing);

    // Check predictive alerts
    const { data: alertData } = await supabase
      .from('predictive_alerts')
      .select('*')
      .eq('actioned', false)
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(5);
    setAlerts(alertData || []);

    // Check agent tasks
    const { data: taskData } = await supabase
      .from('agent_tasks')
      .select('*')
      .in('status', ['Open', 'In Progress'])
      .order('due_date', { ascending: true })
      .limit(5);
    setTasks(taskData || []);

    const isTodayBriefing = latestBriefing?.briefing_date === new Date().toISOString().split('T')[0];

    setFeatures([
      {
        name: 'Morning Briefing',
        description: 'Daily 8 AM PKT — Claude generates WhatsApp briefing from live ERP data',
        icon: <Sun size={20} className="text-amber-400"/>,
        status: isTodayBriefing ? 'active' : latestBriefing ? 'partial' : 'inactive',
        lastRun: latestBriefing?.briefing_date || undefined,
        detail: isTodayBriefing ? "Aaj ki briefing generate ho chuki hai" : latestBriefing ? `Last: ${latestBriefing.briefing_date}` : 'Abhi tak run nahi hua',
        envVars: ['ANTHROPIC_API_KEY', 'WA_PHONE_NUMBER_ID', 'WA_ACCESS_TOKEN', 'WA_TO_NUMBER'],
        testFn: async () => {
          const data = await callEdgeFunction('morning-briefing');
          if (data.success) toast.success(`Briefing ready! WhatsApp: ${data.whatsapp_sent ? 'Sent ✓' : 'Not configured'}`);
          else toast.error('Error: ' + (data.error || 'Unknown'));
          await checkStatuses();
        },
        setupUrl: 'https://supabase.com/dashboard/project/_/functions',
      },
      {
        name: 'Predictive Alerts',
        description: 'Hourly cron — analyzes SLA breach risk, QC patterns, delivery delays',
        icon: <Bell size={20} className="text-purple-400"/>,
        status: (alertData?.length ?? 0) > 0 ? 'active' : 'inactive',
        detail: `${alertData?.length || 0} active alerts`,
        envVars: ['SUPABASE_SERVICE_ROLE_KEY'],
        testFn: async () => {
          const data = await callEdgeFunction('predictive-alerts');
          toast.success(`${data.generated || 0} new alerts generated`);
          await checkStatuses();
        },
      },
      {
        name: 'Telegram Bot',
        description: 'Webhook + 8AM cron — send/receive messages, approve actions from phone',
        icon: <Send size={20} className="text-blue-400"/>,
        status: 'partial',
        detail: 'Edge function deployed — webhook URL set karna hai',
        envVars: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
        testFn: async () => {
          const data = await callEdgeFunction('telegram-bot');
          if (data.sent) toast.success('Telegram message sent!');
          else toast.warning('Telegram not configured (TELEGRAM_BOT_TOKEN missing?)');
        },
        setupUrl: 'https://t.me/BotFather',
      },
      {
        name: 'AI Chat (Claude Proxy)',
        description: 'Secure server-side Claude API — Factory Incharge AI chat',
        icon: <Bot size={20} className="text-emerald-400"/>,
        status: 'partial',
        detail: 'ANTHROPIC_API_KEY Supabase secrets mein set hona chahiye',
        envVars: ['ANTHROPIC_API_KEY'],
        testFn: async () => {
          const data = await callEdgeFunction('claude-proxy');
          if (!data.error) toast.success('Claude proxy working ✓');
          else toast.error('Proxy error: ' + data.error);
        },
      },
      {
        name: 'WhatsApp Intelligence',
        description: 'Inbound WhatsApp messages → AI response + task creation',
        icon: <MessageCircle size={20} className="text-green-400"/>,
        status: 'inactive',
        detail: 'Webhook URL Meta Developer Console mein set karna hai',
        envVars: ['WA_PHONE_NUMBER_ID', 'WA_ACCESS_TOKEN', 'WA_VERIFY_TOKEN'],
        setupUrl: 'https://developers.facebook.com/',
      },
      {
        name: 'Self-Heal Agent',
        description: 'Auto-resolves stale alerts and closes completed tasks',
        icon: <Zap size={20} className="text-rose-400"/>,
        status: 'inactive',
        detail: 'Daily cron — Supabase mein schedule set karna hai',
        envVars: ['SUPABASE_SERVICE_ROLE_KEY'],
        testFn: async () => {
          const data = await callEdgeFunction('self-heal');
          toast.success(`Self-heal: resolved ${data.resolved || 0} items`);
        },
      },
    ]);
  };

  useEffect(() => { checkStatuses(); }, []);

  const runTest = async (feature: FeatureStatus) => {
    if (!feature.testFn) return;
    setTesting(feature.name);
    try { await feature.testFn(); }
    catch (e: any) { toast.error('Error: ' + e.message); }
    finally { setTesting(null); }
  };

  const activeCount  = features.filter(f => f.status === 'active').length;
  const partialCount = features.filter(f => f.status === 'partial').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10"><Bot size={140}/></div>
        <div className="flex justify-between items-start relative z-10">
          <div>
            
            <p className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mt-1">
              Morning Briefing · Predictive Alerts · Telegram · AI Chat · Self-Heal
            </p>
          </div>
          <div className="flex gap-8 text-right">
            <div><p className="text-[9px] font-bold text-emerald-400 uppercase">Active</p><p className="text-3xl font-black text-emerald-400">{activeCount}</p></div>
            <div><p className="text-[9px] font-bold text-amber-400 uppercase">Partial</p><p className="text-3xl font-black text-amber-400">{partialCount}</p></div>
            <div><p className="text-[9px] font-bold text-slate-400 uppercase">Total</p><p className="text-3xl font-black">{features.length}</p></div>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-2 gap-4">
        {features.map(f => (
          <div key={f.name} className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">{f.icon}</div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">{f.name}</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">{f.description}</p>
                </div>
              </div>
              <StatusBadge status={f.status}/>
            </div>

            {f.detail && (
              <p className={`text-xs font-bold px-3 py-1.5 rounded-lg ${
                f.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                f.status === 'partial' ? 'bg-amber-50 text-amber-700' :
                'bg-slate-50 text-slate-500'
              }`}>{f.detail}</p>
            )}

            {/* Required env vars */}
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400 mb-1.5">Required Secrets</p>
              <div className="flex flex-wrap gap-1">
                {f.envVars.map(v => (
                  <span key={v} className="text-[9px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{v}</span>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              {f.testFn && (
                <button
                  onClick={() => runTest(f)}
                  disabled={testing === f.name}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-700 disabled:opacity-50"
                >
                  {testing === f.name ? <Loader2 size={12} className="animate-spin"/> : <Zap size={12}/>}
                  Test Now
                </button>
              )}
              {f.setupUrl && (
                <a href={f.setupUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50">
                  <ExternalLink size={12}/> Setup
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Cron Schedule Reference */}
      <div className="bg-white rounded-2xl border shadow-sm p-6">
        <h3 className="font-black uppercase text-slate-700 text-sm mb-4 tracking-widest">Cron Schedule — Supabase Dashboard mein set karo</h3>
        <div className="space-y-3">
          {[
            { fn: 'morning-briefing',  cron: '0 3 * * *',   note: 'Daily 8 AM PKT (3 AM UTC)' },
            { fn: 'predictive-alerts', cron: '0 * * * *',   note: 'Har ghante' },
            { fn: 'self-heal',         cron: '0 2 * * *',   note: 'Daily 7 AM PKT (2 AM UTC)' },
            { fn: 'profit-share-calculator', cron: '0 1 1 * *', note: 'Mahine ki 1 tarikh' },
          ].map(r => (
            <div key={r.fn} className="flex items-center gap-4">
              <span className="w-52 text-xs font-mono font-bold text-blue-700">{r.fn}</span>
              <CopyBlock text={r.cron}/>
              <span className="text-xs text-slate-400 font-bold whitespace-nowrap">{r.note}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs font-bold text-blue-800">
          Path: Supabase Dashboard → Edge Functions → [function name] → Schedule → Add Schedule
        </div>
      </div>

      {/* Telegram Setup */}
      <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
        <h3 className="font-black uppercase text-slate-700 text-sm tracking-widest">Telegram Bot Setup</h3>
        <div className="space-y-3 text-xs font-bold text-slate-700">
          <div className="flex gap-3 items-start">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">1</span>
            <div>
              <p>BotFather se naya bot banao: <code className="bg-slate-100 px-1 rounded">/newbot</code></p>
              <p className="text-slate-400 font-normal mt-0.5">Token copy karo — ye TELEGRAM_BOT_TOKEN hai</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">2</span>
            <div>
              <p>Apna Chat ID pao — @userinfobot ko message karo</p>
              <p className="text-slate-400 font-normal mt-0.5">Ye TELEGRAM_CHAT_ID hai</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">3</span>
            <div>
              <p>Supabase secrets mein add karo: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">4</span>
            <div>
              <p>Webhook set karo (browser mein open karo):</p>
              <CopyBlock text={`https://api.telegram.org/bot{TOKEN}/setWebhook?url=${supabaseUrl}/functions/v1/telegram-bot`}/>
            </div>
          </div>
        </div>
      </div>

      {/* Live Data Panels */}
      <div className="grid grid-cols-3 gap-4">

        {/* Today's Briefing KPIs */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sun size={16} className="text-amber-400"/>
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-300">Latest Briefing</h3>
          </div>
          {briefing ? (
            <>
              <p className="text-[10px] text-slate-500">{briefing.briefing_date}</p>
              {Object.entries(briefing.kpis || {}).map(([k, v]: [string, any]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-slate-400 capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="font-black text-white">{typeof v === 'number' ? v.toLocaleString() : String(v)}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="text-slate-500 text-xs">Abhi tak koi briefing nahi</p>
          )}
        </div>

        {/* Active Alerts */}
        <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-purple-500"/>
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-600">Active Alerts</h3>
          </div>
          {alerts.length === 0 ? (
            <p className="text-slate-400 text-xs">No active alerts</p>
          ) : (
            alerts.map(a => (
              <div key={a.id} className="flex items-start gap-2">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                  a.severity === 'Critical' || a.severity === 'High'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>{a.severity}</span>
                <p className="text-xs font-bold text-slate-700 leading-tight">{a.title}</p>
              </div>
            ))
          )}
        </div>

        {/* Open Tasks */}
        <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-blue-500"/>
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-600">Open AI Tasks</h3>
          </div>
          {tasks.length === 0 ? (
            <p className="text-slate-400 text-xs">No open tasks</p>
          ) : (
            tasks.map(t => (
              <div key={t.id} className="flex items-start gap-2">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                  t.priority === 'Urgent' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                }`}>{t.priority}</span>
                <p className="text-xs font-bold text-slate-700 leading-tight">{t.title}</p>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};

export default AIActivationDashboard;
