'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiShield, FiUsers, FiEdit2, FiMail, FiPhone, FiGlobe,
  FiLoader, FiRefreshCw, FiKey, FiSend, FiUserPlus, FiPower, FiCheckCircle,
  FiXCircle, FiClock, FiChevronDown, FiTruck, FiClipboard, FiMapPin,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────── */

interface VendorUser {
  id: string;
  email: string;
  name: string;
  role: string;            // vendor_admin | vendor_employee
  status: string;          // pending | active | inactive
  activated: boolean;
  invitedAt?: string | null;
  passwordSetAt?: string | null;
  createdAt?: string | null;
}

interface BgvRequestLite {
  id: string;
  candidateName?: string | null;
  candidateEmail: string;
  status: string;
  createdAt: string;
  checks?: Array<{ id: string; checkType: string; status: string; result?: string | null }>;
}

interface VendorCompany {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  supportedChecks?: string | null;   // JSON string array
  status: string;                    // active | inactive
  createdAt?: string;
  _users?: VendorUser[];
  _requests?: BgvRequestLite[];
  _userCount?: number;
  _openRequests?: number;
}

const STANDARD_CHECKS = [
  { type: 'identity', label: 'Identity' },
  { type: 'address', label: 'Address' },
  { type: 'education', label: 'Education' },
  { type: 'employment', label: 'Employment' },
  { type: 'criminal', label: 'Criminal Record' },
  { type: 'reference', label: 'Reference' },
  { type: 'credit', label: 'Credit' },
  { type: 'drug_test', label: 'Drug Test' },
];

const REQ_STATUS_LABELS: Record<string, string> = {
  awaiting_assignment: 'Awaiting Assignment',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  awaiting_information: 'Awaiting Info',
  submitted_for_hr_review: 'Submitted for Review',
  rework_required: 'Rework Required',
  approved_by_hr: 'Approved',
  rejected_by_hr: 'Rejected',
  cancelled: 'Cancelled',
};

const REQ_STATUS_COLORS: Record<string, string> = {
  awaiting_assignment: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-blue-100 text-blue-800',
  awaiting_information: 'bg-amber-100 text-amber-800',
  submitted_for_hr_review: 'bg-violet-100 text-violet-800',
  rework_required: 'bg-orange-100 text-orange-800',
  approved_by_hr: 'bg-emerald-100 text-emerald-800',
  rejected_by_hr: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-100 text-slate-600',
};

const emptyVendorForm = {
  name: '', email: '', phone: '', website: '', address: '',
  supportedChecks: ['identity', 'address', 'education', 'employment', 'criminal'] as string[],
};

