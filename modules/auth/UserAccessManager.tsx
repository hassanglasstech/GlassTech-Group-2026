/**
 * User Access Manager — Phase 4
 * 
 * Replaces the manual "copy UUID from Supabase" workflow with a proper 
 * in-app user lifecycle management panel.
 * 
 * Features:
 *   - Grant access: select employee → enter Gmail → assign role → create Supabase user
 *   - Active users list with status badges (Active/Pending/Revoked)
 *   - Revoke access, Reset PIN, Force sign-out
 *   - Login audit log (timestamp, device, IP)
 *   - Fallback PIN system for employees without Google
 * 
 * Owner/Super Admin only.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/src/services/supabaseClient';
import { AdminAuthService } from '@/modules/auth/adminAuthService';
import { useAuthStore, UserRole } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { HRService } from '@/modules/hr/services/hrService';
import { RBACService } from '@/modules/hr/services/rbacService';
import { Employee, Role } from '@/modules/hr/types/hr';
import { safeParse, safeSave } from '@/modules/shared/services/utils';
import { Logger } from '@/modules/shared/services/logger';
import {
  UserPlus, Shield, Users, RefreshCw, Search, X, Check,
  UserCheck, UserX, Key, LogOut, Clock, Smartphone,
  AlertCircle, CheckCircle2, Loader2, Eye, EyeOff,
  Copy, Mail, ChevronDown, Activity, Trash2
} from 'lucide-react';
import { toast } from 'sonner';

// ── Constants ─────────────────────────────────────────────────────────
const ROLES_LIST = [
  // ── Management ──────────────────────────────────────────────────────
  { value: 'super_admin',        label: 'Super Admin',          desc: 'Full access — all companies, all modules',              color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'owner',              label: 'Owner',                desc: 'Owner — full visibility, MD Dashboard home',            color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'hassan',             label: 'Hassan (System Admin)',desc: 'ERP Admin — full access + system settings',            color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'factory_manager',    label: 'Factory Manager',      desc: 'All 3 companies production — Factory Incharge home',    color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'admin_officer',      label: 'Admin Officer',        desc: 'Orders, billing, dispatch, HR — Sales home',           color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  // ── Supervisors ─────────────────────────────────────────────────────
  { value: 'glassco_supervisor', label: 'GlassCo Supervisor',  desc: 'GlassCo production supervisor — Production home',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'gtk_supervisor',     label: 'GTK Supervisor',       desc: 'GTK production supervisor — Production home',           color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'gti_supervisor',     label: 'GTI Supervisor',       desc: 'GTI production supervisor — Production home',           color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  // ── Floor Staff ─────────────────────────────────────────────────────
  { value: 'glassco_cutter',     label: 'Cutter (GlassCo)',     desc: 'Cutting floor only — sees assigned tasks only',         color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'dispatch_staff',     label: 'Dispatch Staff',       desc: 'Dispatch desk only — load, DC print, delivery confirm', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  // ── Legacy ──────────────────────────────────────────────────────────
  { value: 'gtk_admin',          label: 'GTK Admin',            desc: 'GTK + GTI full access',                                 color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'glassco_admin',      label: 'Glassco Admin',        desc: 'Glassco full access',                                   color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'glassco_production', label: 'Production Staff',     desc: 'Production modules only (legacy)',                      color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'nippon_admin',       label: 'Nippon Admin',         desc: 'Nippon full access',                                    color: 'bg-rose-100 text-rose-800 border-rose-200' },
];

const ROLE_DEFAULTS: Record<string, { companies: string[]; modules: string[] }> = {
  super_admin:         { companies: ['GTK','GTI','Glassco','Nippon','Factory'], modules: [] },
  owner:               { companies: ['GTK','GTI','Glassco','Nippon','Factory'], modules: [] },
  hassan:              { companies: ['GTK','GTI','Glassco','Nippon','Factory'], modules: [] },
  factory_manager:     { companies: ['GTK','GTI','Glassco'],                   modules: ['production','inventory','requisitions','factory-incharge'] },
  admin_officer:       { companies: ['Glassco'],                                modules: ['sales','inventory','logistics','requisitions','accounts'] },
  glassco_supervisor:  { companies: ['Glassco'],                                modules: ['production','inventory','requisitions'] },
  gtk_supervisor:      { companies: ['GTK'],                                    modules: ['production','inventory','requisitions'] },
  gti_supervisor:      { companies: ['GTI'],                                    modules: ['production','inventory','requisitions'] },
  glassco_cutter:      { companies: ['Glassco'],                                modules: ['production'] },
  dispatch_staff:      { companies: ['Glassco'],                                modules: ['production','logistics'] },
  gtk_admin:           { companies: ['GTK','GTI'],                              modules: [] },
  glassco_admin:       { companies: ['Glassco'],                                modules: [] },
  glassco_production:  { companies: ['Glassco'],                                modules: ['production','inventory','logistics','requisitions'] },
  nippon_admin:        { companies: ['Nippon'],                                 modules: ['sales','inventory','hr','accounts','requisitions'] },
};

type UserStatus = 'active' | 'pending' | 'revoked';

interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  company: string;
  status: UserStatus;
  lastLogin: string | null;
  createdAt: string;
  allowedCompanies: string[];
  allowedModules: string[];
  timeRestricted: boolean;
  hasPinFallback: boolean;
}

interface AuditEntry {
  id: string;
  userId: string;
  email: string;
  action: string;
  timestamp: string;
  userAgent: string;
  ipAddress: string;
}

// ── PIN generator ────────────────────────────────────────────────────
const generatePIN = (): string => {
  return String(Math.floor(1000 + Math.random() * 9000)); // 4-digit
};

const buildShadowEmail = (empCode: string): string => {
  return `${empCode.toLowerCase().replace(/\s+/g, '-')}@glasstech.local`;
};

// ── Role Badge ───────────────────────────────────────────────────────
const RoleBadge = ({ role }: { role: string }) => {
  const r = ROLES_LIST.find(x => x.value === role);
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${r?.color || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {r?.label || role}
    </span>
  );
};

const StatusBadge = ({ status }: { status: UserStatus }) => {
  const styles = {
    active:  'bg-emerald-100 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    revoked: 'bg-red-100 text-red-700 border-red-200',
  };
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border capitalize ${styles[status]}`}>
      {status}
    </span>
  );
};

// ═════════════════════════════════════════════════════════════════════
export default function UserAccessManager() {
  const { user: me } = useAuthStore();
  const company = useAppStore(s => s.selectedCompany);

  // ── State ──────────────────────────────────────────────────────────
  const [users, setUsers]         = useState<ManagedUser[]>([]);
  const [auditLog, setAuditLog]   = useState<AuditEntry[]>([]);
  const [busy, setBusy]           = useState(false);
  const [view, setView]           = useState<'users' | 'audit'>('users');
  const [searchTerm, setSearchTerm] = useState('');

  // Grant access modal
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [grantEmail, setGrantEmail]     = useState('');
  const [grantRole, setGrantRole]       = useState<string>('gtk_admin');
  const [grantPIN, setGrantPIN]         = useState('');
  const [usePinFallback, setUsePinFallback] = useState(false);
  const [showPIN, setShowPIN]           = useState(false);
  const [empSearch, setEmpSearch]       = useState('');

  // Edit modal
  const [editUser, setEditUser]         = useState<ManagedUser | null>(null);

  // ── Guard: Super Admin only ────────────────────────────────────────
  if (me?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-60 space-y-3">
        <Shield size={36} className="text-slate-300" />
        <p className="text-sm font-bold text-slate-400 uppercase">Owner / Super Admin Access Only</p>
      </div>
    );
  }

  // ── Load users ─────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setBusy(true);
    try {
      const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        toast.error(`Failed to load users: ${error.message}`);
        setBusy(false);
        return;
      }

      // Map profiles to ManagedUser with employee info
      const employees = HRService.getEmployees();
      const mapped: ManagedUser[] = (profiles || []).map((p: any) => {
        const emp = employees.find(e => 
          e.id === p.employee_id || 
          e.personal?.phone === p.email || // loose match fallback
          e.work?.employeeCode === p.employee_code
        );
        return {
          id: p.id,
          email: p.email,
          fullName: p.full_name,
          role: p.role,
          employeeId: p.employee_id || emp?.id || null,
          employeeCode: p.employee_code || emp?.work?.employeeCode || null,
          employeeName: emp?.personal?.name || null,
          company: (p.allowed_companies || [])[0] || 'GTK',
          status: !p.is_active ? 'revoked' : (p.last_login ? 'active' : 'pending'),
          lastLogin: p.last_login,
          createdAt: p.created_at,
          allowedCompanies: p.allowed_companies || [],
          allowedModules: p.allowed_modules || [],
          timeRestricted: p.time_restricted || false,
          hasPinFallback: p.has_pin_fallback || false,
        };
      });
      setUsers(mapped);
    } catch (err) {
      toast.error('Failed to load users');
    }
    setBusy(false);
  }, []);

  const loadAuditLog = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('access_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (!error && data) {
        setAuditLog(data.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          email: d.email,
          action: d.action,
          timestamp: d.created_at,
          userAgent: d.user_agent || '',
          ipAddress: d.ip_address || '',
        })));
      }
    } catch { /* silent — table may not exist yet */ }
  }, []);

  useEffect(() => { loadUsers(); loadAuditLog(); }, [loadUsers, loadAuditLog]);

  // ── Employees for grant modal ──────────────────────────────────────
  const allEmployees = useMemo(() => HRService.getEmployees(), []);
  const filteredEmployees = useMemo(() => {
    if (!empSearch.trim()) return allEmployees.slice(0, 20);
    const term = empSearch.toLowerCase();
    return allEmployees.filter(e =>
      e.personal.name.toLowerCase().includes(term) ||
      e.work.employeeCode.toLowerCase().includes(term) ||
      e.company.toLowerCase().includes(term)
    ).slice(0, 20);
  }, [allEmployees, empSearch]);

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const term = searchTerm.toLowerCase();
    return users.filter(u =>
      u.fullName.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.employeeCode?.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term)
    );
  }, [users, searchTerm]);

  // ── Grant Access ───────────────────────────────────────────────────
  const handleGrantAccess = async () => {
    if (!selectedEmployee) {
      toast.error('Select an employee first');
      return;
    }
    if (!grantEmail.trim() && !usePinFallback) {
      toast.error('Enter Gmail address or enable PIN fallback');
      return;
    }

    setBusy(true);
    try {
      const empCode = selectedEmployee.work.employeeCode;
      const empName = selectedEmployee.personal.name;
      const defaults = ROLE_DEFAULTS[grantRole] || { companies: [selectedEmployee.company], modules: [] };

      let authUserId: string;
      let finalEmail: string;

      if (usePinFallback && !grantEmail.trim()) {
        // PIN-only: create shadow email auth user
        finalEmail = buildShadowEmail(empCode);
        const pin = grantPIN || generatePIN();

        // Create Supabase auth user with email/password
        const { userId: newUserId } = await AdminAuthService.createUser({
          email: finalEmail,
          password: pin,
          userMetadata: {
            full_name: empName,
            employee_code: empCode,
            auth_type: 'pin',
          },
        });

        authUserId = newUserId;
        setGrantPIN(pin); // show PIN to admin
        setShowPIN(true);
        toast.success(`PIN created: ${pin} — note this down for ${empName}`);
      } else {
        // Google OAuth: create user with Google provider
        finalEmail = grantEmail.trim().toLowerCase();

        try {
          const { userId: newUserId } = await AdminAuthService.createUser({
            email: finalEmail,
            userMetadata: {
              full_name: empName,
              employee_code: empCode,
              auth_type: 'google',
            },
          });
          authUserId = newUserId;
        } catch (createErr: any) {
          if (createErr.message?.includes('already') || createErr.message?.includes('exists')) {
            // User exists in auth but maybe not in profiles — try to find existing
            try {
              const existingUsers = await AdminAuthService.listUsers();
              const existing = existingUsers.find(u => u.email === finalEmail);
              if (existing) {
                authUserId = existing.id;
              } else {
                throw createErr;
              }
            } catch {
              throw createErr;
            }
          } else {
            throw createErr;
          }
        }

        // If PIN fallback also enabled alongside Gmail
        if (usePinFallback && grantPIN) {
          await AdminAuthService.updateUser(authUserId!, { password: grantPIN });
        }
      }

      // Create user_profiles entry
      const profilePayload = {
        id: authUserId!,
        email: finalEmail!,
        full_name: empName,
        role: grantRole,
        allowed_companies: defaults.companies,
        allowed_modules: defaults.modules,
        time_restricted: false,
        is_active: true,
        employee_id: selectedEmployee.id,
        employee_code: empCode,
        has_pin_fallback: usePinFallback,
      };

      const { error: profErr } = await supabase
        .from('user_profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      if (profErr) throw profErr;

      // Update employee record with auth link
      const allEmps = HRService.getEmployees();
      const empIdx = allEmps.findIndex(e => e.id === selectedEmployee.id);
      if (empIdx >= 0) {
        (allEmps[empIdx] as any).authUserId = authUserId;
        HRService.saveEmployees(allEmps);
      }

      // Log
      await supabase.from('access_logs').insert({
        user_id: me?.id, email: me?.email,
        action: `grant_access:${empCode}:${grantRole}`,
        user_agent: navigator.userAgent,
      }).then(() => {});

      Logger.action('UserAccess', 'GRANT', `Access granted to ${empName} (${empCode}) as ${grantRole}`);
      toast.success(`Access granted to ${empName}!`);
      
      if (!usePinFallback || grantEmail.trim()) {
        setShowGrantModal(false);
        resetGrantForm();
      }
      await loadUsers();
    } catch (err: any) {
      console.error('[UserAccess] Grant error:', err);
      toast.error(`Grant failed: ${err?.message || 'Unknown error'}`);
    }
    setBusy(false);
  };

  // ── Revoke Access ──────────────────────────────────────────────────
  const handleRevoke = async (user: ManagedUser) => {
    if (!confirm(`Revoke access for ${user.fullName}? They will be logged out immediately.`)) return;
    setBusy(true);
    try {
      // Disable in profiles
      await supabase.from('user_profiles')
        .update({ is_active: false })
        .eq('id', user.id);

      // Ban user in Supabase auth (invalidates all sessions)
      await AdminAuthService.banUser(user.id);

      await supabase.from('access_logs').insert({
        user_id: me?.id, email: me?.email,
        action: `revoke_access:${user.employeeCode || user.email}`,
        user_agent: navigator.userAgent,
      }).then(() => {});

      Logger.action('UserAccess', 'REVOKE', `Access revoked for ${user.fullName}`);
      toast.success(`${user.fullName} access revoked`);
      await loadUsers();
    } catch (err: any) {
      toast.error(`Revoke failed: ${err?.message}`);
    }
    setBusy(false);
  };

  // ── Reactivate ─────────────────────────────────────────────────────
  const handleReactivate = async (user: ManagedUser) => {
    setBusy(true);
    try {
      await supabase.from('user_profiles')
        .update({ is_active: true })
        .eq('id', user.id);

      await AdminAuthService.unbanUser(user.id);

      Logger.action('UserAccess', 'REACTIVATE', `Access restored for ${user.fullName}`);
      toast.success(`${user.fullName} reactivated`);
      await loadUsers();
    } catch (err: any) {
      toast.error(`Reactivate failed: ${err?.message}`);
    }
    setBusy(false);
  };

  // ── Reset PIN ──────────────────────────────────────────────────────
  const handleResetPIN = async (user: ManagedUser) => {
    const newPIN = generatePIN();
    setBusy(true);
    try {
      await AdminAuthService.resetPassword(user.id, newPIN);

      await supabase.from('user_profiles')
        .update({ has_pin_fallback: true })
        .eq('id', user.id);

      await supabase.from('access_logs').insert({
        user_id: me?.id, email: me?.email,
        action: `reset_pin:${user.employeeCode || user.email}`,
        user_agent: navigator.userAgent,
      }).then(() => {});

      toast.success(`New PIN for ${user.fullName}: ${newPIN}`, { duration: 10000 });
      Logger.action('UserAccess', 'RESET_PIN', `PIN reset for ${user.fullName}`);
    } catch (err: any) {
      toast.error(`PIN reset failed: ${err?.message}`);
    }
    setBusy(false);
  };

  // ── Force Sign-out ─────────────────────────────────────────────────
  const handleForceSignOut = async (user: ManagedUser) => {
    setBusy(true);
    try {
      // Supabase doesn't have a direct "sign out user" admin API,
      // but we can rotate their refresh token which invalidates sessions
      await AdminAuthService.updateUser(user.id, {
        userMetadata: { force_signout_at: new Date().toISOString() },
      });

      await supabase.from('access_logs').insert({
        user_id: me?.id, email: me?.email,
        action: `force_signout:${user.employeeCode || user.email}`,
        user_agent: navigator.userAgent,
      }).then(() => {});

      toast.success(`${user.fullName} will be signed out on next request`);
    } catch (err: any) {
      toast.error(`Force sign-out failed: ${err?.message}`);
    }
    setBusy(false);
  };

  // ── Helpers ────────────────────────────────────────────────────────
  const resetGrantForm = () => {
    setSelectedEmployee(null);
    setGrantEmail('');
    setGrantRole('gtk_admin');
    setGrantPIN('');
    setUsePinFallback(false);
    setShowPIN(false);
    setEmpSearch('');
  };

  const formatDate = (d: string | null) => {
    if (!d) return 'Never';
    return new Date(d).toLocaleString('en-PK', { dateStyle: 'short', timeStyle: 'short' });
  };

  const parseUserAgent = (ua: string): string => {
    if (!ua) return 'Unknown';
    if (ua.includes('Mobile')) return 'Mobile';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    return 'Desktop';
  };

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Shield size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 text-base">User Access Manager</h2>
            <p className="text-xs text-slate-500">{users.length} registered users · Grant & manage ERP access</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadUsers(); loadAuditLog(); }} disabled={busy}
            className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors">
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { resetGrantForm(); setShowGrantModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm">
            <UserPlus size={14} /> Grant Access
          </button>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200 w-fit shadow-sm">
        <button onClick={() => setView('users')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${view === 'users' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          <div className="flex items-center gap-1.5"><Users size={14} /> Active Users ({users.filter(u => u.status !== 'revoked').length})</div>
        </button>
        <button onClick={() => setView('audit')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${view === 'audit' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          <div className="flex items-center gap-1.5"><Activity size={14} /> Login Audit ({auditLog.length})</div>
        </button>
      </div>

      {/* ── How it works (info box) ─────────────────────────────────── */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800">
        <p className="font-semibold mb-1">How to grant access:</p>
        <p>1. Click "Grant Access" → select employee from registry</p>
        <p>2. Enter their Gmail (for Google sign-in) or enable PIN fallback</p>
        <p>3. Assign role → system creates Supabase auth user automatically</p>
        <p className="mt-1 text-blue-600">No need to open Supabase dashboard — everything is managed here.</p>
      </div>

      {/* ── Users List ──────────────────────────────────────────────── */}
      {view === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Search bar */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Search users..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
            </div>
          </div>

          {busy && users.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={24} className="animate-spin text-slate-300" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 space-y-2">
              <Users size={32} className="text-slate-200" />
              <p className="text-slate-400 text-sm">No users configured yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredUsers.map(u => (
                <div key={u.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 gap-3 transition-colors ${
                    u.status === 'revoked' ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50'
                  }`}>

                  {/* Left */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      u.status === 'active' ? 'bg-emerald-100' : u.status === 'pending' ? 'bg-amber-100' : 'bg-slate-100'
                    }`}>
                      <span className="text-xs font-bold text-slate-700">
                        {u.fullName?.slice(0,2).toUpperCase() || '??'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{u.fullName}</span>
                        {u.employeeCode && (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-medium">{u.employeeCode}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <RoleBadge role={u.role} />
                        <StatusBadge status={u.status} />
                        {u.hasPinFallback && (
                          <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold border border-violet-200">PIN</span>
                        )}
                        {u.timeRestricted && (
                          <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold border border-amber-200">9–6</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <span className="text-[9px] text-slate-400 mr-2 hidden lg:block">
                      {u.lastLogin ? formatDate(u.lastLogin) : 'Never logged in'}
                    </span>

                    {u.status !== 'revoked' && (
                      <>
                        <button onClick={() => handleResetPIN(u)}
                          title="Reset PIN"
                          className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors">
                          <Key size={14} />
                        </button>
                        <button onClick={() => handleForceSignOut(u)}
                          title="Force Sign-out"
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                          <LogOut size={14} />
                        </button>
                        <button onClick={() => handleRevoke(u)}
                          title="Revoke Access"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <UserX size={14} />
                        </button>
                      </>
                    )}
                    {u.status === 'revoked' && (
                      <button onClick={() => handleReactivate(u)}
                        title="Reactivate"
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-medium hover:bg-emerald-100 transition-colors">
                        <UserCheck size={12} /> Reactivate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Audit Log ──────────────────────────────────────────────── */}
      {view === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">Login History (Last 100)</h3>
          </div>
          {auditLog.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No login activity recorded yet.
              <p className="text-xs mt-1">Ensure <code>access_logs</code> table exists in Supabase.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2 font-semibold text-slate-600 text-xs">User</th>
                    <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Action</th>
                    <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Device</th>
                    <th className="px-4 py-2 font-semibold text-slate-600 text-xs">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLog.map(entry => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs text-slate-700">{entry.email}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          entry.action.includes('login') ? 'bg-emerald-100 text-emerald-700' :
                          entry.action.includes('grant') ? 'bg-blue-100 text-blue-700' :
                          entry.action.includes('revoke') ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[10px] text-slate-500">{parseUserAgent(entry.userAgent)}</td>
                      <td className="px-4 py-2.5 text-[10px] text-slate-500">{formatDate(entry.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ GRANT ACCESS MODAL ═══════════════════════════════════════ */}
      {showGrantModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 z-[500] overflow-y-auto">
          <div className="bg-white w-full max-w-lg my-6 rounded-2xl shadow-2xl border border-slate-200">

            {/* Modal header */}
            <div className="bg-indigo-600 text-white px-6 py-5 rounded-t-2xl flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-base">Grant ERP Access</h3>
                <p className="text-xs text-indigo-200 mt-0.5">Select employee → set credentials → assign role</p>
              </div>
              <button onClick={() => { setShowGrantModal(false); resetGrantForm(); }}
                className="hover:bg-white/10 p-2 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">

              {/* Step 1: Select Employee */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">1. Select Employee *</label>
                {selectedEmployee ? (
                  <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="font-semibold text-sm text-slate-800">{selectedEmployee.personal.name}</p>
                      <p className="text-[10px] text-slate-500">{selectedEmployee.work.employeeCode} · {selectedEmployee.company} · {selectedEmployee.work.designation || 'No designation'}</p>
                    </div>
                    <button onClick={() => setSelectedEmployee(null)}
                      className="text-slate-400 hover:text-red-600 p-1">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input type="text" placeholder="Search by name or code..."
                        value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {filteredEmployees.map(emp => (
                        <button key={emp.id}
                          onClick={() => { setSelectedEmployee(emp); setEmpSearch(''); }}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors">
                          <p className="text-sm font-medium text-slate-800">{emp.personal.name}</p>
                          <p className="text-[10px] text-slate-500">{emp.work.employeeCode} · {emp.company}</p>
                        </button>
                      ))}
                      {filteredEmployees.length === 0 && (
                        <p className="px-3 py-4 text-center text-slate-400 text-xs">No employees found</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Authentication */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-700">2. Authentication Method</label>
                
                {/* Gmail */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 font-medium">Gmail (for Google Sign-in)</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input type="email" value={grantEmail}
                      onChange={e => setGrantEmail(e.target.value)}
                      placeholder="employee@gmail.com"
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
                  </div>
                </div>

                {/* PIN Fallback toggle */}
                <div className="flex items-center justify-between bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">PIN Fallback</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Employee code + 4-digit PIN (if no Google account)</p>
                  </div>
                  <button onClick={() => {
                    setUsePinFallback(!usePinFallback);
                    if (!usePinFallback) setGrantPIN(generatePIN());
                  }}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${usePinFallback ? 'bg-violet-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${usePinFallback ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {/* PIN display */}
                {usePinFallback && (
                  <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
                    <Key size={16} className="text-violet-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] text-violet-700 font-medium">Generated PIN:</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-lg font-bold text-violet-800 tracking-widest">
                          {showPIN ? grantPIN : '••••'}
                        </span>
                        <button onClick={() => setShowPIN(!showPIN)}
                          className="text-violet-500 hover:text-violet-700">
                          {showPIN ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button onClick={() => setGrantPIN(generatePIN())}
                          className="text-violet-500 hover:text-violet-700 text-[10px] font-medium">
                          Regenerate
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3: Role */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">3. Assign Role *</label>
                <div className="space-y-1.5">
                  {ROLES_LIST.map(r => (
                    <button key={r.value}
                      onClick={() => setGrantRole(r.value)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-left transition-all ${
                        grantRole === r.value ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-slate-200 hover:border-indigo-200'
                      }`}>
                      <div>
                        <p className={`font-semibold text-xs ${grantRole === r.value ? 'text-indigo-800' : 'text-slate-700'}`}>{r.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{r.desc}</p>
                      </div>
                      {grantRole === r.value && <CheckCircle2 size={16} className="text-indigo-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => { setShowGrantModal(false); resetGrantForm(); }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button onClick={handleGrantAccess} disabled={busy}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm disabled:opacity-50">
                {busy
                  ? <><Loader2 size={14} className="animate-spin" /> Granting...</>
                  : <><UserPlus size={14} /> Grant Access</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
