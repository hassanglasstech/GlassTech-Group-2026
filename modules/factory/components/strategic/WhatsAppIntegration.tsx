import React, { useState, useEffect } from 'react';
import {
  MessageCircle, Send, Loader2, CheckCircle2,
  AlertTriangle, RefreshCw, Plus, X, ExternalLink
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

// ── Types ─────────────────────────────────────────────────────────────
interface WALog {
  id:         string;
  message:    string;
  type:       string;
  priority:   string;
  status:     string;
  created_at: string;
}

type MessageType = 'alert' | 'report' | 'task' | 'predict' | 'custom';

const TYPE_LABEL: Record<MessageType, string> = {
  alert:   '🚨 Alert',
  report:  '📋 Report',
  task:    '✅ Task',
  predict: '🔮 Prediction',
  custom:  '💬 Custom',
};

// ── Quick message templates ───────────────────────────────────────────
const TEMPLATES = [
  { label: 'Daily Summary',    type: 'report'  as MessageType, fn: 'daily-report'   },
  { label: 'Urgent Events',    type: 'alert'   as MessageType, fn: null             },
  { label: 'AI Narrative',     type: 'report'  as MessageType, fn: 'report-narrative' },
  { label: 'Predictive Alerts',type: 'predict' as MessageType, fn: 'predictive-alerts' },
];

// ── Send helper ───────────────────────────────────────────────────────
const sendWA = async (message: string, type: MessageType, priority = 'Normal') => {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-notify`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ message, type, priority }),
    }
  );
  return res.ok;
};

// ── Main Component ────────────────────────────────────────────────────
const WhatsAppIntegration: React.FC = () => {
  const [logs, setLogs]       = useState<WALog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [result, setResult]   = useState<Record<string, 'ok' | 'fail'>>({});
  const [customMsg, setCustomMsg] = useState('');
  const [customType, setCustomType] = useState<MessageType>('custom');
  const [sendingCustom, setSendingCustom] = useState(false);

  useEffect(() => { loadLogs(); }, []);

  const loadLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setLogs(data as WALog[]);
    setLoading(false);
  };

  // Trigger a function + send notification
  const triggerAndNotify = async (template: typeof TEMPLATES[0]) => {
    setSending(template.label);
    setResult(p => ({ ...p, [template.label]: undefined as any }));

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // 1. Run the function if specified
      if (template.fn) {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${template.fn}`,
          { method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}` } }
        );
      }

      // 2. Build message from live data
      let message = '';

      if (template.fn === 'daily-report') {
        const { data: rep } = await supabase
          .from('daily_reports').select('event_count,urgent_count,open_count,report_date').order('report_date', { ascending: false }).limit(1).single();
        message = rep
          ? `Daily Factory Report — ${rep.report_date}\n\n📊 Events: ${rep.event_count}\n🚨 Urgent: ${rep.urgent_count}\n⏳ Open: ${rep.open_count}\n\nFull report ERP mein available hai.`
          : 'Daily report generate ho raha hai — ERP check karo.';
      } else if (template.fn === 'report-narrative') {
        message = 'AI Narrative report generate ho gaya — ERP → AI Report tab mein dekho.';
      } else if (template.fn === 'predictive-alerts') {
        const { count } = await supabase.from('predictive_alerts').select('id', { count: 'exact', head: true }).eq('actioned', false).eq('dismissed', false);
        message = count && count > 0
          ? `🔮 ${count} AI predictive alert${count > 1 ? 's' : ''} active hain — ERP → Predict tab mein check karo.`
          : '✅ Koi active predictive alerts nahi — sab theek hai.';
      } else {
        // Urgent events live pull
        const { data: evs } = await supabase.from('factory_events').select('event_type,sector,detail').eq('priority','Urgent').in('status',['Open','Pending']).order('created_at',{ascending:false}).limit(5);
        if (evs && evs.length > 0) {
          message = `🚨 ${evs.length} Urgent Factory Event${evs.length > 1 ? 's' : ''}:\n\n${evs.map((e: any) => `• ${e.event_type} (${e.sector}): ${e.detail?.slice(0,60)}`).join('\n')}`;
        } else {
          message = '✅ Koi urgent events nahi — factory normal chal rahi hai.';
        }
      }

      const ok = await sendWA(message, template.type);
      setResult(p => ({ ...p, [template.label]: ok ? 'ok' : 'fail' }));
      if (ok) await loadLogs();
    } catch {
      setResult(p => ({ ...p, [template.label]: 'fail' }));
    }
    setSending(null);
  };

  const sendCustom = async () => {
    if (!customMsg.trim()) return;
    setSendingCustom(true);
    const ok = await sendWA(customMsg.trim(), customType);
    setResult(p => ({ ...p, custom: ok ? 'ok' : 'fail' }));
    if (ok) { setCustomMsg(''); await loadLogs(); }
    setSendingCustom(false);
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">WhatsApp</h2>
          <p className="text-xs text-slate-500 mt-0.5">Factory alerts · Reports · Live updates</p>
        </div>
        <button onClick={loadLogs} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Setup guide */}
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <MessageCircle size={15} className="text-green-400" />
          <span className="font-bold text-green-400 text-sm">Setup — Meta WhatsApp Business API</span>
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <div>1. <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-blue-400 underline">developers.facebook.com</a> → Create App → WhatsApp</div>
          <div>2. Get Phone Number ID + Permanent Token</div>
          <div>3. Supabase Secrets mein add karo:</div>
          <div className="bg-slate-900 rounded-lg p-2 font-mono text-[10px] space-y-0.5">
            <div>WA_PHONE_NUMBER_ID = <span className="text-yellow-400">123456789</span></div>
            <div>WA_ACCESS_TOKEN = <span className="text-yellow-400">EAABsbC...</span></div>
            <div>WA_TO_NUMBER = <span className="text-yellow-400">923001234567</span></div>
          </div>
          <div>4. <code className="bg-slate-700 px-1 rounded text-[10px]">supabase functions deploy whatsapp-notify</code></div>
        </div>
      </div>

      {/* Quick send buttons */}
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Quick Send</div>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map(t => {
            const res = result[t.label];
            return (
              <button key={t.label} onClick={() => triggerAndNotify(t)}
                disabled={sending === t.label}
                className={`flex items-center gap-2 px-3 py-3 rounded-xl text-left text-xs font-bold transition-all
                  ${res === 'ok'   ? 'bg-green-500/20 border border-green-500/30 text-green-400' :
                    res === 'fail' ? 'bg-red-500/20 border border-red-500/30 text-red-400' :
                    'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}>
                {sending === t.label
                  ? <Loader2 size={13} className="animate-spin shrink-0" />
                  : res === 'ok'   ? <CheckCircle2 size={13} className="shrink-0" />
                  : res === 'fail' ? <AlertTriangle size={13} className="shrink-0" />
                  : <Send size={13} className="shrink-0" />}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom message */}
      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Custom Message</div>
        <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)}
          rows={3} placeholder="Koi bhi message bhejo..."
          className="w-full bg-slate-700 text-white rounded-xl px-4 py-3 text-sm outline-none resize-none placeholder-slate-500" />
        <div className="flex gap-2">
          <select value={customType} onChange={e => setCustomType(e.target.value as MessageType)}
            className="bg-slate-700 text-white text-xs rounded-xl px-3 py-2 outline-none">
            {(Object.keys(TYPE_LABEL) as MessageType[]).map(t => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
          <button onClick={sendCustom} disabled={sendingCustom || !customMsg.trim()}
            className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold text-sm py-2 rounded-xl transition-all disabled:opacity-40">
            {sendingCustom ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send
          </button>
        </div>
        {result.custom === 'ok' && <div className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={12} /> Sent!</div>}
        {result.custom === 'fail' && <div className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> Failed — secrets check karo</div>}
      </div>

      {/* Message log */}
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Sent Log</div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-500" /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm bg-slate-800 rounded-xl">
            Koi messages nahi — setup complete karo aur test karo
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="bg-slate-800 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500">{TYPE_LABEL[log.type as MessageType] || log.type}</span>
                  <span className="text-[10px] text-slate-600">{new Date(log.created_at).toLocaleString('en-PK')}</span>
                </div>
                <p className="text-xs text-slate-300 truncate">{log.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppIntegration;
