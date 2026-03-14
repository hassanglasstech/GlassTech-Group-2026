import React, { useState, useEffect } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore, UserRole } from '@/modules/auth/authStore';
import {
  Plus, Edit2, Trash2, Shield, Save, X,
  CheckCircle2, AlertCircle, Loader2, Users, RefreshCw
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────
interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  allowed_companies: string[];
  allowed_modules: string[];
  time_restricted: boolean;
  is_active: boolean;
  last_login: string | null;
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'super_admin',        label: 'Super Admin (All Access)' },
  { value: 'gtk_admin',          label: 'GTK Admin' },
  { value: 'glassco_admin',      label: 'Glassco Admin' },
  { value: 'glassco_production', label: 'Glassco Production' },
  { value: 'nippon_admin',       label: 'Nippon Admin' },
];

const ALL_COMPANIES = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];

const ALL_MODULES = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'hr',          label: 'HR / HCM' },
  { key: 'sales',       label: 'Sales & Distribution' },
  { key: 'projects',    label: 'Projects' },
  { key: 'inventory',   label: 'Inventory / MM' },
  { key: 'logistics',   label: 'Logistics' },
  { key: 'vendors',     label: 'Vendor Network' },
  { key: 'production',  label: 'Production (PP)' },
  { key: 'accounts',    label: 'Finance / FICO' },
  { key: 'hub',         label: 'Supply Chain Hub' },
  { key: 'requisitions',label: 'Procurement' },
  { key: 'admin',       label: 'Basis Admin' },
];

const ROLE_DEFAULTS: Record<UserRole, { companies: string[]; modules: string[] }> = {
  super_admin:        { companies: ALL_COMPANIES, modules: [] },
  gtk_admin:          { companies: ['GTK','GTI'], modules: [] },
  glassco_admin:      { companies: ['Glassco'], modules: [] },
  glassco_production: { companies: ['Glassco'], modules: ['production','inventory','logistics','requisitions'] },
  nippon_admin:       { companies: ['Nippon'], modules: ['sales','inventory','hr','accounts','requisitions'] },
};

// ── Empty form ────────────────────────────────────────────────────────
const emptyForm = (): Partial<UserProfile> => ({
  email: '',
  full_name: '',
  role: 'glassco_admin',
  allowed_companies: ['Glassco'],
  allowed_modules: [],
  time_restricted: false,
  is_active: true,
});

