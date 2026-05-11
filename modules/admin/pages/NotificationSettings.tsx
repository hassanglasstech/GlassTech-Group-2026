/**
 * NotificationSettings.tsx — Sprint 35
 *
 * Admin page at /admin/alert-settings.
 * Lets owner / admin configure per-company ERP alert thresholds,
 * WhatsApp webhook, daily digest, and off-hours suppression.
 *
 * Sections
 *   1. Company selector
 *   2. Invoice & Finance thresholds
 *   3. Operations thresholds (tempering, PR, sync, stock)
 *   4. Notification channels (WhatsApp webhook, daily digest, off-hours)
 *   5. Run checks now + last-run status
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bell, Save, RefreshCw, Webhook, Mail, Clock, Moon,
  CreditCard, Flame, ClipboardList, Package, Scale,
  AlertTriangle, CheckCircle2, Settings, Play,
} from 'lucide-react';
import { useAuthStore }  from '@/modules/auth/authStore';
import { useAppStore }   from '@/modules/shared/store/appStore';
import { AlertService, AlertThresholds } from '@/modules/shared/services/alertService';

// ─────────────────────────────────────────────────────────────────────
const COMPANIES  = ['Glassco', 'GTK', 'GTI', 'Nippon', 'Factory'] as const;
const ALLOWED    = new Set(['super_admin', 'owner', 'hassan', 'admin', 'glassco_admin']);

const DEFAULT: Omit<AlertThresholds, 'company'> = {
  invoice_overdue_days:     30,
  tempering_overdue_days:   7,
  pr_approval_overdue_days: 3,
  sync_queue_threshold:     50,
  gl_imbalance_tolerance:   0.01,
  low_stock_threshold:      0,
  daily_digest_enabled:     false,
  digest_email:             '',
  whatsapp_webhook_url:     '',
  suppress_offhours:        false,
};

// ─────────────────────────────────────────────────────────────────────
// Small reusable input components
// ─────────────────────────────────────────────────────────────────────

interface SliderRowProps {
  label:    string;
  sub?:     string;
  icon:     React.ReactNode;
  value:    number;
  min:      number;
  max:      number;
  step?:    number;
  unit?:    string;
  onChange: (v: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({ label, sub, icon, value, min, max, step = 1, unit = 'days', onChange }) => (
  <div className="flex items-start gap-4 py-3.5 border-b border-slate-100 last:border-0">
    <div className="mt-0.5 text-slate-400 flex-shrink-0">{icon}</div>
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-[11px] font-black text-slate-700 uppercase">{label}</p>
          {sub && <p className="text-[9px] text-slate-400">{sub}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={e => onChange(Number(e.target.value))}
            className="w-16 text-center text-[11px] font-black text-slate-800 border border-slate-300 rounded-lg px-1.5 py-1 focus:outline-none focus:border-blue-400"
          />
          <span className="text-[9px] text-slate-400 font-bold">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full accent-blue-600"
      />
      <div className="flex justify-between text-[8px] text-slate-300 font-bold mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  </div>
);

interface ToggleRowProps {
  label:    string;
  sub?:     string;
  icon?:    React.ReactNode;
  checked:  boolean;
  onChange: (v: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, sub, icon, checked, onChange }) => (
  <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
    {icon && <div className="text-slate-400 flex-shrink-0">{icon}</div>}
    <div className="flex-1">
      <p className="text-[11px] font-black text-slate-700 uppercase">{label}</p>
      {sub && <p className="text-[9px] text-slate-400">{sub}</p>}
    </div>
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-slate-200'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  </div>
);

// ─────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────

const NotificationSettings: React.FC = () => {
  const user       = useAuthStore(s => s.user);
  const appCompany = useAppStore(s => s.selectedCompany);

  if (!user) return <Navigate to="/" replace />;
  if (!ALLOWED.has(user.role || '')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center">
          <AlertTriangle size={36} className="mx-auto text-amber-500 mb-3" />
          <p className="text-sm font-bold text-slate-700">Alert Settings requires admin / owner role.</p>
        </div>
      </div>
    );
  }

  const [company, setCompany]       = useState<string>(appCompany || 'Glassco');
  const [cfg, setCfg]               = useState<AlertThresholds>({ ...DEFAULT, company });
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [running, setRunning]       = useState(false);
  const [lastRun, setLastRun]       = useState<string | null>(null);
  const [runStatus, setRunStatus]   = useState<'idle' | 'ok' | 'error'>('idle');
  const [dirty, setDirty]           = useState(false);

  // Load thresholds when company changes
  const load = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    try {
      const t = await AlertService.loadThresholds(company);
      setCfg({ ...t, company });
    } catch {
      toast.error('Failed to load thresholds');
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const patch = <K extends keyof AlertThresholds>(key: K, val: AlertThresholds[K]) => {
    setCfg(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { ok, error } = await AlertService.saveThresholds(cfg);
      if (!ok) throw new Error(error);
      toast.success(`Alert thresholds saved for ${company}`);
      setDirty(false);
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRunChecks = async () => {
    setRunning(true);
    setRunStatus('idle');
    try {
      await AlertService.runChecks(company);
      setLastRun(new Date().toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' }));
      setRunStatus('ok');
      toast.success(`Checks complete for ${company} — open the bell to see new alerts`);
    } catch {
      setRunStatus('error');
      toast.error('Some checks failed');
    } finally {
      setRunning(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">

      {/* Page header */}
      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#354a5f] text-white px-6 py-5 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell size={22} className="text-blue-300" />
            <div>
              <h1 className="text-base font-black uppercase tracking-widest">Alert Settings</h1>
              <p className="text-[10px] text-blue-200 font-bold">ERP notification thresholds &amp; channels</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Run checks */}
            <button
              onClick={handleRunChecks}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase transition-colors disabled:opacity-60"
            >
              {running ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
              {running ? 'Running…' : 'Run checks now'}
            </button>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase transition-colors disabled:opacity-50"
            >
              {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Run-check status bar */}
      {runStatus !== 'idle' && lastRun && (
        <div className={`px-6 py-2 text-[10px] font-bold flex items-center gap-2 ${runStatus === 'ok' ? 'bg-emerald-50 text-emerald-700 border-b border-emerald-100' : 'bg-red-50 text-red-600 border-b border-red-100'}`}>
          {runStatus === 'ok'
            ? <><CheckCircle2 size={12} /> Checks ran at {lastRun} — open the bell icon to see new alerts</>
            : <><AlertTriangle size={12} /> Checks completed with some errors (see browser console)</>}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Company selector */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Company</p>
          <div className="flex gap-2 flex-wrap">
            {COMPANIES.map(c => (
              <button
                key={c}
                onClick={() => { setCompany(c); setDirty(false); }}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-colors ${company === c ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <RefreshCw size={24} className="mx-auto text-slate-200 animate-spin mb-3" />
            <p className="text-[10px] font-bold text-slate-400 uppercase">Loading thresholds…</p>
          </div>
        ) : (
          <>
            {/* ── Finance thresholds ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
                <CreditCard size={14} className="text-rose-500" />
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Finance Thresholds</span>
              </div>
              <div className="px-5">
                <SliderRow
                  label="Invoice Overdue After"
                  sub="Fire alert when invoice is unpaid past due date by N days"
                  icon={<CreditCard size={14} />}
                  value={cfg.invoice_overdue_days}
                  min={1} max={90}
                  onChange={v => patch('invoice_overdue_days', v)}
                />
                <div className="py-3.5 border-b border-slate-100">
                  <p className="text-[11px] font-black text-slate-700 uppercase mb-1">GL Imbalance Tolerance</p>
                  <p className="text-[9px] text-slate-400 mb-2">Fire alert when trial balance Dr ≠ Cr by more than this amount (PKR)</p>
                  <div className="flex items-center gap-2">
                    <Scale size={14} className="text-orange-400" />
                    <input
                      type="number"
                      value={cfg.gl_imbalance_tolerance}
                      min={0}
                      step={0.01}
                      onChange={e => patch('gl_imbalance_tolerance', parseFloat(e.target.value) || 0)}
                      className="w-32 text-[11px] font-black text-slate-800 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
                    />
                    <span className="text-[9px] text-slate-400 font-bold">PKR (0.01 = any imbalance)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Operations thresholds ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
                <Settings size={14} className="text-blue-500" />
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Operations Thresholds</span>
              </div>
              <div className="px-5">
                <SliderRow
                  label="Tempering Vendor SLA"
                  sub="Alert when glass is at tempering vendor for more than N days"
                  icon={<Flame size={14} />}
                  value={cfg.tempering_overdue_days}
                  min={1} max={30}
                  onChange={v => patch('tempering_overdue_days', v)}
                />
                <SliderRow
                  label="PR Approval Wait"
                  sub="Alert when purchase requisition is Pending approval for N days"
                  icon={<ClipboardList size={14} />}
                  value={cfg.pr_approval_overdue_days}
                  min={1} max={14}
                  onChange={v => patch('pr_approval_overdue_days', v)}
                />
                <SliderRow
                  label="Offline Sync Queue Limit"
                  sub="Alert when offline write queue exceeds N items"
                  icon={<RefreshCw size={14} />}
                  value={cfg.sync_queue_threshold}
                  min={5} max={200}
                  unit="items"
                  onChange={v => patch('sync_queue_threshold', v)}
                />
                <div className="py-3.5">
                  <p className="text-[11px] font-black text-slate-700 uppercase mb-1">Low Stock Threshold</p>
                  <p className="text-[9px] text-slate-400 mb-2">Alert when store item qty falls below N. Set 0 to disable.</p>
                  <div className="flex items-center gap-2">
                    <Package size={14} className="text-amber-400" />
                    <input
                      type="number"
                      value={cfg.low_stock_threshold}
                      min={0}
                      step={1}
                      onChange={e => patch('low_stock_threshold', parseInt(e.target.value) || 0)}
                      className="w-24 text-[11px] font-black text-slate-800 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
                    />
                    <span className="text-[9px] text-slate-400 font-bold">{cfg.low_stock_threshold === 0 ? 'Disabled' : `fire when qty < ${cfg.low_stock_threshold}`}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Notification channels ── */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
                <Webhook size={14} className="text-violet-500" />
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Notification Channels</span>
              </div>
              <div className="px-5">

                {/* WhatsApp webhook */}
                <div className="py-3.5 border-b border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Webhook size={13} className="text-violet-400" />
                    <p className="text-[11px] font-black text-slate-700 uppercase">WhatsApp Webhook URL</p>
                  </div>
                  <p className="text-[9px] text-slate-400 mb-2">
                    POST JSON <code className="bg-slate-100 px-1 rounded text-[8px]">{'{ title, body, severity, company }'}</code> on every critical alert.
                    Use n8n / Make.com / your own API.
                  </p>
                  <input
                    type="url"
                    placeholder="https://hook.n8n.cloud/..."
                    value={cfg.whatsapp_webhook_url}
                    onChange={e => patch('whatsapp_webhook_url', e.target.value)}
                    className="w-full text-[10px] text-slate-700 border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400 placeholder-slate-300"
                  />
                </div>

                {/* Daily digest */}
                <ToggleRow
                  label="Daily Digest Email"
                  sub="Send a daily summary of all active alerts to the address below"
                  icon={<Mail size={13} />}
                  checked={cfg.daily_digest_enabled}
                  onChange={v => patch('daily_digest_enabled', v)}
                />

                {cfg.daily_digest_enabled && (
                  <div className="pb-3.5 border-b border-slate-100 pl-6 space-y-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-500 mb-1">Digest email address</p>
                      <input
                        type="email"
                        placeholder="alerts@glassco.com"
                        value={cfg.digest_email}
                        onChange={e => patch('digest_email', e.target.value)}
                        className="w-full text-[10px] text-slate-700 border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400 placeholder-slate-300"
                      />
                    </div>
                  </div>
                )}

                {/* Off-hours suppression */}
                <ToggleRow
                  label="Suppress Off-Hours Alerts"
                  sub="Don't fire checks outside 08:00–22:00 PKT (Asia/Karachi)"
                  icon={<Moon size={13} />}
                  checked={cfg.suppress_offhours}
                  onChange={v => patch('suppress_offhours', v)}
                />
              </div>
            </div>

            {/* ── Save button (bottom) ── */}
            <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-slate-200 px-5 py-4">
              <p className="text-[9px] text-slate-400 font-bold">
                {dirty ? '● Unsaved changes' : 'All changes saved'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={load}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-bold uppercase hover:bg-slate-200 transition-colors"
                >
                  <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                  Reset
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase transition-colors disabled:opacity-50"
                >
                  {saving ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                  {saving ? 'Saving…' : 'Save thresholds'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default NotificationSettings;
