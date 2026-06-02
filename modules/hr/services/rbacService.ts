/**
 * RBAC Service — Role-Based Access Control
 * 
 * Provides:
 *   - Role CRUD (company-scoped)
 *   - Permission matrix management
 *   - hasPermission() checker used by useRBAC hook
 *   - Employee ↔ Role assignment
 *   - Default role seeding (Admin, Supervisor, Operator, Viewer)
 */

import { Role, Permission, RolePermission, EmployeeRole, RBACModule, RBACAction, RBACScope } from '../types/hr';
import { Company } from '@/modules/shared/types/core';
import { safeParse, safeSave } from '../../shared/services/utils';
import { SyncService } from '@/src/services/SyncService';
import { Logger } from '@/modules/shared/services/logger';

// ── Storage Keys ────────────────────────────────────────────────────
const KEYS = {
  ROLES:            'gtk_erp_roles',
  PERMISSIONS:      'gtk_erp_permissions',
  ROLE_PERMISSIONS: 'gtk_erp_role_permissions',
  EMPLOYEE_ROLES:   'gtk_erp_employee_roles',
};

// ── All modules in the system ───────────────────────────────────────
export const ALL_MODULES: { key: RBACModule; label: string }[] = [
  { key: 'hr',           label: 'HR / Employees' },
  { key: 'attendance',   label: 'Attendance' },
  { key: 'payroll',      label: 'Payroll' },
  { key: 'production',   label: 'Production' },
  { key: 'finance',      label: 'Finance / GL' },
  { key: 'store',        label: 'Store / GRN' },
  { key: 'procurement',  label: 'Procurement' },
  { key: 'sales',        label: 'Sales & CRM' },
  { key: 'projects',     label: 'Projects' },
  { key: 'logistics',    label: 'Logistics' },
  { key: 'vendors',      label: 'Vendor Network' },
  { key: 'hub',          label: 'Supply Chain Hub' },
  { key: 'md-dashboard', label: 'MD Dashboard' },
  { key: 'admin',        label: 'Basis Admin' },
];

export const ALL_ACTIONS: RBACAction[] = ['create', 'read', 'update', 'delete'];

// ── Default Permission Matrix ───────────────────────────────────────
// Maps: roleName → module → allowed actions (scope defaults to 'company')
type DefaultMatrix = Record<string, Record<string, { actions: RBACAction[]; scope: RBACScope }>>;

const DEFAULT_MATRIX: DefaultMatrix = {
  Admin: {
    hr:           { actions: ['create','read','update','delete'], scope: 'company' },
    attendance:   { actions: ['create','read','update','delete'], scope: 'company' },
    payroll:      { actions: ['create','read','update','delete'], scope: 'company' },
    production:   { actions: ['create','read','update','delete'], scope: 'company' },
    finance:      { actions: ['create','read','update','delete'], scope: 'company' },
    store:        { actions: ['create','read','update','delete'], scope: 'company' },
    procurement:  { actions: ['create','read','update','delete'], scope: 'company' },
    sales:        { actions: ['create','read','update','delete'], scope: 'company' },
    projects:     { actions: ['create','read','update','delete'], scope: 'company' },
    logistics:    { actions: ['create','read','update','delete'], scope: 'company' },
    vendors:      { actions: ['create','read','update','delete'], scope: 'company' },
    hub:          { actions: ['create','read','update','delete'], scope: 'company' },
    'md-dashboard': { actions: ['read'], scope: 'company' },
    admin:        { actions: ['create','read','update','delete'], scope: 'all' },
  },
  Supervisor: {
    hr:           { actions: ['read','update'], scope: 'department' },
    attendance:   { actions: ['create','read','update'], scope: 'department' },
    payroll:      { actions: ['read'], scope: 'own' },
    production:   { actions: ['create','read','update','delete'], scope: 'department' },
    store:        { actions: ['read','create'], scope: 'company' },
    procurement:  { actions: ['read'], scope: 'company' },
  },
  'Team Lead': {
    hr:           { actions: ['read'], scope: 'department' },
    attendance:   { actions: ['create','read'], scope: 'department' },
    payroll:      { actions: ['read'], scope: 'own' },
    production:   { actions: ['create','read','update'], scope: 'department' },
  },
  'Store Incharge': {
    hr:           { actions: ['read'], scope: 'own' },
    store:        { actions: ['create','read','update','delete'], scope: 'company' },
    procurement:  { actions: ['create','read'], scope: 'company' },
    payroll:      { actions: ['read'], scope: 'own' },
  },
  Viewer: {
    hr:           { actions: ['read'], scope: 'own' },
    payroll:      { actions: ['read'], scope: 'own' },
  },
};

