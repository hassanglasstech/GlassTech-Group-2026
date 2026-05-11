/**
 * TaxSettings.tsx — Tax/GST Configuration Page
 *
 * Single-page UI for enabling/disabling GST + WHT per company.
 * Off by default — flip toggle when business needs to issue GST invoices.
 */

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { toast } from 'sonner';
import {
  Settings, Save, RefreshCw, AlertCircle, CheckCircle2, Calculator, Percent, FileCheck,
} from 'lucide-react';
import {
  loadTaxSettings, saveTaxSettings, TaxSettings as TaxSettingsType, DEFAULT_TAX_SETTINGS,
} from '@/modules/admin/services/taxSettingsService';

const TaxSettings: React.FC = () => {
  const { user, profile } = useAuthStore();
  const company           = useAppStore(s => s.selectedCompany) ?? profile?.company ?? user?.company ?? 'Glassco';

  const [settings, setSettings] = useState<TaxSettingsType>(DEFAULT_TAX_SETTINGS);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await loadTaxSettings(company);
    if (error) toast.error(error);
    if (data) setSettings(data);
    setLoading(false);
    setDirty(false);
  };

  useEffect(() => { load(); }, [company]);

  const updateField = <K extends keyof TaxSettingsType>(key: K, value: TaxSettingsType[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await saveTaxSettings(company, settings);
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error}`);
    } else {
      toast.success('Tax settings saved');
      setDirty(false);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-slate-300 text-xs font-bold">Loading tax settings…</div>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300 max-w-4xl">

      {/* Header */}
      <div className={`p-6 rounded-[2rem] shadow-xl text-white ${settings.enabled ? 'bg-gradient-to-r from-emerald-900 to-emerald-700' : 'bg-gradient-to-r from-slate-900 to-slate-700'}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Calculator size={20}/> Tax / GST Settings
            </h2>
            <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-0.5">
              {company} · {settings.enabled ? 'TAX ACTIVE' : 'TAX DISABLED'}
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white border border-white/25 rounded-lg text-xs font-bold hover:bg-white/20">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/> Refresh
          </button>
        </div>
      </div>

      {/* Master toggle */}
      <div className={`border rounded-2xl p-5 ${settings.enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-black text-slate-900 flex items-center gap-2">
              {settings.enabled ? <CheckCircle2 size={18} className="text-emerald-700"/> : <AlertCircle size={18} className="text-amber-700"/>}
              Enable Tax / GST on Invoices
            </p>
            <p className="text-[11px] text-slate-600 mt-1">
              {settings.enabled
                ? 'Invoices will include GST line, post to GST output account, and require NTN/STRN if configured below.'
                : 'Invoices issued without GST. No tax calculation, no GST posting. Toggle this ON when business starts requiring GST invoices.'}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={settings.enabled} onChange={e => updateField('enabled', e.target.checked)} className="sr-only peer"/>
            <div className="w-14 h-7 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-200 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"/>
          </label>
        </div>
      </div>

      {/* GST settings — only enabled if master toggle on */}
      <div className={`bg-white border border-slate-200 rounded-2xl p-5 ${!settings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Percent size={14}/> GST Configuration
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase">GST Rate (%)</label>
            <input type="number" value={settings.gst_rate} step="0.1"
              onChange={e => updateField('gst_rate', Number(e.target.value))}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"/>
          </div>
          <div></div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase">Input GST Account (Asset)</label>
            <input type="text" value={settings.gst_input_account}
              onChange={e => updateField('gst_input_account', e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400"/>
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase">Output GST Account (Liability)</label>
            <input type="text" value={settings.gst_output_account}
              onChange={e => updateField('gst_output_account', e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400"/>
          </div>
        </div>
      </div>

      {/* WHT settings */}
      <div className={`bg-white border border-slate-200 rounded-2xl p-5 ${!settings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
            <Percent size={14}/> Withholding Tax (WHT)
          </p>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={settings.wht_enabled} onChange={e => updateField('wht_enabled', e.target.checked)} className="sr-only peer"/>
            <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"/>
          </label>
        </div>
        <div className={`grid grid-cols-2 gap-4 ${!settings.wht_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase">WHT Rate (%)</label>
            <input type="number" value={settings.wht_rate} step="0.1"
              onChange={e => updateField('wht_rate', Number(e.target.value))}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"/>
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase">WHT Payable Account</label>
            <input type="text" value={settings.wht_account}
              onChange={e => updateField('wht_account', e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400"/>
          </div>
        </div>
      </div>

      {/* Compliance toggles */}
      <div className={`bg-white border border-slate-200 rounded-2xl p-5 ${!settings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
          <FileCheck size={14}/> Compliance Requirements
        </p>
        <div className="space-y-3">
          {([
            ['ntn_required',   'Require NTN on every invoice',                     'Reject invoices without NTN field on client'],
            ['strn_required',  'Require STRN on every invoice',                    'Reject invoices without STRN field on client'],
            ['fbr_einvoicing', 'Enable FBR e-Invoicing (PRAL integration)',        'Future: post each invoice to FBR PRAL system'],
          ] as Array<[keyof TaxSettingsType, string, string]>).map(([key, label, desc]) => (
            <label key={String(key)} className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={Boolean(settings[key])}
                onChange={e => updateField(key, e.target.checked as TaxSettingsType[typeof key])}
                className="mt-0.5 w-4 h-4"/>
              <div>
                <p className="text-xs font-bold text-slate-800">{label}</p>
                <p className="text-[10px] text-slate-500">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="sticky bottom-4 flex justify-end">
        <button onClick={handleSave} disabled={!dirty || saving}
          className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-black hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2 shadow-lg">
          <Save size={16}/>
          {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>
    </div>
  );
};

export default TaxSettings;
