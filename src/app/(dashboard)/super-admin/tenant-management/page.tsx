'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  FiServer, FiUsers, FiPlus, FiEdit2, FiEye, FiTrash2, FiX, FiSearch,
  FiRefreshCw, FiShield, FiDatabase, FiActivity, FiZap, FiDownload,
  FiLayers, FiCreditCard, FiCheckCircle, FiAlertTriangle,
  FiChevronLeft, FiChevronRight, FiMoreVertical, FiGlobe, FiKey,
  FiUserCheck, FiInfo, FiClock, FiToggleLeft,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ─── Interfaces ───────────────────────────────────────────
interface TenantRow {
  id: string; name: string; slug: string; domain: string | null; plan: string; status: string;
  country: string | null; currency: string; timezone: string; createdAt: string; logo?: string | null;
  maxCompaniesAllowed?: number;
  _count?: { users: number; companyGroups: number; subscriptions: number };
}

interface Pagination { page: number; limit: number; total: number; totalPages: number }

interface DbStatus {
  id: string; name: string; slug: string; domain: string | null; status: string; plan: string;
  isIsolated: boolean;
  database: { id: string; name: string; active: boolean; provisionedAt: string } | null;
}

interface DbTestResult {
  ok: boolean; mode: 'dedicated' | 'shared'; slug: string; name?: string;
  databaseName?: string; latencyMs?: number; provisionedAt?: string;
  neonProjectId?: string | null; neonBranchId?: string | null;
  error?: string; message: string;
}

interface DetailTenant extends TenantRow {
  language?: string; baseCurrency?: string; dataRegion?: string | null;
  subscriptionSeats?: number; subscriptionStorage?: number;
  companyGroups: {
    id: string; name: string;
    companies: { id: string; name: string; code: string | null; status: string; maxEmployees: number | null; plannedEmployeeCount: number | null; _count: { departments: number; branches: number } }[];
    _count: { companies: number };
  }[];
  employees: unknown[];
  users: { id: string; email: string; name: string; role: string; status: string; lastLogin: string | null; createdAt: string }[];
  subscriptions: {
    id: string; plan: { name: string; planType: string }; status: string; billingCycle: string;
    startDate: string; endDate: string; amount: number; currency: string; paymentStatus: string; trialEnd?: string | null;
  }[];
  _count: { users: number; companyGroups: number; employees: number };
}

interface ConfirmState {
  open: boolean; title: string; message: string; confirmLabel: string; danger: boolean;
  requireText?: string; requireHint?: string; onConfirm: () => void | Promise<void>;
}

const statusBadge: Record<string, string> = {
  active: 'thb-badge thb-badge-success',
  trial: 'thb-badge thb-badge-purple',
  pending_approval: 'thb-badge thb-badge-warning',
  suspended: 'thb-badge thb-badge-error',
  inactive: 'thb-badge bg-slate-100 text-slate-600',
};

const statusLabel: Record<string, string> = {
  active: 'Active', trial: 'Trial', pending_approval: 'Pending', suspended: 'Suspended', inactive: 'Inactive',
};

function planBadgeClass(plan: string): string {
  if (plan === 'enterprise') return 'thb-badge thb-badge-purple';
  if (plan === 'global_enterprise' || plan === 'white_label') return 'thb-badge thb-badge-info';
  if (plan === 'staffing') return 'thb-badge thb-badge-warning';
  return 'thb-badge thb-badge-primary';
}