// ═════════════════════════════════════════════════════════════════════
const UserManager: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const [users,    setUsers]    = useState<UserProfile[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [isOpen,   setIsOpen]   = useState(false);
  const [editing,  setEditing]  = useState<UserProfile | null>(null);
  const [form,     setForm]     = useState<Partial<UserProfile>>(emptyForm());

  // Only super_admin can access
  if (currentUser?.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield size={40} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-500 font-bold uppercase text-sm">Access Restricted</p>
          <p className="text-slate-400 text-xs mt-1">Super Admin only</p>
        </div>
      </div>
    );
  }

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setUsers(data);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setIsOpen(true);
  };

  const openEdit = (u: UserProfile) => {
    setEditing(u);
    setForm({ ...u });
    setError('');
    setIsOpen(true);
  };

  // Apply role defaults
  const applyRole = (role: UserRole) => {
    const defaults = ROLE_DEFAULTS[role];
    setForm(f => ({
      ...f,
      role,
      allowed_companies: defaults.companies,
      allowed_modules:   defaults.modules,
    }));
  };

  const toggleCompany = (c: string) => {
    setForm(f => ({
      ...f,
      allowed_companies: f.allowed_companies?.includes(c)
        ? f.allowed_companies.filter(x => x !== c)
        : [...(f.allowed_companies || []), c],
    }));
  };

  const toggleModule = (m: string) => {
    setForm(f => {
      const mods = f.allowed_modules || [];
      return {
        ...f,
        allowed_modules: mods.includes(m)
          ? mods.filter(x => x !== m)
          : [...mods, m],
      };
    });
  };

  const handleSave = async () => {
    if (!form.email || !form.full_name || !form.role) {
      setError('Email, Name and Role are required.');
      return;
    }
    setSaving(true);
    setError('');

    if (editing) {
      // Update existing
      const { error: err } = await supabase
        .from('user_profiles')
        .update({
          full_name:          form.full_name,
          role:               form.role,
          allowed_companies:  form.allowed_companies,
          allowed_modules:    form.allowed_modules,
          time_restricted:    form.time_restricted,
          is_active:          form.is_active,
        })
        .eq('id', editing.id);

      if (err) { setError(err.message); setSaving(false); return; }
      setSuccess('User updated successfully.');

    } else {
      // Create new user in Supabase Auth first
      const { data: authData, error: authErr } = await supabase.auth.admin
        ? // Try admin API if available
          { data: null, error: { message: 'Use Supabase Dashboard to create user' } }
        : { data: null, error: { message: 'Use Supabase Dashboard to create user' } };

      // Since we can't create auth users from frontend (security),
      // just insert profile and show instructions
      setError(
        `To add a new user:\n` +
        `1. Supabase → Authentication → Users → Add User\n` +
        `2. Copy the UUID\n` +
        `3. Come back here and use "Insert Profile" with that UUID`
      );
      setSaving(false);
      return;
    }

    await loadUsers();
    setSaving(false);
    setIsOpen(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleInsertProfile = async () => {
    const uuid = prompt('Paste the UUID from Supabase Auth → Users:');
    if (!uuid || uuid.length < 30) return;
    if (!form.email || !form.full_name || !form.role) {
      setError('Fill in all fields first.');
      return;
    }

    setSaving(true);
    const { error: err } = await supabase.from('user_profiles').insert({
      id:                uuid.trim(),
      email:             form.email,
      full_name:         form.full_name,
      role:              form.role,
      allowed_companies: form.allowed_companies,
      allowed_modules:   form.allowed_modules,
      time_restricted:   form.time_restricted,
      is_active:         form.is_active ?? true,
    });

    if (err) { setError(err.message); setSaving(false); return; }
    setSuccess('User profile created!');
    await loadUsers();
    setSaving(false);
    setIsOpen(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleToggleActive = async (u: UserProfile) => {
    await supabase.from('user_profiles').update({ is_active: !u.is_active }).eq('id', u.id);
    loadUsers();
  };

  const roleColors: Record<string, string> = {
    super_admin:        'bg-purple-100 text-purple-700',
    gtk_admin:          'bg-blue-100 text-blue-700',
    glassco_admin:      'bg-emerald-100 text-emerald-700',
    glassco_production: 'bg-amber-100 text-amber-700',
    nippon_admin:       'bg-rose-100 text-rose-700',
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Users size={20} className="text-purple-600"/>
          </div>
          <div>
            <h2 className="font-black text-slate-800 uppercase tracking-tight">User Management</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase">{users.length} users registered</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={loadUsers} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
            <RefreshCw size={16}/>
          </button>
          <button onClick={openAdd}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest flex items-center space-x-2 transition-all shadow-md">
            <Plus size={14}/><span>Add User</span>
          </button>
        </div>
      </div>

      {/* Success */}
      {success && (
        <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <CheckCircle2 size={16} className="text-emerald-600"/>
          <p className="text-sm text-emerald-700 font-bold">{success}</p>
        </div>
      )}

      {/* Users Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={24} className="animate-spin text-slate-400"/>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left sap-table">
            <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
              <tr>
                <th className="px-5 py-3">Name / Email</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Companies</th>
                <th className="px-5 py-3">Time Lock</th>
                <th className="px-5 py-3">Last Login</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3">
                    <p className="font-black text-slate-800 text-xs">{u.full_name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{u.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase ${roleColors[u.role] || 'bg-slate-100 text-slate-600'}`}>
                      {u.role.replace(/_/g,' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(u.allowed_companies || []).map(c => (
                        <span key={c} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {u.time_restricted
                      ? <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-black">9am–6pm</span>
                      : <span className="text-[9px] text-slate-300 font-bold">—</span>
                    }
                  </td>
                  <td className="px-5 py-3 text-[10px] text-slate-400">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString('en-PK') : 'Never'}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button onClick={() => handleToggleActive(u)}
                      className={`text-[9px] font-black px-2 py-1 rounded-full uppercase transition-colors ${u.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-rose-100 hover:text-rose-700' : 'bg-rose-100 text-rose-700 hover:bg-emerald-100 hover:text-emerald-700'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button onClick={() => openEdit(u)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 size={14}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── FORM MODAL ──────────────────────────────────────────────── */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-start justify-center p-4 z-[400] overflow-y-auto">
          <div className="bg-white w-full max-w-lg my-4 rounded-2xl shadow-2xl border border-slate-200">

            <div className="bg-purple-700 text-white px-7 py-5 rounded-t-2xl flex justify-between items-center">
              <div>
                <h3 className="font-black uppercase tracking-tight">{editing ? 'Edit User' : 'Add New User'}</h3>
                <p className="text-[10px] text-purple-200 mt-0.5">{editing ? editing.email : 'Configure access permissions'}</p>
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-2 rounded-lg"><X size={18}/></button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                  <p className="text-xs text-rose-700 font-bold whitespace-pre-line">{error}</p>
                </div>
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Full Name</label>
                  <input type="text" value={form.full_name || ''} onChange={e => setForm(f=>({...f,full_name:e.target.value}))}
                    className="sap-input w-full text-xs" placeholder="e.g. Hassan Ali"/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Email (Gmail)</label>
                  <input type="email" value={form.email || ''} onChange={e => setForm(f=>({...f,email:e.target.value}))}
                    className="sap-input w-full text-xs" placeholder="user@gmail.com"
                    disabled={!!editing}/>
                </div>
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500">Role</label>
                <div className="grid grid-cols-1 gap-2">
                  {ROLES.map(r => (
                    <button key={r.value} onClick={() => applyRole(r.value)}
                      className={`text-left px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${form.role === r.value ? 'bg-purple-50 border-purple-300 text-purple-800' : 'border-slate-200 text-slate-600 hover:border-purple-200'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Companies */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-slate-500">Allowed Companies</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_COMPANIES.map(c => (
                    <button key={c} onClick={() => toggleCompany(c)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${form.allowed_companies?.includes(c) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modules */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Module Access</label>
                  <button onClick={() => setForm(f=>({...f,allowed_modules:[]}))}
                    className="text-[10px] text-blue-600 font-bold hover:underline">All Modules (clear)</button>
                </div>
                <p className="text-[10px] text-slate-400">Empty = all modules allowed. Select to restrict.</p>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_MODULES.map(m => (
                    <button key={m.key} onClick={() => toggleModule(m.key)}
                      className={`text-left px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${form.allowed_modules?.includes(m.key) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4">
                <div>
                  <p className="text-xs font-black text-slate-700">Time Restriction</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Mon–Sat 9am–6pm PKT only</p>
                </div>
                <button onClick={() => setForm(f=>({...f,time_restricted:!f.time_restricted}))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.time_restricted ? 'bg-amber-500' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.time_restricted ? 'translate-x-5' : ''}`}/>
                </button>
              </div>

            </div>

            <div className="px-6 py-4 border-t bg-white rounded-b-2xl flex justify-between items-center">
              {!editing && (
                <button onClick={handleInsertProfile} disabled={saving}
                  className="text-xs font-bold text-purple-600 hover:text-purple-800 border border-purple-200 px-4 py-2 rounded-xl hover:bg-purple-50 transition-colors">
                  Insert Profile (with UUID)
                </button>
              )}
              <div className={`flex space-x-3 ${editing ? 'ml-auto' : ''}`}>
                <button onClick={() => setIsOpen(false)} className="sap-btn-ghost text-xs">Cancel</button>
                {editing && (
                  <button onClick={handleSave} disabled={saving}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-xl font-black uppercase text-xs flex items-center space-x-2 transition-all">
                    {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                    <span>Save Changes</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManager;
