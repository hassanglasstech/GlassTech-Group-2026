import React, { useState } from 'react';
import { Send, CheckCircle2, Loader2, AlertTriangle, Copy, ExternalLink } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

const TelegramSetup: React.FC = () => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');

  const sendTest = async () => {
    setTesting(true);
    setTestResult('idle');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-bot`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
        }
      );
      setTestResult(res.ok ? 'ok' : 'fail');
    } catch {
      setTestResult('fail');
    }
    setTesting(false);
  };

  const copy = (text: string) => navigator.clipboard.writeText(text);

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-bot`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-black text-white text-lg">Telegram Bot Setup</h2>
        <p className="text-xs text-slate-500 mt-0.5">8am briefing · Commands · Alerts</p>
      </div>

      {/* Step 1 */}
      <div className="bg-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="bg-blue-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">1</span>
          <span className="font-bold text-white text-sm">BotFather se bot banao</span>
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <p>1. Telegram mein <code className="bg-slate-700 px-1 rounded">@BotFather</code> search karo</p>
          <p>2. <code className="bg-slate-700 px-1 rounded">/newbot</code> likho</p>
          <p>3. Naam do: <code className="bg-slate-700 px-1 rounded">GlassTech ERP</code></p>
          <p>4. Token copy karo — ye aayega: <code className="bg-slate-700 px-1 rounded">123456:ABCdef...</code></p>
        </div>
        <a href="https://t.me/BotFather" target="_blank" rel="noreferrer"
          className="flex items-center gap-2 text-blue-400 text-xs hover:text-blue-300 transition-colors">
          <ExternalLink size={12} /> t.me/BotFather kholein
        </a>
      </div>

      {/* Step 2 */}
      <div className="bg-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="bg-blue-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">2</span>
          <span className="font-bold text-white text-sm">Chat ID hasil karo</span>
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <p>1. Telegram mein <code className="bg-slate-700 px-1 rounded">@userinfobot</code> search karo</p>
          <p>2. <code className="bg-slate-700 px-1 rounded">/start</code> likho</p>
          <p>3. Tumhara Chat ID note karo</p>
        </div>
      </div>

      {/* Step 3 */}
      <div className="bg-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="bg-blue-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">3</span>
          <span className="font-bold text-white text-sm">Supabase mein secrets add karo</span>
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <p>Supabase Dashboard → Settings → Edge Functions → Secrets</p>
          <div className="bg-slate-900 rounded-lg p-3 mt-2 space-y-1 font-mono">
            <p>TELEGRAM_BOT_TOKEN = <span className="text-yellow-400">your_token_here</span></p>
            <p>TELEGRAM_CHAT_ID = <span className="text-yellow-400">your_chat_id_here</span></p>
          </div>
        </div>
      </div>

      {/* Step 4 */}
      <div className="bg-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="bg-blue-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">4</span>
          <span className="font-bold text-white text-sm">Webhook set karo (replies ke liye)</span>
        </div>
        <div className="text-xs text-slate-400">
          <p className="mb-2">Browser mein ye URL kholo (apna token replace karo):</p>
          <div className="bg-slate-900 rounded-lg p-3 text-[10px] font-mono break-all text-yellow-400">
            {`https://api.telegram.org/bot{YOUR_TOKEN}/setWebhook?url=${fnUrl}`}
          </div>
          <button onClick={() => copy(`https://api.telegram.org/bot{YOUR_TOKEN}/setWebhook?url=${fnUrl}`)}
            className="flex items-center gap-1 text-slate-400 hover:text-white mt-2 transition-colors">
            <Copy size={11} /> Copy URL
          </button>
        </div>
      </div>

      {/* Step 5 - Cron */}
      <div className="bg-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="bg-blue-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">5</span>
          <span className="font-bold text-white text-sm">8am cron schedule karo</span>
        </div>
        <div className="text-xs text-slate-400">
          <p>Supabase Dashboard → Edge Functions → telegram-bot → Schedule</p>
          <div className="bg-slate-900 rounded-lg p-3 mt-2 font-mono text-yellow-400">
            0 3 * * *
          </div>
          <p className="mt-1 text-slate-500">3am UTC = 8am PKT</p>
        </div>
      </div>

      {/* Test */}
      <div className="bg-slate-800 rounded-xl p-5 space-y-3">
        <div className="font-bold text-white text-sm">Test karo</div>
        <p className="text-xs text-slate-400">Deploy ke baad yahan se test briefing bhejo</p>
        <button onClick={sendTest} disabled={testing}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50">
          {testing
            ? <Loader2 size={16} className="animate-spin" />
            : <Send size={16} />}
          Send Test Briefing
        </button>
        {testResult === 'ok' && (
          <div className="flex items-center gap-2 text-green-400 text-xs">
            <CheckCircle2 size={14} /> Message sent — Telegram check karo
          </div>
        )}
        {testResult === 'fail' && (
          <div className="flex items-center gap-2 text-red-400 text-xs">
            <AlertTriangle size={14} /> Failed — secrets check karo, function deploy hua?
          </div>
        )}
      </div>

      {/* Commands reference */}
      <div className="bg-slate-800 rounded-xl p-5">
        <div className="font-bold text-white text-sm mb-3">Bot Commands</div>
        <div className="space-y-1 text-xs">
          {[
            ['/status', 'Full factory briefing'],
            ['/tasks',  'Open tasks list'],
            ['/events', "Aaj ke events"],
            ['/urgent', 'Urgent open events'],
            ['/help',   'Commands list'],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="flex items-center gap-3">
              <code className="bg-slate-700 text-blue-400 px-2 py-0.5 rounded text-[11px]">{cmd}</code>
              <span className="text-slate-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TelegramSetup;
