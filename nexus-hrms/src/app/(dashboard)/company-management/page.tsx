'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiHome, FiGitBranch, FiGrid, FiAward, FiLayers, FiTarget, FiBox, FiFileText,
  FiPlus, FiX, FiEdit2, FiTrash2, FiSearch, FiEye, FiCheckCircle, FiXCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
function getStatusBadge(s: string) {
  return s === 'active' ? 'nexus-badge nexus-badge-success' : s === 'inactive' ? 'nexus-badge nexus-badge-error' : 'nexus-badge nexus-badge-warning';
}

const tabs = [
  { key: 'companies', label: 'Companies', icon: FiHome },
  { key: 'branches', label: 'Branches', icon: FiGitBranch },
  { key: 'departments', label: 'Departments', icon: FiGrid },
  { key: 'designations', label: 'Designations', icon: FiAward },
  { key: 'grades', label: 'Grades', icon: FiLayers },
  { key: 'costCenters', label: 'Cost Centers', icon: FiTarget },
  { key: 'businessUnits', label: 'Business Units', icon: FiBox },
  { key: 'policies', label: 'Policies', icon: FiFileText },
];

/* ─── COMPANIES TAB ─── */
interface Company {
  id: string; name: string; code?: string; legalName?: string; companyGroupId: string;
  companyGroup?: { id: string; name: string }; registrationNo?: string; taxId?: string;
  panTanCin?: string; gstVatNumber?: string; country?: string; currency: string;
  payrollCurrency?: string; reportingCurrency?: string; timezone: string;
  financialYear?: string; payrollFrequency?: string; address?: string; city?: string;
  state?: string; zipCode?: string; phone?: string; email?: string; website?: string;
  logo?: string; companyAdmin?: string; status: string; createdAt: string;
}
const companyInitial = { name: '', code: '', legalName: '', companyGroupId: '', registrationNo: '', taxId: '', panTanCin: '', gstVatNumber: '', country: '', currency: 'USD', payrollCurrency: 'USD', reportingCurrency: 'USD', timezone: 'UTC', financialYear: 'April-March', payrollFrequency: 'monthly', address: '', city: '', state: '', zipCode: '', phone: '', email: '', website: '', companyAdmin: '', status: 'active' };

