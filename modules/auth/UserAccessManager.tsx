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
  Copy, Mail, ChevronDown, Activity, Trash2, Edit2
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
  // ── External ────────────────────────────────────────────────────────
  { value: 'customer',           label: 'Customer (Portal)',    desc: 'Self-service portal — own orders + rates only',         color: 'bg-teal-100 text-teal-800 border-teal-200' },
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
  customer:            { companies: ['Nippon'],                                 modules: ['customer-portal'] },
};

// The full module catalog + which companies actually run each module. When an
// admin grants access, only the SELECTED companies' real modules are shown — a
// trading company (Nippon) has no Production/Logistics/Factory Desk, an aluminium
// fab has no Store Issue, and so on.
const MODULE_CATALOG: { key: string; label: string }[] = [
  { key: 'sales',            label: 'Sales' },
  { key: 'hr',               label: 'HR / HCM' },
  { key: 'inventory',        label: 'Inventory' },
  { key: 'store-issue',      label: 'Store Issue' },
  { key: 'requisitions',     label: 'Procurement' },
  { key: 'production',       label: 'Production' },
  { key: 'accounts',         label: 'Finance / FICO' },
  { key: 'logistics',        label: 'Logistics' },
  { key: 'vendors',          label: 'Vendors' },
  { key: 'projects',         label: 'Projects' },
  { key: 'hub',              label: 'Supply Hub' },
  { key: 'md-dashboard',     label: 'MD Dashboard' },
  { key: 'factory-incharge', label: 'Factory Desk' },
  { key: 'customer-portal',  label: 'Customer Portal' },
  { key: 'admin',            label: 'Admin / Basis' },
];

const PRODUCTION_CO =['sales','hr','inventory','requisitions','production','accounts','logistics','vendors','projects','hub','md-dashboard','factory-incharge','admin'];
const COMPANY_MODULES: Record<string, string[]> = {
  GTK:     PRODUCTION_CO,
  GTI:     PRODUCTION_CO,
  Glassco: PRODUCTION_CO,
  // Nippon = trading: Store Issue instead of Production; no Logistics/Factory Desk.
  Nippon:  ['sales','hr','inventory','store-issue','requisitions','accounts','vendors','projects','hub','md-dashboard','customer-portal','admin'],
  // Factory = ops/logistics hub.
  Factory: ['inventory','logistics','requisitions','hub','md-dashboard','factory-incharge','admin'],
};

/** Modules to offer for the selected companies (union). No company picked yet →
 *  show the whole catalog so the admin isn't blocked before choosing a company. */
const modulesForCompanies = (companies: string[]): { key: string; label: string }[] => {
  if (!companies || companies.length === 0) return MODULE_CATALOG;
  const allowed = new Set<string>();
  companies.forEach(c => (COMPANY_MODULES[c] || MODULE_CATALOG.map(m => m.key)).forEach(k => allowed.add(k)));
  return MODULE_CATALOG.filter(m => allowed.has(m.key));
};

