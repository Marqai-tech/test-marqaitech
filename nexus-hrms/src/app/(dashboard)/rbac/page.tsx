'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiShield,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiEye,
  FiCheckCircle,
  FiXCircle,
  FiLock,
  FiKey,
  FiLink,
  FiUsers,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = { active: 'nexus-badge nexus-badge-success', inactive: 'nexus-badge nexus-badge-error' };
  return map[status] || 'nexus-badge';
}

function getTypeBadge(type: string) {
  return type === 'internal' ? 'nexus-badge nexus-badge-info' : 'nexus-badge nexus-badge-warning';
}

function getAccessLevelBadge(level: string) {
  const map: Record<string, string> = {
    platform: 'nexus-badge nexus-badge-error',
    tenant: 'nexus-badge nexus-badge-warning',
    group_company: 'nexus-badge nexus-badge-info',
    company: 'nexus-badge nexus-badge-info',
    branch: 'nexus-badge nexus-badge-success',
    department: 'nexus-badge nexus-badge-success',
    project: 'nexus-badge nexus-badge-info',
    team: 'nexus-badge nexus-badge-success',
    self: 'nexus-badge nexus-badge-info',
    client_only: 'nexus-badge nexus-badge-warning',
    vendor_only: 'nexus-badge nexus-badge-warning',
    sub_vendor_only: 'nexus-badge nexus-badge-warning',
  };
  return map[level] || 'nexus-badge';
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const MODULES = [
  'employees', 'recruitment', 'leave', 'attendance', 'payroll', 'performance',
  'training', 'assets', 'documents', 'travel', 'expenses', 'timesheets',
  'projects', 'settings', 'super_admin', 'helpdesk', 'workflows', 'reports',
  'notifications',
];

const ACTIONS = [
  'view', 'create', 'edit', 'delete', 'approve', 'reject', 'export', 'import',
  'assign', 'configure', 'download', 'audit_view',
];

const ACCESS_LEVELS = [
  'platform', 'tenant', 'group_company', 'company', 'branch', 'department',
  'project', 'team', 'self', 'client_only', 'vendor_only', 'sub_vendor_only',
];

const TABS = [
  { key: 'roles', label: 'Roles', icon: FiShield },
  { key: 'permissions', label: 'Permissions', icon: FiKey },
  { key: 'role-permissions', label: 'Role-Permission Mapping', icon: FiLink },
  { key: 'user-roles', label: 'User-Role Assignment', icon: FiUsers },
] as const;

type TabKey = typeof TABS[number]['key'];

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

interface Role {
  id: string;
  name: string;
  key: string;
  description?: string | null;
  type: string;
  isSystem: boolean;
  status: string;
  rolePermissions?: { permission: Permission }[];
  userRoles?: unknown[];
  createdAt: string;
}

interface Permission {
  id: string;
  name: string;
  key: string;
  module: string;
  action: string;
  description?: string | null;
  rolePermissions?: { role: Role }[];
  createdAt: string;
}

interface RolePermission {
  id: string;
  roleId: string;
  permissionId: string;
  accessLevel: string;
  role: Role;
  permission: Permission;
  createdAt: string;
}

interface UserRoleItem {
  id: string;
  userId: string;
  roleId: string;
  scopeId?: string | null;
  user: { id: string; name: string; email: string; role?: string };
  role: Role;
  createdAt: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
}

/* ------------------------------------------------------------------ */
/*  Initial Forms                                                     */
/* ------------------------------------------------------------------ */

const initialRoleForm = { name: '', key: '', description: '', type: 'internal', isSystem: false, status: 'active' };
const initialPermissionForm = { name: '', key: '', module: 'employees', action: 'view', description: '' };
const initialRolePermissionForm = { roleId: '', permissionId: '', accessLevel: 'self' };
const initialUserRoleForm = { userId: '', roleId: '', scopeId: '' };

/* ================================================================== */
/*  Main Component                                                    */
/* ================================================================== */

export default function RBACPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  /* ---- Tab ---- */
  const [activeTab, setActiveTab] = useState<TabKey>('roles');

  /* ---- Data ---- */
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [userRoles, setUserRoles] = useState<UserRoleItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  /* ---- Loading ---- */
  const [loading, setLoading] = useState(true);

  /* ---- Search & Filter ---- */
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterModule, setFilterModule] = useState('');

  /* ---- Form ---- */
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [roleForm, setRoleForm] = useState(initialRoleForm);
  const [permissionForm, setPermissionForm] = useState(initialPermissionForm);
  const [rolePermissionForm, setRolePermissionForm] = useState(initialRolePermissionForm);
  const [userRoleForm, setUserRoleForm] = useState(initialUserRoleForm);

  /* ---- View ---- */
  const [viewingId, setViewingId] = useState<string | null>(null);

  /* ---- Delete ---- */
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Data Fetching                                                    */
  /* ---------------------------------------------------------------- */

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/roles?limit=100', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setRoles(data.items || []); }
    } catch { toast.error('Failed to load roles'); }
  }, []);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch('/api/permissions?limit=100', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setPermissions(data.items || []); }
    } catch { toast.error('Failed to load permissions'); }
  }, []);

  const fetchRolePermissions = useCallback(async () => {
    try {
      const res = await fetch('/api/role-permissions?limit=100', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setRolePermissions(data.items || []); }
    } catch { toast.error('Failed to load role-permission mappings'); }
  }, []);

  const fetchUserRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/user-roles?limit=100', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setUserRoles(data.items || []); }
    } catch { toast.error('Failed to load user-role assignments'); }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?limit=100', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setEmployees(data.employees || []); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    queueMicrotask(async () => {
      setLoading(true);
      await fetchRoles();
      await fetchPermissions();
      await fetchRolePermissions();
      await fetchUserRoles();
      await fetchEmployees();
      setLoading(false);
    });
  }, [fetchRoles, fetchPermissions, fetchRolePermissions, fetchUserRoles, fetchEmployees]);

  const refreshAll = () => {
    fetchRoles();
    fetchPermissions();
    fetchRolePermissions();
    fetchUserRoles();
  };

  /* ---------------------------------------------------------------- */
  /*  Tab change resets                                                */
  /* ---------------------------------------------------------------- */

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setShowForm(false);
    setEditingId(null);
    setViewingId(null);
    setDeleteConfirmId(null);
    setSearch('');
    setFilterStatus('');
    setFilterModule('');
  };

  /* ---------------------------------------------------------------- */
  /*  Open handlers                                                    */
  /* ---------------------------------------------------------------- */

  const handleOpenAdd = () => {
    if (activeTab === 'roles') setRoleForm(initialRoleForm);
    else if (activeTab === 'permissions') setPermissionForm(initialPermissionForm);
    else if (activeTab === 'role-permissions') setRolePermissionForm(initialRolePermissionForm);
    else setUserRoleForm(initialUserRoleForm);
    setEditingId(null);
    setShowForm(true);
    setViewingId(null);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenEdit = (item: Role | Permission | RolePermission | UserRoleItem) => {
    if (activeTab === 'roles') {
      const r = item as Role;
      setRoleForm({ name: r.name, key: r.key, description: r.description || '', type: r.type, isSystem: r.isSystem, status: r.status });
    } else if (activeTab === 'permissions') {
      const p = item as Permission;
      setPermissionForm({ name: p.name, key: p.key, module: p.module, action: p.action, description: p.description || '' });
    } else if (activeTab === 'role-permissions') {
      const rp = item as RolePermission;
      setRolePermissionForm({ roleId: rp.roleId, permissionId: rp.permissionId, accessLevel: rp.accessLevel });
    } else {
      const ur = item as UserRoleItem;
      setUserRoleForm({ userId: ur.userId, roleId: ur.roleId, scopeId: ur.scopeId || '' });
    }
    setEditingId(item.id);
    setShowForm(true);
    setViewingId(null);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenView = (id: string) => {
    setViewingId(id);
    setShowForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCloseView = () => setViewingId(null);

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  /* ---------------------------------------------------------------- */
  /*  Submit handlers                                                  */
  /* ---------------------------------------------------------------- */

  const handleSubmitRole = async () => {
    if (!roleForm.name.trim() || !roleForm.key.trim()) { toast.error('Name and Key are required'); return; }
    try {
      setSubmitting(true);
      const payload = { name: roleForm.name.trim(), key: roleForm.key.trim(), description: roleForm.description.trim() || null, type: roleForm.type, isSystem: roleForm.isSystem, status: roleForm.status };
      const url = editingId ? `/api/roles/${editingId}` : '/api/roles';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Role updated' : 'Role created');
      handleCancelForm(); fetchRoles(); fetchRolePermissions();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to save'); } finally { setSubmitting(false); }
  };

  const handleSubmitPermission = async () => {
    if (!permissionForm.name.trim() || !permissionForm.key.trim()) { toast.error('Name and Key are required'); return; }
    try {
      setSubmitting(true);
      const payload = { name: permissionForm.name.trim(), key: permissionForm.key.trim(), module: permissionForm.module, action: permissionForm.action, description: permissionForm.description.trim() || null };
      const url = editingId ? `/api/permissions/${editingId}` : '/api/permissions';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Permission updated' : 'Permission created');
      handleCancelForm(); fetchPermissions(); fetchRolePermissions();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to save'); } finally { setSubmitting(false); }
  };

  const handleSubmitRolePermission = async () => {
    if (!rolePermissionForm.roleId || !rolePermissionForm.permissionId) { toast.error('Role and Permission are required'); return; }
    try {
      setSubmitting(true);
      const payload = { roleId: rolePermissionForm.roleId, permissionId: rolePermissionForm.permissionId, accessLevel: rolePermissionForm.accessLevel };
      const url = editingId ? `/api/role-permissions/${editingId}` : '/api/role-permissions';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Mapping updated' : 'Mapping created');
      handleCancelForm(); fetchRolePermissions();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to save'); } finally { setSubmitting(false); }
  };

  const handleSubmitUserRole = async () => {
    if (!userRoleForm.userId || !userRoleForm.roleId) { toast.error('User and Role are required'); return; }
    try {
      setSubmitting(true);
      const payload = { userId: userRoleForm.userId, roleId: userRoleForm.roleId, scopeId: userRoleForm.scopeId.trim() || null };
      const url = editingId ? `/api/user-roles/${editingId}` : '/api/user-roles';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Assignment updated' : 'Assignment created');
      handleCancelForm(); fetchUserRoles();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to save'); } finally { setSubmitting(false); }
  };

  const handleSubmit = () => {
    if (activeTab === 'roles') handleSubmitRole();
    else if (activeTab === 'permissions') handleSubmitPermission();
    else if (activeTab === 'role-permissions') handleSubmitRolePermission();
    else handleSubmitUserRole();
  };

  /* ---------------------------------------------------------------- */
  /*  Delete handler                                                   */
  /* ---------------------------------------------------------------- */

  const handleDelete = async (id: string) => {
    let apiPath = '';
    if (activeTab === 'roles') apiPath = `/api/roles/${id}`;
    else if (activeTab === 'permissions') apiPath = `/api/permissions/${id}`;
    else if (activeTab === 'role-permissions') apiPath = `/api/role-permissions/${id}`;
    else apiPath = `/api/user-roles/${id}`;
    try {
      setDeleting(true);
      const res = await fetch(apiPath, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Deleted successfully');
      setDeleteConfirmId(null);
      refreshAll();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); } finally { setDeleting(false); }
  };

  /* ---------------------------------------------------------------- */
  /*  Filtered data                                                    */
  /* ---------------------------------------------------------------- */

  const filteredRoles = roles.filter(r => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.key.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const filteredPermissions = permissions.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.key.toLowerCase().includes(search.toLowerCase());
    const matchModule = !filterModule || p.module === filterModule;
    return matchSearch && matchModule;
  });

  const filteredRolePermissions = rolePermissions.filter(rp => {
    const matchSearch = !search || rp.role?.name?.toLowerCase().includes(search.toLowerCase()) || rp.permission?.name?.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const filteredUserRoles = userRoles.filter(ur => {
    const matchSearch = !search || ur.user?.name?.toLowerCase().includes(search.toLowerCase()) || ur.user?.email?.toLowerCase().includes(search.toLowerCase()) || ur.role?.name?.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  /* ---------------------------------------------------------------- */
  /*  Stats                                                            */
  /* ---------------------------------------------------------------- */

  const roleStats = { total: roles.length, active: roles.filter(r => r.status === 'active').length, system: roles.filter(r => r.isSystem).length };
  const permStats = { total: permissions.length, modules: [...new Set(permissions.map(p => p.module))].length, actions: [...new Set(permissions.map(p => p.action))].length };
  const rpStats = { total: rolePermissions.length, platform: rolePermissions.filter(rp => rp.accessLevel === 'platform').length, self: rolePermissions.filter(rp => rp.accessLevel === 'self').length };
  const urStats = { total: userRoles.length, uniqueUsers: [...new Set(userRoles.map(ur => ur.userId))].length, uniqueRoles: [...new Set(userRoles.map(ur => ur.roleId))].length };

  /* ---------------------------------------------------------------- */
  /*  View panel data                                                  */
  /* ---------------------------------------------------------------- */

  const viewingRole = viewingId && activeTab === 'roles' ? roles.find(r => r.id === viewingId) : null;
  const viewingPermission = viewingId && activeTab === 'permissions' ? permissions.find(p => p.id === viewingId) : null;
  const viewingRolePermission = viewingId && activeTab === 'role-permissions' ? rolePermissions.find(rp => rp.id === viewingId) : null;
  const viewingUserRole = viewingId && activeTab === 'user-roles' ? userRoles.find(ur => ur.id === viewingId) : null;

  /* ================================================================== */
  /*  RENDER                                                            */
  /* ================================================================== */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiShield className="w-6 h-6 text-blue-500" /> RBAC Management
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage roles, permissions, and access control</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            {activeTab === 'roles' ? 'Add Role' : activeTab === 'permissions' ? 'Add Permission' : activeTab === 'role-permissions' ? 'Add Mapping' : 'Assign Role'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-nexus-text-muted hover:text-nexus-text-primary hover:bg-white/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiShield className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{roleStats.total}</p><p className="text-xs text-nexus-text-muted">Total Roles</p></div></div></div>
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{roleStats.active}</p><p className="text-xs text-nexus-text-muted">Active</p></div></div></div>
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiLock className="w-5 h-5 text-amber-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{roleStats.system}</p><p className="text-xs text-nexus-text-muted">System Roles</p></div></div></div>
        </div>
      )}

      {activeTab === 'permissions' && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiKey className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{permStats.total}</p><p className="text-xs text-nexus-text-muted">Total Permissions</p></div></div></div>
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{permStats.modules}</p><p className="text-xs text-nexus-text-muted">Modules</p></div></div></div>
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiLock className="w-5 h-5 text-amber-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{permStats.actions}</p><p className="text-xs text-nexus-text-muted">Action Types</p></div></div></div>
        </div>
      )}

      {activeTab === 'role-permissions' && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiLink className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{rpStats.total}</p><p className="text-xs text-nexus-text-muted">Total Mappings</p></div></div></div>
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><FiShield className="w-5 h-5 text-red-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{rpStats.platform}</p><p className="text-xs text-nexus-text-muted">Platform Level</p></div></div></div>
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{rpStats.self}</p><p className="text-xs text-nexus-text-muted">Self Level</p></div></div></div>
        </div>
      )}

      {activeTab === 'user-roles' && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiUsers className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{urStats.total}</p><p className="text-xs text-nexus-text-muted">Total Assignments</p></div></div></div>
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{urStats.uniqueUsers}</p><p className="text-xs text-nexus-text-muted">Users with Roles</p></div></div></div>
          <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiShield className="w-5 h-5 text-amber-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{urStats.uniqueRoles}</p><p className="text-xs text-nexus-text-muted">Roles Assigned</p></div></div></div>
        </div>
      )}

      {/* View Panel */}
      {viewingRole && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Role Details</h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">Name</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingRole.name}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Key</p><p className="text-sm text-nexus-text-primary mt-0.5 font-mono">{viewingRole.key}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Type</p><p className="mt-0.5"><span className={getTypeBadge(viewingRole.type)}>{viewingRole.type}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">System Role</p><p className="mt-0.5"><span className={viewingRole.isSystem ? 'nexus-badge nexus-badge-warning' : 'nexus-badge nexus-badge-info'}>{viewingRole.isSystem ? 'Yes' : 'No'}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingRole.status)}>{viewingRole.status}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Permissions</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingRole.rolePermissions?.length || 0}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Description</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingRole.description || '—'}</p></div>
            </div>
            {viewingRole.rolePermissions && viewingRole.rolePermissions.length > 0 && (
              <div className="mt-6 pt-4 border-t border-nexus-border">
                <h3 className="text-sm font-semibold text-nexus-text-primary mb-3">Assigned Permissions</h3>
                <div className="flex flex-wrap gap-2">
                  {viewingRole.rolePermissions.map((rp, i) => (
                    <span key={i} className="nexus-badge nexus-badge-info">{rp.permission?.module} : {rp.permission?.action}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-nexus-border">
              <button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {viewingPermission && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Permission Details</h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">Name</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingPermission.name}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Key</p><p className="text-sm text-nexus-text-primary mt-0.5 font-mono">{viewingPermission.key}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Module</p><p className="mt-0.5"><span className="nexus-badge nexus-badge-info">{viewingPermission.module}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Action</p><p className="mt-0.5"><span className="nexus-badge nexus-badge-success">{viewingPermission.action}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Roles Using It</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingPermission.rolePermissions?.length || 0}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Description</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingPermission.description || '—'}</p></div>
            </div>
            {viewingPermission.rolePermissions && viewingPermission.rolePermissions.length > 0 && (
              <div className="mt-6 pt-4 border-t border-nexus-border">
                <h3 className="text-sm font-semibold text-nexus-text-primary mb-3">Roles with this Permission</h3>
                <div className="flex flex-wrap gap-2">
                  {viewingPermission.rolePermissions.map((rp, i) => (
                    <span key={i} className="nexus-badge nexus-badge-warning">{rp.role?.name}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-nexus-border">
              <button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {viewingRolePermission && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Role-Permission Mapping Details</h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">Role</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingRolePermission.role?.name}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Permission</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingRolePermission.permission?.name}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Module</p><p className="mt-0.5"><span className="nexus-badge nexus-badge-info">{viewingRolePermission.permission?.module}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Action</p><p className="mt-0.5"><span className="nexus-badge nexus-badge-success">{viewingRolePermission.permission?.action}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Access Level</p><p className="mt-0.5"><span className={getAccessLevelBadge(viewingRolePermission.accessLevel)}>{viewingRolePermission.accessLevel}</span></p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border">
              <button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {viewingUserRole && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">User-Role Assignment Details</h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">User Name</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingUserRole.user?.name}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Email</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingUserRole.user?.email}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Assigned Role</p><p className="mt-0.5"><span className="nexus-badge nexus-badge-info">{viewingUserRole.role?.name}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Scope ID</p><p className="text-sm text-nexus-text-primary mt-0.5 font-mono">{viewingUserRole.scopeId || '—'}</p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border">
              <button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Form */}
      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">
                {editingId
                  ? activeTab === 'roles' ? 'Edit Role' : activeTab === 'permissions' ? 'Edit Permission' : activeTab === 'role-permissions' ? 'Edit Mapping' : 'Edit Assignment'
                  : activeTab === 'roles' ? 'Add Role' : activeTab === 'permissions' ? 'Add Permission' : activeTab === 'role-permissions' ? 'Add Mapping' : 'Assign Role'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>

            {/* Roles Form */}
            {activeTab === 'roles' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label><input type="text" value={roleForm.name} onChange={e => setRoleForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Role name" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Key *</label><input type="text" value={roleForm.key} onChange={e => setRoleForm(p => ({ ...p, key: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-mono" placeholder="role_key" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Type</label><select value={roleForm.type} onChange={e => setRoleForm(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="internal">Internal</option><option value="external">External</option></select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label><select value={roleForm.status} onChange={e => setRoleForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
                <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1 pt-5"><input type="checkbox" id="isSystem" checked={roleForm.isSystem} onChange={e => setRoleForm(p => ({ ...p, isSystem: e.target.checked }))} className="w-4 h-4 rounded border-nexus-border text-blue-500 focus:ring-blue-500/20" /><label htmlFor="isSystem" className="text-xs font-medium text-nexus-text-secondary">System Role</label></div>
                <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label><textarea rows={2} value={roleForm.description} onChange={e => setRoleForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Description..." /></div>
              </div>
            )}

            {/* Permissions Form */}
            {activeTab === 'permissions' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label><input type="text" value={permissionForm.name} onChange={e => setPermissionForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Permission name" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Key *</label><input type="text" value={permissionForm.key} onChange={e => setPermissionForm(p => ({ ...p, key: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-mono" placeholder="permission_key" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Module *</label><select value={permissionForm.module} onChange={e => setPermissionForm(p => ({ ...p, module: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{MODULES.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Action *</label><select value={permissionForm.action} onChange={e => setPermissionForm(p => ({ ...p, action: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
                <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label><textarea rows={2} value={permissionForm.description} onChange={e => setPermissionForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Description..." /></div>
              </div>
            )}

            {/* Role-Permission Mapping Form */}
            {activeTab === 'role-permissions' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Role *</label><select value={rolePermissionForm.roleId} onChange={e => setRolePermissionForm(p => ({ ...p, roleId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">Select Role</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Permission *</label><select value={rolePermissionForm.permissionId} onChange={e => setRolePermissionForm(p => ({ ...p, permissionId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">Select Permission</option>{permissions.map(p => <option key={p.id} value={p.id}>{p.module} : {p.action} ({p.name})</option>)}</select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Access Level *</label><select value={rolePermissionForm.accessLevel} onChange={e => setRolePermissionForm(p => ({ ...p, accessLevel: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{ACCESS_LEVELS.map(al => <option key={al} value={al}>{al}</option>)}</select></div>
              </div>
            )}

            {/* User-Role Assignment Form */}
            {activeTab === 'user-roles' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">User *</label><select value={userRoleForm.userId} onChange={e => setUserRoleForm(p => ({ ...p, userId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">Select User</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.email})</option>)}</select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Role *</label><select value={userRoleForm.roleId} onChange={e => setUserRoleForm(p => ({ ...p, roleId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">Select Role</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Scope ID</label><input type="text" value={userRoleForm.scopeId} onChange={e => setUserRoleForm(p => ({ ...p, scopeId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Company / Branch / Dept ID" /></div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder={`Search ${activeTab === 'roles' ? 'roles' : activeTab === 'permissions' ? 'permissions' : activeTab === 'role-permissions' ? 'mappings' : 'assignments'}...`} />
        </div>
        {activeTab === 'roles' && (
          <div className="flex items-center gap-2">
            <FiFilter className="w-4 h-4 text-nexus-text-muted" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        )}
        {activeTab === 'permissions' && (
          <div className="flex items-center gap-2">
            <FiFilter className="w-4 h-4 text-nexus-text-muted" />
            <select value={filterModule} onChange={e => setFilterModule(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Modules</option>
              {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ==================== DATA TABLES ==================== */}

      {/* Roles Table */}
      {activeTab === 'roles' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Key</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">System</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Permissions</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                      <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-8 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-14 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredRoles.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center"><FiShield className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No roles found</p></td></tr>
                ) : (
                  filteredRoles.map(r => (
                    <tr key={r.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      {deleteConfirmId === r.id ? (
                        <td colSpan={7} className="px-4 py-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Delete &quot;{r.name}&quot;?</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(r.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{r.name}</td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary font-mono">{r.key}</td>
                          <td className="px-4 py-3"><span className={getTypeBadge(r.type)}>{r.type}</span></td>
                          <td className="px-4 py-3"><span className={r.isSystem ? 'nexus-badge nexus-badge-warning' : 'nexus-badge nexus-badge-info'}>{r.isSystem ? 'Yes' : 'No'}</span></td>
                          <td className="px-4 py-3"><span className={getStatusBadge(r.status)}>{r.status}</span></td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{r.rolePermissions?.length || 0}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleOpenView(r.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                              {isAdmin && (<><button onClick={() => handleOpenEdit(r)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button><button onClick={() => { setDeleteConfirmId(r.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button></>)}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Permissions Table */}
      {activeTab === 'permissions' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Key</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Module</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider"># Roles</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                      <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-14 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredPermissions.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center"><FiKey className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No permissions found</p></td></tr>
                ) : (
                  filteredPermissions.map(p => (
                    <tr key={p.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      {deleteConfirmId === p.id ? (
                        <td colSpan={7} className="px-4 py-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Delete &quot;{p.name}&quot;?</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(p.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{p.name}</td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary font-mono">{p.key}</td>
                          <td className="px-4 py-3"><span className="nexus-badge nexus-badge-info">{p.module}</span></td>
                          <td className="px-4 py-3"><span className="nexus-badge nexus-badge-success">{p.action}</span></td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary max-w-48 truncate">{p.description || '—'}</td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{p.rolePermissions?.length || 0}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleOpenView(p.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                              {isAdmin && (<><button onClick={() => handleOpenEdit(p)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button><button onClick={() => { setDeleteConfirmId(p.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button></>)}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Role-Permission Mapping Table */}
      {activeTab === 'role-permissions' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Permission (Module : Action)</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Access Level</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                      <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredRolePermissions.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center"><FiLink className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No mappings found</p></td></tr>
                ) : (
                  filteredRolePermissions.map(rp => (
                    <tr key={rp.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      {deleteConfirmId === rp.id ? (
                        <td colSpan={4} className="px-4 py-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Delete this mapping?</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(rp.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{rp.role?.name || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="nexus-badge nexus-badge-info">{rp.permission?.module}</span>
                            <span className="mx-1 text-nexus-text-muted">:</span>
                            <span className="nexus-badge nexus-badge-success">{rp.permission?.action}</span>
                          </td>
                          <td className="px-4 py-3"><span className={getAccessLevelBadge(rp.accessLevel)}>{rp.accessLevel}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleOpenView(rp.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                              {isAdmin && (<><button onClick={() => handleOpenEdit(rp)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button><button onClick={() => { setDeleteConfirmId(rp.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button></>)}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User-Role Assignment Table */}
      {activeTab === 'user-roles' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">User Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Assigned Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Scope</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                      <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-20 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredUserRoles.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center"><FiUsers className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No assignments found</p></td></tr>
                ) : (
                  filteredUserRoles.map(ur => (
                    <tr key={ur.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      {deleteConfirmId === ur.id ? (
                        <td colSpan={5} className="px-4 py-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Remove &quot;{ur.role?.name}&quot; from &quot;{ur.user?.name}&quot;?</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(ur.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{ur.user?.name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{ur.user?.email || '—'}</td>
                          <td className="px-4 py-3"><span className="nexus-badge nexus-badge-info">{ur.role?.name}</span></td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary font-mono">{ur.scopeId || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleOpenView(ur.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                              {isAdmin && (<><button onClick={() => handleOpenEdit(ur)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button><button onClick={() => { setDeleteConfirmId(ur.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button></>)}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