function fmtDate(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const emptyForm = {
  name: '', slug: '', domain: '', plan: 'starter', country: '', currency: 'INR', timezone: 'UTC',
  language: 'en', baseCurrency: 'INR', dataRegion: '', subscriptionSeats: 0, subscriptionStorage: 0,
  maxCompaniesAllowed: 0, logo: '',
  adminName: '', adminEmail: '', adminPassword: '',
};

const TIMEZONES = ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'];
const LANGUAGES = [['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['ar', 'Arabic'], ['hi', 'Hindi']];
const PLANS = ['starter', 'professional', 'enterprise', 'global_enterprise', 'staffing', 'white_label'];

export default function TenantManagementPage() {
  const { user } = useAuthStore();

  // ─── Access guard (same pattern as sibling super-admin pages) ───
  if (user?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <FiShield className="w-16 h-16 text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-800">Access Restricted</h2>
        <p className="text-slate-500">This page is only accessible to Super Admins.</p>
      </div>
    );
  }
  return <TenantManagementConsole />;
}

function TenantManagementConsole() {
  // ─── List state ───
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [dbStatuses, setDbStatuses] = useState<Record<string, DbStatus>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [isolationFilter, setIsolationFilter] = useState<'' | 'isolated' | 'shared'>('');
  const [pageSize, setPageSize] = useState(20);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slugTouchedRef = useRef(false);
  const fetchRef = useRef<(page?: number, limit?: number, opts?: { silent?: boolean }) => Promise<void>>(async () => {});

  // ─── Drawer / forms state ───
  const [detail, setDetail] = useState<DetailTenant | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'groups' | 'users' | 'subs'>('overview');
  const [detailLoading, setDetailLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formSaving, setFormSaving] = useState(false);

  // ─── DB ops state ───
  const [provisionFor, setProvisionFor] = useState<DetailTenant | null>(null);
  const [provisionForm, setProvisionForm] = useState({ connectionString: '', databaseName: '', neonProjectId: '', neonBranchId: '' });
  const [provisionSaving, setProvisionSaving] = useState(false);
  const [testResult, setTestResult] = useState<DbTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>({ open: false, title: '', message: '', confirmLabel: 'Confirm', danger: false, onConfirm: () => {} });
  const [confirmText, setConfirmText] = useState('');
  const [actionMenuFor, setActionMenuFor] = useState<string | null>(null);

  // ─── Data fetching ───
  const fetchTenants = useCallback(async (page = 1, limit = pageSize, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/tenants?${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load tenants');
      setTenants(data.tenants || []);
      setPagination(data.pagination || { page: 1, limit, total: 0, totalPages: 1 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, pageSize]);

  const fetchDbStatuses = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant-database/list', { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load DB status');
      const map: Record<string, DbStatus> = {};
      for (const t of data.tenants || []) map[t.id] = t;
      setDbStatuses(map);
    } catch (err) {
      console.error('DB status load failed:', err);
    }
  }, []);

  // Keep a live ref so scheduled fetches never fire with a stale closure
  useEffect(() => { fetchRef.current = fetchTenants; }, [fetchTenants]);

  // Initial + filter-driven load (deferred so effects stay setState-sync-free)
  useEffect(() => {
    const t = setTimeout(() => { fetchRef.current(1); }, 0);
    return () => clearTimeout(t);
  }, [statusFilter, pageSize]);
  useEffect(() => {
    const t = setTimeout(() => { fetchDbStatuses(); }, 0);
    return () => clearTimeout(t);
  }, [fetchDbStatuses]);

  // Debounced search
  const onSearchChange = (v: string) => {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { fetchRef.current(1); }, 400);
  };

  const refreshAll = () => { fetchTenants(pagination.page, pageSize, { silent: true }); fetchDbStatuses(); };

  // ─── Derived: KPIs (real data only) ───
  const kpis = useMemo(() => {
    const dbEntries = Object.values(dbStatuses);
    const isolated = dbEntries.filter((d) => d.isIsolated).length;
    return {
      total: pagination.total,
      active: tenants.filter((t) => t.status === 'active').length,
      needsAttention: tenants.filter((t) => ['suspended', 'pending_approval', 'inactive'].includes(t.status)).length,
      trial: tenants.filter((t) => t.status === 'trial').length,
      isolated,
      shared: dbEntries.filter((d) => !d.isIsolated).length,
    };
  }, [tenants, dbStatuses, pagination.total]);

  // ─── Detail drawer ───
  const openDetail = async (t: TenantRow) => {
    setDetailLoading(true);
    setDetail({ ...t, companyGroups: [], employees: [], users: [], subscriptions: [], _count: { users: t._count?.users ?? 0, companyGroups: t._count?.companyGroups ?? 0, employees: 0 } });
    setDetailTab('overview');
    setTestResult(null);
    setActionMenuFor(null);
    try {
      const res = await fetch(`/api/tenants/${t.id}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load tenant');
      setDetail(data.tenant);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load tenant');
    } finally {
      setDetailLoading(false);
    }
  };

  // ─── Create / Edit ───
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    slugTouchedRef.current = false;
    setShowForm(true);
    setActionMenuFor(null);
  };

  const openEdit = (t: TenantRow) => {
    setEditingId(t.id);
    setForm({
      name: t.name, slug: t.slug, domain: t.domain || '', plan: t.plan, country: t.country || '',
      currency: t.currency, timezone: t.timezone, language: 'en',
      baseCurrency: t.currency, dataRegion: '',
      subscriptionSeats: 0, subscriptionStorage: 0,
      maxCompaniesAllowed: t.maxCompaniesAllowed ?? 0, logo: t.logo || '',
      adminName: '', adminEmail: '', adminPassword: '',
    });
    slugTouchedRef.current = true;
    setShowForm(true);
    setActionMenuFor(null);
    // Load full detail so extended fields (language/seats/storage) prefill correctly
    fetch(`/api/tenants/${t.id}`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.tenant) return;
        setForm((f) => ({
          ...f,
          language: d.tenant.language || 'en',
          baseCurrency: d.tenant.baseCurrency || f.currency,
          dataRegion: d.tenant.dataRegion || '',
          subscriptionSeats: d.tenant.subscriptionSeats ?? 0,
          subscriptionStorage: d.tenant.subscriptionStorage ?? 0,
        }));
      })
      .catch(() => {});
  };

  const submitForm = async () => {
    if (!form.name.trim() || !form.slug.trim()) { toast.error('Name and slug are required'); return; }
    if (!editingId && (!form.adminName.trim() || !form.adminEmail.trim() || !form.adminPassword)) {
      toast.error('Admin name, email and password are required for a new tenant');
      return;
    }
    setFormSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(), domain: form.domain.trim() || undefined, plan: form.plan,
        country: form.country.trim() || undefined, currency: form.currency, timezone: form.timezone,
        language: form.language, baseCurrency: form.baseCurrency,
        dataRegion: form.dataRegion.trim() || null,
        subscriptionSeats: Number(form.subscriptionSeats) || 0,
        subscriptionStorage: Number(form.subscriptionStorage) || 0,
        maxCompaniesAllowed: Number(form.maxCompaniesAllowed) || 0,
        logo: form.logo.trim() || undefined,
      };
      if (editingId) {
        const res = await fetch(`/api/tenants/${editingId}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update tenant');
        toast.success('Tenant updated');
      } else {
        payload.slug = form.slug.trim();
        payload.adminName = form.adminName.trim();
        payload.adminEmail = form.adminEmail.trim();
        payload.adminPassword = form.adminPassword;
        const res = await fetch('/api/tenants', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create tenant');
        toast.success(`Tenant "${form.name}" created — a matching group company and tenant admin were provisioned automatically`);
      }
      setShowForm(false);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setFormSaving(false);
    }
  };

  // ─── Status lifecycle (suspend / activate / convert trial) with confirmation ───
  const changeStatus = (t: TenantRow, next: string) => {
    setActionMenuFor(null);
    const label = statusLabel[next] || next;
    setConfirm({
      open: true,
      title: `${label} — ${t.name}?`,
      danger: next === 'suspended' || next === 'inactive',
      confirmLabel: `Mark ${label}`,
      message:
        next === 'suspended'
          ? 'Suspended tenants are blocked from writing data (employees, companies, etc.). Their users can still log in read-only. You can reactivate at any time.'
          : next === 'inactive'
            ? 'Inactive tenants are treated like suspended ones — writes are blocked platform-wide. Use this for offboarded or dormant tenants.'
            : next === 'trial'
              ? 'Trial tenants get the standard trial treatment (conversion to active happens from here or Trial Requests).'
              : 'Active tenants can log in and write data across every module.',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/tenants/${t.id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status: next }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Status update failed');
          toast.success(`${t.name} is now ${label.toLowerCase()}`);
          setConfirm((c) => ({ ...c, open: false }));
          refreshAll();
          if (detail?.id === t.id) openDetail({ ...t, status: next });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Status update failed');
        }
      },
    });
    setConfirmText('');
  };

  // ─── Delete (type-slug-to-confirm) ───
  const requestDelete = (t: TenantRow) => {
    setActionMenuFor(null);
    const db = dbStatuses[t.id];
    setConfirm({
      open: true,
      title: `Delete ${t.name}?`,
      danger: true,
      confirmLabel: 'Delete permanently',
      requireText: t.slug,
      requireHint: `Type the tenant slug "${t.slug}" to confirm.`,
      message: `This permanently removes the tenant record, its tenant admin users, group companies, subscriptions and feature flags. ${
        db?.isIsolated ? `Its DEDICATED DATABASE (${db.database?.name}) is NOT dropped automatically — remove it in Neon separately if desired.` : 'The tenant currently shares the platform database (no dedicated DB registered).'
      } This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/tenants/${t.id}`, { method: 'DELETE', headers: getAuthHeaders() });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Delete failed');
          toast.success(`Tenant "${t.name}" deleted`);
          setConfirm((c) => ({ ...c, open: false }));
          if (detail?.id === t.id) setDetail(null);
          refreshAll();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
    setConfirmText('');
  };

  // ─── DB provisioning / health ───
  const openProvision = (t: DetailTenant) => {
    setProvisionFor(t);
    setProvisionForm({ connectionString: '', databaseName: `tenant_${t.slug.replace(/-/g, '_')}`, neonProjectId: '', neonBranchId: '' });
  };

  const submitProvision = async () => {
    if (!provisionFor) return;
    if (!provisionForm.connectionString.trim() || !provisionForm.databaseName.trim()) {
      toast.error('Connection string and database name are required');
      return;
    }
    setProvisionSaving(true);
    try {
      const res = await fetch('/api/tenant-database/provision', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          tenantId: provisionFor.id,
          connectionString: provisionForm.connectionString.trim(),
          databaseName: provisionForm.databaseName.trim(),
          neonProjectId: provisionForm.neonProjectId.trim() || undefined,
          neonBranchId: provisionForm.neonBranchId.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Provisioning failed');
      toast.success(data.message || 'Database registered');
      setProvisionFor(null);
      fetchDbStatuses();
      // Follow up with a live connectivity test
      const tRes = await fetch('/api/tenant-database/test', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ slug: provisionFor.slug }) });
      const tData = await tRes.json();
      setTestResult(tData);
      if (detail) openDetail(detail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Provisioning failed');
    } finally {
      setProvisionSaving(false);
    }
  };

  const runTest = async (slug: string) => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/tenant-database/test', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ slug }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test failed');
      setTestResult(data);
      if (data.ok) toast.success(data.message || 'Connection OK'); else toast.error(data.message || 'Connection FAILED');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const flushCache = async (slug: string) => {
    setFlushing(true);
    try {
      const res = await fetch('/api/tenant-database/flush-cache', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ slug }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Flush failed');
      toast.success(data.message || 'Cache flushed');
      fetchDbStatuses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Flush failed');
    } finally {
      setFlushing(false);
    }
  };

  const flushAllCaches = () => {
    setConfirm({
      open: true, title: 'Flush ALL tenant DB handles?', danger: false, confirmLabel: 'Flush all',
      message: 'Every cached dedicated-database connection will be dropped. The next request per tenant re-opens a fresh connection (brief latency spike). Safe to run.',
      onConfirm: async () => {
        try {
          const res = await fetch('/api/tenant-database/flush-cache', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ all: true }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Flush failed');
          toast.success(data.message || 'All caches flushed');
          setConfirm((c) => ({ ...c, open: false }));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Flush failed');
        }
      },
    });
    setConfirmText('');
  };

  // ─── CSV export (real data from the current filtered query) ───
  const exportCsv = async () => {
    try {
      const params = new URLSearchParams({ page: '1', limit: '1000' });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/tenants?${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      const rows: TenantRow[] = data.tenants || [];
      const header = ['Name', 'Slug', 'Plan', 'Status', 'Domain', 'Country', 'Currency', 'Timezone', 'MaxCompanies', 'Users', 'Groups', 'Subscriptions', 'DB Mode', 'Database', 'CreatedAt'];
      const lines = rows.map((t) => {
        const db = dbStatuses[t.id];
        return [t.name, t.slug, t.plan, t.status, t.domain || '', t.country || '', t.currency, t.timezone,
          t.maxCompaniesAllowed ?? 0, t._count?.users ?? 0, t._count?.companyGroups ?? 0, t._count?.subscriptions ?? 0,
          db?.isIsolated ? 'dedicated' : 'shared', db?.database?.name || '', t.createdAt]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
      });
      const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `tenants-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} tenants`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const dbStatusFor = (t: TenantRow): DbStatus | undefined => dbStatuses[t.id];

  // Client-side plan + isolation filtering (server supports search/status only)
  const visibleTenants = useMemo(() => tenants.filter((t) => {
    if (planFilter && t.plan !== planFilter) return false;
    if (isolationFilter) {
      const iso = dbStatuses[t.id]?.isIsolated;
      if (isolationFilter === 'isolated' && !iso) return false;
      if (isolationFilter === 'shared' && iso) return false;
    }
    return true;
  }), [tenants, planFilter, isolationFilter, dbStatuses]);

  // ─── Render ───
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><FiServer className="text-emerald-500" /> Tenant Management</h1>
          <p className="text-sm text-slate-500 mt-1">Platform-level lifecycle console — provision, configure, monitor and offboard tenant workspaces.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshAll} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"><FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh</button>
          <button onClick={flushAllCaches} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"><FiZap className="text-amber-500" /> Flush DB Caches</button>
          <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white hover:bg-green-600 shadow-sm shadow-green-500/25 rounded-lg font-medium text-sm transition-colors"><FiPlus /> New Tenant</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Tenants', value: kpis.total, icon: FiServer, cls: 'bg-slate-50 text-slate-600' },
          { label: 'Active', value: kpis.active, icon: FiCheckCircle, cls: 'bg-emerald-50 text-emerald-500' },
          { label: 'Needs Attention', value: kpis.needsAttention, icon: FiAlertTriangle, cls: 'bg-amber-50 text-amber-500' },
          { label: 'On Trial', value: kpis.trial, icon: FiClock, cls: 'bg-purple-50 text-purple-500' },
          { label: 'Dedicated DBs', value: kpis.isolated, icon: FiDatabase, cls: 'bg-green-50 text-green-500' },
          { label: 'Shared DB Mode', value: kpis.shared, icon: FiToggleLeft, cls: 'bg-orange-50 text-orange-500' },
        ].map((k) => (
          <div key={k.label} className="thb-card thb-card-hover p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{k.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{k.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${k.cls}`}><k.icon className="w-5 h-5" /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="thb-card p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search by name, slug or domain…"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 cursor-pointer">
            <option value="">All Status</option>
            {['active', 'trial', 'pending_approval', 'suspended', 'inactive'].map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
          </select>
          <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); }} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 cursor-pointer">
            <option value="">All Plans</option>
            {PLANS.map((p) => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
          </select>
          <select value={isolationFilter} onChange={(e) => setIsolationFilter(e.target.value as '' | 'isolated' | 'shared')} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 cursor-pointer">
            <option value="">All DB Modes</option>
            <option value="isolated">Dedicated DB</option>
            <option value="shared">Shared DB</option>
          </select>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 cursor-pointer">
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"><FiDownload /> Export CSV</button>
        </div>
      </div>

      {/* Tenant table */}
      <div className="thb-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Database</th>
                <th className="px-4 py-3">Users</th>
                <th className="px-4 py-3">Groups</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400"><FiRefreshCw className="animate-spin w-6 h-6 mx-auto" /></td></tr>
              ) : visibleTenants.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <FiServer className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-500 font-medium">No tenants match the current filters</p>
                  <p className="text-slate-400 text-xs mt-1">Adjust search / filters, or create a new tenant.</p>
                </td></tr>
              ) : visibleTenants.map((t) => {
                const db = dbStatusFor(t);
                return (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {t.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.logo} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-200" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-semibold text-sm">{t.name.slice(0, 2).toUpperCase()}</div>
                        )}
                        <div className="min-w-0">
                          <button onClick={() => openDetail(t)} className="font-semibold text-slate-800 hover:text-emerald-600 text-left truncate max-w-[220px] block">{t.name}</button>
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <span className="truncate">{t.slug}</span>
                            {t.domain && <><span>·</span><span className="truncate max-w-[140px]">{t.domain}</span></>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={planBadgeClass(t.plan)}>{t.plan.replace('_', ' ')}</span></td>
                    <td className="px-4 py-3"><span className={statusBadge[t.status] || 'thb-badge bg-slate-100 text-slate-600'}>{statusLabel[t.status] || t.status}</span></td>
                    <td className="px-4 py-3">
                      {db?.isIsolated ? (
                        <span className="thb-badge thb-badge-success inline-flex items-center gap-1 max-w-[180px]" title={`${db.database?.name} · provisioned ${fmtDate(db.database?.provisionedAt)}`}><FiDatabase className="w-3 h-3 flex-shrink-0" /><span className="truncate">{db.database?.name}</span></span>
                      ) : (
                        <span className="thb-badge thb-badge-warning inline-flex items-center gap-1" title="Resolves to the shared platform database"><FiToggleLeft className="w-3 h-3" />Shared</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t._count?.users ?? 0}</td>
                    <td className="px-4 py-3 text-slate-600">{t._count?.companyGroups ?? 0}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(t.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 relative">
                        <button onClick={() => openDetail(t)} title="View" className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"><FiEye className="w-4 h-4" /></button>
                        <button onClick={() => openEdit(t)} title="Edit" className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"><FiEdit2 className="w-4 h-4" /></button>
                        <button onClick={() => setActionMenuFor(actionMenuFor === t.id ? null : t.id)} title="More" className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><FiMoreVertical className="w-4 h-4" /></button>
                        {actionMenuFor === t.id && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setActionMenuFor(null)} />
                            <div className="absolute right-0 top-10 z-40 w-52 thb-card py-1 shadow-lg border border-slate-200">
                              {(['suspended', 'active', 'trial', 'inactive'] as const).filter((s) => s !== t.status).map((s) => (
                                <button key={s} onClick={() => changeStatus(t, s)} className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2">
                                  <FiToggleLeft className={`w-4 h-4 ${s === 'active' ? 'text-emerald-500' : s === 'suspended' || s === 'inactive' ? 'text-red-400' : 'text-amber-400'}`} />
                                  Mark {statusLabel[s]}
                                </button>
                              ))}
                              <div className="border-t border-slate-100 my-1" />
                              <button onClick={() => requestDelete(t)} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><FiTrash2 className="w-4 h-4" /> Delete tenant…</button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/40">
          <p className="text-xs text-slate-500">
            Showing <span className="font-semibold">{pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="font-semibold">{pagination.total}</span> tenants
          </p>
          <div className="flex items-center gap-1">
            <button disabled={pagination.page <= 1} onClick={() => fetchTenants(pagination.page - 1)} className="p-2 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"><FiChevronLeft className="w-4 h-4" /></button>
            {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
              const start = Math.max(1, Math.min(pagination.page - 3, pagination.totalPages - 6));
              return start + i;
            }).filter((p) => p >= 1 && p <= pagination.totalPages).map((p) => (
              <button key={p} onClick={() => fetchTenants(p)} className={`w-8 h-8 rounded-lg text-sm font-medium ${p === pagination.page ? 'bg-green-500 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{p}</button>
            ))}
            <button disabled={pagination.page >= pagination.totalPages} onClick={() => fetchTenants(pagination.page + 1)} className="p-2 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"><FiChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* ─── Detail Drawer ─── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setDetail(null)} />
          <div className="relative w-full max-w-2xl bg-slate-50 h-full shadow-2xl flex flex-col overflow-hidden">
            {/* Drawer header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {detail.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detail.logo} alt="" className="w-11 h-11 rounded-xl object-cover border border-slate-200" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">{detail.name.slice(0, 2).toUpperCase()}</div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-900 truncate">{detail.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={statusBadge[detail.status] || 'thb-badge bg-slate-100 text-slate-600'}>{statusLabel[detail.status] || detail.status}</span>
                      <span className={planBadgeClass(detail.plan)}>{detail.plan.replace('_', ' ')}</span>
                      <span className="text-xs text-slate-400">{detail.slug}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(detail)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100"><FiEdit2 className="w-3.5 h-3.5" /> Edit</button>
                  <button onClick={() => setDetail(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"><FiX className="w-5 h-5" /></button>
                </div>
              </div>
              {/* Tabs */}
              <div className="flex gap-1 mt-4 -mb-px">
                {([['overview', 'Overview'], ['groups', `Groups & Companies (${detail._count?.companyGroups ?? 0})`], ['users', `Users (${detail._count?.users ?? 0})`], ['subs', `Subscriptions (${detail.subscriptions.length})`]] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setDetailTab(key)}
                    className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${detailTab === key ? 'border-green-500 text-green-600 bg-green-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {detailLoading && !detail.companyGroups.length && !detail.users.length ? (
                <div className="py-12 text-center text-slate-400"><FiRefreshCw className="animate-spin w-6 h-6 mx-auto" /></div>
              ) : detailTab === 'overview' && (
                <>
                  {/* Profile card */}
                  <div className="thb-card p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><FiInfo className="text-emerald-500" /> Profile</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                      {[
                        ['Domain', detail.domain || '—', <FiGlobe key="g" className="w-3.5 h-3.5" />],
                        ['Country', detail.country || '—', null],
                        ['Currency', detail.currency, null],
                        ['Base Currency', detail.baseCurrency || detail.currency, null],
                        ['Language', detail.language || 'en', null],
                        ['Timezone', detail.timezone, null],
                        ['Data Region', detail.dataRegion || 'not set', null],
                        ['Max Companies', detail.maxCompaniesAllowed === 0 ? 'Unlimited' : String(detail.maxCompaniesAllowed ?? 0), null],
                        ['Seat Cap', (detail.subscriptionSeats ?? 0) === 0 ? 'Unlimited' : `${detail.subscriptionSeats} seats`, null],
                        ['Storage Cap', !detail.subscriptionStorage ? 'Unlimited' : `${detail.subscriptionStorage} MB`, null],
                        ['Employees', String(detail._count?.employees ?? 0), <FiUserCheck key="u" className="w-3.5 h-3.5" />],
                        ['Created', fmtDate(detail.createdAt), null],
                        ['Tenant ID', detail.id, null],
                      ].map(([label, value]) => (
                        <div key={String(label)}>
                          <p className="text-xs text-slate-400 uppercase tracking-wide">{String(label)}</p>
                          <p className="font-medium text-slate-700 mt-0.5 break-words">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Database isolation card */}
                  <div className="thb-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FiDatabase className="text-emerald-500" /> Database Isolation</h3>
                      {(() => {
                        const db = dbStatuses[detail.id];
                        if (!db) return <span className="thb-badge bg-slate-100 text-slate-500">Unknown</span>;
                        return db.isIsolated
                          ? <span className="thb-badge thb-badge-success inline-flex items-center gap-1"><FiDatabase className="w-3 h-3" />Dedicated · {db.database?.name}</span>
                          : <span className="thb-badge thb-badge-warning inline-flex items-center gap-1"><FiToggleLeft className="w-3 h-3" />Shared platform DB</span>;
                      })()}
                    </div>
                    {(() => {
                      const db = dbStatuses[detail.id];
                      return db?.isIsolated ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
                          <div><p className="text-xs text-slate-400">Database</p><p className="font-mono text-xs font-medium text-slate-700 mt-0.5 break-all">{db.database?.name}</p></div>
                          <div><p className="text-xs text-slate-400">Provisioned</p><p className="font-medium text-slate-700 mt-0.5">{fmtDate(db.database?.provisionedAt)}</p></div>
                          <div><p className="text-xs text-slate-400">Active</p><p className="font-medium text-slate-700 mt-0.5">{db.database?.active ? 'Yes' : 'No'}</p></div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 mb-4">This tenant has no dedicated database registered. All reads/writes resolve to the shared platform database. Provision a dedicated Neon database for full data isolation.</p>
                      );
                    })()}
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => runTest(detail.slug)} disabled={testing} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"><FiActivity className={testing ? 'animate-pulse text-emerald-500' : 'text-emerald-500'} /> {testing ? 'Testing…' : 'Test Connection'}</button>
                      <button onClick={() => flushCache(detail.slug)} disabled={flushing} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"><FiZap className="text-amber-500" /> Flush DB Cache</button>
                      <button onClick={() => openProvision(detail)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600"><FiDatabase /> {dbStatuses[detail.id]?.isIsolated ? 'Re-provision / Update' : 'Provision Dedicated DB'}</button>
                    </div>
                    {testResult && testResult.slug === detail.slug && (
                      <div className={`mt-4 rounded-lg border p-3 text-sm ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        <p className="font-semibold flex items-center gap-2">{testResult.ok ? <FiCheckCircle className="w-4 h-4" /> : <FiAlertTriangle className="w-4 h-4" />}{testResult.message}</p>
                        {testResult.mode === 'dedicated' && (
                          <p className="text-xs mt-1 opacity-80">{testResult.databaseName}{testResult.latencyMs !== undefined ? ` · latency ${testResult.latencyMs}ms` : ''}{testResult.error ? ` · ${testResult.error}` : ''}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="thb-card p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><FiShield className="text-emerald-500" /> Lifecycle Actions</h3>
                    <div className="flex flex-wrap gap-2">
                      {detail.status !== 'active' && (
                        <button onClick={() => changeStatus(detail, 'active')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100"><FiCheckCircle /> Activate Tenant</button>
                      )}
                      {detail.status !== 'suspended' && (
                        <button onClick={() => changeStatus(detail, 'suspended')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100"><FiAlertTriangle /> Suspend</button>
                      )}
                      {detail.status !== 'inactive' && (
                        <button onClick={() => changeStatus(detail, 'inactive')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200"><FiToggleLeft /> Deactivate</button>
                      )}
                      <button onClick={() => requestDelete(detail)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100"><FiTrash2 /> Delete…</button>
                    </div>
                  </div>
                </>
              )}

              {detailTab === 'groups' && (
                <div className="space-y-3">
                  {detail.companyGroups.length === 0 ? (
                    <div className="thb-card p-8 text-center"><FiLayers className="w-8 h-8 mx-auto text-slate-300 mb-2" /><p className="text-slate-500 text-sm">No group companies registered for this tenant.</p></div>
                  ) : detail.companyGroups.map((g) => (
                    <div key={g.id} className="thb-card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-slate-800 flex items-center gap-2"><FiLayers className="text-emerald-500 w-4 h-4" /> {g.name}</h4>
                        <span className="thb-badge thb-badge-primary">{g._count?.companies ?? g.companies.length} companies</span>
                      </div>
                      {g.companies.length === 0 ? (
                        <p className="text-xs text-slate-400">No companies under this group yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="text-left text-slate-400 border-b border-slate-100"><th className="py-1.5 pr-3">Company</th><th className="py-1.5 pr-3">Code</th><th className="py-1.5 pr-3">Status</th><th className="py-1.5 pr-3">Depts</th><th className="py-1.5 pr-3">Branches</th><th className="py-1.5 pr-3">Headcount Plan</th></tr></thead>
                            <tbody>
                              {g.companies.map((c) => (
                                <tr key={c.id} className="border-b border-slate-50">
                                  <td className="py-1.5 pr-3 font-medium text-slate-700">{c.name}</td>
                                  <td className="py-1.5 pr-3 text-slate-500">{c.code || '—'}</td>
                                  <td className="py-1.5 pr-3"><span className={c.status === 'active' ? 'thb-badge thb-badge-success' : 'thb-badge bg-slate-100 text-slate-600'}>{c.status}</span></td>
                                  <td className="py-1.5 pr-3 text-slate-500">{c._count?.departments ?? 0}</td>
                                  <td className="py-1.5 pr-3 text-slate-500">{c._count?.branches ?? 0}</td>
                                  <td className="py-1.5 pr-3 text-slate-500">{c.plannedEmployeeCount ?? c.maxEmployees ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {detailTab === 'users' && (
                <div className="thb-card overflow-hidden">
                  {detail.users.length === 0 ? (
                    <div className="p-8 text-center"><FiUsers className="w-8 h-8 mx-auto text-slate-300 mb-2" /><p className="text-slate-500 text-sm">No users found in this tenant database.</p></div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-semibold text-slate-500 uppercase"><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last Login</th></tr></thead>
                      <tbody>
                        {detail.users.map((u) => (
                          <tr key={u.id} className="border-b border-slate-100">
                            <td className="px-4 py-3"><p className="font-medium text-slate-700">{u.name || '—'}</p><p className="text-xs text-slate-400">{u.email}</p></td>
                            <td className="px-4 py-3"><span className="thb-badge thb-badge-info">{u.role.replace('_', ' ')}</span></td>
                            <td className="px-4 py-3"><span className={u.status === 'active' ? 'thb-badge thb-badge-success' : 'thb-badge bg-slate-100 text-slate-600'}>{u.status}</span></td>
                            <td className="px-4 py-3 text-xs text-slate-500">{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {detailTab === 'subs' && (
                <div className="space-y-3">
                  {detail.subscriptions.length === 0 ? (
                    <div className="thb-card p-8 text-center"><FiCreditCard className="w-8 h-8 mx-auto text-slate-300 mb-2" /><p className="text-slate-500 text-sm">No subscriptions recorded. Apply a plan from the Subscriptions page.</p></div>
                  ) : detail.subscriptions.map((s) => (
                    <div key={s.id} className="thb-card p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800 flex items-center gap-2">{s.plan?.name || 'Plan'} <span className={planBadgeClass(s.plan?.planType || '')}>{(s.plan?.planType || '').replace('_', ' ')}</span></p>
                        <p className="text-xs text-slate-400 mt-0.5">{fmtDate(s.startDate)} → {fmtDate(s.endDate)} · {s.billingCycle} · payment {s.paymentStatus}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-slate-800">{s.currency} {s.amount?.toLocaleString()}</p>
                        <span className={statusBadge[s.status] || 'thb-badge bg-slate-100 text-slate-600'}>{s.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Create / Edit Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setShowForm(false)} />
          <div className="relative thb-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><FiServer className="text-emerald-500" /> {editingId ? `Edit ${form.name}` : 'New Tenant'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Company / Tenant Name *</label>
                <input value={form.name} onChange={(e) => { const v = e.target.value; if (!slugTouchedRef.current) setForm((f) => ({ ...f, name: v, slug: slugify(v) })); else setForm((f) => ({ ...f, name: v })); }} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" placeholder="Acme Corp" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Slug {editingId && '(immutable)'}</label>
                <input value={form.slug} disabled={!!editingId} onChange={(e) => { slugTouchedRef.current = true; setForm({ ...form, slug: e.target.value }); }} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 disabled:bg-slate-50 disabled:text-slate-400" placeholder="acme-corp" />
                <p className="text-[11px] text-slate-400 mt-1">{editingId ? 'Slug cannot be changed after creation.' : 'Login subdomain: <slug>.3boxeshrms.com (demo: tenant DB tenant_<slug>)'}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Custom Domain</label>
                <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" placeholder="hr.acme.com" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Plan</label>
                <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 cursor-pointer">
                  {PLANS.map((p) => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Country</label>
                <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" placeholder="India" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Timezone</label>
                <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 cursor-pointer">
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Display Currency</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 cursor-pointer">
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Base Currency (reporting)</label>
                <select value={form.baseCurrency} onChange={(e) => setForm({ ...form, baseCurrency: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 cursor-pointer">
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Default Language</label>
                <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 cursor-pointer">
                  {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Data Residency Region</label>
                <input value={form.dataRegion} onChange={(e) => setForm({ ...form, dataRegion: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" placeholder="us-east-1 / eu-west-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Seat Cap (0 = unlimited)</label>
                <input type="number" min={0} value={form.subscriptionSeats} onChange={(e) => setForm({ ...form, subscriptionSeats: Number(e.target.value) })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Storage Cap MB (0 = unlimited)</label>
                <input type="number" min={0} value={form.subscriptionStorage} onChange={(e) => setForm({ ...form, subscriptionStorage: Number(e.target.value) })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Max Companies (0 = unlimited)</label>
                <input type="number" min={0} value={form.maxCompaniesAllowed} onChange={(e) => setForm({ ...form, maxCompaniesAllowed: Number(e.target.value) })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Logo URL</label>
                <input value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" placeholder="https://…" />
              </div>
              {!editingId && (
                <>
                  <div className="sm:col-span-2 border-t border-slate-100 pt-3 mt-1">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1"><FiKey className="w-3.5 h-3.5" /> Tenant Admin Account (auto-provisioned with the tenant)</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Admin Name *</label>
                    <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" placeholder="Jane Admin" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Admin Email *</label>
                    <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" placeholder="admin@acme.com" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Admin Password *</label>
                    <input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" placeholder="Minimum 8 characters" />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={submitForm} disabled={formSaving} className="px-4 py-2.5 bg-green-500 text-white hover:bg-green-600 rounded-lg font-medium text-sm disabled:opacity-50 inline-flex items-center gap-2">
                {formSaving && <FiRefreshCw className="animate-spin w-4 h-4" />} {editingId ? 'Save Changes' : 'Create Tenant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Provision DB Modal ─── */}
      {provisionFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setProvisionFor(null)} />
          <div className="relative thb-card w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><FiDatabase className="text-emerald-500" /> Provision Dedicated DB</h3>
              <button onClick={() => setProvisionFor(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Register a dedicated Neon database for <span className="font-semibold">{provisionFor.name}</span>. Create the database in the Neon console first, then paste its pooled connection string here.</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Pooled Connection String *</label>
                <textarea value={provisionForm.connectionString} onChange={(e) => setProvisionForm({ ...provisionForm, connectionString: e.target.value })} rows={3} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500/20" placeholder="postgresql://user:pass@ep-xxx.aws.neon.tech/tenant_xxx?sslmode=require" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">Database Name *</label>
                  <input value={provisionForm.databaseName} onChange={(e) => setProvisionForm({ ...provisionForm, databaseName: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">Neon Project ID</label>
                  <input value={provisionForm.neonProjectId} onChange={(e) => setProvisionForm({ ...provisionForm, neonProjectId: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" placeholder="optional" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Neon Branch ID</label>
                  <input value={provisionForm.neonBranchId} onChange={(e) => setProvisionForm({ ...provisionForm, neonBranchId: e.target.value })} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" placeholder="optional" />
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex gap-2">
                <FiInfo className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>After registering, run the schema sync (scripts/apply-additive-sync.py) against the new database before switching traffic. The connectivity test runs automatically on save.</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setProvisionFor(null)} className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={submitProvision} disabled={provisionSaving} className="px-4 py-2.5 bg-green-500 text-white hover:bg-green-600 rounded-lg font-medium text-sm disabled:opacity-50 inline-flex items-center gap-2">
                {provisionSaving && <FiRefreshCw className="animate-spin w-4 h-4" />} Register & Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirm Dialog ─── */}
      {confirm.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={() => setConfirm((c) => ({ ...c, open: false }))} />
          <div className="relative thb-card w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${confirm.danger ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                <FiAlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{confirm.title}</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{confirm.message}</p>
              </div>
            </div>
            {confirm.requireText && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-slate-500 uppercase">{confirm.requireHint || 'Type to confirm'}</label>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400" placeholder={confirm.requireText} />
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirm((c) => ({ ...c, open: false }))} className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => { if (confirm.requireText && confirmText !== confirm.requireText) { toast.error(`Type "${confirm.requireText}" to confirm`); return; } confirm.onConfirm(); }}
                className={`px-4 py-2.5 rounded-lg font-medium text-sm text-white disabled:opacity-50 ${confirm.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
