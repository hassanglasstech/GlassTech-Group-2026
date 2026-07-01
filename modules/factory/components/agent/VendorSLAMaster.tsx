import React, { useEffect, useState } from 'react';
import {
  Handshake, Plus, Loader2, X, AlertTriangle,
  CheckCircle2, Clock, TrendingUp, TrendingDown, Star
} from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';

// ── Types ─────────────────────────────────────────────────────────────
type Company    = 'Glassco' | 'GTK' | 'GTI' | 'Factory' | 'Nippon';
type VendorType = 'Glass' | 'Aluminium' | 'Chemical' | 'Service' | 'Other';

interface VendorSLA {
  id: string;
  vendor_name: string;
  vendor_type: VendorType;
  company: Company;
  sla_days: number;
  review_days: number;
  last_rate_review?: string;
  next_rate_review?: string;
  breach_count: number;
  total_orders: number;
  on_time_count: number;
  sla_score: number;
  notes?: string;
  active: boolean;
  created_at: string;
}

interface SLALog {
  id: string;
  vendor_sla_id: string;
  vendor_name: string;
  order_ref: string;
  promised_date: string;
  actual_date?: string;
  days_variance?: number;
  status: 'On Time' | 'Breached' | 'Pending';
  notes?: string;
  created_at: string;
}

const SCORE_COLOR = (score: number) =>
  score >= 90 ? 'text-green-400' :
  score >= 70 ? 'text-yellow-400' : 'text-red-400';

const SCORE_BG = (score: number) =>
  score >= 90 ? 'bg-green-500/10 border-green-500/20' :
  score >= 70 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-red-500/10 border-red-500/20';

const COMPANIES: Company[]    = ['Glassco', 'GTK', 'GTI', 'Factory', 'Nippon'];
const VENDOR_TYPES: VendorType[] = ['Glass', 'Aluminium', 'Chemical', 'Service', 'Other'];

const EMPTY_VENDOR = {
  vendor_name: '', vendor_type: 'Glass' as VendorType,
  company: 'Glassco' as Company, sla_days: 7, review_days: 15, notes: '',
};

const EMPTY_LOG = {
  order_ref: '', promised_date: '', actual_date: '',
  status: 'Pending' as 'On Time' | 'Breached' | 'Pending', notes: '',
};

type View = 'list' | 'log';

