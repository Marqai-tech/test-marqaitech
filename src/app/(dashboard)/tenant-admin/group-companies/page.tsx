'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiLayers, FiEdit2, FiTrash2, FiX, FiRefreshCw,
  FiShield, FiUsers, FiHome, FiInfo, FiBriefcase,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface CompanyInGroup {
  id: string;
  name: string;
  code: string | null;
  status: string;
  maxEmployees?: number | null;
  plannedEmployeeCount?: number | null;
  _count: { employees: number };
}

interface CompanyGroupRow {
  id: string;
  name: string;
  tenantId: string;
  tenantName?: string | null;
  tenantSlug?: string | null;
  employeeLimitMode: 'per_company' | 'group_total';
  maxEmployees: number | null;
  maxCompanies: number | null;
  notes?: string | null;
  createdAt: string;
  _count?: { companies: number; employees: number };
  companies?: CompanyInGroup[];
}

const EMPTY_FORM = {
  name: '',
  employeeLimitMode: 'group_total' as 'per_company' | 'group_total',
  maxEmployees: 0,
  maxCompanies: 0,
  notes: '',
};

export default function TenantGroupCompaniesPage() {
  const { user } = useAuthStore();
  const { tenant, hydrate, hydrated: ctxHydrated } = useCompanyContextStore();

  const [groups, setGroups] = useState<CompanyGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/company-groups', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      // The API returns groups scoped to the caller's tenant for tenant_admin
      setGroups(data.groups || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load group companies');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ctxHydrated) hydrate();
    fetchGroups();
  }, [ctxHydrated, hydrate, fetchGroups]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowCreate(true);
  };

  const openEdit = (g: CompanyGroupRow) => {
    setEditingId(g.id);
    setForm({
      name: g.name,
      employeeLimitMode: g.employeeLimitMode === 'per_company' ? 'per_company' : 'group_total',
      maxEmployees: g.maxEmployees ?? 0,
      maxCompanies: g.maxCompanies ?? 0,
      notes: g.notes || '',
    });
    setShowCreate(true);
  };

  const cancelForm = () => {
    setShowCreate(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Group company name is required');
      return;
    }
    setSubmitting(true);
    try {
      // For tenant_admin, the API ignores the body's tenantId and uses their
      // own tenant. We don't send tenantId — the API resolves it from the JWT.
      const payload = {
        name: form.name.trim(),
        employeeLimitMode: form.employeeLimitMode,
        maxEmployees: Number(form.maxEmployees) > 0 ? Number(form.maxEmployees) : null,
        maxCompanies: Number(form.maxCompanies) > 0 ? Number(form.maxCompanies) : null,
        notes: form.notes?.trim() || null,
      };
      const url = editingId ? `/api/company-groups/${editingId}` : '/api/company-groups';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      toast.success(editingId ? 'Group company updated' : 'Group company created');
      cancelForm();
      fetchGroups();
      // Refresh the context store so the header CompanySwitcher reflects the change
      hydrate(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save group company');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete group company "${name}"? This is only allowed if the group has no companies attached.`)) return;
    try {
      const res = await fetch(`/api/company-groups/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      toast.success('Group company deleted');
      fetchGroups();
      hydrate(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const tenantName = tenant?.name || user?.tenant?.name || 'your tenant';
  const totalGroups = groups.length;
  const totalCompanies = groups.reduce((s, g) => s + (g._count?.companies || 0), 0);
  const totalEmployees = groups.reduce((s, g) => s + (g._count?.employees || 0), 0);

  return (
    <div className="space-y-6">
      {/* HERO */}
      <div className="relative rounded-2xl overflow-hidden border-0 shadow-xl shadow-violet-500/10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#312E81] to-[#5B21B6]" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-violet-500/30 rounded-full blur-[100px]" />
        <div className="relative z-10 px-6 sm:px-8 py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-violet-300/60 text-xs font-medium tracking-widest uppercase">Tenant Administration</p>
              <h1 className="text-2xl font-bold text-white mt-1">Group Companies</h1>
              <p className="text-violet-100/60 text-sm font-medium mt-1 flex items-center gap-1.5 flex-wrap">
                <FiHome className="w-3.5 h-3.5" />
                <span>Inducted under tenant:</span>
                <span className="font-bold text-white">{tenantName}</span>
                <span className="opacity-50">·</span>
                <span>{totalGroups} groups</span>
                <span className="opacity-50">·</span>
                <span>{totalCompanies} companies</span>
                <span className="opacity-50">·</span>
                <span>{totalEmployees} employees</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchGroups}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-semibold hover:bg-white/20 transition-all"
              >
                <FiRefreshCw className="w-4 h-4" /> Refresh
              </button>
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white text-sm font-semibold shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all"
              >
                <FiPlus className="w-4 h-4" /> New Group Company
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* INFO BANNER */}
      <div className="rounded-xl p-4 border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50/60 flex items-start gap-3">
        <FiLayers className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-900 flex-1">
          <p className="font-bold mb-2 text-sm">Multi-tenancy Hierarchy</p>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded-md border border-indigo-200 font-semibold">
              <FiHome className="w-3 h-3" /> Tenant
            </span>
            <span className="text-indigo-400">=</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded-md border border-violet-200 font-semibold">
              <FiLayers className="w-3 h-3" /> Group Company (parent)
            </span>
            <span className="text-indigo-400">→</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded-md border border-blue-200 font-semibold">
              <FiBriefcase className="w-3 h-3" /> Company
            </span>
            <span className="text-indigo-400">→</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded-md border border-amber-200 font-semibold">
              <FiUsers className="w-3 h-3" /> Employees
            </span>
          </div>
          <p className="leading-relaxed">
            <b>The group company name and parent tenant are the same.</b>
            {' '}Your tenant <b>{tenantName}</b> has a companies cap set by the super admin.
            {' '}Create a group company here (you can name it <b>{tenantName}</b> to match the tenant, or use a different name for a sub-cluster) — then induct <b>Companies</b> under each group via the{' '}
            <a href="/tenant-admin/companies" className="font-bold text-indigo-700 underline">Companies</a> page.
            {' '}Each group can have an employee-strength barrier (per-company or group-total).
          </p>
        </div>
      </div>

      {/* EMPLOYEE STRENGTH BARRIER BANNER */}
      <div className="rounded-xl p-4 border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/60 flex items-start gap-3">
        <FiShield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900">
          <p className="font-semibold mb-1">Employee Strength Barriers</p>
          <p>
            Create group companies under <b>{tenantName}</b> and cap how many employees they can hold. Choose
            <b> per-company </b> mode (cap applies to EACH company) or <b>group-total</b> mode (cap applies to
            the SUM across all companies in the group). You will be blocked from creating more companies or
            loading more employees beyond these limits.
          </p>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Group Companies" value={totalGroups} icon={<FiLayers className="w-5 h-5" />} bg="bg-violet-50 text-violet-600" ring="ring-violet-100" />
        <StatCard label="Companies Inducted" value={totalCompanies} icon={<FiHome className="w-5 h-5" />} bg="bg-indigo-50 text-indigo-600" ring="ring-indigo-100" />
        <StatCard label="Total Employees" value={totalEmployees} icon={<FiUsers className="w-5 h-5" />} bg="bg-amber-50 text-amber-600" ring="ring-amber-100" />
      </div>

      {/* GROUPS LIST */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-100/70 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <FiLayers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No group companies created yet</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Per the multi-tenancy hierarchy, your tenant <b>{tenantName}</b> is the parent.
            Create a group company (it can share the tenant name) and then induct individual
            companies under it via the <a href="/tenant-admin/companies" className="font-bold text-indigo-700 underline">Companies</a> page.
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white text-sm font-semibold shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all"
          >
            <FiPlus className="w-4 h-4" /> Create your first group company
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const empCount = g._count?.employees || 0;
            const coCount = g._count?.companies || 0;
            const hasEmpCap = g.maxEmployees !== null && g.maxEmployees !== undefined && g.maxEmployees > 0;
            const hasCoCap = g.maxCompanies !== null && g.maxCompanies !== undefined && g.maxCompanies > 0;
            return (
              <div key={g.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0">
                      <FiLayers className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900">{g.name}</h3>
                      <p className="text-sm text-slate-500 flex items-center gap-1.5 flex-wrap">
                        <FiHome className="w-3 h-3" /> {g.tenantName || tenantName}
                        <span className="opacity-50">·</span> {coCount} companies
                        <span className="opacity-50">·</span> {empCount} employees
                      </p>
                      {g.notes && <p className="text-xs text-slate-500 italic mt-1">“{g.notes}”</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {hasEmpCap ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[11px] font-semibold">
                        <FiUsers className="w-3 h-3" />
                        {g.employeeLimitMode === 'per_company' ? 'per-co' : 'group-total'}: {empCount}/{g.maxEmployees}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-[11px] font-semibold">
                        <FiUsers className="w-3 h-3" /> no emp cap
                      </span>
                    )}
                    {hasCoCap && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 ring-1 ring-blue-200 text-[11px] font-semibold">
                        <FiLayers className="w-3 h-3" /> co cap: {coCount}/{g.maxCompanies}
                      </span>
                    )}
                    <button
                      onClick={() => openEdit(g)}
                      className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg"
                      title="Edit"
                    >
                      <FiEdit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(g.id, g.name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Companies under this group */}
                {g.companies && g.companies.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                    {g.companies.map((c) => {
                      const cEmp = c._count?.employees || 0;
                      const cCap = c.maxEmployees;
                      const cPlan = c.plannedEmployeeCount;
                      const atCap = cCap !== null && cCap !== undefined && (cCap as number) > 0 && cEmp >= (cCap as number);
                      return (
                        <div key={c.id} className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5">
                          <FiHome className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium text-slate-900">{c.name}</span>
                          {c.code && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold">{c.code}</span>}
                          <span className="ml-auto flex items-center gap-1.5">
                            <span className={atCap ? 'text-red-600 font-semibold' : ''}>{cEmp} emp</span>
                            {cPlan !== null && cPlan !== undefined && (cPlan as number) > 0 && (
                              <span className="text-slate-400">plan: {cPlan}</span>
                            )}
                            {cCap !== null && cCap !== undefined && (cCap as number) > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold">cap: {cCap}</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-purple-50">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FiLayers className="w-4 h-4 text-violet-500" />
                  {editingId ? 'Edit Group Company' : 'Create Group Company'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                  <FiHome className="w-3 h-3" />
                  <span>Inducting under tenant:</span>
                  <span className="font-bold text-violet-700">{tenantName}</span>
                </p>
              </div>
              <button
                onClick={cancelForm}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Tenant context — read only */}
              <div className="px-4 py-3 rounded-xl bg-violet-50/60 border border-violet-100 flex items-center gap-3">
                <FiHome className="w-5 h-5 text-violet-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-violet-700/70 font-semibold">Parent Tenant</p>
                  <p className="text-sm font-bold text-violet-900">{tenantName}</p>
                </div>
                <span className="text-[11px] text-violet-700/70">auto-assigned</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Group Company Name *
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="e.g., Acme Group"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-300"
                />
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
                  <FiUsers className="w-4 h-4 text-amber-500" /> Employee Strength Barrier
                </h4>
                <p className="text-xs text-slate-500 mb-3">
                  Set a cap on how many employees can be loaded under this group. Leave 0 for unlimited.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Limit mode</label>
                    <select
                      value={form.employeeLimitMode}
                      onChange={(e) => setForm({ ...form, employeeLimitMode: e.target.value as 'per_company' | 'group_total' })}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-300"
                    >
                      <option value="group_total">Group total — cap = SUM across all companies in this group</option>
                      <option value="per_company">Per company — cap applies to EACH company in this group</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Max employees (0 = unlimited)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.maxEmployees}
                      onChange={(e) => setForm({ ...form, maxEmployees: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-300"
                      placeholder="e.g., 500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
                  <FiLayers className="w-4 h-4 text-blue-500" /> Company Cap (optional)
                </h4>
                <p className="text-xs text-slate-500 mb-3">
                  Optionally cap how many companies can be inducted under this group. Leave 0 for unlimited.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Max companies in this group (0 = unlimited)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.maxCompanies}
                      onChange={(e) => setForm({ ...form, maxCompanies: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-300"
                      placeholder="e.g., 5"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Admin notes (optional)</label>
                    <input
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-300"
                      placeholder="e.g., Sales cluster — cap at 200 staff"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                <FiInfo className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <p className="text-xs text-slate-500">
                  After creation, use the <b>Companies</b> menu to induct individual companies under this group.
                  The header switcher will list all companies under <b>{tenantName}</b>.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={cancelForm}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-purple-500 text-white text-sm font-semibold shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : (<>{editingId ? 'Update Group' : 'Create Group'}</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, bg, ring }: { label: string; value: number; icon: React.ReactNode; bg: string; ring: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center ring-1 ${ring}`}>{icon}</div>
      </div>
    </div>
  );
}
