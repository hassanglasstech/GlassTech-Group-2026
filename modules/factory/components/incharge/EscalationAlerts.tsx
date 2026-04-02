import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

interface EscalationAlert {
  id: string;
  event_id: string;
  sector: string;
  event_type: string;
  priority: string;
  hours_overdue: number;
  alert_type: string;
  resolved: boolean;
  created_at: string;
}

const EscalationAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<EscalationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => { loadAlerts(); }, []);

  const loadAlerts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('factory_escalation_alerts')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setAlerts(data as EscalationAlert[]);
    setLoading(false);
  };

  const resolve = async (id: string) => {
    setResolving(id);
    await supabase
      .from('factory_escalation_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
    setResolving(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 size={18} className="animate-spin text-slate-500" />
    </div>
  );

  if (alerts.length === 0) return (
    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
      <CheckCircle2 size={18} className="text-green-400" />
      <span className="text-green-400 text-sm font-medium">No overdue escalations</span>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={13} className="text-red-400" />
        <span className="text-xs text-red-400 uppercase tracking-widest font-bold">
          {alerts.length} Overdue Escalation{alerts.length > 1 ? 's' : ''}
        </span>
      </div>
      {alerts.map(alert => (
        <div
          key={alert.id}
          className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3"
        >
          <Clock size={15} className="text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-red-300 text-sm">{alert.event_type}</div>
            <div className="text-xs text-red-400/70 mt-0.5">
              {alert.sector} · {alert.hours_overdue}hr overdue · {alert.priority}
            </div>
          </div>
          <button
            onClick={() => resolve(alert.id)}
            disabled={resolving === alert.id}
            className="shrink-0 bg-red-500/20 hover:bg-red-500/40 text-red-300 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
          >
            {resolving === alert.id ? <Loader2 size={12} className="animate-spin" /> : 'Dismiss'}
          </button>
        </div>
      ))}
    </div>
  );
};

export default EscalationAlerts;
