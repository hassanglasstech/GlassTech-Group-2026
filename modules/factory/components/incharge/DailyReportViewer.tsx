import React, { useEffect, useState } from 'react';
import { FileText, Loader2, ExternalLink, RefreshCw, Play } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

interface Report {
  id: string;
  report_date: string;
  event_count: number;
  urgent_count: number;
  open_count: number;
  html_content: string;
  created_at: string;
}

const DailyReportViewer: React.FC = () => {
  const [reports, setReports]       = useState<Report[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Report | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('daily_reports')
      .select('id, report_date, event_count, urgent_count, open_count, html_content, created_at')
      .order('report_date', { ascending: false })
      .limit(10);
    if (data) setReports(data as Report[]);
    setLoading(false);
  };

  // Manually trigger report generation (calls edge function)
  const generateNow = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      await load();
    } catch (err) {
      console.error(err);
    }
    setGenerating(false);
  };

  const openInTab = (html: string) => {
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  if (selected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)}
            className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className="text-white font-bold">{selected.report_date}</span>
          <button onClick={() => openInTab(selected.html_content)}
            className="ml-auto flex items-center gap-1 bg-white text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg">
            <ExternalLink size={12} /> Open / Print
          </button>
        </div>
        <div className="bg-white rounded-xl overflow-hidden" style={{ height: '70vh' }}>
          <iframe
            srcDoc={selected.html_content}
            className="w-full h-full border-0"
            title="Daily Report"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Daily Reports</h2>
          <p className="text-xs text-slate-500 mt-0.5">Auto-generated 6pm every day</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
          <button onClick={generateNow} disabled={generating}
            className="flex items-center gap-1 bg-white text-slate-900 font-bold text-xs px-3 py-2 rounded-xl hover:bg-slate-100 transition-all disabled:opacity-50">
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Generate Now
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          No reports yet — Generate Now ya 6pm ka wait karo
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(r => (
            <button key={r.id} onClick={() => setSelected(r)}
              className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-slate-400" />
                  <div>
                    <div className="font-bold text-white text-sm">{r.report_date}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {r.event_count} events · {r.urgent_count} urgent · {r.open_count} open
                    </div>
                  </div>
                </div>
                <ExternalLink size={14} className="text-slate-500" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DailyReportViewer;