function parseChecks(raw?: string | null): string[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

/* ────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────── */

export default function VendorManagementVendorsPage() {
  const [vendors, setVendors] = useState<VendorCompany[]>([]);
  const [requests, setRequests] = useState<BgvRequestLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ ...emptyVendorForm });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  // invite user form state (per vendor)
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'vendor_employee' });
  const [inviting, setInviting] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<VendorUser | null>(null);
  const [resetPassword, setResetPassword] = useState('Welcome@123');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, rRes] = await Promise.all([
        fetch('/api/vendors', { headers: getAuthHeaders() }),
        fetch('/api/bgv/requests', { headers: getAuthHeaders() }),
      ]);
      const vData = vRes.ok ? await vRes.json() : { vendors: [] };
      const rData = rRes.ok ? await rRes.json() : { requests: [] };
      const vendorList: VendorCompany[] = vData.vendors || [];
      const reqList: BgvRequestLite[] = rData.requests || [];
      const withCounts = vendorList.map(v => {
        const vreqs = reqList.filter(r => r.vendorCompanyId === v.id);
        return {
          ...v,
          _requests: vreqs.slice(0, 5),
          _openRequests: vreqs.filter(r => !['approved_by_hr', 'rejected_by_hr', 'cancelled'].includes(r.status)).length,
        };
      });
      setVendors(withCounts);
      setRequests(reqList);
    } catch {
      toast.error('Failed to load vendors');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchAll()); }, [fetchAll]);

  /* ── Vendor CRUD ── */

  const openAdd = () => { setEditingId(null); setForm({ ...emptyVendorForm }); setShowForm(true); setTimeout(() => document.getElementById('vendor-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  const openEdit = (v: VendorCompany) => {
    setEditingId(v.id);
    const checks = parseChecks(v.supportedChecks);
    setForm({
      name: v.name || '', email: v.email || '', phone: v.phone || '', website: v.website || '',
      address: v.address || '', supportedChecks: checks.length ? checks : [...emptyVendorForm.supportedChecks],
    });
    setShowForm(true);
    setTimeout(() => document.getElementById('vendor-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const submitVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Vendor name is required'); return; }
    setSubmitting(true);
    try {
      const payload = { ...form, supportedChecks: form.supportedChecks };
      const res = editingId
        ? await fetch(`/api/vendors/${editingId}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(payload) })
        : await fetch('/api/vendors', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(editingId ? 'Vendor updated' : 'Vendor added');
      setShowForm(false); setEditingId(null);
      fetchAll();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const toggleVendorStatus = async (v: VendorCompany) => {
    const next = v.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/vendors/${v.id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ status: next }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(next === 'active' ? 'Vendor activated' : 'Vendor deactivated');
      fetchAll();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
  };

  /* ── Expand: load users for a vendor ── */

  const reloadUsers = async (vendorId: string) => {
    const res = await fetch(`/api/vendors/${vendorId}/users`, { headers: getAuthHeaders() });
    const data = res.ok ? await res.json() : { users: [] };
    setVendors(prev => prev.map(x => x.id === vendorId ? { ...x, _users: data.users || [], _userCount: (data.users || []).length } : x));
    return data.users || [];
  };

  const toggleExpand = async (v: VendorCompany) => {
    if (expandedId === v.id) { setExpandedId(null); return; }
    setExpandedId(v.id);
    setInviteForm({ email: '', name: '', role: 'vendor_employee' });
    setResetTarget(null);
    setExpandedLoading(true);
    try { await reloadUsers(v.id); } catch { toast.error('Failed to load vendor users'); }
    finally { setExpandedLoading(false); }
  };

  /* ── Add vendor portal user ── */

  const addUser = async (vendorId: string) => {
    if (!inviteForm.email.trim() || !inviteForm.name.trim()) { toast.error('Name and email are required'); return; }
    setInviting(true);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/invite-employee`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ email: inviteForm.email.trim(), name: inviteForm.name.trim(), role: inviteForm.role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(`Vendor ${inviteForm.role === 'vendor_admin' ? 'admin' : 'employee'} invited. They must activate from the emailed link and create their own password.`, { duration: 7000 });
      setInviteForm({ email: '', name: '', role: 'vendor_employee' });
      await reloadUsers(vendorId);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setInviting(false); }
  };

  /* ── Vendor user actions ── */

  const userAction = async (vendorId: string, user: VendorUser, action: string, password?: string) => {
    setUserActionLoading(user.id);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/users/${user.id}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ action, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (action === 'resend_invite' && data.setPasswordUrl) {
        toast.success(`Invite link regenerated: ${data.setPasswordUrl}`, { duration: 8000 });
      } else {
        toast.success(data.message || 'Done');
      }
      await reloadUsers(vendorId);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setUserActionLoading(null); setResetTarget(null); }
  };

  const activeVendors = vendors.filter(v => v.status === 'active');
  const inactiveVendors = vendors.filter(v => v.status !== 'active');

  /* ──────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary">BGV Vendors</h1>
          <p className="text-thb-text-secondary mt-1">Manage background-verification vendor companies, their portal users and invitations</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={fetchAll} className="inline-flex items-center gap-2 px-3 py-2.5 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50">
            <FiRefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm">
            <FiPlus className="w-4 h-4" /> Add Vendor
          </button>
        </div>
      </div>

      {/* Add/Edit Vendor Form */}
      {showForm && (
        <div id="vendor-form" className="thb-card border-l-4 border-l-green-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-thb-text-primary">{editingId ? 'Edit Vendor' : 'Add New Vendor'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitVendor} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-thb-text-secondary mb-1">Vendor Name <span className="text-red-500">*</span></label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. VerifyRight BGV Services" className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-thb-text-secondary mb-1">Contact Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contact@vendor.com" className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-thb-text-secondary mb-1">Phone</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 90000 00000" className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-thb-text-secondary mb-1">Website</label>
                  <input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://…" className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-thb-text-secondary mb-1">Address</label>
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Office address" className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-thb-text-secondary mb-2">Supported Checks</label>
                <div className="flex flex-wrap gap-2">
                  {STANDARD_CHECKS.map(c => {
                    const on = form.supportedChecks.includes(c.type);
                    return (
                      <button type="button" key={c.type} onClick={() => setForm(prev => ({
                        ...prev,
                        supportedChecks: on ? prev.supportedChecks.filter(x => x !== c.type) : [...prev.supportedChecks, c.type],
                      }))} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-green-600 text-white border-green-600' : 'bg-white text-thb-text-secondary border-thb-border hover:border-green-400'}`}>
                        {on && <FiCheckCircle className="w-3 h-3 inline mr-1" />}{c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-thb-border">
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 shadow-sm shadow-green-500/25">
                  {submitting ? 'Saving…' : editingId ? 'Update Vendor' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vendors List */}
      {loading ? (
        <div className="thb-card overflow-hidden"><div className="p-5 space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}</div></div>
      ) : vendors.length === 0 ? (
        <div className="thb-card p-12 text-center">
          <FiTruck className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
          <p className="text-thb-text-secondary">No BGV vendors yet. Add your first verification vendor to enable the vendor BGV flow.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...activeVendors, ...inactiveVendors].map(v => {
            const checks = parseChecks(v.supportedChecks);
            const isExpanded = expandedId === v.id;
            const users = v._users || [];
            return (
              <div key={v.id} className={`thb-card overflow-hidden ${v.status !== 'active' ? 'opacity-70' : ''}`}>
                {/* Vendor row */}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <button onClick={() => toggleExpand(v)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shrink-0"><FiShield className="w-5 h-5" /></div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-thb-text-primary">{v.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{v.status}</span>
                          {(v._userCount ?? 0) > 0 && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{v._userCount} user{(v._userCount ?? 0) > 1 ? 's' : ''}</span>}
                          {(v._openRequests ?? 0) > 0 && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{v._openRequests} open BGV</span>}
                        </div>
                        <div className="text-xs text-thb-text-secondary flex items-center gap-3 mt-1 flex-wrap">
                          {v.email && <span className="inline-flex items-center gap-1"><FiMail className="w-3 h-3" />{v.email}</span>}
                          {v.phone && <span className="inline-flex items-center gap-1"><FiPhone className="w-3 h-3" />{v.phone}</span>}
                          {checks.length > 0 && <span className="inline-flex items-center gap-1"><FiClipboard className="w-3 h-3" />{checks.length} checks</span>}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(v)} className="p-2 rounded-lg text-thb-text-muted hover:text-green-600 hover:bg-green-50 transition-colors" title="Edit vendor"><FiEdit2 className="w-4 h-4" /></button>
                      <button onClick={() => toggleVendorStatus(v)} className={`p-2 rounded-lg transition-colors ${v.status === 'active' ? 'text-thb-text-muted hover:text-red-500 hover:bg-red-50' : 'text-thb-text-muted hover:text-emerald-500 hover:bg-emerald-50'}`} title={v.status === 'active' ? 'Deactivate' : 'Activate'}>
                        {v.status === 'active' ? <FiPower className="w-4 h-4" /> : <FiCheckCircle className="w-4 h-4" />}
                      </button>
                      <button onClick={() => toggleExpand(v)} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100" title="Manage users">
                        <FiChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                  {checks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {checks.map(c => {
                        const def = STANDARD_CHECKS.find(s => s.type === c);
                        return <span key={c} className="text-xs bg-slate-100 text-thb-text-secondary px-2 py-0.5 rounded-full">{def?.label || c}</span>;
                      })}
                    </div>
                  )}
                </div>

                {/* Expanded panel: users + invites + requests */}
                {isExpanded && (
                  <div className="border-t border-thb-border bg-slate-50/50 p-4 sm:p-5 space-y-5">
                    {/* Add user form */}
                    <div className="bg-white rounded-xl border border-thb-border p-4">
                      <h4 className="text-sm font-semibold text-thb-text-primary flex items-center gap-2 mb-3"><FiUserPlus className="w-4 h-4 text-green-600" /> Add Vendor Portal User</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <input value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} placeholder="Full name" className="px-3 py-2 border border-thb-border rounded-lg text-sm" />
                        <input type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="user@vendor.com" className="px-3 py-2 border border-thb-border rounded-lg text-sm" />
                        <select value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })} className="px-3 py-2 border border-thb-border rounded-lg text-sm bg-white">
                          <option value="vendor_employee">Vendor Employee (verifier)</option>
                          <option value="vendor_admin">Vendor Admin</option>
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => addUser(v.id)} disabled={inviting} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0">
                            {inviting ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiSend className="w-4 h-4" />} Add
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-thb-text-muted mt-2">An activation email is queued. The user creates a password from the single-use link, then signs in at <span className="font-medium">/login → Vendor</span>.</p>
                    </div>

                    {/* Users table */}
                    <div>
                      <h4 className="text-sm font-semibold text-thb-text-primary flex items-center gap-2 mb-3"><FiUsers className="w-4 h-4 text-green-600" /> Portal Users</h4>
                      {expandedLoading ? (
                        <div className="bg-white rounded-xl border border-thb-border p-5 flex items-center justify-center text-thb-text-muted"><FiLoader className="w-5 h-5 animate-spin mr-2" /> Loading users…</div>
                      ) : users.length === 0 ? (
                        <div className="bg-white rounded-xl border border-thb-border p-5 text-center text-sm text-thb-text-secondary">No vendor users yet — add one above so this vendor can log in and process BGV requests.</div>
                      ) : (
                        <div className="bg-white rounded-xl border border-thb-border overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-thb-border">
                              <tr>{['Name', 'Email', 'Role', 'Status', 'Password Set', 'Actions'].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {users.map(u => (
                                <tr key={u.id} className="hover:bg-slate-50">
                                  <td className="px-4 py-2.5 font-medium text-thb-text-primary">{u.name}</td>
                                  <td className="px-4 py-2.5 text-thb-text-secondary">{u.email}</td>
                                  <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role === 'vendor_admin' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'}`}>{u.role === 'vendor_admin' ? 'Admin' : 'Employee'}</span></td>
                                  <td className="px-4 py-2.5">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : u.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                      {u.status === 'active' ? <FiCheckCircle className="w-3 h-3" /> : u.status === 'pending' ? <FiClock className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />} {u.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-thb-text-secondary">{u.activated ? (u.passwordSetAt ? new Date(u.passwordSetAt).toLocaleDateString() : 'Yes') : '—'}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => { setResetTarget(u); setResetPassword('Welcome@123'); }} disabled={userActionLoading === u.id} className="p-1.5 rounded-lg text-thb-text-muted hover:text-violet-600 hover:bg-violet-50" title="Reset password"><FiKey className="w-3.5 h-3.5" /></button>
                                      {u.status === 'active' ? (
                                        <button onClick={() => userAction(v.id, u, 'deactivate')} disabled={userActionLoading === u.id} className="p-1.5 rounded-lg text-thb-text-muted hover:text-red-500 hover:bg-red-50" title="Deactivate"><FiXCircle className="w-3.5 h-3.5" /></button>
                                      ) : (
                                        <button onClick={() => userAction(v.id, u, 'activate')} disabled={userActionLoading === u.id} className="p-1.5 rounded-lg text-thb-text-muted hover:text-emerald-500 hover:bg-emerald-50" title="Activate"><FiCheckCircle className="w-3.5 h-3.5" /></button>
                                      )}
                                      <button onClick={() => userAction(v.id, u, 'resend_invite')} disabled={userActionLoading === u.id} className="p-1.5 rounded-lg text-thb-text-muted hover:text-amber-500 hover:bg-amber-50" title="Regenerate invite link"><FiSend className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Reset password inline */}
                    {resetTarget && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 text-sm text-amber-800 min-w-0">
                          <span className="font-medium">Reset password for {resetTarget.email}:</span>
                          <input value={resetPassword} onChange={e => setResetPassword(e.target.value)} className="ml-2 px-2 py-1 border border-amber-300 rounded-md text-sm w-40 bg-white" />
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => userAction(v.id, resetTarget, 'reset_password', resetPassword)} disabled={userActionLoading === resetTarget.id} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-50">
                            {userActionLoading === resetTarget.id ? 'Resetting…' : 'Reset Password'}
                          </button>
                          <button onClick={() => setResetTarget(null)} className="px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Recent BGV requests for this vendor */}
                    <div>
                      <h4 className="text-sm font-semibold text-thb-text-primary flex items-center gap-2 mb-3"><FiClipboard className="w-4 h-4 text-green-600" /> Recent BGV Requests</h4>
                      {(v._requests || []).length === 0 ? (
                        <div className="bg-white rounded-xl border border-thb-border p-5 text-center text-sm text-thb-text-secondary">No BGV requests for this vendor yet. Initiate one from Onboarding Review → Initiate BGV with Vendor.</div>
                      ) : (
                        <div className="bg-white rounded-xl border border-thb-border divide-y divide-slate-100">
                          {(v._requests || []).map(r => {
                            const done = (r.checks || []).filter(c => c.status === 'completed').length;
                            return (
                              <div key={r.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-thb-text-primary">{r.candidateName || r.candidateEmail}</div>
                                  <div className="text-xs text-thb-text-muted">{new Date(r.createdAt).toLocaleDateString()} · {done}/{r.checks?.length || 0} checks done</div>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${REQ_STATUS_COLORS[r.status] || 'bg-slate-100 text-slate-600'}`}>{REQ_STATUS_LABELS[r.status] || r.status}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-thb-text-muted">
        Total: {vendors.length} vendor{vendors.length === 1 ? '' : 's'} ({activeVendors.length} active) · {requests.length} BGV request{requests.length === 1 ? '' : 's'} tracked.
      </p>
    </div>
  );
}