// Real lifecycle states (more granular than before — see auth_status_label()).
//   no_auth        → profile row exists but no auth.users row (orphan)
//   invite_pending → auth user created, but invite link not clicked yet
//   never_signed_in→ link clicked / email confirmed, but never logged in
//   active         → has at least one successful sign-in
//   revoked        → is_active=false in profile, or banned in auth
type UserStatus = 'no_auth' | 'invite_pending' | 'never_signed_in' | 'active' | 'revoked';

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
  lastLogin: string | null;       // auth.last_sign_in_at (real source of truth)
  inviteClickedAt: string | null; // auth.email_confirmed_at
  invitedAt: string | null;       // auth.created_at
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
// Supabase default minimum password length is 6 chars — 4-digit PINs were
// being rejected by auth.admin.updateUserById with a 422 / "password should
// be at least 6 characters" error. Bumped to 6-digit.
const generatePIN = (): string => {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
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

const STATUS_META: Record<UserStatus, { label: string; classes: string; tip: string }> = {
  active:          { label: 'Active',         classes: 'bg-emerald-100 text-emerald-700 border-emerald-200', tip: 'User has signed in at least once' },
  never_signed_in: { label: 'Email Confirmed',classes: 'bg-blue-100 text-blue-700 border-blue-200',         tip: 'Clicked invite link but never signed in' },
  invite_pending:  { label: 'Invite Pending', classes: 'bg-amber-100 text-amber-700 border-amber-200',      tip: 'Email sent — user has not clicked the link yet' },
  no_auth:         { label: 'No Auth',        classes: 'bg-slate-100 text-slate-600 border-slate-200',       tip: 'Profile row exists but no Supabase auth account' },
  revoked:         { label: 'Revoked',        classes: 'bg-red-100 text-red-700 border-red-200',             tip: 'Access has been revoked / banned' },
};

const StatusBadge = ({ status }: { status: UserStatus }) => {
  const m = STATUS_META[status] || STATUS_META.no_auth;
  return (
    <span title={m.tip}
      className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${m.classes}`}>
      {m.label}
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

  // Edit modal — change an existing user's role / companies / modules / hours.
  const [editUser, setEditUser]             = useState<ManagedUser | null>(null);
  const [editRole, setEditRole]             = useState<string>('');
  const [editCompanies, setEditCompanies]   = useState<string[]>([]);
  const [editModules, setEditModules]       = useState<string[]>([]);
  const [editTimeRestrict, setEditTimeRestrict] = useState(false);

  // ── Invite-by-email modal (Quick Add — no HR employee required) ───
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail,     setInviteEmail]     = useState('');
  const [inviteFullName,  setInviteFullName]  = useState('');
  const [inviteRole,      setInviteRole]      = useState<string>('admin_officer');
  const [inviteCompanies, setInviteCompanies] = useState<string[]>([]);
  const [inviteModules,   setInviteModules]   = useState<string[]>([]);
  const [inviteTimeRestrict, setInviteTimeRestrict] = useState(false);
  const [invitePassword,  setInvitePassword]  = useState('');

  // ── Credentials modal — shows email+password after successful create ──
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string; fullName: string } | null>(null);
  const [credsCopiedField, setCredsCopiedField] = useState<'email' | 'password' | 'both' | ''>('');

  // ── Login history modal — per-user activity from access_logs ──
  const [historyUser, setHistoryUser] = useState<ManagedUser | null>(null);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);

  const openLoginHistory = async (u: ManagedUser) => {
    setHistoryUser(u);
    setHistoryBusy(true);
    try {
      const { data, error } = await supabase
        .from('access_logs')
        .select('action, user_agent, ip_address, created_at')
        .eq('user_id', u.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        toast.error(`History load failed: ${error.message}`);
        setHistoryRows([]);
      } else {
        setHistoryRows(data || []);
      }
    } catch (err: any) {
      toast.error(`History load failed: ${err?.message}`);
      setHistoryRows([]);
    }
    setHistoryBusy(false);
  };

  // ── Load users ─────────────────────────────────────────────────────
  // (Super-admin guard moved BELOW all hooks — see rules-of-hooks fix.)
  // Strategy: fetch user_profiles + auth.users in parallel, then merge by id.
  // auth.users gives us the real signals for invite-link click and last login:
  //   • email_confirmed_at → link clicked
  //   • last_sign_in_at    → user logged in at least once
  //   • banned_until       → access revoked at auth layer
  const loadUsers = useCallback(async () => {
    setBusy(true);
    try {
      // Profiles (RLS-readable for super_admin)
      const profilesPromise = supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      // auth.users (via edge function — service_role only)
      const authPromise = AdminAuthService.listUsers().catch((err) => {
        // Don't block the whole load if listUsers fails — just degrade
        // gracefully to profile-only data.
        Logger.warn('UserAccess', `listUsers fallback: ${err?.message || err}`);
        return [];
      });

      const [{ data: profiles, error }, authUsers] = await Promise.all([
        profilesPromise,
        authPromise,
      ]);

      if (error) {
        toast.error(`Failed to load users: ${error.message}`);
        setBusy(false);
        return;
      }

      // Build a quick id→authUser lookup
      const authById = new Map<string, any>();
      for (const a of authUsers || []) authById.set(a.id, a);

      const employees = HRService.getEmployees();
      const now = Date.now();

      const computeStatus = (p: any, a: any): UserStatus => {
        if (!p.is_active) return 'revoked';
        if (!a) return 'no_auth';                                 // orphan profile
        if (a.banned_until && new Date(a.banned_until).getTime() > now) return 'revoked';
        // PRIORITY FIX (Sprint 40):
        // Check last_sign_in_at FIRST. A user who has actually logged in is
        // active regardless of whether email_confirmed_at is set — older
        // accounts (e.g. Hassan's original super_admin account, created via
        // password not invite) have a NULL email_confirmed_at but a real
        // last_sign_in_at, and were incorrectly flagged as "Invite Pending".
        if (a.last_sign_in_at)    return 'active';                // has logged in → done
        if (a.email_confirmed_at) return 'never_signed_in';       // confirmed link, never logged
        return 'invite_pending';                                  // link not clicked
      };

      const mapped: ManagedUser[] = (profiles || []).map((p: any) => {
        const emp = employees.find(e =>
          e.id === p.employee_id ||
          e.personal?.phone === p.email ||
          e.work?.employeeCode === p.employee_code
        );
        const a = authById.get(p.id);
        return {
          id: p.id,
          email: p.email,
          fullName: p.full_name,
          role: p.role,
          employeeId: p.employee_id || emp?.id || null,
          employeeCode: p.employee_code || emp?.work?.employeeCode || null,
          employeeName: emp?.personal?.name || null,
          company: (p.allowed_companies || [])[0] || 'GTK',
          status: computeStatus(p, a),
          lastLogin: a?.last_sign_in_at || p.last_login || null,
          inviteClickedAt: a?.email_confirmed_at || null,
          invitedAt: a?.created_at || p.created_at || null,
          createdAt: p.created_at,
          allowedCompanies: p.allowed_companies || [],
          allowedModules: p.allowed_modules || [],
          timeRestricted: p.time_restricted || false,
          hasPinFallback: p.has_pin_fallback || false,
        };
      });
      setUsers(mapped);
    } catch (err: any) {
      toast.error(`Failed to load users: ${err?.message || err}`);
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

  // ── Guard: Super Admin only ────────────────────────────────────────
  // MUST come after all hooks above (rules-of-hooks): an early return before
  // the hooks made them run conditionally and could crash on role change.
  if (me?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-60 space-y-3">
        <Shield size={36} className="text-slate-300" />
        <p className="text-sm font-bold text-slate-400 uppercase">Owner / Super Admin Access Only</p>
      </div>
    );
  }

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

  // ── Reset Password / PIN ───────────────────────────────────────────
  // Resets the user's password to a fresh 12-char strong password (NOT a
  // 6-digit PIN any more — old PIN was below Supabase's 6-char minimum and
  // confused users when copying via WhatsApp). After reset, shows the same
  // credentials modal as Create User so admin can copy & share cleanly.
  const handleResetPIN = async (user: ManagedUser) => {
    const newPassword = generatePassword();
    setBusy(true);
    try {
      await AdminAuthService.resetPassword(user.id, newPassword);

      await supabase.from('user_profiles')
        .update({ has_pin_fallback: true })
        .eq('id', user.id);

      try {
        await supabase.from('access_logs').insert({
          user_id: me?.id, email: me?.email,
          action: `reset_password:${user.employeeCode || user.email}`,
          user_agent: navigator.userAgent,
        });
      } catch { /* table may not exist */ }

      Logger.action('UserAccess', 'RESET_PIN', `Password reset for ${user.fullName}`);
      // Show the same credentials modal as Create User so admin can copy.
      setCreatedCreds({
        email:    user.email,
        password: newPassword,
        fullName: user.fullName,
      });
      await loadUsers();
    } catch (err: any) {
      toast.error(`Password reset failed: ${err?.message}`);
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

  const resetInviteForm = () => {
    setInviteEmail('');
    setInviteFullName('');
    setInviteRole('admin_officer');
    setInviteCompanies([]);
    setInviteModules([]);
    setInviteTimeRestrict(false);
    setInvitePassword('');
  };

  // When role changes in invite modal, pre-fill role's default companies (modules
  // stay empty by design — admin explicitly ticks modules. BUG-1 + "empty = no access").
  const applyInviteRolePreset = (role: string) => {
    setInviteRole(role);
    const d = ROLE_DEFAULTS[role];
    if (d) setInviteCompanies(d.companies);
  };

  const toggleInList = (list: string[], val: string): string[] =>
    list.includes(val) ? list.filter(x => x !== val) : [...list, val];

  // ── Edit an existing user's access (role / companies / modules / hours) ─
  const openEditUser = (u: ManagedUser) => {
    setEditUser(u);
    setEditRole(u.role);
    setEditCompanies(u.allowedCompanies || []);
    setEditModules(u.allowedModules || []);
    setEditTimeRestrict(u.timeRestricted);
  };

  // Picking a role in the edit modal resets companies to the role's defaults
  // (mirrors invite). Modules are left as-is so the admin can fine-tune.
  const applyEditRolePreset = (role: string) => {
    setEditRole(role);
    const d = ROLE_DEFAULTS[role];
    if (d) setEditCompanies(d.companies);
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    if (!editRole) { toast.error('Role required'); return; }
    if (editCompanies.length === 0) { toast.error('At least one company required'); return; }
    setBusy(true);
    try {
      // Role / companies / modules / hours all live on the profile row — no auth
      // change needed. Update by id; .select() confirms RLS actually let it write.
      const { data, error } = await supabase
        .from('user_profiles')
        .update({
          role: editRole,
          allowed_companies: editCompanies,
          allowed_modules: editModules,
          time_restricted: editTimeRestrict,
        })
        .eq('id', editUser.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('No rows updated — check RLS policy (super_admin only).');
        return;
      }

      try {
        await supabase.from('access_logs').insert({
          user_id: me?.id,
          email: me?.email,
          action: `edit_access:${editUser.email}:${editRole}`,
          user_agent: navigator.userAgent,
        });
      } catch { /* table may not exist */ }

      Logger.action('UserAccess', 'EDIT', `Access updated: ${editUser.email} → ${editRole}`);
      toast.success(`${editUser.fullName} updated. User must sign out / back in for it to take effect.`);
      setEditUser(null);
      await loadUsers();
    } catch (err: any) {
      Logger.error('UserAccess', 'EDIT_FAILED', err);
      toast.error(`Update failed: ${err?.message || err}`);
    }
    setBusy(false);
  };

  // Strong, human-readable password — 12 chars, mixed-case + digits.
  // Avoids ambiguous chars (0/O, 1/l/I) so WhatsApp / SMS recipients can
  // type it without confusion.
  const generatePassword = (): string => {
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const nums  = '23456789';
    const all   = upper + lower + nums;
    let pw = '';
    // Guarantee at least 1 of each category
    pw += upper[Math.floor(Math.random() * upper.length)];
    pw += lower[Math.floor(Math.random() * lower.length)];
    pw += nums [Math.floor(Math.random() * nums.length)];
    while (pw.length < 12) {
      pw += all[Math.floor(Math.random() * all.length)];
    }
    // Shuffle so the "category" chars aren't always at the start
    return pw.split('').sort(() => Math.random() - 0.5).join('');
  };

  // ── Create user with admin-set password (no magic-link dependency) ─
  // Replaces the previous magic-link invite flow which kept getting stuck
  // in a HashRouter / Supabase URL redirect loop. With this flow:
  //   1. Admin enters email + name + role + (optionally) password
  //   2. Backend creates auth.users with that password + confirms email
  //   3. Profile row is upserted with role/companies/modules
  //   4. Admin gets a Credentials modal with email + password — share via
  //      WhatsApp / SMS / whatever
  //   5. User logs in directly via email + password (no email step needed)
  const handleInviteByEmail = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast.error('Valid email required');
      return;
    }
    if (!inviteFullName.trim()) {
      toast.error('Full name required');
      return;
    }
    if (!inviteRole) {
      toast.error('Role required');
      return;
    }
    if (inviteCompanies.length === 0) {
      toast.error('At least one company required');
      return;
    }

    // Use admin-provided password if any, else auto-generate.
    const password = invitePassword.trim() || generatePassword();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters (Supabase requirement)');
      return;
    }

    setBusy(true);
    try {
      let authUserId: string;

      // 1. Create the auth.users row with email + password (no magic link)
      try {
        const { userId } = await AdminAuthService.createUser({
          email,
          password,
          userMetadata: {
            full_name: inviteFullName.trim(),
            created_by: me?.email,
            role: inviteRole,
          },
        });
        authUserId = userId;
      } catch (err: any) {
        // If user already exists in auth, reuse their UUID and reset the
        // password — this lets admin recover when a half-failed earlier
        // invite left an orphan auth row.
        if (err.message?.toLowerCase().includes('already') || err.message?.toLowerCase().includes('exists') || err.message?.toLowerCase().includes('registered')) {
          const existingUsers = await AdminAuthService.listUsers();
          const existing = existingUsers.find(u => u.email?.toLowerCase() === email);
          if (!existing) throw err;
          authUserId = existing.id;
          // Reset their password to the new one we just generated
          await AdminAuthService.resetPassword(existing.id, password);
          toast.info('User already existed — password reset.');
        } else {
          throw err;
        }
      }

      // 2. Upsert profile row.
      //    Empty allowed_modules = NO access (BUG-1 fix). NO 'company' column.
      const profilePayload = {
        id: authUserId,
        email,
        full_name: inviteFullName.trim(),
        role: inviteRole,
        allowed_companies: inviteCompanies,
        allowed_modules: inviteModules,
        time_restricted: inviteTimeRestrict,
        is_active: true,
      };

      const { error: profErr } = await supabase
        .from('user_profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      if (profErr) throw profErr;

      // 3. Audit log (table may not exist — silently swallow)
      try {
        await supabase.from('access_logs').insert({
          user_id: me?.id,
          email: me?.email,
          action: `create_user:${email}:${inviteRole}`,
          user_agent: navigator.userAgent,
        });
      } catch { /* table may not exist */ }

      Logger.action('UserAccess', 'CREATE', `User created: ${email} as ${inviteRole}`);

      // 4. Show credentials modal so admin can copy & share.
      setShowInviteModal(false);
      resetInviteForm();
      setCreatedCreds({
        email,
        password,
        fullName: inviteFullName.trim(),
      });
      await loadUsers();
    } catch (err: any) {
      Logger.error('UserAccess', 'CREATE_FAILED', err);
      toast.error(`User create failed: ${err?.message || err}`);
    }
    setBusy(false);
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
          <button onClick={() => { resetInviteForm(); setShowInviteModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm">
            <UserPlus size={14} /> Create User
          </button>
          <button onClick={() => { resetGrantForm(); setShowGrantModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm">
            <UserPlus size={14} /> Grant Access (HR)
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
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 space-y-2">
        <div>
          <p className="font-semibold mb-1">🟢 Create User (recommended — fast, no email dependency):</p>
          <p>1. Click <strong>Create User</strong> → enter email + name + role + modules</p>
          <p>2. Aap password type karen ya <strong>Auto-generate</strong> click karen</p>
          <p>3. Create dabane par credentials modal me email + password milega → Copy → WhatsApp / SMS pe user ko bhej do</p>
          <p>4. User ERP login page pe email + password daal kar seedha login karega — koi email link click nahi karna</p>
        </div>
        <div>
          <p className="font-semibold mb-1">🔵 Grant Access (HR — for shop floor / employees on payroll):</p>
          <p>HR Employees ke liye — employee record se link hota hai. PIN fallback bhi mil sakta hai.</p>
        </div>
        <p className="text-blue-600 font-semibold border-t border-blue-200 pt-2">
          ⚠ Empty modules = no access. Admin ko har module tick karna parega.
        </p>
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
                      u.status === 'active' ? 'bg-emerald-100' : u.status === 'invite_pending' ? 'bg-amber-100' : 'bg-slate-100'
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
                    <div className="text-[9px] text-slate-400 mr-2 hidden lg:flex lg:flex-col lg:items-end leading-tight">
                      {u.status === 'invite_pending' && u.invitedAt ? (
                        <>
                          <span>Invited {formatDate(u.invitedAt)}</span>
                          <span className="text-amber-600 font-bold">Awaiting link click</span>
                        </>
                      ) : u.status === 'never_signed_in' && u.inviteClickedAt ? (
                        <>
                          <span>Link clicked {formatDate(u.inviteClickedAt)}</span>
                          <span className="text-blue-600 font-bold">Awaiting first login</span>
                        </>
                      ) : u.lastLogin ? (
                        <span>Last seen {formatDate(u.lastLogin)}</span>
                      ) : (
                        <span>Never logged in</span>
                      )}
                    </div>

                    {u.status !== 'revoked' && (
                      <>
                        <button onClick={() => openEditUser(u)}
                          title="Edit role / access"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => openLoginHistory(u)}
                          title="View login history"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Activity size={14} />
                        </button>
                        <button onClick={() => handleResetPIN(u)}
                          title="Reset Password"
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

      {/* ═══════════════════════════════════════════════════════════════
          INVITE BY EMAIL MODAL — passwordless magic-link invite.
          No HR Employee record required. Empty allowed_modules = no access.
          ═══════════════════════════════════════════════════════════════ */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-start justify-center p-4 z-[500] overflow-y-auto">
          <div className="bg-white w-full max-w-xl my-6 rounded-2xl shadow-2xl border border-slate-200 flex flex-col">

            {/* Header */}
            <div className="bg-emerald-700 text-white px-6 py-5 rounded-t-2xl flex justify-between items-center">
              <div>
                <h3 className="font-black uppercase tracking-tight text-base flex items-center gap-2">
                  <UserPlus size={18} /> Create User
                </h3>
                <p className="text-[10px] text-emerald-200 mt-0.5 font-bold">
                  Direct email + password — share via WhatsApp/SMS.
                </p>
              </div>
              <button onClick={() => { setShowInviteModal(false); resetInviteForm(); }}
                className="hover:bg-white/10 p-2 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">

              {/* Email + Full name */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    Email <span className="text-rose-500">*</span>
                  </label>
                  <input type="email" value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input type="text" value={inviteFullName}
                    onChange={e => setInviteFullName(e.target.value)}
                    placeholder="e.g. Ahmed Khan"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none" />
                </div>
              </div>

              {/* Role */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                  Role <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto border border-slate-100 rounded-xl p-2">
                  {ROLES_LIST.map(r => (
                    <button key={r.value}
                      onClick={() => applyInviteRolePreset(r.value)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all ${inviteRole === r.value ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-200 hover:border-emerald-200'}`}>
                      <div>
                        <p className={`font-black text-xs uppercase ${inviteRole === r.value ? 'text-emerald-800' : 'text-slate-700'}`}>{r.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{r.desc}</p>
                      </div>
                      {inviteRole === r.value && <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Companies */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                  Allowed Companies <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'].map(c => (
                    <button key={c}
                      onClick={() => setInviteCompanies(inviteCompanies => toggleInList(inviteCompanies, c))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${inviteCompanies.includes(c) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modules (EMPTY = NO ACCESS — Hassan's instruction) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    Module Access
                  </label>
                  <span className="text-[10px] font-bold text-rose-600">
                    {inviteModules.length === 0 ? '⚠ NO MODULES SELECTED' : `${inviteModules.length} modules`}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Sirf woh modules tick karen jo is user ko chahiye. Empty = sirf Dashboard.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {modulesForCompanies(inviteCompanies).map(m => (
                    <button key={m.key}
                      onClick={() => setInviteModules(prev => toggleInList(prev, m.key))}
                      className={`text-left px-3 py-2 rounded-lg text-[11px] font-bold border transition-all ${inviteModules.includes(m.key) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Password — admin sets it, or auto-generate */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setInvitePassword(generatePassword())}
                    className="text-[10px] font-bold text-emerald-600 hover:underline">
                    Auto-generate strong password
                  </button>
                </div>
                <input type="text" value={invitePassword}
                  onChange={e => setInvitePassword(e.target.value)}
                  placeholder="Leave blank for auto-generated password (min 6 chars)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none" />
                <p className="text-[10px] text-slate-400">
                  User ko WhatsApp / SMS pe yeh password share karna parega — woh isi se login karega (no email link needed).
                </p>
              </div>

              {/* Time restriction */}
              <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-black text-slate-800">Office Hours Only</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Mon–Sat 9am–6pm PKT only</p>
                </div>
                <button onClick={() => setInviteTimeRestrict(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${inviteTimeRestrict ? 'bg-amber-500' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${inviteTimeRestrict ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-[11px] text-emerald-800">
                <p className="font-bold">Kya hoga jab Create dabayen?</p>
                <p>1. ERP user ko email + password k saath create kare ga (no email link needed)</p>
                <p>2. Aap ko credentials modal me email + password milega — copy karke WhatsApp pe bhej do</p>
                <p>3. User ERP login page pe seedha email + password daal kar login karega</p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => { setShowInviteModal(false); resetInviteForm(); }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button onClick={handleInviteByEmail} disabled={busy}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm disabled:opacity-50">
                {busy
                  ? <><Loader2 size={14} className="animate-spin" /> Creating...</>
                  : <><UserPlus size={14} /> Create User</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          EDIT USER MODAL — change an existing user's role / companies /
          modules / office-hours. Profile-only update (no auth change).
          ═══════════════════════════════════════════════════════════════ */}
      {editUser && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-start justify-center p-4 z-[600] overflow-y-auto">
          <div className="bg-white w-full max-w-lg my-6 rounded-2xl shadow-2xl border border-slate-200 flex flex-col">
            {/* Header */}
            <div className="bg-indigo-700 text-white px-6 py-5 rounded-t-2xl flex justify-between items-center">
              <div>
                <h3 className="font-black uppercase tracking-tight text-base flex items-center gap-2">
                  <Shield size={18} /> Edit Access
                </h3>
                <p className="text-[10px] text-indigo-200 mt-0.5 font-bold">{editUser.fullName} · {editUser.email}</p>
              </div>
              <button onClick={() => setEditUser(null)} className="hover:bg-white/10 p-2 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
              {/* Role */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Role <span className="text-rose-500">*</span></label>
                <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto border border-slate-100 rounded-xl p-2">
                  {ROLES_LIST.map(r => (
                    <button key={r.value}
                      onClick={() => applyEditRolePreset(r.value)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all ${editRole === r.value ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-slate-200 hover:border-indigo-200'}`}>
                      <div>
                        <p className={`font-black text-xs uppercase ${editRole === r.value ? 'text-indigo-800' : 'text-slate-700'}`}>{r.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{r.desc}</p>
                      </div>
                      {editRole === r.value && <CheckCircle2 size={14} className="text-indigo-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Companies */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Allowed Companies <span className="text-rose-500">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'].map(c => (
                    <button key={c}
                      onClick={() => setEditCompanies(prev => toggleInList(prev, c))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${editCompanies.includes(c) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modules */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Module Access</label>
                  <span className="text-[10px] font-bold text-rose-600">
                    {editModules.length === 0 ? '⚠ NO MODULES (Dashboard only)' : `${editModules.length} modules`}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">Sirf woh modules tick karen jo is user ko chahiye. Empty = sirf Dashboard.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {modulesForCompanies(editCompanies).map(m => (
                    <button key={m.key}
                      onClick={() => setEditModules(prev => toggleInList(prev, m.key))}
                      className={`text-left px-3 py-2 rounded-lg text-[11px] font-bold border transition-all ${editModules.includes(m.key) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time restriction */}
              <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-black text-slate-800">Office Hours Only</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Mon–Sat 9am–6pm PKT only</p>
                </div>
                <button onClick={() => setEditTimeRestrict(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${editTimeRestrict ? 'bg-amber-500' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${editTimeRestrict ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setEditUser(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={busy}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-black uppercase text-xs tracking-widest flex items-center gap-2 transition-all shadow-md disabled:opacity-50">
                {busy ? <><Loader2 size={14} className="animate-spin" /><span>Saving...</span></> : <><Check size={14} /><span>Save Changes</span></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CREDENTIALS MODAL — shown after a successful create. Admin can
          copy email + password and share via WhatsApp / SMS / email.
          ═══════════════════════════════════════════════════════════════ */}
      {createdCreds && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-start justify-center p-4 z-[600] overflow-y-auto">
          <div className="bg-white w-full max-w-md my-10 rounded-2xl shadow-2xl border border-slate-200 flex flex-col">
            <div className="bg-emerald-700 text-white px-6 py-5 rounded-t-2xl flex justify-between items-center">
              <div>
                <h3 className="font-black uppercase tracking-tight text-base flex items-center gap-2">
                  <CheckCircle2 size={18} /> User Created
                </h3>
                <p className="text-[10px] text-emerald-200 mt-0.5 font-bold">
                  {createdCreds.fullName} ka account ready hai
                </p>
              </div>
              <button onClick={() => { setCreatedCreds(null); setCredsCopiedField(''); }}
                className="hover:bg-white/10 p-2 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Yeh credentials user ko share karen — WhatsApp / SMS / email me se jo bhi convenient ho.
                User ERP k login page pe yeh email + password daal kar seedha login kar sakta hai.
              </p>

              {/* Email row */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Email</label>
                  <button onClick={() => {
                      navigator.clipboard.writeText(createdCreds.email);
                      setCredsCopiedField('email');
                      setTimeout(() => setCredsCopiedField(''), 2000);
                    }}
                    className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1">
                    {credsCopiedField === 'email' ? <><Check size={11}/> Copied</> : <><Copy size={11}/> Copy</>}
                  </button>
                </div>
                <p className="text-sm font-mono text-slate-800 break-all">{createdCreds.email}</p>
              </div>

              {/* Password row */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Password</label>
                  <button onClick={() => {
                      navigator.clipboard.writeText(createdCreds.password);
                      setCredsCopiedField('password');
                      setTimeout(() => setCredsCopiedField(''), 2000);
                    }}
                    className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1">
                    {credsCopiedField === 'password' ? <><Check size={11}/> Copied</> : <><Copy size={11}/> Copy</>}
                  </button>
                </div>
                <p className="text-base font-mono font-bold text-slate-800 select-all">{createdCreds.password}</p>
              </div>

              {/* Copy-both convenience button */}
              <button
                onClick={() => {
                  const text =
                    `GlassTech ERP login\n\nEmail: ${createdCreds.email}\nPassword: ${createdCreds.password}\n\nLogin URL: ${window.location.origin}/#/`;
                  navigator.clipboard.writeText(text);
                  setCredsCopiedField('both');
                  setTimeout(() => setCredsCopiedField(''), 2500);
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm">
                {credsCopiedField === 'both'
                  ? <><Check size={14}/> Copied — paste in WhatsApp / SMS</>
                  : <><Copy size={14}/> Copy email + password + login URL</>
                }
              </button>

              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-[11px] text-amber-800">
                <p className="font-bold mb-1">⚠ Important:</p>
                <p>• Yeh password sirf abhi visible hai. Modal band karne k bad show nahi hoga.</p>
                <p>• User ko bolen yeh password change kar lein pehli login pe (security best practice).</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-slate-50 rounded-b-2xl flex justify-end">
              <button onClick={() => { setCreatedCreds(null); setCredsCopiedField(''); }}
                className="bg-slate-900 hover:bg-slate-700 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors">
                Done — credentials saved
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          LOGIN HISTORY MODAL — admin views user's access_logs activity
          ═══════════════════════════════════════════════════════════════ */}
      {historyUser && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-start justify-center p-4 z-[500] overflow-y-auto">
          <div className="bg-white w-full max-w-2xl my-6 rounded-2xl shadow-2xl border border-slate-200 flex flex-col">
            <div className="bg-blue-700 text-white px-6 py-5 rounded-t-2xl flex justify-between items-center">
              <div>
                <h3 className="font-black uppercase tracking-tight text-base flex items-center gap-2">
                  <Activity size={18} /> Login History
                </h3>
                <p className="text-[11px] text-blue-200 mt-0.5">
                  {historyUser.fullName} · {historyUser.email}
                </p>
              </div>
              <button onClick={() => { setHistoryUser(null); setHistoryRows([]); }}
                className="hover:bg-white/10 p-2 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {/* Auth summary */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Status</p>
                  <p className="mt-1"><StatusBadge status={historyUser.status} /></p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Last Login</p>
                  <p className="text-xs font-bold text-slate-800 mt-1">
                    {historyUser.lastLogin ? formatDate(historyUser.lastLogin) : 'Never'}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Invite Clicked</p>
                  <p className="text-xs font-bold text-slate-800 mt-1">
                    {historyUser.inviteClickedAt ? formatDate(historyUser.inviteClickedAt) : '—'}
                  </p>
                </div>
              </div>

              {historyBusy ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-slate-400" />
                </div>
              ) : historyRows.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-400">
                  Koi activity log nahi mila is user ke liye
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2">Action</th>
                        <th className="text-left px-3 py-2">Device</th>
                        <th className="text-left px-3 py-2">IP</th>
                        <th className="text-left px-3 py-2">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-slate-700">{r.action}</td>
                          <td className="px-3 py-2 text-slate-600">{parseUserAgent(r.user_agent || '')}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono">{r.ip_address || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{formatDate(r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t bg-slate-50 rounded-b-2xl flex justify-end">
              <button onClick={() => { setHistoryUser(null); setHistoryRows([]); }}
                className="bg-slate-900 hover:bg-slate-700 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
