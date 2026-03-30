import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { RBACService, ALL_MODULES, ALL_ACTIONS } from '@/modules/hr/services/rbacService';
import { HRService } from '@/modules/hr/services/hrService';
import { Role, Permission, RBACModule, RBACAction, RBACScope, Employee } from '@/modules/hr/types/hr';
import { Company } from '@/modules/shared/types/core';
import { Shield, Plus, Edit2, Trash2, X, Users, Check, ChevronDown, ChevronRight, Search, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';

// ── Scope Labels ────────────────────────────────────────────────────
const SCOPE_LABELS: Record<RBACScope, string> = {
  own: 'Own Only',
  department: 'Department',
  company: 'Company',
  all: 'All Companies',
};
const SCOPE_ORDER: RBACScope[] = ['own', 'department', 'company', 'all'];

const RoleManager: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);

  // ── State ──────────────────────────────────────────────────────────
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [view, setView] = useState<'roles' | 'matrix' | 'assign'>('roles');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Partial<Role> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // ── Load data ──────────────────────────────────────────────────────

  const { refreshKey } = useRealtimeRefresh(['roles', 'permissions', 'role_permissions', 'employee_roles']);

  useEffect(() => {
    RBACService.initSeedData();
    setRoles(RBACService.getRoles(company));
  }, [company, refreshKey]);

  const selectedRole = useMemo(() => roles.find(r => r.id === selectedRoleId), [roles, selectedRoleId]);

  // ── Permission Matrix for selected role ────────────────────────────
  const permMatrix = useMemo(() => {
    if (!selectedRoleId) return {};
    return RBACService.getRolePermissionMatrix(selectedRoleId);
  }, [selectedRoleId, roles]);

  // ── Employees for assignment ───────────────────────────────────────
  const employees = useMemo(() => {
    return HRService.getEmployees().filter(e => e.company === company);
  }, [company, refreshKey]);

  const assignedEmployeeIds = useMemo(() => {
    if (!selectedRoleId) return new Set<string>();
    return new Set(RBACService.getEmployeesByRole(selectedRoleId));
  }, [selectedRoleId, roles]);

  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) return employees;
    const term = searchTerm.toLowerCase();
    return employees.filter(e =>
      e.personal.name.toLowerCase().includes(term) ||
      e.work.employeeCode.toLowerCase().includes(term)
    );
  }, [employees, searchTerm]);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleSaveRole = () => {
    if (!editingRole?.name?.trim()) {
      toast.error('Role name is required');
      return;
    }
    const role: Role = {
      id: editingRole.id || `role_${Date.now()}`,
      name: editingRole.name.trim(),
      company,
      description: editingRole.description || '',
      isSystem: editingRole.isSystem || false,
      isActive: true,
    };
    RBACService.saveRole(role);
    setRoles(RBACService.getRoles(company));
    setShowRoleModal(false);
    setEditingRole(null);
    toast.success(`Role "${role.name}" saved`);
  };

  const handleDeleteRole = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    if (role?.isSystem) {
      toast.error('System roles cannot be deleted');
      return;
    }
    if (window.confirm(`Delete role "${role?.name}"?`)) {
      RBACService.deleteRole(roleId);
      setRoles(RBACService.getRoles(company));
      if (selectedRoleId === roleId) setSelectedRoleId(null);
      toast.success('Role deleted');
    }
  };

  const handleTogglePermission = (module: RBACModule, action: RBACAction) => {
    if (!selectedRoleId) return;
    const scope: RBACScope = 'company'; // Default scope for toggle
    RBACService.togglePermission(selectedRoleId, module, action, scope);
    setRoles(RBACService.getRoles(company)); // trigger re-render
  };

  const handleToggleEmployee = (empId: string) => {
    if (!selectedRoleId) return;
    if (assignedEmployeeIds.has(empId)) {
      RBACService.removeRole(empId, selectedRoleId);
    } else {
      RBACService.assignRole(empId, selectedRoleId);
    }
    setRoles(RBACService.getRoles(company)); // trigger re-render
  };

  const toggleModule = (mod: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(mod) ? next.delete(mod) : next.add(mod);
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="text-indigo-600" size={24} />
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Role Manager</h2>
            <p className="text-sm text-slate-500">Manage RBAC roles and permissions for {company}</p>
          </div>
        </div>
        <button
          onClick={() => { setEditingRole({ company, isSystem: false }); setShowRoleModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          <Plus size={16} /> New Role
        </button>
      </div>

      {/* Layout: Roles List + Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* ── Left: Roles List ──────────────────────────────────────── */}
        <div className="lg:col-span-4 space-y-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700">Roles ({roles.length})</h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {roles.map(role => {
                const empCount = RBACService.getEmployeesByRole(role.id).length;
                return (
                  <div
                    key={role.id}
                    onClick={() => { setSelectedRoleId(role.id); setView('matrix'); }}
                    className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                      selectedRoleId === role.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800 text-sm">{role.name}</span>
                          {role.isSystem && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">System</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{role.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{empCount} users</span>
                        {!role.isSystem && (
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingRole(role); setShowRoleModal(true); }}
                              className="p-1 text-slate-400 hover:text-indigo-600"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteRole(role.id); }}
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {roles.length === 0 && (
                <div className="p-6 text-center text-slate-400 text-sm">No roles configured. Click "New Role" to start.</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Detail Panel ──────────────────────────────────── */}
        <div className="lg:col-span-8">
          {!selectedRoleId ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
              <Shield className="mx-auto text-slate-300 mb-3" size={48} />
              <p className="text-slate-500">Select a role from the list to view its permissions</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setView('matrix')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    view === 'matrix' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Permission Matrix
                </button>
                <button
                  onClick={() => setView('assign')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    view === 'assign' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Users size={14} />
                    Assign Employees ({assignedEmployeeIds.size})
                  </div>
                </button>
              </div>

              {/* Permission Matrix */}
              {view === 'matrix' && (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Info size={14} className="text-slate-400" />
                    <p className="text-xs text-slate-500">
                      Click checkboxes to toggle permissions for <strong>{selectedRole?.name}</strong>. 
                      {selectedRole?.isSystem && ' System role permissions can be modified but the role itself cannot be deleted.'}
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-3 py-2 font-semibold text-slate-600 w-48">Module</th>
                          {ALL_ACTIONS.map(action => (
                            <th key={action} className="text-center px-3 py-2 font-semibold text-slate-600 capitalize w-20">
                              {action}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ALL_MODULES.map(mod => {
                          const modPerms = permMatrix[mod.key] || {};
                          const hasAny = Object.values(modPerms).some(Boolean);
                          return (
                            <tr key={mod.key} className={`hover:bg-slate-50 ${hasAny ? '' : 'opacity-60'}`}>
                              <td className="px-3 py-2.5 text-slate-700 font-medium">{mod.label}</td>
                              {ALL_ACTIONS.map(action => (
                                <td key={action} className="text-center px-3 py-2.5">
                                  <button
                                    onClick={() => handleTogglePermission(mod.key, action)}
                                    className={`w-6 h-6 rounded border-2 inline-flex items-center justify-center transition-all ${
                                      modPerms[action]
                                        ? 'bg-indigo-500 border-indigo-500 text-white'
                                        : 'border-slate-300 hover:border-indigo-400'
                                    }`}
                                  >
                                    {modPerms[action] && <Check size={14} strokeWidth={3} />}
                                  </button>
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
                    <button
                      onClick={() => {
                        ALL_MODULES.forEach(mod => {
                          ALL_ACTIONS.forEach(action => {
                            const has = permMatrix[mod.key]?.[action];
                            if (!has) handleTogglePermission(mod.key, action);
                          });
                        });
                        toast.success('All permissions granted');
                      }}
                      className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 font-medium"
                    >
                      Grant All
                    </button>
                    <button
                      onClick={() => {
                        ALL_MODULES.forEach(mod => {
                          ALL_ACTIONS.forEach(action => {
                            const has = permMatrix[mod.key]?.[action];
                            if (has) handleTogglePermission(mod.key, action);
                          });
                        });
                        toast.success('All permissions revoked');
                      }}
                      className="text-xs px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 font-medium"
                    >
                      Revoke All
                    </button>
                    <button
                      onClick={() => {
                        ALL_MODULES.forEach(mod => {
                          const hasRead = permMatrix[mod.key]?.['read'];
                          if (!hasRead) handleTogglePermission(mod.key, 'read');
                          // remove other permissions
                          (['create','update','delete'] as RBACAction[]).forEach(action => {
                            const has = permMatrix[mod.key]?.[action];
                            if (has) handleTogglePermission(mod.key, action);
                          });
                        });
                        toast.success('Read-only permissions set');
                      }}
                      className="text-xs px-3 py-1.5 bg-sky-50 text-sky-700 rounded-lg hover:bg-sky-100 font-medium"
                    >
                      Read-Only
                    </button>
                  </div>
                </div>
              )}

              {/* Assign Employees */}
              {view === 'assign' && (
                <div className="p-4">
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search employees..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                    />
                  </div>

                  <div className="max-h-[450px] overflow-y-auto divide-y divide-slate-100">
                    {filteredEmployees.map(emp => {
                      const isAssigned = assignedEmployeeIds.has(emp.id);
                      return (
                        <div
                          key={emp.id}
                          onClick={() => handleToggleEmployee(emp.id)}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${
                            isAssigned ? 'bg-indigo-50/50' : ''
                          }`}
                        >
                          <button
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                              isAssigned
                                ? 'bg-indigo-500 border-indigo-500 text-white'
                                : 'border-slate-300'
                            }`}
                          >
                            {isAssigned && <Check size={12} strokeWidth={3} />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-800">{emp.personal.name}</span>
                              <span className="text-xs text-slate-400">{emp.work.employeeCode}</span>
                            </div>
                            <p className="text-xs text-slate-500 truncate">
                              {emp.work.designation || 'No designation'} · {emp.work.department || 'No dept'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {filteredEmployees.length === 0 && (
                      <div className="p-6 text-center text-slate-400 text-sm">
                        {employees.length === 0 ? 'No employees in this company' : 'No matching employees'}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <p className="text-xs text-slate-500">
                      {assignedEmployeeIds.size} employee(s) assigned to <strong>{selectedRole?.name}</strong>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Role Create/Edit Modal ──────────────────────────────────── */}
      {showRoleModal && editingRole && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingRole.id ? 'Edit Role' : 'New Role'}
              </h3>
              <button onClick={() => { setShowRoleModal(false); setEditingRole(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role Name *</label>
                <input
                  type="text"
                  value={editingRole.name || ''}
                  onChange={e => setEditingRole({ ...editingRole, name: e.target.value })}
                  placeholder="e.g., Quality Inspector"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={editingRole.description || ''}
                  onChange={e => setEditingRole({ ...editingRole, description: e.target.value })}
                  placeholder="What this role is for..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none"
                />
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">
                  Company: <strong>{company}</strong> · After creating, select the role from the list to configure its permissions.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
              <button
                onClick={() => { setShowRoleModal(false); setEditingRole(null); }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRole}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                {editingRole.id ? 'Update' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(RoleManager);
