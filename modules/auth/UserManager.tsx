import { toast } from 'sonner';
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';
import {
  Plus, Edit2, Shield, Save, X, CheckCircle2,
  AlertCircle, Loader2, Users, RefreshCw, UserCheck,
  UserX, Lock, Unlock, Eye, EyeOff, Copy, Check
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────
const ROLES = [
  { value: 'super_admin',        label: 'Super Admin',         desc: 'Full access to everything', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'gtk_admin',          label: 'GTK Admin',           desc: 'GTK + GTI companies',        color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'glassco_admin',      label: 'Glassco Admin',       desc: 'Glassco full access',        color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'glassco_production', label: 'Production Staff',    desc: 'Production modules only',    color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'nippon_admin',       label: 'Nippon Admin',        desc: 'Nippon full access',         color: 'bg-rose-100 text-rose-800 border-rose-200' },
];

const COMPANIES = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];

const MODULES = [
  { key: 'hr',           label: 'Human Capital (HR)' },
  { key: 'sales',        label: 'Sales & Distribution' },
  { key: 'projects',     label: 'Projects' },
  { key: 'inventory',    label: 'Inventory (MM)' },
  { key: 'logistics',    label: 'Logistics' },
  { key: 'vendors',      label: 'Vendor Network' },
  { key: 'production',   label: 'Production (PP)' },
  { key: 'accounts',     label: 'Finance / FICO' },
  { key: 'hub',          label: 'Supply Chain Hub' },
  { key: 'requisitions', label: 'Procurement' },
  { key: 'admin',        label: 'Basis Admin' },
];

const ROLE_DEFAULTS: Record<string, { companies: string[]; modules: string[] }> = {
  super_admin:        { companies: [...COMPANIES],                   modules: [] },
  gtk_admin:          { companies: ['GTK','GTI'],                    modules: [] },
  glassco_admin:      { companies: ['Glassco'],                      modules: [] },
  glassco_production: { companies: ['Glassco'],                      modules: ['production','inventory','logistics','requisitions'] },
  nippon_admin:       { companies: ['Nippon'],                       modules: ['sales','inventory','hr','accounts','requisitions'] },
};

interface Profile {
  id:                string;
  email:             string;
  full_name:         string;
  role:              string;
  allowed_companies: string[];
  allowed_modules:   string[];
  time_restricted:   boolean;
  is_active:         boolean;
  last_login:        string | null;
  created_at:        string;
}

const blank = (): Profile => ({
  id: '', email: '', full_name: '',
  role: 'glassco_admin',
  allowed_companies: ['Glassco'],
  allowed_modules: [],
  time_restricted: false,
  is_active: true,
  last_login: null,
  created_at: '',
});

