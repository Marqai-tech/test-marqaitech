'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiBriefcase, FiEdit2, FiSearch, FiRefreshCw,
  FiX, FiCheck, FiInfo, FiLayers, FiServer, FiAlertCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface CompanyRow {
  id: string;
  name: string;
  code: string | null;
  status: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  companyGroup: { id: string; name: string; tenantId: string };
  _count?: { departments: number; branches: number };
}

export default function TenantCompaniesPage() {
  const { user } = useAuthStore();
  const { hydrate, availableCompanyGroups, hydrated: ctxHydrated } = useCompanyContextStore();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create-form state
  const [form, setForm] = useState({
    name: '',
    code: '',
    companyGroupId: '',
    companyGroupName: '',
    registrationNo: '',
    taxId: '',
    country: 'India',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    email: '',
    website: '',
  });

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/companies', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load companies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ctxHydrated) hydrate();
    fetchCompanies();
  }, [ctxHydrated, hydrate, fetchCompanies]);

  const filtered = companies.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q) || c.companyGroup?.name?.toLowerCase().includes(q);
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Company name is required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create company');
      }
      toast.success(`Company "${form.name}" created`);
      setShowCreate(false);
      setForm({
        name: '', code: '', companyGroupId: '', companyGroupName: '',
        registrationNo: '', taxId: '', country: 'India', currency: 'INR', timezone: 'Asia/Kolkata',
        address: '', city: '', state: '', zipCode: '', phone: '', email: '', website: '',
      });
      fetchCompanies();
      hydrate(true); // refresh context so the new company appears in the switcher
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to create company');
    } finally {
      setCreating(false);
    }
  };

  const totalBranches = companies.reduce((s, c) => s + (c._count?.branches || 0), 0);
  const totalGroups = new Set(companies.map((c) => c.companyGroup?.id)).size;

  return (
    <div className="space-y-6">
      {/* HERO */}
      <div className="relative rounded-2xl overflow-hidden border-0 shadow-xl shadow-indigo-500/10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E3A5F] to-[#312E81]" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/20 rounded-full blur-[100px]" />
        <div className="relative z-10 px-6 sm:px-8 py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-blue-300/60 text-xs font-medium tracking-widest uppercase">Tenant Administration</p>
              <h1 className="text-2xl font-bold text-white mt-1">Companies</h1>
              <p className="text-blue-100/60 text-sm font-medium mt-1">
                Manage companies under your group · {companies.length} companies · {totalGroups} groups · {totalBranches} branches
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchCompanies}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-semibold hover:bg-white/20 transition-all"
              >
                <FiRefreshCw className="w-4 h-4" /> Refresh
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all"
              >
                <FiPlus className="w-4 h-4" /> New Company
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Companies" value={companies.length} icon={<FiBriefcase className="w-5 h-5" />} bg="bg-indigo-50 text-indigo-600" ring="ring-indigo-100" />
        <StatCard label="Group Companies" value={totalGroups} icon={<FiLayers className="w-5 h-5" />} bg="bg-violet-50 text-violet-600" ring="ring-violet-100" />
        <StatCard label="Branches" value={totalBranches} icon={<FiServer className="w-5 h-5" />} bg="bg-emerald-50 text-emerald-600" ring="ring-emerald-100" />
        <StatCard label="Active" value={companies.filter((c) => c.status === 'active').length} icon={<FiCheck className="w-5 h-5" />} bg="bg-amber-50 text-amber-600" ring="ring-amber-100" />
      </div>

      {/* SEARCH */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <div className="relative">
          <FiSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code or group..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-300"
          />
        </div>
      </div>

      {/* COMPANIES TABLE */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-100/70 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <FiAlertCircle className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No companies found</p>
            <button onClick={() => setShowCreate(true)} className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
              + Create your first company
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Company</th>
                  <th className="px-5 py-3">Group</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3 text-center">Branches</th>
                  <th className="px-5 py-3 text-center">Departments</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-400 to-blue-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {c.name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{c.name}</p>
                          <p className="text-xs text-slate-500">{c.code || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">{c.companyGroup?.name || '—'}</td>
                    <td className="px-5 py-3 text-sm text-slate-700">
                      {[c.city, c.state, c.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-5 py-3 text-center text-sm font-semibold text-slate-700">{c._count?.branches || 0}</td>
                    <td className="px-5 py-3 text-center text-sm font-semibold text-slate-700">{c._count?.departments || 0}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ${
                        c.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-700 ring-slate-200'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => toast('Editing coming soon — use the sidebar to manage branches & departments')}
                        className="text-slate-400 hover:text-indigo-600"
                        title="Edit (coming soon)"
                      >
                        <FiEdit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-violet-50">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FiPlus className="w-4 h-4 text-indigo-500" /> Create New Company
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add a company under your tenant. A group company will be auto-created if not specified.
                </p>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Company Name *">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    placeholder="e.g., Acme Technologies"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-300"
                  />
                </Field>
                <Field label="Code">
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="Auto from name"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-300"
                  />
                </Field>
              </div>

              <Field label="Group Company (optional — leave blank to auto-create)">
              <select
                value={form.companyGroupId}
                onChange={(e) => setForm({ ...form, companyGroupId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-300 bg-white"
              >
                <option value="">— Auto-create new group —</option>
                {availableCompanyGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </Field>
            {form.companyGroupId === '' && (
              <Field label="New Group Name (optional)">
                <input
                  value={form.companyGroupName}
                  onChange={(e) => setForm({ ...form, companyGroupName: e.target.value })}
                  placeholder={`Defaults to "${form.name || 'Company'} Group"`}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-300"
                />
              </Field>
            )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Registration No.">
                  <input value={form.registrationNo} onChange={(e) => setForm({ ...form, registrationNo: e.target.value })} className="form-input" />
                </Field>
                <Field label="Tax ID (GSTIN)">
                  <input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} className="form-input" />
                </Field>
                <Field label="Country">
                  <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="form-input" />
                </Field>
                <Field label="Currency">
                  <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="form-input" />
                </Field>
                <Field label="City">
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="form-input" />
                </Field>
                <Field label="State">
                  <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="form-input" />
                </Field>
                <Field label="Phone">
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="form-input" />
                </Field>
                <Field label="Email">
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="form-input" />
                </Field>
              </div>

              <Field label="Address">
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-300"
                />
              </Field>

              <div className="flex items-center gap-2 pt-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                <FiInfo className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <p className="text-xs text-slate-500">
                  After creation, the new company will appear in the header switcher and you can start configuring branches, departments and employees under it.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 disabled:opacity-60"
                >
                  {creating ? 'Creating...' : (<><FiCheck className="w-4 h-4" /> Create Company</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .form-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid rgb(226 232 240);
          font-size: 0.875rem;
          outline: none;
        }
        .form-input:focus {
          box-shadow: 0 0 0 2px rgb(99 102 241 / 0.4);
          border-color: rgb(165 180 252);
        }
      `}</style>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}
