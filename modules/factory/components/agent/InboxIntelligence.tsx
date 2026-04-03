import React, { useEffect, useState } from 'react';
import {
  Inbox, RefreshCw, Loader2, CheckCircle2,
  MessageCircle, Mic, AlertTriangle, Brain,
  BookOpen, Plus, X, ChevronRight
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

interface InboxItem {
  id:            string;
  sender_name:   string;
  group_name?:   string;
  message_type:  string;
  raw_message:   string;
  transcription?: string;
  intent:        string;
  confidence:    number;
  agent_summary: string;
  status:        string;
  created_at:    string;
}

interface VocabItem {
  id:          string;
  phrase:      string;
  meaning:     string;
  context?:    string;
  usage_count: number;
}

const CONFIDENCE_COLOR = (c: number) =>
  c >= 85 ? 'text-green-400' : c >= 60 ? 'text-yellow-400' : 'text-red-400';

const INTENT_ICON: Record<string, string> = {
  attendance:     '👤',
  dispatch:       '🚛',
  factory_event:  '🏭',
  market_intel:   '📊',
  payment:        '💳',
  hr_complaint:   '😟',
  maintenance:    '🔧',
  unknown:        '❓',
};

const STATUS_STYLE: Record<string, string> = {
  received:  'bg-slate-500/20 text-slate-400',
  processed: 'bg-blue-500/20 text-blue-400',
  actioned:  'bg-green-500/20 text-green-400',
  forwarded: 'bg-yellow-500/20 text-yellow-400',
  ignored:   'bg-slate-700 text-slate-600',
};

const InboxIntelligence: React.FC = () => {
  const [tab, setTab]           = useState<'inbox' | 'vocab' | 'setup'>('inbox');
  const [items, setItems]       = useState<InboxItem[]>([]);
  const [vocab, setVocab]       = useState<VocabItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [newPhrase, setNewPhrase] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => { load(); }, [tab]);

  const load = async () => {
    setLoading(true);
    if (tab === 'inbox') {
      const { data } = await supabase
        .from('whatsapp_inbox_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setItems(data as InboxItem[]);
    } else if (tab === 'vocab') {
      const { data } = await supabase
        .from('agent_vocabulary')
        .select('*')
        .order('usage_count', { ascending: false });
      if (data) setVocab(data as VocabItem[]);
    }
    setLoading(false);
  };

  const addVocab = async () => {
    if (!newPhrase.trim() || !newMeaning.trim()) return;
    setSaving(true);
    await supabase.from('agent_vocabulary').insert({
      phrase:      newPhrase.trim().toLowerCase(),
      meaning:     newMeaning.trim(),
      usage_count: 1,
      created_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    });
    setNewPhrase('');
    setNewMeaning('');
    await load();
    setSaving(false);
  };

  const deleteVocab = async (id: string) => {
    await supabase.from('agent_vocabulary').delete().eq('id', id);
    setVocab(prev => prev.filter(v => v.id !== id));
  };

  const unread  = items.filter(i => i.status === 'forwarded' || i.status === 'processed').length;
  const autoExd = items.filter(i => i.status === 'actioned').length;

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className="font-bold text-white truncate">{selected.sender_name}</span>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{INTENT_ICON[selected.intent] || '❓'}</span>
            <span className="font-bold text-white capitalize">{selected.intent.replace('_', ' ')}</span>
            <span className={`text-xs font-bold ${CONFIDENCE_COLOR(selected.confidence)}`}>{selected.confidence}%</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_STYLE[selected.status] || ''}`}>{selected.status}</span>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Agent Summary</div>
            <p className="text-sm text-white">{selected.agent_summary}</p>
          </div>
          {selected.transcription && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Voice Transcription</div>
              <p className="text-sm text-slate-400 italic">"{selected.transcription}"</p>
            </div>
          )}
          {!selected.transcription && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Original Message</div>
              <p className="text-sm text-slate-400">"{selected.raw_message}"</p>
            </div>
          )}
          <div className="text-[10px] text-slate-500">
            {selected.group_name && `Group: ${selected.group_name} · `}
            {new Date(selected.created_at).toLocaleString('en-PK')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Inbox Intelligence</h2>
          <p className="text-xs text-slate-500 mt-0.5">WhatsApp → Agent → ERP</p>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className={`rounded-xl p-3 text-center ${unread > 0 ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-slate-800'}`}>
          <div className={`text-xl font-black ${unread > 0 ? 'text-yellow-400' : 'text-white'}`}>{unread}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Needs Review</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-green-400">{autoExd}</div>
          <div className="text-[10px] text-green-400 uppercase tracking-widest mt-0.5">Auto-Actioned</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{vocab.length || '?'}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Vocab Words</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
        {([['inbox', 'Inbox'], ['vocab', 'Vocabulary'], ['setup', 'Setup']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
              ${tab === t ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : tab === 'inbox' ? (

        // ── INBOX ──────────────────────────────────────────────────
        items.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            Koi messages nahi — Bridge server start karo
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <button key={item.id} onClick={() => setSelected(item)}
                className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-all">
                <div className="flex items-start gap-3">
                  <span className="text-lg shrink-0">{INTENT_ICON[item.intent] || '❓'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{item.sender_name}</span>
                      {item.message_type === 'voice' && <Mic size={11} className="text-blue-400" />}
                      <span className={`text-[10px] font-bold ${CONFIDENCE_COLOR(item.confidence)}`}>{item.confidence}%</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_STYLE[item.status] || ''}`}>{item.status}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{item.agent_summary}</p>
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      {item.group_name && `${item.group_name} · `}
                      {new Date(item.created_at).toLocaleString('en-PK')}
                    </div>
                  </div>
                  <ChevronRight size={13} className="text-slate-500 shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        )

      ) : tab === 'vocab' ? (

        // ── VOCABULARY ─────────────────────────────────────────────
        <div className="space-y-3">
          <div className="bg-slate-800 rounded-xl p-4 space-y-2">
            <div className="text-xs text-slate-400 font-bold">Add new word/phrase</div>
            <input value={newPhrase} onChange={e => setNewPhrase(e.target.value)}
              placeholder='"woh masla", "kal chutti"...'
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
            <input value={newMeaning} onChange={e => setNewMeaning(e.target.value)}
              placeholder="Meaning / context"
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
            <button onClick={addVocab} disabled={saving || !newPhrase.trim() || !newMeaning.trim()}
              className="w-full bg-white text-slate-900 font-bold py-2 rounded-xl text-sm disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
            </button>
          </div>
          {vocab.map(v => (
            <div key={v.id} className="bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm">"{v.phrase}"</div>
                <div className="text-xs text-slate-400 mt-0.5">{v.meaning}</div>
                <div className="text-[10px] text-slate-600 mt-0.5">Used {v.usage_count}x</div>
              </div>
              <button onClick={() => deleteVocab(v.id)} className="text-slate-500 hover:text-red-400 transition-colors shrink-0">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

      ) : (

        // ── SETUP ──────────────────────────────────────────────────
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-xl p-5 space-y-3">
            <div className="font-bold text-white text-sm">Step 1: Bridge Server</div>
            <div className="text-xs text-slate-400 space-y-1">
              <p>1. <code className="bg-slate-700 px-1 rounded">server/</code> folder Railway pe deploy karo</p>
              <p>2. ENV vars set karo:</p>
              <div className="bg-slate-900 rounded-lg p-3 font-mono text-[10px] space-y-0.5">
                <div>SUPABASE_URL = <span className="text-yellow-400">your url</span></div>
                <div>SUPABASE_SERVICE_ROLE_KEY = <span className="text-yellow-400">your key</span></div>
                <div>WATCH_GROUPS = <span className="text-yellow-400">GlassTech Market,Dealers</span></div>
                <div>WATCH_DIRECT_FROM = <span className="text-yellow-400">923001234567</span></div>
                <div>INTELLIGENCE_FN_URL = <span className="text-yellow-400">supabase fn url</span></div>
                <div>INTELLIGENCE_FN_KEY = <span className="text-yellow-400">supabase anon key</span></div>
              </div>
              <p>3. QR scan karo secondary phone se</p>
              <p>4. Screen off, charger on — done</p>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-5 space-y-2">
            <div className="font-bold text-white text-sm">Step 2: Edge Function</div>
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-[10px] text-yellow-400">
              supabase functions deploy whatsapp-intelligence
            </div>
            <div className="text-xs text-slate-400">Optional: OPENAI_API_KEY for voice transcription</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-xs text-green-400">
            ✅ Secondary number WhatsApp group mein add karo — Seth kuch nahi karta, agent silently sunta hai
          </div>
        </div>
      )}
    </div>
  );
};

export default InboxIntelligence;
