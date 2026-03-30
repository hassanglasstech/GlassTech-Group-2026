/**
 * useRBAC — React hook for RBAC permission checks
 * 
 * Usage:
 *   const { can, canAccess, isSuperAdmin } = useRBAC();
 *   if (can('hr', 'create')) { ... }
 *   if (canAccess('payroll')) { ... }
 * 
 * Super admin (from authStore) bypasses all checks.
 * If no RBAC employee roles are assigned, falls back to authStore role-based access.
 */

import { useCallback, useMemo } from 'react';
import { useAuthStore } from '@/modules/auth/authStore';
import { RBACService } from '../services/rbacService';
import { RBACModule, RBACAction, RBACScope } from '../types/hr';
import { safeParse } from '@/modules/shared/services/utils';

// Map authStore UserRole → employeeId lookup key
// When RBAC employee_roles are empty, fall back to authStore role checks
const AUTH_ROLE_MODULE_ACCESS: Record<string, RBACModule[]> = {
  super_admin:        [], // empty = all access
  gtk_admin:          [], // empty = all access
  glassco_admin:      [], // empty = all access
  glassco_production: ['production', 'store', 'procurement', 'logistics'],
  nippon_admin:       ['sales', 'store', 'hr', 'finance', 'procurement'],
};

export const useRBAC = () => {
  const user = useAuthStore(s => s.user);

  const isSuperAdmin = useMemo(() => user?.role === 'super_admin', [user]);
  const isAdmin = useMemo(() => 
    user?.role === 'super_admin' || user?.role === 'gtk_admin' || user?.role === 'glassco_admin' || user?.role === 'nippon_admin', 
    [user]
  );

  // Try to find employee linked to current auth user
  const linkedEmployeeId = useMemo(() => {
    if (!user?.email) return null;
    const employees = safeParse('employees');
    // Match by email or by a custom authUserId field (future Phase 4)
    const match = employees.find((e: any) => 
      e?.personal?.email === user.email || e?.authUserId === user.id
    );
    return match?.id || null;
  }, [user]);

  // Check if employee has RBAC roles assigned
  const hasRBACRoles = useMemo(() => {
    if (!linkedEmployeeId) return false;
    return RBACService.getEmployeeRoles(linkedEmployeeId).length > 0;
  }, [linkedEmployeeId]);

  /**
   * Check permission: module + action
   * Returns { allowed, scope }
   */
  const can = useCallback((module: RBACModule, action: RBACAction): { allowed: boolean; scope: RBACScope } => {
    // Super admin bypasses everything
    if (isSuperAdmin || isAdmin) return { allowed: true, scope: 'all' };

    // If employee has RBAC roles, use RBAC check
    if (linkedEmployeeId && hasRBACRoles) {
      return RBACService.hasPermission(linkedEmployeeId, module, action);
    }

    // Fallback: use authStore role-based module list
    if (user?.role) {
      const allowedModules = AUTH_ROLE_MODULE_ACCESS[user.role];
      if (!allowedModules || allowedModules.length === 0) {
        // Empty list = full access for admin roles
        return { allowed: true, scope: 'company' };
      }
      return { allowed: allowedModules.includes(module), scope: 'company' };
    }

    return { allowed: false, scope: 'own' };
  }, [isSuperAdmin, isAdmin, linkedEmployeeId, hasRBACRoles, user]);

  /**
   * Quick check: can the user access this module at all? (read permission)
   */
  const canAccess = useCallback((module: RBACModule): boolean => {
    return can(module, 'read').allowed;
  }, [can]);

  /**
   * Get all accessible module keys for sidebar filtering
   */
  const accessibleModules = useMemo((): RBACModule[] => {
    if (isSuperAdmin || isAdmin) return [];  // empty = show all

    if (linkedEmployeeId && hasRBACRoles) {
      const allModules: RBACModule[] = [
        'hr', 'attendance', 'payroll', 'production', 'finance',
        'store', 'procurement', 'sales', 'projects', 'logistics',
        'vendors', 'hub', 'md-dashboard', 'admin'
      ];
      return allModules.filter(mod => RBACService.canAccessModule(linkedEmployeeId, mod));
    }

    // Fallback to authStore
    if (user?.role) {
      const allowed = AUTH_ROLE_MODULE_ACCESS[user.role];
      if (!allowed || allowed.length === 0) return []; // empty = all
      return allowed;
    }

    return [];
  }, [isSuperAdmin, isAdmin, linkedEmployeeId, hasRBACRoles, user]);

  return {
    can,
    canAccess,
    accessibleModules,
    isSuperAdmin,
    isAdmin,
    linkedEmployeeId,
    hasRBACRoles,
  };
};

/**
 * Wrapper component: renders children only if user has permission
 * 
 * <PermissionGate module="payroll" action="read">
 *   <PayrollTable />
 * </PermissionGate>
 */
export const PermissionGate: React.FC<{
  module: RBACModule;
  action?: RBACAction;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}> = ({ module, action = 'read', fallback = null, children }) => {
  const { can } = useRBAC();
  const { allowed } = can(module, action);
  return allowed ? <>{children}</> : <>{fallback}</>;
};