// ── Component ─────────────────────────────────────────────────────────
const VendorSLAMaster: React.FC = () => {
  const [vendors, setVendors]       = useState<VendorSLA[]>([]);
  const [logs, setLogs]             = useState<SLALog[]>([]);
  const [loading, setLoading]       = useState(true);
  const [view, setView]             = useState<View>('list');
  const [selectedVendor, setSelected] = useState<VendorSLA | null>(null);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [showLogForm, setShowLogForm]       = useState(false);
  const [vendorForm, setVendorForm] = useState({ ...EMPTY_VENDOR });
  const [logForm, setLogForm]       = useState({ ...EMPTY_LOG });
  const [saving, setSaving]         = useState(false);
  const [filterCo, setFilterCo]     = useState<Company | 'All'>('All');

  useEffect(() => { loadVendors(); }, [filterCo]);
  useEffect(() => { if (selectedVendor) loadLogs(selectedVendor.id); }, [selectedVendor]);

  const loadVendors = async () => {
    setLoading(true);
    let q = supabase.from('vendor_sla').select('*').eq('active', true).order('sla_score', { ascending: true });
    if (filterCo !== 'All') q = q.eq('company', filterCo);
    const { data } = await q;
    if (data) setVendors(data as VendorSLA[]);
    setLoading(false);
  };

  const loadLogs = async (vendorId: string) => {
    const { data } = await supabase
      .from('vendor_sla_log')
      .select('*')
      .eq('vendor_sla_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setLogs(data as SLALog[]);
  };

  const saveVendor = async () => {
    if (!vendorForm.vendor_name.trim()) return;
    setSaving(true);
    const today = new Date();
    const nextReview = new Date(today);
    nextReview.setDate(nextReview.getDate() + vendorForm.review_days);
    await supabase.from('vendor_sla').insert({
      ...vendorForm,
      breach_count:  0,
      total_orders:  0,
      on_time_count: 0,
      last_rate_review: today.toISOString().split('T')[0],
      next_rate_review: nextReview.toISOString().split('T')[0],
      active:    true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setVendorForm({ ...EMPTY_VENDOR });
    setShowVendorForm(false);
    await loadVendors();
    setSaving(false);
  };

  const saveLog = async () => {
    if (!selectedVendor || !logForm.order_ref.trim()) return;
    setSaving(true);
    await supabase.from('vendor_sla_log').insert({
      vendor_sla_id: selectedVendor.id,
      vendor_name:   selectedVendor.vendor_name,
      order_ref:     logForm.order_ref.trim(),
      promised_date: logForm.promised_date || null,
      actual_date:   logForm.actual_date || null,
      status:        logForm.status,
      notes:         logForm.notes || null,
      created_at:    new Date().toISOString(),
    });

    // Update vendor stats
    const isOnTime  = logForm.status === 'On Time';
    const isBreached = logForm.status === 'Breached';
    await supabase.from('vendor_sla').update({
      total_orders:  selectedVendor.total_orders + 1,
      on_time_count: isOnTime ? selectedVendor.on_time_count + 1 : selectedVendor.on_time_count,
      breach_count:  isBreached ? selectedVendor.breach_count + 1 : selectedVendor.breach_count,
      updated_at:    new Date().toISOString(),
    }).eq('id', selectedVendor.id);

    setLogForm({ ...EMPTY_LOG });
    setShowLogForm(false);
    await loadVendors();
    await loadLogs(selectedVendor.id);
    setSaving(false);
  };

  // Review due check
  const reviewDue = vendors.filter(v =>
    v.next_rate_review && new Date(v.next_rate_review) <= new Date()
  );

  // Vendor detail view
  if (selectedVendor) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-xs underline">← Back</button>
          <span className="font-black text-white">{selectedVendor.vendor_name}</span>
        </div>

        {/* Score card */}
        <div className={`rounded-xl p-4 border ${SCORE_BG(selectedVendor.sla_score)}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest">SLA Score</div>
              <div className={`text-4xl font-black mt-1 ${SCORE_COLOR(selectedVendor.sla_score)}`}>
                {selectedVendor.sla_score}%
              </div>
            </div>
            <div className="text-right text-xs text-slate-400 space-y-1">
              <div>{selectedVendor.total_orders} orders</div>
              <div className="text-green-400">{selectedVendor.on_time_count} on time</div>
              <div className="text-red-400">{selectedVendor.breach_count} breached</div>
              <div>{selectedVendor.sla_days} day SLA</div>
            </div>
          </div>
          {selectedVendor.next_rate_review && (
            <div className={`text-xs mt-3 ${new Date(selectedVendor.next_rate_review) <= new Date() ? 'text-red-400' : 'text-slate-400'}`}>
              Rate review: {selectedVendor.next_rate_review}
              {new Date(selectedVendor.next_rate_review) <= new Date() && ' ⚠️ DUE'}
            </div>
          )}
        </div>

        {/* Log delivery */}
        <button onClick={() => setShowLogForm(true)}
          className="w-full flex items-center justify-center gap-2 bg-white text-slate-900 font-bold text-xs py-3 rounded-xl hover:bg-slate-100 transition-all">
          <Plus size={14} /> Log Delivery
        </button>

        {showLogForm && (
          <div className="bg-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm">Log Delivery</span>
              <button onClick={() => setShowLogForm(false)}><X size={16} className="text-slate-400" /></button>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Order / PO Ref *</label>
              <input value={logForm.order_ref} onChange={e => setLogForm(p => ({ ...p, order_ref: e.target.value }))}
                placeholder="PO-001 or SO-2473"
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Promised Date</label>
                <input type="date" value={logForm.promised_date}
                  onChange={e => setLogForm(p => ({ ...p, promised_date: e.target.value }))}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Actual Date</label>
                <input type="date" value={logForm.actual_date}
                  onChange={e => setLogForm(p => ({ ...p, actual_date: e.target.value }))}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Status</label>
              <div className="flex gap-2">
                {(['On Time', 'Breached', 'Pending'] as const).map(s => (
                  <button key={s} onClick={() => setLogForm(p => ({ ...p, status: s }))}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all
                      ${logForm.status === s
                        ? s === 'On Time' ? 'bg-green-500 text-white'
                        : s === 'Breached' ? 'bg-red-500 text-white'
                        : 'bg-slate-500 text-white'
                        : 'bg-slate-700 text-slate-400'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={saveLog} disabled={saving || !logForm.order_ref.trim()}
              className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Log'}
            </button>
          </div>
        )}

        {/* Delivery history */}
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Delivery History</div>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No deliveries logged yet</div>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    log.status === 'On Time' ? 'bg-green-400' :
                    log.status === 'Breached' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium">{log.order_ref}</div>
                    <div className="text-[10px] text-slate-500">
                      {log.promised_date && `Promised: ${log.promised_date}`}
                      {log.actual_date && ` · Actual: ${log.actual_date}`}
                      {log.days_variance !== null && log.days_variance !== undefined && (
                        <span className={log.days_variance > 0 ? 'text-red-400' : 'text-green-400'}>
                          {' '}· {log.days_variance > 0 ? `+${log.days_variance}` : log.days_variance}d
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold ${
                    log.status === 'On Time' ? 'text-green-400' :
                    log.status === 'Breached' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {log.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main list view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-white text-lg">Vendor SLA</h2>
          <p className="text-xs text-slate-500 mt-0.5">Delivery performance · Rate reviews</p>
        </div>
        <button onClick={() => setShowVendorForm(true)}
          className="flex items-center gap-2 bg-white text-slate-900 font-bold text-xs px-4 py-2 rounded-xl hover:bg-slate-100 transition-all">
          <Plus size={14} /> Add Vendor
        </button>
      </div>

      {/* Review due alert */}
      {reviewDue.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
          <span className="text-yellow-400 text-xs font-bold">
            {reviewDue.length} vendor{reviewDue.length > 1 ? 's' : ''} ka rate review due hai
          </span>
        </div>
      )}

      {/* Company filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['All', ...COMPANIES] as const).map(c => (
          <button key={c} onClick={() => setFilterCo(c as Company | 'All')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all
              ${filterCo === c ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Add Vendor Form */}
      {showVendorForm && (
        <div className="bg-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">Add Vendor</span>
            <button onClick={() => setShowVendorForm(false)}><X size={16} className="text-slate-400" /></button>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Vendor Name *</label>
            <input value={vendorForm.vendor_name}
              onChange={e => setVendorForm(p => ({ ...p, vendor_name: e.target.value }))}
              placeholder="e.g. Ali Glass Traders"
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Type</label>
              <select value={vendorForm.vendor_type}
                onChange={e => setVendorForm(p => ({ ...p, vendor_type: e.target.value as VendorType }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                {VENDOR_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Company</label>
              <select value={vendorForm.company}
                onChange={e => setVendorForm(p => ({ ...p, company: e.target.value as Company }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
                {COMPANIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">SLA Days</label>
              <input type="number" value={vendorForm.sla_days}
                onChange={e => setVendorForm(p => ({ ...p, sla_days: parseInt(e.target.value) || 7 }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Rate Review (days)</label>
              <input type="number" value={vendorForm.review_days}
                onChange={e => setVendorForm(p => ({ ...p, review_days: parseInt(e.target.value) || 15 }))}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          </div>
          <button onClick={saveVendor} disabled={saving || !vendorForm.vendor_name.trim()}
            className="w-full bg-white text-slate-900 font-black py-3 rounded-xl text-sm uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Vendor'}
          </button>
        </div>
      )}

      {/* Vendor list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
      ) : vendors.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">Koi vendor nahi — Add Vendor se shuru karo</div>
      ) : (
        <div className="space-y-2">
          {vendors.map(v => (
            <button key={v.id} onClick={() => setSelected(v)}
              className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-all">
              <div className="flex items-center gap-3">
                <div className={`text-2xl font-black w-14 text-center ${SCORE_COLOR(v.sla_score)}`}>
                  {v.sla_score}%
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm">{v.vendor_name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {v.vendor_type} · {v.company} · {v.sla_days}d SLA
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    {v.total_orders} orders · {v.breach_count} breaches
                  </div>
                </div>
                {v.next_rate_review && new Date(v.next_rate_review) <= new Date() && (
                  <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default VendorSLAMaster;