function CompaniesTab() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(companyInitial);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [companyGroups, setCompanyGroups] = useState<{ id: string; name: string }[]>([]);

  const fetchData = useCallback(async () => {
    try { setLoading(true); const res = await fetch('/api/companies?limit=100', { headers: getAuthHeaders() }); if (res.ok) { const d = await res.json(); setItems(d.companies || d.items || []); } } catch { toast.error('Failed to load companies'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);
  useEffect(() => {
    fetch('/api/companies?limit=100', { headers: getAuthHeaders() }).then(r => r.json()).then(d => {
      const groups: { id: string; name: string }[] = [];
      (d.companies || d.items || []).forEach((c: Company) => { if (c.companyGroup && !groups.find(g => g.id === c.companyGroup!.id)) groups.push(c.companyGroup!); });
      setCompanyGroups(groups);
    }).catch(() => {});
  }, []);

  const handleOpenAdd = () => { setForm(companyInitial); setEditingId(null); setShowForm(true); setViewingId(null); };
  const handleOpenEdit = (c: Company) => {
    setForm({ name: c.name, code: c.code || '', legalName: c.legalName || '', companyGroupId: c.companyGroupId, registrationNo: c.registrationNo || '', taxId: c.taxId || '', panTanCin: c.panTanCin || '', gstVatNumber: c.gstVatNumber || '', country: c.country || '', currency: c.currency, payrollCurrency: c.payrollCurrency || 'USD', reportingCurrency: c.reportingCurrency || 'USD', timezone: c.timezone, financialYear: c.financialYear || 'April-March', payrollFrequency: c.payrollFrequency || 'monthly', address: c.address || '', city: c.city || '', state: c.state || '', zipCode: c.zipCode || '', phone: c.phone || '', email: c.email || '', website: c.website || '', companyAdmin: c.companyAdmin || '', status: c.status });
    setEditingId(c.id); setShowForm(true); setViewingId(null);
  };
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm(companyInitial); };
  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    try {
      setSubmitting(true);
      const payload = { ...form, name: form.name.trim() };
      const url = editingId ? `/api/companies/${editingId}` : '/api/companies';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Company updated' : 'Company created');
      handleCancelForm(); fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); } finally { setSubmitting(false); }
  };
  const handleDelete = async (id: string) => {
    try { setDeleting(true); const res = await fetch(`/api/companies/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) throw new Error('Failed'); toast.success('Company deleted'); setDeleteConfirmId(null); fetchData(); } catch { toast.error('Failed to delete'); } finally { setDeleting(false); }
  };

  const filtered = items.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.code || '').toLowerCase().includes(search.toLowerCase()));
  const viewingItem = viewingId ? items.find(c => c.id === viewingId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h2 className="text-xl font-bold text-nexus-text-primary">Companies</h2><p className="text-nexus-text-secondary text-sm">Manage company profiles and legal entities</p></div>
        {isAdmin && <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25"><FiPlus className="w-4 h-4" />Add Company</button>}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiHome className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{items.length}</p><p className="text-xs text-nexus-text-muted">Total</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{items.filter(c => c.status === 'active').length}</p><p className="text-xs text-nexus-text-muted">Active</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><FiXCircle className="w-5 h-5 text-red-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{items.filter(c => c.status !== 'active').length}</p><p className="text-xs text-nexus-text-muted">Inactive</p></div></div></div>
      </div>

      {viewingItem && (
        <div className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-nexus-text-primary">Company Details</h3><button onClick={() => setViewingId(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                ['Name', viewingItem.name], ['Code', viewingItem.code], ['Legal Name', viewingItem.legalName],
                ['Group', viewingItem.companyGroup?.name], ['Country', viewingItem.country], ['Currency', viewingItem.currency],
                ['Timezone', viewingItem.timezone], ['Financial Year', viewingItem.financialYear], ['Payroll Frequency', viewingItem.payrollFrequency],
                ['Email', viewingItem.email], ['Phone', viewingItem.phone], ['Website', viewingItem.website],
                ['Tax ID', viewingItem.taxId], ['GST/VAT', viewingItem.gstVatNumber], ['PAN/TAN/CIN', viewingItem.panTanCin],
                ['City', viewingItem.city], ['State', viewingItem.state], ['Status', viewingItem.status],
              ].map(([label, value]) => (
                <div key={String(label)}><p className="text-xs font-medium text-nexus-text-muted">{label}</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{value || '—'}</p></div>
              ))}
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Address</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.address || '—'}</p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border"><button onClick={() => setViewingId(null)} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Close</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Company' : 'Add Company'}</h3><button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label><input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Code</label><input type="text" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Legal Name</label><input type="text" value={form.legalName} onChange={e => setForm(p => ({ ...p, legalName: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Country</label><input type="text" value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Currency</label><select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"><option value="USD">USD</option><option value="INR">INR</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Timezone</label><select value={form.timezone} onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"><option value="UTC">UTC</option><option value="Asia/Kolkata">IST</option><option value="America/New_York">EST</option><option value="Europe/London">GMT</option></select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Financial Year</label><select value={form.financialYear} onChange={e => setForm(p => ({ ...p, financialYear: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"><option value="April-March">April - March</option><option value="January-December">Jan - Dec</option><option value="July-June">July - June</option></select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Payroll Frequency</label><select value={form.payrollFrequency} onChange={e => setForm(p => ({ ...p, payrollFrequency: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"><option value="monthly">Monthly</option><option value="bi-monthly">Bi-Monthly</option><option value="weekly">Weekly</option><option value="bi-weekly">Bi-Weekly</option></select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Tax ID</label><input type="text" value={form.taxId} onChange={e => setForm(p => ({ ...p, taxId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">GST/VAT Number</label><input type="text" value={form.gstVatNumber} onChange={e => setForm(p => ({ ...p, gstVatNumber: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Email</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Phone</label><input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Website</label><input type="text" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">City</label><input type="text" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">State</label><input type="text" value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Address</label><input type="text" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Search companies..." /></div>

      <div className="nexus-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
        <thead><tr className="border-b border-nexus-border bg-slate-50/50"><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Code</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Country</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Currency</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th><th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th></tr></thead>
        <tbody>
          {loading ? Array.from({ length: 3 }).map((_, i) => (<tr key={i} className="border-b border-nexus-border/50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-5 w-14 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td></tr>))
          : filtered.length === 0 ? (<tr><td colSpan={6} className="px-4 py-12 text-center"><FiHome className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No companies found</p></td></tr>)
          : filtered.map(c => (
            <tr key={c.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
              {deleteConfirmId === c.id ? (
                <td colSpan={6} className="px-4 py-3 bg-red-50"><div className="flex items-center justify-between"><span className="text-sm text-red-700 font-medium">Delete &quot;{c.name}&quot;?</span><div className="flex items-center gap-2"><button onClick={() => handleDelete(c.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button><button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button></div></div></td>
              ) : (
                <>
                  <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-nexus-text-secondary">{c.code || '—'}</td>
                  <td className="px-4 py-3 text-sm text-nexus-text-secondary">{c.country || '—'}</td>
                  <td className="px-4 py-3 text-sm text-nexus-text-secondary">{c.currency}</td>
                  <td className="px-4 py-3"><span className={getStatusBadge(c.status)}>{c.status}</span></td>
                  <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                    <button onClick={() => setViewingId(c.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50" title="View"><FiEye className="w-4 h-4" /></button>
                    {isAdmin && (<><button onClick={() => handleOpenEdit(c)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50" title="Edit"><FiEdit2 className="w-4 h-4" /></button><button onClick={() => setDeleteConfirmId(c.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50" title="Delete"><FiTrash2 className="w-4 h-4" /></button></>)}
                  </div></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table></div></div>
    </div>
  );
}

/* ─── GENERIC ENTITY TAB ─── */
interface EntityItem { id: string; [key: string]: unknown; status: string; }
interface FieldConfig { key: string; label: string; type?: 'text' | 'select' | 'number' | 'textarea'; options?: { value: string; label: string }[]; required?: boolean; }

function GenericEntityTab({ title, apiPath, fields, columns, displayFn }: { title: string; apiPath: string; fields: FieldConfig[]; columns: { key: string; label: string }[]; displayFn?: (item: EntityItem, key: string) => string; }) {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');
  const [items, setItems] = useState<EntityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const initialForm: Record<string, string> = {};
  fields.forEach(f => { initialForm[f.key] = f.type === 'select' ? (f.options?.[0]?.value || '') : f.type === 'number' ? '0' : ''; });
  initialForm.status = 'active';

  const fetchData = useCallback(async () => {
    try { setLoading(true); const res = await fetch(`${apiPath}?limit=100`, { headers: getAuthHeaders() }); if (res.ok) { const d = await res.json(); setItems(d.items || d.branches || d.departments || d.designations || d.grades || d.costCenters || d.businessUnits || d.policies || []); } } catch { toast.error(`Failed to load ${title}`); } finally { setLoading(false); }
  }, [apiPath, title]);
  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const handleOpenAdd = () => { setForm(initialForm); setEditingId(null); setShowForm(true); setViewingId(null); };
  const handleOpenEdit = (item: EntityItem) => {
    const f: Record<string, string> = {};
    fields.forEach(field => { f[field.key] = String(item[field.key] ?? ''); });
    f.status = item.status;
    setForm(f); setEditingId(item.id); setShowForm(true); setViewingId(null);
  };
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); };
  const handleSubmit = async () => {
    const requiredField = fields.find(f => f.required);
    if (requiredField && !form[requiredField.key]?.trim()) { toast.error(`${requiredField.label} is required`); return; }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = { ...form };
      fields.forEach(f => { if (f.type === 'number') payload[f.key] = parseFloat(form[f.key]) || 0; });
      const url = editingId ? `${apiPath}/${editingId}` : apiPath;
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? `${title} updated` : `${title} created`);
      handleCancelForm(); fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); } finally { setSubmitting(false); }
  };
  const handleDelete = async (id: string) => {
    try { setDeleting(true); const res = await fetch(`${apiPath}/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) throw new Error('Failed'); toast.success(`${title} deleted`); setDeleteConfirmId(null); fetchData(); } catch { toast.error('Failed to delete'); } finally { setDeleting(false); }
  };

  const searchField = fields[0]?.key || 'name';
  const filtered = items.filter(i => !search || String(i[searchField] || '').toLowerCase().includes(search.toLowerCase()));
  const viewingItem = viewingId ? items.find(i => i.id === viewingId) : null;
  const getVal = (item: EntityItem, key: string) => displayFn ? displayFn(item, key) : String(item[key] ?? '—');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h2 className="text-xl font-bold text-nexus-text-primary">{title}</h2></div>
        {isAdmin && <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25"><FiPlus className="w-4 h-4" />Add {title.slice(0, -1)}</button>}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="nexus-card p-4"><p className="text-lg font-bold text-nexus-text-primary">{items.length}</p><p className="text-xs text-nexus-text-muted">Total</p></div>
        <div className="nexus-card p-4"><p className="text-lg font-bold text-emerald-600">{items.filter(i => i.status === 'active').length}</p><p className="text-xs text-nexus-text-muted">Active</p></div>
        <div className="nexus-card p-4"><p className="text-lg font-bold text-red-600">{items.filter(i => i.status !== 'active').length}</p><p className="text-xs text-nexus-text-muted">Inactive</p></div>
      </div>

      {viewingItem && (
        <div className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-nexus-text-primary">{title.slice(0, -1)} Details</h3><button onClick={() => setViewingId(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {fields.map(f => (<div key={f.key}><p className="text-xs font-medium text-nexus-text-muted">{f.label}</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{getVal(viewingItem, f.key)}</p></div>))}
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingItem.status)}>{viewingItem.status}</span></p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border"><button onClick={() => setViewingId(null)} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Close</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit' : 'Add'} {title.slice(0, -1)}</h3><button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {fields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">{f.label}{f.required ? ' *' : ''}</label>
                  {f.type === 'select' ? (
                    <select value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                      {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea rows={2} value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" />
                  ) : (
                    <input type={f.type === 'number' ? 'number' : 'text'} value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  )}
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                <select value={form.status || 'active'} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option value="active">Active</option><option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder={`Search ${title.toLowerCase()}...`} /></div>

      <div className="nexus-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full">
        <thead><tr className="border-b border-nexus-border bg-slate-50/50">{columns.map(c => <th key={c.key} className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">{c.label}</th>)}<th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th></tr></thead>
        <tbody>
          {loading ? Array.from({ length: 3 }).map((_, i) => (<tr key={i} className="border-b border-nexus-border/50 animate-pulse">{columns.map(c => <td key={c.key} className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>)}<td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td></tr>))
          : filtered.length === 0 ? (<tr><td colSpan={columns.length + 1} className="px-4 py-12 text-center"><p className="text-nexus-text-secondary font-medium">No {title.toLowerCase()} found</p></td></tr>)
          : filtered.map(item => (
            <tr key={item.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
              {deleteConfirmId === item.id ? (
                <td colSpan={columns.length + 1} className="px-4 py-3 bg-red-50"><div className="flex items-center justify-between"><span className="text-sm text-red-700 font-medium">Delete this record?</span><div className="flex items-center gap-2"><button onClick={() => handleDelete(item.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button><button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button></div></div></td>
              ) : (
                <>
                  {columns.map(c => <td key={c.key} className="px-4 py-3 text-sm text-nexus-text-primary">{c.key === 'status' ? <span className={getStatusBadge(item.status)}>{item.status}</span> : getVal(item, c.key)}</td>)}
                  <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                    <button onClick={() => setViewingId(item.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50" title="View"><FiEye className="w-4 h-4" /></button>
                    {isAdmin && (<><button onClick={() => handleOpenEdit(item)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50" title="Edit"><FiEdit2 className="w-4 h-4" /></button><button onClick={() => setDeleteConfirmId(item.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50" title="Delete"><FiTrash2 className="w-4 h-4" /></button></>)}
                  </div></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table></div></div>
    </div>
  );
}

/* ─── MAIN PAGE ─── */
export default function CompanyManagementPage() {
  const [activeTab, setActiveTab] = useState('companies');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2"><FiHome className="w-6 h-6 text-blue-500" />Company Management</h1>
        <p className="text-nexus-text-secondary mt-1">Manage companies, branches, departments, designations, grades, cost centers, business units, and policies</p>
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'companies' && <CompaniesTab />}
      {activeTab === 'branches' && <GenericEntityTab title="Branches" apiPath="/api/branches" fields={[
        { key: 'name', label: 'Name', required: true }, { key: 'code', label: 'Code' }, { key: 'companyId', label: 'Company ID' },
        { key: 'country', label: 'Country' }, { key: 'state', label: 'State' }, { key: 'city', label: 'City' },
        { key: 'address', label: 'Address' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
        { key: 'timezone', label: 'Timezone', type: 'select', options: [{ value: 'UTC', label: 'UTC' }, { value: 'Asia/Kolkata', label: 'IST' }] },
        { key: 'branchManager', label: 'Branch Manager' },
      ]} columns={[{ key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }, { key: 'city', label: 'City' }, { key: 'country', label: 'Country' }, { key: 'status', label: 'Status' }]} />}
      {activeTab === 'departments' && <GenericEntityTab title="Departments" apiPath="/api/departments" fields={[
        { key: 'name', label: 'Name', required: true }, { key: 'code', label: 'Code' }, { key: 'companyId', label: 'Company ID' },
        { key: 'branchId', label: 'Branch ID' }, { key: 'parentDepartmentId', label: 'Parent Dept ID' },
      ]} columns={[{ key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }, { key: 'companyId', label: 'Company' }, { key: 'branchId', label: 'Branch' }, { key: 'status', label: 'Status' }]} />}
      {activeTab === 'designations' && <GenericEntityTab title="Designations" apiPath="/api/designations" fields={[
        { key: 'title', label: 'Title', required: true }, { key: 'code', label: 'Code' }, { key: 'companyId', label: 'Company ID' },
        { key: 'departmentId', label: 'Department ID' }, { key: 'level', label: 'Level', type: 'number' },
        { key: 'minSalary', label: 'Min Salary', type: 'number' }, { key: 'maxSalary', label: 'Max Salary', type: 'number' },
      ]} columns={[{ key: 'title', label: 'Title' }, { key: 'code', label: 'Code' }, { key: 'level', label: 'Level' }, { key: 'companyId', label: 'Company' }, { key: 'status', label: 'Status' }]} />}
      {activeTab === 'grades' && <GenericEntityTab title="Grades" apiPath="/api/grades" fields={[
        { key: 'name', label: 'Name', required: true }, { key: 'code', label: 'Code' }, { key: 'companyId', label: 'Company ID' },
        { key: 'level', label: 'Level', type: 'number' }, { key: 'minSalary', label: 'Min Salary', type: 'number' }, { key: 'maxSalary', label: 'Max Salary', type: 'number' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ]} columns={[{ key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }, { key: 'level', label: 'Level' }, { key: 'companyId', label: 'Company' }, { key: 'status', label: 'Status' }]} />}
      {activeTab === 'costCenters' && <GenericEntityTab title="Cost Centers" apiPath="/api/cost-centers" fields={[
        { key: 'name', label: 'Name', required: true }, { key: 'code', label: 'Code' }, { key: 'companyId', label: 'Company ID' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ]} columns={[{ key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }, { key: 'companyId', label: 'Company' }, { key: 'status', label: 'Status' }]} />}
      {activeTab === 'businessUnits' && <GenericEntityTab title="Business Units" apiPath="/api/business-units" fields={[
        { key: 'name', label: 'Name', required: true }, { key: 'code', label: 'Code' }, { key: 'companyId', label: 'Company ID' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ]} columns={[{ key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }, { key: 'companyId', label: 'Company' }, { key: 'status', label: 'Status' }]} />}
      {activeTab === 'policies' && <GenericEntityTab title="Policies" apiPath="/api/policies" fields={[
        { key: 'title', label: 'Title', required: true }, { key: 'category', label: 'Category', type: 'select', options: [{ value: 'hr', label: 'HR' }, { value: 'it', label: 'IT' }, { value: 'safety', label: 'Safety' }, { value: 'leave', label: 'Leave' }, { value: 'travel', label: 'Travel' }, { value: 'code_of_conduct', label: 'Code of Conduct' }] },
        { key: 'description', label: 'Description', type: 'textarea' }, { key: 'version', label: 'Version' },
      ]} columns={[{ key: 'title', label: 'Title' }, { key: 'category', label: 'Category' }, { key: 'version', label: 'Version' }, { key: 'status', label: 'Status' }]} />}
    </div>
  );
}
