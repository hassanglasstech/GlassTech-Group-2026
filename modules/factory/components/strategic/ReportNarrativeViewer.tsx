import React, { useState, useEffect } from 'react';
import {
  FileText, Play, Loader2, RefreshCw,
  CheckCircle2, AlertTriangle, ExternalLink, Sparkles
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

interface ReportWithNarrative {
  id: string;
  report_date: string;
  html_content: string;
  event_count: number;
  urgent_count: number;
  open_count: number;
  created_at: string;
  has_narrative: boolean;
}

const ReportNarrativeViewer: React.FC = () => {
  const [reports, setReports]     = useState<ReportWithNarrative[]>([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected]   = useState<ReportWithNarrative | null>(null);
  const [genResult, setGenResult] = useState<'idle' | 'ok' | 'fail'>('idle');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('daily_reports')
      .select('id, report_date, html_content, event_count, urgent_count, open_count, created_at')
      .order('report_date', { ascending: false })
      .limit(7);
    if (data) {
      setReports(data.map((r: any) => ({
        ...r,
        has_narrative: r.html_content?.includes('AI Narrative Summary'),
      })));
    }
    setLoading(false);
  };

  const generateNarrative = async () => {
    setGenerating(true);
    setGenResult('idle');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-narrative`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
        }
      );
      setGenResult(res.ok ? 'ok' : 'fail');
      if (res.ok) await load();
    } catch {
      setGenResult('fail');
    }
    setGenerating(false);
  };

  const openInTab = (html: string) => {
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  if (selected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)}
            className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className="font-bold text-white">{selected.report_date}</span>
          {selected.has_narrative && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400">
              <Sparkles size={10} /> AI Narrative
            </span>
          )}
          <button onClick={() => openInTab(selected.html_content)}
            className="ml-auto flex items-center gap-1 bg-white text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg">
            <ExternalLink size={12} /> Open / Print
          </button>
        </div>
        <div className="bg-white rounded-xl overflow-hidden" style={{ height: '72vh' }}>
          <iframe srcDoc={selected.html_content} className="w-full h-full border-0" title="Report" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">AI Report Narrative</h2>
          <p className="text-xs text-slate-500 mt-0.5">Daily PDF with written summary</p>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Generate button */}
      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <div className="text-xs text-slate-400">
          Claude AI aaj ka data analyze karke written narrative generate karta hai — daily report mein inject ho jaata hai.
        </div>
        <button onClick={generateNarrative} disabled={generating}
          className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm py-3 rounded-xl transition-all disabled:opacity-50">
          {generating
            ? <><Loader2 size={16} className="animate-spin" /> Generating...</>
            : <><Sparkles size={16} /> Generate Today's Narrative</>}
        </button>
        {genResult === 'ok' && (
          <div className="flex items-center gap-2 text-green-400 text-xs">
            <CheckCircle2 size={13} /> Narrative generated — report mein add ho gaya
          </div>
        )}
        {genResult === 'fail' && (
          <div className="flex items-center gap-2 text-red-400 text-xs">
            <AlertTriangle size={13} /> Failed — ANTHROPIC_API_KEY Supabase secrets mein add karo
          </div>
        )}
      </div>

      {/* Setup note */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-300 space-y-1">
        <div className="font-bold">Setup: ANTHROPIC_API_KEY add karo</div>
        <div>Supabase Dashboard → Settings → Edge Functions → Secrets</div>
        <div><code className="bg-slate-700 px-1 rounded">ANTHROPIC_API_KEY = sk-ant-...</code></div>
        <div className="text-blue-400/70 mt-1">Key milti hai: console.anthropic.com → API Keys</div>
      </div>

      {/* Reports list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          Koi reports nahi — Daily Report (1F) se generate karo pehle
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(r => (
            <button key={r.id} onClick={() => setSelected(r)}
              className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText size={16} className={r.has_narrative ? 'text-blue-400' : 'text-slate-400'} />
                  <div>
                    <div className="font-bold text-white text-sm">{r.report_date}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-500">
                        {r.event_count} events · {r.urgent_count} urgent
                      </span>
                      {r.has_narrative && (
                        <span className="flex items-center gap-0.5 text-[10px] text-blue-400">
                          <Sparkles size={9} /> AI
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ExternalLink size={13} className="text-slate-500" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReportNarrativeViewer;
