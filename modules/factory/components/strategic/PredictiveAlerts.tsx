import React, { useEffect, useState } from 'react';
import {
  Zap, Loader2, RefreshCw, CheckCircle2,
  X, AlertTriangle, TrendingUp, Shield,
  Package, Clock, Star, Play
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

// ── Types ─────────────────────────────────────────────────────────────
type AlertSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
type AlertType     = 'SLA_BREACH' | 'CASH_RISK' | 'OVERSTOCK' | 'DELIVERY_DELAY' | 'QC_PATTERN' | 'VENDOR_RISK' | 'CAPACITY_RISK';

interface PredictiveAlert {
  id:             string;
  alert_type:     AlertType;
  title:          string;
  message:        string;
  severity:       AlertSeverity;
  confidence:     number;
  entity_label?:  string;
  data_snapshot?: any;
  actioned:       boolean;
  dismissed:      boolean;
  created_at:     string;
}

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  Low:      'bg-slate-500/20 text-slate-400 border-slate-500/30',
  Medium:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  High:     'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Critical: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const TYPE_ICON: Record<AlertType, React.ElementType> = {
  SLA_BREACH:     Clock,
  CASH_RISK:      TrendingUp,
  OVERSTOCK:      Package,
  DELIVERY_DELAY: AlertTriangle,
  QC_PATTERN:     Shield,
  VENDOR_RISK:    Star,
  CAPACITY_RISK:  Zap,
};

const TYPE_LABEL: Record<AlertType, string> = {
  SLA_BREACH:     'SLA Breach Risk',
  CASH_RISK:      'Cash Flow Risk',
  OVERSTOCK:      'Overstock Risk',
  DELIVERY_DELAY: 'Delivery Delay',
  QC_PATTERN:     'QC Pattern',
  VENDOR_RISK:    'Vendor Risk',
  CAPACITY_RISK:  'Capacity Risk',
};

// ── Confidence bar ────────────────────────────────────────────────────
const ConfidenceBar: React.FC<{ value: number }> = ({ value }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : 'bg-slate-500'}`}
        style={{ width: `${value}%` }} />
    </div>
    <span className="text-[10px] text-slate-500 shrink-0">{value}% confident</span>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────
const PredictiveAlerts: React.FC = () => {
  const [alerts, setAlerts]     = useState<PredictiveAlert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState(false);
  const [filter, setFilter]     = useState<'active' | 'actioned'>('active');
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('predictive_alerts')
      .select('*')
      .eq('actioned', filter === 'actioned')
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setAlerts(data as PredictiveAlert[]);
    setLoading(false);
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/predictive-alerts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      await load();
    } catch (err) { console.error(err); }
    setRunning(false);
  };

  const action = async (id: string) => {
    setUpdating(id);
    await supabase.from('predictive_alerts').update({
      actioned:    true,
      actioned_at: new Date().toISOString(),
    }).eq('id', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
    setUpdating(null);
  };

  const dismiss = async (id: string) => {
    setUpdating(id);
    await supabase.from('predictive_alerts').update({
      dismissed:    true,
      dismissed_at: new Date().toISOString(),
    }).eq('id', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
    setUpdating(null);
  };

  const critical = alerts.filter(a => a.severity === 'Critical').length;
  const high     = alerts.filter(a => a.severity === 'High').length;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Predictive Alerts</h2>
          <p className="text-xs text-slate-500 mt-0.5">AI-powered · Runs every hour</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
          <button onClick={runNow} disabled={running}
            className="flex items-center gap-1 bg-white text-slate-900 font-bold text-xs px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all disabled:opacity-50">
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Run Now
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{alerts.length}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Active</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${critical > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-800'}`}>
          <div className={`text-xl font-black ${critical > 0 ? 'text-red-400' : 'text-white'}`}>{critical}</div>
          <div className="text-[10px] text-red-400/70 uppercase tracking-widest mt-0.5">Critical</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${high > 0 ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-slate-800'}`}>
          <div className={`text-xl font-black ${high > 0 ? 'text-orange-400' : 'text-white'}`}>{high}</div>
          <div className="text-[10px] text-orange-400/70 uppercase tracking-widest mt-0.5">High</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
        {(['active', 'actioned'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
              ${filter === f ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {f === 'active' ? 'Active' : 'Actioned'}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <CheckCircle2 size={32} className="text-green-400 mx-auto" />
          <div className="text-slate-400 text-sm">
            {filter === 'active' ? 'Koi predictive alerts nahi — sab theek lag raha hai' : 'Koi actioned alerts nahi'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => {
            const Icon = TYPE_ICON[alert.alert_type] ?? AlertTriangle;
            return (
              <div key={alert.id} className={`bg-slate-800 rounded-xl p-4 space-y-3 border ${
                alert.severity === 'Critical' ? 'border-red-500/30' :
                alert.severity === 'High'     ? 'border-orange-500/30' : 'border-slate-700'}`}>

                {/* Header */}
                <div className="flex items-start gap-3">
                  <Icon size={16} className={
                    alert.severity === 'Critical' ? 'text-red-400' :
                    alert.severity === 'High'     ? 'text-orange-400' :
                    alert.severity === 'Medium'   ? 'text-yellow-400' : 'text-slate-400'
                  } />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{alert.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[alert.severity]}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {TYPE_LABEL[alert.alert_type]} · {new Date(alert.created_at).toLocaleString('en-PK')}
                    </div>
                  </div>
                </div>

                {/* Message */}
                <p className="text-sm text-slate-400">{alert.message}</p>

                {/* Confidence */}
                <ConfidenceBar value={alert.confidence} />

                {/* Actions */}
                {filter === 'active' && (
                  <div className="flex gap-2">
                    <button onClick={() => action(alert.id)} disabled={updating === alert.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 text-xs font-bold py-2 rounded-lg transition-all disabled:opacity-50">
                      {updating === alert.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      Actioned
                    </button>
                    <button onClick={() => dismiss(alert.id)} disabled={updating === alert.id}
                      className="px-3 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-400 text-xs py-2 rounded-lg transition-all disabled:opacity-50">
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PredictiveAlerts;
