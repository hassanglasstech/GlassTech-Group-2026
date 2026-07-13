/**
 * FeatureFlags.tsx — per-company feature entitlements (phased launch control).
 *
 * The founder builds every feature but launches them in phases. This page flips
 * each registered feature ON/OFF for the ACTIVE company. State lives in
 * erp_config (via featureFlagService); hasFeature()/useFeature() read it.
 */

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { useAuthStore } from '@/modules/auth/authStore';
import { toast } from 'sonner';
import { Save, RefreshCw, ToggleLeft, ToggleRight, Flag } from 'lucide-react';
import { FeatureFlagService } from '@/modules/shared/services/featureFlagService';
import {
  FEATURE_REGISTRY, FEATURE_DEFAULTS, FEATURE_GROUPS, type FeatureFlagMap,
} from '@/modules/shared/config/featureFlags';

const FeatureFlags: React.FC = () => {
  const { user, profile } = useAuthStore();
  const company = useAppStore(s => s.selectedCompany) ?? profile?.company ?? user?.company ?? 'Glassco';

  const [flags,   setFlags]   = useState<FeatureFlagMap>(FEATURE_DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [dirty,   setDirty]   = useState(false);

  const load = async () => {
    setLoading(true);
    await FeatureFlagService.loadAsync(company);
    const stored = FeatureFlagService.getFlags(company);
    setFlags({ ...FEATURE_DEFAULTS, ...stored });
    setLoading(false);
    setDirty(false);
  };

  useEffect(() => { load(); }, [company]);

  const toggle = (key: string) => {
    setFlags(prev => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await FeatureFlagService.saveAsync(flags, company);
    setSaving(false);
    if (error) { toast.error(`Save failed: ${error}`); return; }
    toast.success(`Feature flags saved for ${company}`);
    setDirty(false);
  };

  if (loading) {
    return <div className="py-16 text-center text-slate-400 text-xs font-bold">Loading feature flags…</div>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300 max-w-4xl">
      {/* Header */}
      <div className="p-6 rounded-[2rem] shadow-xl text-white bg-gradient-to-r from-[#1A3A6B] to-[#2a5298]">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Flag size={20} /> Feature Flags
            </h2>
            <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-0.5">
              {company} — turn features on as you launch them, phase by phase
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <RefreshCw size={14} /> Reload
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="px-4 py-2 rounded-xl bg-[#B8893A] hover:bg-[#a67a30] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black flex items-center gap-1.5 transition"
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Groups */}
      {FEATURE_GROUPS.map(group => {
        const items = FEATURE_REGISTRY.filter(f => f.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">{group}</h3>
            </div>
            <ul className="divide-y divide-slate-100">
              {items.map(f => {
                const on = flags[f.key] ?? f.defaultEnabled;
                return (
                  <li key={f.key} className="flex items-start justify-between gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{f.label}</span>
                        <code className="text-[10px] text-slate-400 font-mono">{f.key}</code>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{f.description}</p>
                    </div>
                    <button
                      onClick={() => toggle(f.key)}
                      aria-pressed={on}
                      aria-label={`${on ? 'Disable' : 'Enable'} ${f.label}`}
                      className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide transition ${
                        on ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                           : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {on ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      {on ? 'On' : 'Off'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <p className="text-[11px] text-slate-400 px-1">
        Unset features fall back to their default. Turning a feature OFF hides it for <b>{company}</b> only —
        other companies are unaffected.
      </p>
    </div>
  );
};

export default FeatureFlags;
