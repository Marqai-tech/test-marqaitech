'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiServer, FiUsers, FiPlus, FiEdit2, FiEye,
  FiCheck, FiX, FiSearch, FiRefreshCw, FiCreditCard, FiShield,
  FiGlobe, FiSettings, FiChevronRight,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Tenant {
  id: string; name: string; slug: string; domain: string | null; plan: string; status: string; country: string | null; currency: string; createdAt: string;
  companyGroups?: { companies?: { employees?: unknown[] }[] }[];
  _count?: { users: number };
}

interface SubscriptionPlan {
  id: string; name: string; planType: string; monthlyPrice: number; annualPrice: number; employeeLimit: number; description: string | null; status: string;
}

export default function SuperAdminPage() {
  const { user } = useAuthStore();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'tenants' | 'plans'>('tenants');
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({
    name: '', slug: '', domain: '', plan: 'starter', country: 'US', currency: 'USD', timezone: 'UTC',
    adminName: '', adminEmail: '', adminPassword: '', companyName: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [tenRes, planRes] = await Promise.allSettled([
        fetch('/api/tenants', { headers }),
        fetch('/api/subscriptions/plans', { headers }),
      ]);
      if (tenRes.status === 'fulfilled' && tenRes.value.ok) {
        const data = await tenRes.value.json();
        setTenants(Array.isArray(data) ? data : data.tenants || []);
      }
      if (planRes.status === 'fulfilled' && planRes.value.ok) {
        const data = await planRes.value.json();
        setPlans(Array.isArray(data) ? data : data.plans || []);
      }
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.slug || !form.adminName || !form.adminEmail) {
      toast.error('Please fill required fields');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Tenant created successfully');
      setShowAddModal(false);
      setForm({ name: '', slug: '', domain: '', plan: 'starter', country: 'US', currency: 'USD', timezone: 'UTC', adminName: '', adminEmail: '', adminPassword: '', companyName: '' });
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to create tenant'); }
    finally { setSubmitting(false); }
  };

  const handleTenantAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/tenants/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: action }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Tenant ${action} successfully`);
      fetchData();
    } catch { toast.error('Action failed'); }
  };

  if (user?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <FiShield className="w-16 h-16 text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-600">Access Restricted</h2>
        <p className="text-slate-500">This page is only accessible to Super Admins.</p>
      </div>
    );
  }

  const totalTenants = tenants.length;
  const activeTenants = tenants.filter((t) => t.status === 'active').length;
  const totalCompanies = tenants.reduce((sum, t) => sum + (t.companyGroups?.length || 0), 0);
  const totalEmployees = tenants.reduce((sum, t) => {
    const empCount = t.companyGroups?.reduce((s, cg) => s + (cg.companies?.reduce((es, c) => es + (c.employees?.length || 0), 0) || 0), 0) || 0;
    return sum + empCount;
  }, 0);

  const filteredTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const planBadge: Record<string, string> = {
    starter: 'bg-slate-100 text-slate-700',
    professional: 'bg-blue-100 text-blue-700',
    enterprise: 'bg-purple-100 text-purple-700',
  };
  const statusBadge: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    suspended: 'bg-amber-100 text-amber-700',
    inactive: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Super Admin Dashboard</h1>
          <p className="text-slate-500 mt-1">Platform management & tenant administration</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors">
          <FiPlus className="w-4 h-4" /> Add Tenant
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Tenants', value: totalTenants, icon: <FiServer className="w-5 h-5" />, color: 'text-blue-500 bg-blue-50' },
          { label: 'Active Tenants', value: activeTenants, icon: <FiCheck className="w-5 h-5" />, color: 'text-emerald-500 bg-emerald-50' },
          { label: 'Total Companies', value: totalCompanies, icon: <FiGlobe className="w-5 h-5" />, color: 'text-violet-500 bg-violet-50' },
          { label: 'Total Employees', value: totalEmployees, icon: <FiUsers className="w-5 h-5" />, color: 'text-amber-500 bg-amber-50' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div><p className="text-xs font-medium text-slate-500">{s.label}</p><p className="text-2xl font-bold text-slate-900 mt-1">{s.value}</p></div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['tenants', 'plans'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'tenants' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search tenants..." className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <button onClick={fetchData} className="p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50"><FiRefreshCw className="w-4 h-4 text-slate-500" /></button>
          </div>

          {loading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse"><div className="flex justify-between"><div className="space-y-2"><div className="h-4 w-32 bg-slate-200 rounded" /><div className="h-3 w-24 bg-slate-100 rounded" /></div><div className="h-6 w-20 bg-slate-100 rounded-full" /></div></div>))}</div>
          ) : filteredTenants.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FiServer className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No tenants found</p></div>
          ) : (
            <div className="space-y-3">
              {filteredTenants.map((t) => (
                <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">{t.name[0]}</div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{t.name}</h3>
                        <p className="text-sm text-slate-500">{t.slug} {t.domain ? `· ${t.domain}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${planBadge[t.plan] || planBadge.starter}`}>{t.plan}</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge[t.status] || statusBadge.inactive}`}>{t.status}</span>
                      <span className="text-xs text-slate-400">{t.country || '—'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                    <span className="text-xs text-slate-400">Created {new Date(t.createdAt).toLocaleDateString()}</span>
                    <span className="text-slate-200">·</span>
                    <span className="text-xs text-slate-400">{t._count?.users || 0} users</span>
                    <div className="ml-auto flex items-center gap-1">
                      {t.status === 'active' ? (
                        <button onClick={() => handleTenantAction(t.id, 'suspended')} className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100">Suspend</button>
                      ) : t.status === 'suspended' ? (
                        <button onClick={() => handleTenantAction(t.id, 'active')} className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100">Activate</button>
                      ) : null}
                      <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg"><FiEdit2 className="w-3.5 h-3.5" /></button>
                      <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg"><FiEye className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.length === 0 ? (
            <div className="col-span-full bg-white rounded-xl border border-slate-200 p-12 text-center">
              <FiCreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No subscription plans configured</p>
            </div>
          ) : plans.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">{p.name}</h3>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${p.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{p.planType}</span>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between"><span className="text-sm text-slate-500">Monthly</span><span className="text-sm font-semibold">${p.monthlyPrice}</span></div>
                <div className="flex justify-between"><span className="text-sm text-slate-500">Annual</span><span className="text-sm font-semibold">${p.annualPrice}</span></div>
                <div className="flex justify-between"><span className="text-sm text-slate-500">Employee Limit</span><span className="text-sm font-semibold">{p.employeeLimit}</span></div>
              </div>
              {p.description && <p className="text-xs text-slate-400 mb-4">{p.description}</p>}
              <button className="w-full py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-1">
                View Details <FiChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Tenant Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Add New Tenant</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button>
            </div>
            <form onSubmit={handleAddTenant} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Tenant Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Slug *</label><input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Domain</label><input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label><input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Plan</label><select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option></select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Country</label><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Currency</label><select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="INR">INR</option></select></div>
              </div>
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2"><FiSettings className="w-4 h-4" /> Admin User</h3>
                <div className="space-y-3">
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Admin Name *</label><input required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Admin Email *</label><input required type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Admin Password</label><input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Creating...' : 'Create Tenant'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