// ── Seed Helpers ────────────────────────────────────────────────────
let _permCounter = 0;
const makePermId = () => `perm_${String(++_permCounter).padStart(4, '0')}`;

const buildPermissionsForMatrix = (): { permissions: Permission[]; rolePerms: Record<string, string[]> } => {
  const permissions: Permission[] = [];
  const permMap = new Map<string, string>(); // "module|action|scope" → permId
  const rolePerms: Record<string, string[]> = {};

  for (const [roleName, modules] of Object.entries(DEFAULT_MATRIX)) {
    rolePerms[roleName] = [];
    for (const [mod, config] of Object.entries(modules)) {
      for (const action of config.actions) {
        const key = `${mod}|${action}|${config.scope}`;
        let permId = permMap.get(key);
        if (!permId) {
          permId = makePermId();
          permMap.set(key, permId);
          permissions.push({
            id: permId,
            module: mod as RBACModule,
            action: action as RBACAction,
            scope: config.scope,
          });
        }
        rolePerms[roleName].push(permId);
      }
    }
  }

  return { permissions, rolePerms };
};

// ── RBAC Service ────────────────────────────────────────────────────
export const RBACService = {

  // ── Initialize seed data if empty ─────────────────────────────────
  initSeedData: () => {
    const existingRoles = safeParse(KEYS.ROLES);
    if (existingRoles && existingRoles.length > 0) return; // already seeded

    const companies: Company[] = ['GTK', 'GTI', 'Glassco'];
    const roleNames = Object.keys(DEFAULT_MATRIX);

    // Build permissions
    const { permissions, rolePerms } = buildPermissionsForMatrix();
    safeSave(KEYS.PERMISSIONS, permissions);

    // Build roles (one per company per roleName)
    const roles: Role[] = [];
    const rpLinks: RolePermission[] = [];
    let roleIdx = 0;
    let rpIdx = 0;

    for (const comp of companies) {
      for (const roleName of roleNames) {
        roleIdx++;
        const roleId = `role_${String(roleIdx).padStart(3, '0')}`;
        roles.push({
          id: roleId,
          name: roleName,
          company: comp,
          description: `Default ${roleName} role for ${comp}`,
          isSystem: true,
          isActive: true,
        });

        // Link permissions
        const permIds = rolePerms[roleName] || [];
        for (const permId of permIds) {
          rpIdx++;
          rpLinks.push({
            id: `rp_${String(rpIdx).padStart(4, '0')}`,
            roleId,
            permissionId: permId,
          });
        }
      }
    }

    safeSave(KEYS.ROLES, roles);
    safeSave(KEYS.ROLE_PERMISSIONS, rpLinks);
    safeSave(KEYS.EMPLOYEE_ROLES, []);

    SyncService.markDirty('roles');
    SyncService.markDirty('permissions');
    SyncService.markDirty('role_permissions');
    Logger.action('RBAC', 'SEED', `${roles.length} roles, ${permissions.length} permissions seeded`);
  },

  // ── Role CRUD ─────────────────────────────────────────────────────
  getRoles: (company?: Company): Role[] => {
    const all: Role[] = safeParse(KEYS.ROLES);
    if (company) return all.filter(r => r.company === company && r.isActive);
    return all.filter(r => r.isActive);
  },

  getRoleById: (id: string): Role | undefined => {
    const all: Role[] = safeParse(KEYS.ROLES);
    return all.find(r => r.id === id);
  },

  saveRole: (role: Role) => {
    const all: Role[] = safeParse(KEYS.ROLES);
    const idx = all.findIndex(r => r.id === role.id);
    if (idx >= 0) all[idx] = role;
    else all.push(role);
    safeSave(KEYS.ROLES, all);
    SyncService.markDirty('roles');
    Logger.action('RBAC', 'SAVE_ROLE', `Role "${role.name}" saved for ${role.company}`);
  },

  deleteRole: (id: string) => {
    const all: Role[] = safeParse(KEYS.ROLES);
    const role = all.find(r => r.id === id);
    if (role?.isSystem) {
      Logger.action('RBAC', 'DELETE_BLOCKED', `Cannot delete system role ${id}`);
      return false;
    }
    safeSave(KEYS.ROLES, all.map(r => r.id === id ? { ...r, isActive: false } : r));
    // Remove role-permission links
    const rps: RolePermission[] = safeParse(KEYS.ROLE_PERMISSIONS);
    safeSave(KEYS.ROLE_PERMISSIONS, rps.filter(rp => rp.roleId !== id));
    // Remove employee-role assignments
    const ers: EmployeeRole[] = safeParse(KEYS.EMPLOYEE_ROLES);
    safeSave(KEYS.EMPLOYEE_ROLES, ers.filter(er => er.roleId !== id));
    SyncService.markDirty('roles');
    SyncService.markDirty('role_permissions');
    SyncService.markDirty('employee_roles');
    Logger.action('RBAC', 'DELETE_ROLE', `Role ${id} soft-deleted`);
    return true;
  },

  // ── Permission CRUD ───────────────────────────────────────────────
  getPermissions: (): Permission[] => safeParse(KEYS.PERMISSIONS),

  // ── Role ↔ Permission ─────────────────────────────────────────────
  getRolePermissions: (roleId: string): Permission[] => {
    const rps: RolePermission[] = safeParse(KEYS.ROLE_PERMISSIONS);
    const permIds = rps.filter(rp => rp.roleId === roleId).map(rp => rp.permissionId);
    const perms: Permission[] = safeParse(KEYS.PERMISSIONS);
    return perms.filter(p => permIds.includes(p.id));
  },

  setRolePermissions: (roleId: string, permissionIds: string[]) => {
    const allRPs: RolePermission[] = safeParse(KEYS.ROLE_PERMISSIONS);
    // Remove old links for this role
    const others = allRPs.filter(rp => rp.roleId !== roleId);
    // Add new links
    const newRPs: RolePermission[] = permissionIds.map((permId, i) => ({
      id: `rp_${roleId}_${permId}`,
      roleId,
      permissionId: permId,
    }));
    safeSave(KEYS.ROLE_PERMISSIONS, [...others, ...newRPs]);
    SyncService.markDirty('role_permissions');
    Logger.action('RBAC', 'SET_PERMS', `${permissionIds.length} permissions set for role ${roleId}`);
  },

  togglePermission: (roleId: string, module: RBACModule, action: RBACAction, scope: RBACScope) => {
    const allPerms: Permission[] = safeParse(KEYS.PERMISSIONS);
    const allRPs: RolePermission[] = safeParse(KEYS.ROLE_PERMISSIONS);

    // Find or create permission
    let perm = allPerms.find(p => p.module === module && p.action === action && p.scope === scope);
    if (!perm) {
      perm = { id: `perm_${Date.now()}`, module, action, scope };
      allPerms.push(perm);
      safeSave(KEYS.PERMISSIONS, allPerms);
      SyncService.markDirty('permissions');
    }

    // Toggle link
    const existing = allRPs.find(rp => rp.roleId === roleId && rp.permissionId === perm!.id);
    if (existing) {
      // Remove
      safeSave(KEYS.ROLE_PERMISSIONS, allRPs.filter(rp => rp.id !== existing.id));
    } else {
      // Add
      allRPs.push({ id: `rp_${roleId}_${perm.id}`, roleId, permissionId: perm.id });
      safeSave(KEYS.ROLE_PERMISSIONS, allRPs);
    }
    SyncService.markDirty('role_permissions');
  },

  // ── Employee ↔ Role ───────────────────────────────────────────────
  getEmployeeRoles: (employeeId: string): EmployeeRole[] => {
    const all: EmployeeRole[] = safeParse(KEYS.EMPLOYEE_ROLES);
    return all.filter(er => er.employeeId === employeeId);
  },

  getEmployeeRolesResolved: (employeeId: string): (EmployeeRole & { role: Role })[] => {
    const empRoles = RBACService.getEmployeeRoles(employeeId);
    const allRoles: Role[] = safeParse(KEYS.ROLES);
    return empRoles
      .map(er => {
        const role = allRoles.find(r => r.id === er.roleId && r.isActive);
        return role ? { ...er, role } : null;
      })
      .filter(Boolean) as (EmployeeRole & { role: Role })[];
  },

  assignRole: (employeeId: string, roleId: string, assignedBy: string = 'admin') => {
    const all: EmployeeRole[] = safeParse(KEYS.EMPLOYEE_ROLES);
    // Prevent duplicates
    if (all.some(er => er.employeeId === employeeId && er.roleId === roleId)) return;
    const newAssignment: EmployeeRole = {
      id: `er_${employeeId}_${roleId}`,
      employeeId,
      roleId,
      assignedAt: new Date().toISOString(),
      assignedBy,
    };
    safeSave(KEYS.EMPLOYEE_ROLES, [...all, newAssignment]);
    SyncService.markDirty('employee_roles');
    Logger.action('RBAC', 'ASSIGN', `Role ${roleId} assigned to ${employeeId}`);
  },

  removeRole: (employeeId: string, roleId: string) => {
    const all: EmployeeRole[] = safeParse(KEYS.EMPLOYEE_ROLES);
    safeSave(KEYS.EMPLOYEE_ROLES, all.filter(er => !(er.employeeId === employeeId && er.roleId === roleId)));
    SyncService.markDirty('employee_roles');
    Logger.action('RBAC', 'REMOVE', `Role ${roleId} removed from ${employeeId}`);
  },

  setEmployeeRoles: (employeeId: string, roleIds: string[], assignedBy: string = 'admin') => {
    const all: EmployeeRole[] = safeParse(KEYS.EMPLOYEE_ROLES);
    const others = all.filter(er => er.employeeId !== employeeId);
    const newAssignments: EmployeeRole[] = roleIds.map(roleId => ({
      id: `er_${employeeId}_${roleId}`,
      employeeId,
      roleId,
      assignedAt: new Date().toISOString(),
      assignedBy,
    }));
    safeSave(KEYS.EMPLOYEE_ROLES, [...others, ...newAssignments]);
    SyncService.markDirty('employee_roles');
    Logger.action('RBAC', 'SET_ROLES', `${roleIds.length} roles set for ${employeeId}`);
  },

  // ── Permission Checker (core method) ──────────────────────────────
  /**
   * Check if an employee has permission for a module+action.
   * Super admin (authStore role === 'super_admin') bypasses this — checked in useRBAC hook.
   * Returns { allowed: boolean; scope: RBACScope }
   */
  hasPermission: (employeeId: string, module: RBACModule, action: RBACAction): { allowed: boolean; scope: RBACScope } => {
    const empRoles = RBACService.getEmployeeRoles(employeeId);
    if (empRoles.length === 0) return { allowed: false, scope: 'own' };

    const roleIds = empRoles.map(er => er.roleId);
    const allRPs: RolePermission[] = safeParse(KEYS.ROLE_PERMISSIONS);
    const relevantPermIds = allRPs
      .filter(rp => roleIds.includes(rp.roleId))
      .map(rp => rp.permissionId);

    const allPerms: Permission[] = safeParse(KEYS.PERMISSIONS);
    const matchingPerms = allPerms.filter(
      p => relevantPermIds.includes(p.id) && p.module === module && p.action === action
    );

    if (matchingPerms.length === 0) return { allowed: false, scope: 'own' };

    // Pick the widest scope (all > company > department > own)
    const scopeOrder: RBACScope[] = ['all', 'company', 'department', 'own'];
    const bestScope = scopeOrder.find(s => matchingPerms.some(p => p.scope === s)) || 'own';

    return { allowed: true, scope: bestScope };
  },

  // ── Convenience: check if employee can access a sidebar module ────
  canAccessModule: (employeeId: string, module: RBACModule): boolean => {
    return RBACService.hasPermission(employeeId, module, 'read').allowed;
  },

  // ── Get summary: all permissions for a role (for UI matrix) ───────
  getRolePermissionMatrix: (roleId: string): Record<string, Record<string, boolean>> => {
    const perms = RBACService.getRolePermissions(roleId);
    const matrix: Record<string, Record<string, boolean>> = {};

    for (const mod of ALL_MODULES) {
      matrix[mod.key] = {};
      for (const action of ALL_ACTIONS) {
        matrix[mod.key][action] = perms.some(p => p.module === mod.key && p.action === action);
      }
    }
    return matrix;
  },

  // ── Get employees with a specific role ───────────────────────────
  getEmployeesByRole: (roleId: string): string[] => {
    const all: EmployeeRole[] = safeParse(KEYS.EMPLOYEE_ROLES);
    return all.filter(er => er.roleId === roleId).map(er => er.employeeId);
  },
};
