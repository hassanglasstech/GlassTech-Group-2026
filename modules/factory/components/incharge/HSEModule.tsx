import React, { useEffect, useState } from 'react';
import { ShieldCheck, Plus, Loader2, X, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';

type Severity = 'Near Miss' | 'Minor' | 'Major' | 'Critical';
type Category = 'Injury' | 'Fire' | 'Chemical' | 'Equipment' | 'Slip/Fall' | 'Other';
type ActionStatus = 'Pending' | 'In Progress' | 'Completed';

interface Incident {
  id: string;
  company: string;
  incident_date: string;
  incident_time: string;
  location: string;
  severity: Severity;
  category: Category;
  description: string;
  injured_person: string;
  reported_by: string;
  corrective_action: string;
  action_due_date: string;
  action_status: ActionStatus;
  closed: boolean;
  created_at: string;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  'Near Miss': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Minor':     'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Major':     'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Critical':  'bg-red-500/20 text-red-400 border-red-500/30',
};

const EMPTY = {
  company: 'Factory', incident_date: new Date().toISOString().split('T')[0],
  incident_time: '', location: '', severity: 'Minor' as Severity,
  category: 'Injury' as Category, description: '', injured_person: '',
  corrective_action: '', action_due_date: '', action_status: 'Pending' as ActionStatus,
};

const HSEModule: React.FC = () => {
  const { user } = useAuthStore();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ ...EMPTY });
  const [saving, setSaving]       = useState(false);
  const [filter, setFilter]       = useState<'open' | 'closed'>('open');

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    // SEC-6: Explicit company filter prevents cross-tenant data exposure.
    // useAuthStore.getState() is safe here (non-hook context) because Zustand
    // exposes getState() outside React's render cycle.
    const company = useAuthStore.getState().profile?.company ?? 'Factory';
    const { data } = await supabase
      .from('hse_incidents')
      .select('*')
      .eq('company', company)
      .eq('closed', filter === 'closed')
      .order('incident_date', { ascending: false });
    if (data) setIncidents(data as Incident[]);
    setLoading(false);
  };

  const save = async () => {
    if (!form.description.trim()) return;
    setSaving(true);

    const { data: inserted, error: insertError } = await supabase
      .from('hse_incidents')
      .insert({
        ...form,
        reported_by: user?.fullName || 'Incharge',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[HSEModule] insert failed:', insertError.message);
    }

    // HSE-2: Critical incidents trigger an immediate server-side escalation.
    // The Edge Function looks up the HSE Manager for this company, writes to
    // hse_escalations (30-min SLA), and fires a WhatsApp notification.
    // Escalation failure is non-blocking — the incident is already saved.
    if (form.severity === 'Critical' && inserted?.id) {
      supabase.functions.invoke('hse-escalation', {
        body: {
          incidentId:  inserted.id,
          company:     (inserted as any).company ?? '',
          severity:    form.severity,
          description: form.description,
          location:    form.location,
          reportedBy:  user?.fullName || 'Incharge',
        },
      }).catch((err: Error) => {
        // Non-blocking: log but never suppress the incident save
        console.error('[HSEModule] hse-escalation invoke failed:', err.message);
      });
    }

    await load();
    setShowForm(false);
    setForm({ ...EMPTY });
    setSaving(false);
  };

  // HSE-1: An incident may only be closed if corrective_action is non-empty
  // AND action_status is 'Completed'. Closing without corrective documentation
  // breaks ISO 45001 compliance and voids insurance claims on repeat incidents.
  const closeIncident = async (id: string) => {
    // Find the incident in local state first (already loaded)
    const incident = incidents.find(i => i.id === id);
    if (!incident) return;

    if (!incident.corrective_action?.trim()) {
      alert(
        'Cannot close incident: Corrective action is required before closure.\n\n' +
        'Document the root cause and corrective measures taken, then try again.'
      );
      return;
    }
    if (incident.action_status !== 'Completed') {
      alert(
        `Cannot close incident: Action status is "${incident.action_status}".\n\n` +
        'Set Action Status to "Completed" before closing.'
      );
      return;
    }

    await supabase.from('hse_incidents').update({
      closed: true, closed_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', id);
    await load();
  };

  const updateAction = async (id: string, action_status: ActionStatus) => {
    await supabase.from('hse_incidents').update({ action_status, updated_at: new Date().toISOString() }).eq('id', id);
    setIncidents(prev => prev.map(i => i.id === id ? { ...i, action_status } : i));
  };

  const critical = incidents.filter(i => i.severity === 'Critical' || i.severity === 'Major').length;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">HSE Module</h2>
          <p className="text-xs text-slate-500 mt-0.5">Health · Safety · Environment</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-white text-slate-900 font-bold text-xs px-4 py-2 rounded-xl hover:bg-slate-100 transition-all">
          <Plus size={14} /> Log Incident
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-white">{incidents.length}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Open</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${critical > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-800'}`}>
          <div className={`text-xl font-black ${critical > 0 ? 'text-red-400' : 'text-white'}`}>{critical}</div>
          <div className="text-[10px] text-red-400/70 uppercase tracking-widest mt-0.5">Critical/Major</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 text-center">
          <div className="text-xl font-black text-yellow-400">
            {incidents.filter(i => i.action_status === 'Pending').length}
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Action Pending</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
        {(['open', 'closed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
              ${filter === f ? 'bg-white text-slate-900' : 'text-slate-400'}`}>
            {f === 'open' ? 'Open' : 'Closed'}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">Log Incident</span>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-slate-400" /></button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date</label>
              <input type="date" value={form.incident_date}
                onChange={e => setForm(p => ({ ...p, incident_date: e.target.value }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Time</label>
              <input type="time" value={form.incident_time}
                onChange={e => setForm(p => ({ ...p, incident_time: e.target.value }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Location</label>
            <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
              placeholder="e.g. Cutting Floor" className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Severity</label>
              <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value as Severity }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                {(['Near Miss', 'Minor', 'Major', 'Critical'] as Severity[]).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as Category }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                {(['Injury', 'Fire', 'Chemical', 'Equipment', 'Slip/Fall', 'Other'] as Category[]).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description *</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3} placeholder="Kya hua, kaise hua..."
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Injured Person (if any)</label>
            <input value={form.injured_person} onChange={e => setForm(p => ({ ...p, injured_person: e.target.value }))}
              placeholder="Name" className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Corrective Action</label>
            <textarea value={form.corrective_action} onChange={e => setForm(p => ({ ...p, corrective_action: e.target.value }))}
              rows={2} placeholder="Kya karna hai..."
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Action Due Date</label>
            <input type="date" value={form.action_due_date}
              onChange={e => setForm(p => ({ ...p, action_due_date: e.target.value }))}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
          </div>

          <button onClick={save} disabled={saving || !form.description.trim()}
            className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider hover:bg-slate-100 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Submit Incident'}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          {filter === 'open' ? 'No open incidents' : 'No closed incidents'}
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map(inc => (
            <div key={inc.id} className="bg-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[inc.severity]}`}>
                      {inc.severity}
                    </span>
                    <span className="text-xs text-slate-400">{inc.category}</span>
                    <span className="text-xs text-slate-600">{inc.incident_date}</span>
                  </div>
                  <p className="text-sm text-white mt-1">{inc.description}</p>
                  {inc.location && <div className="text-xs text-slate-500 mt-0.5">📍 {inc.location}</div>}
                  {inc.injured_person && <div className="text-xs text-red-400 mt-0.5">🤕 {inc.injured_person}</div>}
                </div>
              </div>

              {inc.corrective_action && (
                <div className="bg-slate-700/50 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Corrective Action</div>
                  <div className="text-xs text-slate-300">{inc.corrective_action}</div>
                  {inc.action_due_date && <div className="text-[10px] text-slate-500 mt-1">Due: {inc.action_due_date}</div>}
                </div>
              )}

              {!inc.closed && (
                <div className="flex items-center gap-2">
                  <select value={inc.action_status}
                    onChange={e => updateAction(inc.id, e.target.value as ActionStatus)}
                    className="flex-1 bg-slate-700 text-white text-xs rounded-lg px-3 py-2 outline-none">
                    {(['Pending', 'In Progress', 'Completed'] as ActionStatus[]).map(s => <option key={s}>{s}</option>)}
                  </select>
                  <button onClick={() => closeIncident(inc.id)}
                    className="bg-green-500/20 hover:bg-green-500/40 text-green-400 text-xs px-3 py-2 rounded-lg transition-all flex items-center gap-1">
                    <CheckCircle2 size={12} /> Close
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HSEModule;