// ── Small helpers ─────────────────────────────────────────────────────
const RoleBadge = ({ role }: { role: string }) => {
  const r = ROLES.find(x => x.value === role);
  return (
    <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase border ${r?.color || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {r?.label || role}
    </span>
  );
};

// ═════════════════════════════════════════════════════════════════════
export default function UserManager() {
  const { user: me } = useAuthStore();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [busy,     setBusy]     = useState(false);
  const [msg,      setMsg]      = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [modal,    setModal]    = useState<'edit' | 'add' | null>(null);
  const [form,     setForm]     = useState<Profile>(blank());
  const [copiedId, setCopiedId] = useState('');

  // ── Guard ──────────────────────────────────────────────────────────
  if (me?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-60 space-y-3">
        <Shield size={36} className="text-slate-300"/>
        <p className="text-sm font-bold text-slate-400 uppercase">Super Admin Access Only</p>
      </div>
    );
  }

  // ── Load ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setMsg({ type: 'err', text: `Load failed: ${error.message}` });
    } else {
      setProfiles(data || []);
    }
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  // ── Open edit ─────────────────────────────────────────────────────
  const openEdit = (p: Profile) => {
    setForm({ ...p });
    setModal('edit');
  };

  const openAdd = () => {
    setForm(blank());
    setModal('add');
  };

  // ── Apply role preset ─────────────────────────────────────────────
  const applyRole = (role: string) => {
    const d = ROLE_DEFAULTS[role] || { companies: [], modules: [] };
    setForm(f => ({ ...f, role, allowed_companies: d.companies, allowed_modules: d.modules }));
  };

  const toggleItem = (field: 'allowed_companies' | 'allowed_modules', val: string) => {
    setForm(f => {
      const arr = f[field] || [];
      return {
        ...f,
        [field]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val],
      };
    });
  };

  // ── Save (UPDATE) ─────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!form.full_name || !form.role) { flash('err', 'Name and Role required.'); return; }
    setBusy(true);

    const payload = {
      full_name:          form.full_name.trim(),
      role:               form.role,
      allowed_companies:  form.allowed_companies,
      allowed_modules:    form.allowed_modules,
      time_restricted:    form.time_restricted,
      is_active:          form.is_active,
    };

    console.log('[UserManager] Updating', form.id, payload);

    const { data, error } = await supabase
      .from('user_profiles')
      .update(payload)
      .eq('id', form.id)
      .select();

    console.log('[UserManager] Update result:', data, error);

    if (error) {
      flash('err', `Save failed: ${error.message}`);
    } else if (!data || data.length === 0) {
      flash('err', 'No rows updated — check RLS policy (run fix_admin_rls.sql)');
    } else {
      flash('ok', `${form.full_name} updated successfully.`);
      setModal(null);
      await load();
    }
    setBusy(false);
  };

  // ── Save (INSERT new profile) ─────────────────────────────────────
  const saveNew = async () => {
    if (!form.id.trim())       { flash('err', 'UUID required — get from Supabase Auth → Users.'); return; }
    if (!form.email.trim())    { flash('err', 'Email required.'); return; }
    if (!form.full_name.trim()){ flash('err', 'Name required.'); return; }
    if (!form.role)            { flash('err', 'Role required.'); return; }
    setBusy(true);

    const payload = {
      id:                form.id.trim(),
      email:             form.email.trim().toLowerCase(),
      full_name:         form.full_name.trim(),
      role:              form.role,
      allowed_companies: form.allowed_companies,
      allowed_modules:   form.allowed_modules,
      time_restricted:   form.time_restricted,
      is_active:         true,
    };

    // Try upsert first — if 409, fall back to plain insert
    let finalError: any = null;
    let success = false;

    // First: try to delete existing row silently (in case of stale duplicate)
    const { error: upsertErr } = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'id', ignoreDuplicates: false })
      .select();

    if (upsertErr) {
      // Fallback: delete then insert
      await supabase.from('user_profiles').delete().eq('id', payload.id);
      const { error: insertErr } = await supabase
        .from('user_profiles')
        .insert(payload)
        .select();
      finalError = insertErr;
      success = !insertErr;
    } else {
      success = true;
    }

    if (!success && finalError) {
      flash('err', `Failed: ${finalError.message}`);
    } else {
      flash('ok', `✓ ${form.full_name} added successfully!`);
      toast.success(`✓ ${form.full_name} added successfully!`, { duration: 4000 });
      setModal(null);
      setForm({ id:'', email:'', full_name:'', role:'glassco_admin', allowed_companies:['Glassco'], allowed_modules:[], time_restricted:false, is_active:true });
      await load();
    }
    setBusy(false);
  };

  // ── Quick toggle active ───────────────────────────────────────────
  const toggleActive = async (p: Profile) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ is_active: !p.is_active })
      .eq('id', p.id);
    if (error) flash('err', error.message);
    else load();
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  };

  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Users size={20} className="text-purple-600"/>
          </div>
          <div>
            <h2 className="font-black text-slate-800 uppercase text-sm tracking-tight">User Roles (SU01)</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase">{profiles.length} registered users</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={load} disabled={busy}
            className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors">
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''}/>
          </button>
          <button onClick={openAdd}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest flex items-center space-x-2 shadow-md transition-all">
            <Plus size={14}/><span>Add User</span>
          </button>
        </div>
      </div>

      {/* Flash message */}
      {msg && (
        <div className={`flex items-center space-x-2.5 p-3.5 rounded-xl border ${msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {msg.type === 'ok' ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
          <p className="text-sm font-bold">{msg.text}</p>
        </div>
      )}

      {/* How to add users */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800">
        <p className="font-black uppercase mb-1">How to add a new user:</p>
        <p>1. Supabase → Authentication → Users → <strong>Add User</strong> → enter Gmail</p>
        <p>2. Copy the UUID that appears</p>
        <p>3. Click <strong>"+ Add User"</strong> above → paste UUID → set role → Save</p>
      </div>

      {/* User list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {busy && profiles.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-slate-300"/>
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-2">
            <Users size={32} className="text-slate-200"/>
            <p className="text-slate-400 text-sm font-bold">No users found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {profiles.map(p => (
              <div key={p.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 gap-3 transition-colors ${!p.is_active ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50'}`}>

                {/* Left: user info */}
                <div className="flex items-center space-x-4 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${p.is_active ? 'bg-purple-100' : 'bg-slate-100'}`}>
                    <span className={`text-xs font-black ${p.is_active ? 'text-purple-600' : 'text-slate-400'}`}>
                      {p.full_name?.slice(0,2).toUpperCase() || '??'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-slate-800 text-sm truncate">{p.full_name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{p.email}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <RoleBadge role={p.role}/>
                      {(p.allowed_companies || []).map(c => (
                        <span key={c} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{c}</span>
                      ))}
                      {p.time_restricted && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-black border border-amber-200">⏰ 9–6</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-[9px] text-slate-400 font-medium hidden lg:block">
                    {p.last_login ? new Date(p.last_login).toLocaleDateString('en-PK') : 'Never'}
                  </span>
                  <button onClick={() => copyId(p.id)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="Copy UUID">
                    {copiedId === p.id ? <Check size={14} className="text-emerald-600"/> : <Copy size={14}/>}
                  </button>
                  <button onClick={() => toggleActive(p)}
                    className={`p-2 rounded-lg transition-colors ${p.is_active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-rose-500 hover:bg-rose-50'}`}
                    title={p.is_active ? 'Deactivate' : 'Activate'}>
                    {p.is_active ? <UserCheck size={15}/> : <UserX size={15}/>}
                  </button>
                  <button onClick={() => openEdit(p)}
                    className="flex items-center space-x-1.5 bg-slate-900 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-colors">
                    <Edit2 size={11}/><span>Edit</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ MODAL ════════════════════════════════════════════════════ */}
      {modal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-start justify-center p-4 z-[500] overflow-y-auto">
          <div className="bg-white w-full max-w-lg my-6 rounded-2xl shadow-2xl border border-slate-200 flex flex-col">

            {/* Modal header */}
            <div className="bg-purple-700 text-white px-7 py-5 rounded-t-2xl flex justify-between items-center">
              <div>
                <h3 className="font-black uppercase tracking-tight text-base">
                  {modal === 'edit' ? `Edit: ${form.full_name}` : 'Add New User'}
                </h3>
                <p className="text-[10px] text-purple-200 mt-0.5 font-bold">
                  {modal === 'edit' ? form.email : 'Set role and permissions'}
                </p>
              </div>
              <button onClick={() => setModal(null)} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
                <X size={18}/>
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">

              {/* UUID — only for new */}
              {modal === 'add' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    Supabase UUID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.id}
                    onChange={e => setForm(f => ({...f, id: e.target.value}))}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="sap-input w-full font-mono text-xs"
                  />
                  <p className="text-[10px] text-slate-400">Get from Supabase → Authentication → Users → copy UUID</p>
                </div>
              )}

              {/* Name + Email */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Full Name <span className="text-rose-500">*</span></label>
                  <input type="text" value={form.full_name}
                    onChange={e => setForm(f=>({...f,full_name:e.target.value}))}
                    className="sap-input w-full text-xs" placeholder="e.g. Hassan Ali"/>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Email {modal==='add' && <span className="text-rose-500">*</span>}</label>
                  <input type="email" value={form.email}
                    onChange={e => setForm(f=>({...f,email:e.target.value}))}
                    className="sap-input w-full text-xs" placeholder="user@gmail.com"
                    disabled={modal==='edit'}/>
                </div>
              </div>

              {/* Role */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Role <span className="text-rose-500">*</span></label>
                <div className="space-y-2">
                  {ROLES.map(r => (
                    <button key={r.value}
                      onClick={() => applyRole(r.value)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${form.role === r.value ? 'bg-purple-50 border-purple-400' : 'bg-white border-slate-200 hover:border-purple-200'}`}>
                      <div>
                        <p className={`font-black text-xs uppercase ${form.role === r.value ? 'text-purple-800' : 'text-slate-700'}`}>{r.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{r.desc}</p>
                      </div>
                      {form.role === r.value && <CheckCircle2 size={16} className="text-purple-600 shrink-0"/>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Companies */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Allowed Companies</label>
                <div className="flex flex-wrap gap-2">
                  {COMPANIES.map(c => (
                    <button key={c}
                      onClick={() => toggleItem('allowed_companies', c)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${form.allowed_companies?.includes(c) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modules */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Module Access</label>
                  <button onClick={() => setForm(f=>({...f,allowed_modules:[]}))}
                    className="text-[10px] font-bold text-blue-600 hover:underline">
                    Clear = All Modules
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">Leave empty = access to all modules. Select specific to restrict.</p>
                <div className="grid grid-cols-2 gap-2">
                  {MODULES.map(m => (
                    <button key={m.key}
                      onClick={() => toggleItem('allowed_modules', m.key)}
                      className={`text-left px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${form.allowed_modules?.includes(m.key) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time restriction + Active */}
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-xs font-black text-slate-800">Office Hours Only</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Mon–Sat 9am–6pm PKT — auto logout after hours</p>
                  </div>
                  <button onClick={() => setForm(f=>({...f,time_restricted:!f.time_restricted}))}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${form.time_restricted ? 'bg-amber-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${form.time_restricted ? 'translate-x-5' : ''}`}/>
                  </button>
                </div>

                {modal === 'edit' && (
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-xs font-black text-slate-800">Account Active</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Inactive users cannot log in</p>
                    </div>
                    <button onClick={() => setForm(f=>({...f,is_active:!f.is_active}))}
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${form.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${form.is_active ? 'translate-x-5' : ''}`}/>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t bg-slate-50 rounded-b-2xl flex justify-end space-x-3">
              <button onClick={() => setModal(null)} className="sap-btn-ghost text-xs">Cancel</button>
              <button
                onClick={modal === 'edit' ? saveEdit : saveNew}
                disabled={busy}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest flex items-center space-x-2 transition-all shadow-md disabled:opacity-50">
                {busy
                  ? <><Loader2 size={14} className="animate-spin"/><span>Saving...</span></>
                  : <><Save size={14}/><span>{modal === 'edit' ? 'Save Changes' : 'Add User'}</span></>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
