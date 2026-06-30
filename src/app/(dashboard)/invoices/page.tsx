'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiEye, FiTrash2, FiDollarSign,
  FiFilter, FiRefreshCw, FiSearch, FiCheckCircle, FiSend, FiFileText,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import { formatCurrency } from '@/lib/currency';

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'thb-badge bg-slate-100 text-slate-600',
    issued: 'thb-badge thb-badge-info',
    sent: 'thb-badge thb-badge-info',
    partial: 'thb-badge thb-badge-warning',
    paid: 'thb-badge thb-badge-success',
    overdue: 'thb-badge thb-badge-error',
    disputed: 'thb-badge thb-badge-error',
    cancelled: 'thb-badge bg-slate-200 text-slate-500',
  };
  return map[status] || 'thb-badge bg-slate-100 text-slate-600';
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/* ── Types ── */
interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  status: string;
  invoiceType: string;
  billingType: string;
  currency: string;
  baseCurrency: string | null;
  exchangeRate: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  totalAmountBase: number | null;
  issueDate: string;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  client: { id: string; name: string; billingCurrency: string } | null;
  project: { id: string; name: string; currency: string } | null;
  company: { id: string; name: string; currency: string } | null;
  _count: { lineItems: number };
}

interface Company { id: string; name: string; currency: string }
interface Client { id: string; name: string; billingCurrency: string; companyId: string }
interface Project { id: string; name: string; currency: string; clientId: string | null; companyId: string }

/* ── Component ── */
export default function InvoicesPage() {
  const { user } = useAuthStore();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [createForm, setCreateForm] = useState({
    companyId: '',
    clientId: '',
    projectId: '',
    invoiceType: 'timesheet',
    billingType: 'time_and_material',
    currency: '',
    baseCurrency: '',
    taxRate: 0,
    discountRate: 0,
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    periodStart: '',
    periodEnd: '',
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (currencyFilter) params.set('currency', currencyFilter);
      params.set('limit', '50');
      const r = await fetch(`/api/invoices?${params.toString()}`, { headers: getAuthHeaders() });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to load invoices');
      setInvoices(data.invoices || []);
    } catch (e: unknown) {
      console.error('fetchInvoices', e);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, currencyFilter]);

  const fetchMeta = useCallback(async () => {
    try {
      const [cos, cls, prs] = await Promise.all([
        fetch('/api/companies?limit=100', { headers: getAuthHeaders() }).then(r => r.json()),
        fetch('/api/clients?limit=100', { headers: getAuthHeaders() }).then(r => r.json()),
        fetch('/api/projects?limit=100', { headers: getAuthHeaders() }).then(r => r.json()),
      ]);
      setCompanies(cos.companies || []);
      setClients(cls.clients || []);
      setProjects(prs.projects || []);
    } catch (e) {
      console.warn('fetchMeta failed (non-fatal):', e);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { if (showCreate) fetchMeta(); }, [showCreate, fetchMeta]);

  const handleCreate = async () => {
    if (!createForm.companyId) {
      toast.error('Please select a company');
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        companyId: createForm.companyId,
        invoiceType: createForm.invoiceType,
        billingType: createForm.billingType,
        taxRate: Number(createForm.taxRate) || 0,
        discountRate: Number(createForm.discountRate) || 0,
        issueDate: createForm.issueDate,
        notes: createForm.notes || undefined,
      };
      if (createForm.clientId) body.clientId = createForm.clientId;
      if (createForm.projectId) body.projectId = createForm.projectId;
      if (createForm.currency) body.currency = createForm.currency;
      if (createForm.baseCurrency) body.baseCurrency = createForm.baseCurrency;
      if (createForm.dueDate) body.dueDate = createForm.dueDate;
      if (createForm.periodStart) body.periodStart = createForm.periodStart;
      if (createForm.periodEnd) body.periodEnd = createForm.periodEnd;

      const r = await fetch('/api/invoices', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to create invoice');
      toast.success(`Invoice ${data.invoice.invoiceNumber} created`);
      setShowCreate(false);
      fetchInvoices();
      // Navigate to detail page
      window.location.href = `/invoices/${data.invoice.id}`;
    } catch (e: unknown) {
      console.error('Create invoice', e);
      toast.error(e instanceof Error ? e.message : 'Failed to create invoice');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (invoice: InvoiceListItem, newStatus: string) => {
    try {
      const r = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to update invoice');
      toast.success(`Invoice marked as ${newStatus}`);
      fetchInvoices();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update invoice');
    }
  };

  const handleDelete = async (invoice: InvoiceListItem) => {
    if (!confirm(`Delete draft invoice ${invoice.invoiceNumber}? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || 'Failed to delete');
      }
      toast.success('Invoice deleted');
      fetchInvoices();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  // Summary stats
  const totalApproved = invoices
    .filter(i => ['issued', 'sent', 'partial', 'paid'].includes(i.status))
    .reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = invoices
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + i.totalAmount, 0);
  const totalOutstanding = invoices
    .filter(i => ['issued', 'sent', 'partial'].includes(i.status))
    .reduce((s, i) => s + i.totalAmount, 0);
  const totalDrafts = invoices
    .filter(i => i.status === 'draft')
    .reduce((s, i) => s + i.totalAmount, 0);

  // Group by currency for summary
  const summaryByCurrency = invoices.reduce((map, i) => {
    if (!map[i.currency]) map[i.currency] = { approved: 0, paid: 0, outstanding: 0, drafts: 0 };
    if (['issued', 'sent', 'partial', 'paid'].includes(i.status)) map[i.currency].approved += i.totalAmount;
    if (i.status === 'paid') map[i.currency].paid += i.totalAmount;
    if (['issued', 'sent', 'partial'].includes(i.status)) map[i.currency].outstanding += i.totalAmount;
    if (i.status === 'draft') map[i.currency].drafts += i.totalAmount;
    return map;
  }, {} as Record<string, { approved: number; paid: number; outstanding: number; drafts: number }>);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FiDollarSign className="w-7 h-7 text-violet-600" />
            Invoices
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Multi-currency client billing. Generate invoices from approved timesheets, manage FX conversion, and track payment status.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="3boxes-btn-primary flex items-center gap-2"
        >
          <FiPlus className="w-4 h-4" /> New Invoice
        </button>
      </div>

      <ModuleTips moduleKey="invoices">
        <p><strong>Multi-Currency Invoicing (REQ-PM-09):</strong> Generate client invoices from approved timesheets with automatic FX conversion via the ExchangeRate table. Invoices can be in any currency; totals are also computed in your company&apos;s base currency for profitability reporting.</p>
      </ModuleTips>

      {/* Summary cards — INR is the platform default currency */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xs uppercase tracking-wider text-slate-500">Total Approved</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">
            {Object.entries(summaryByCurrency)
              .filter(([cur]) => cur !== 'INR')
              .map(([cur, v]) => formatCurrency(v.approved, cur))
              .concat(summaryByCurrency.INR ? [formatCurrency(summaryByCurrency.INR.approved, 'INR')] : [])
              .join(' · ') || formatCurrency(0, 'INR')}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xs uppercase tracking-wider text-slate-500">Outstanding</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {Object.entries(summaryByCurrency)
              .filter(([cur]) => cur !== 'INR')
              .map(([cur, v]) => formatCurrency(v.outstanding, cur))
              .concat(summaryByCurrency.INR ? [formatCurrency(summaryByCurrency.INR.outstanding, 'INR')] : [])
              .join(' · ') || formatCurrency(0, 'INR')}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xs uppercase tracking-wider text-slate-500">Paid</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {Object.entries(summaryByCurrency)
              .filter(([cur]) => cur !== 'INR')
              .map(([cur, v]) => formatCurrency(v.paid, cur))
              .concat(summaryByCurrency.INR ? [formatCurrency(summaryByCurrency.INR.paid, 'INR')] : [])
              .join(' · ') || formatCurrency(0, 'INR')}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xs uppercase tracking-wider text-slate-500">Drafts</p>
          <p className="text-2xl font-bold text-slate-500 mt-1">
            {Object.entries(summaryByCurrency)
              .filter(([cur]) => cur !== 'INR')
              .map(([cur, v]) => formatCurrency(v.drafts, cur))
              .concat(summaryByCurrency.INR ? [formatCurrency(summaryByCurrency.INR.drafts, 'INR')] : [])
              .join(' · ') || formatCurrency(0, 'INR')}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by invoice number or notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="3boxes-input pl-9 w-full"
              onKeyDown={e => e.key === 'Enter' && fetchInvoices()}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="3boxes-input min-w-[140px]"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="sent">Sent</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="disputed">Disputed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={currencyFilter}
            onChange={e => setCurrencyFilter(e.target.value)}
            className="3boxes-input min-w-[100px]"
          >
            <option value="">All Currencies</option>
            <option value="INR">INR</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="SGD">SGD</option>
            <option value="AED">AED</option>
          </select>
          <button
            onClick={fetchInvoices}
            className="3boxes-btn-secondary flex items-center gap-2"
          >
            <FiRefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Invoice #</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Client / Project</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Issue Date</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Due Date</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Lines</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <FiRefreshCw className="w-4 h-4 animate-spin" /> Loading invoices...
                    </div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <FiFileText className="w-12 h-12 text-slate-300" />
                      <p className="text-slate-500">No invoices found</p>
                      <button onClick={() => setShowCreate(true)} className="3boxes-btn-primary flex items-center gap-2">
                        <FiPlus className="w-4 h-4" /> Create First Invoice
                      </button>
                    </div>
                  </td>
                </tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <a href={`/invoices/${inv.id}`} className="font-medium text-violet-600 hover:underline">
                      {inv.invoiceNumber}
                    </a>
                    <p className="text-xs text-slate-500 mt-0.5">{inv.invoiceType.replace(/_/g, ' ')}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{inv.client?.name || '—'}</p>
                    <p className="text-xs text-slate-500">{inv.project?.name || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(inv.issueDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(inv.dueDate)}</td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold text-slate-800">{formatCurrency(inv.totalAmount, inv.currency)}</p>
                    {inv.baseCurrency && inv.baseCurrency !== inv.currency && inv.totalAmountBase !== null && (
                      <p className="text-xs text-slate-500">{formatCurrency(inv.totalAmountBase, inv.baseCurrency)} base</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{inv._count?.lineItems ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={getStatusBadge(inv.status)}>{formatStatus(inv.status)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/invoices/${inv.id}`}
                        className="p-1.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded"
                        title="View / Edit"
                      >
                        <FiEye className="w-4 h-4" />
                      </a>
                      {inv.status === 'draft' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(inv, 'issued')}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Mark as Issued"
                          >
                            <FiCheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleStatusChange(inv, 'sent')}
                            className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded"
                            title="Mark as Sent"
                          >
                            <FiSend className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(inv)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete Draft"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {['issued', 'sent', 'partial'].includes(inv.status) && (
                        <button
                          onClick={() => handleStatusChange(inv, 'paid')}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                          title="Mark as Paid"
                        >
                          <FiDollarSign className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Create New Invoice</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fields marked <span className="text-red-500">*</span> are required. Currency defaults to INR.
                </p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-slate-100 rounded">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Company *</label>
                <select
                  value={createForm.companyId}
                  onChange={e => setCreateForm({ ...createForm, companyId: e.target.value, clientId: '', projectId: '', currency: '', baseCurrency: '' })}
                  className="3boxes-input w-full"
                >
                  <option value="">Select company...</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.currency})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Client (optional)</label>
                  <select
                    value={createForm.clientId}
                    onChange={e => {
                      const cl = clients.find(c => c.id === e.target.value);
                      setCreateForm({
                        ...createForm,
                        clientId: e.target.value,
                        currency: cl?.billingCurrency || createForm.currency,
                      });
                    }}
                    className="3boxes-input w-full"
                    disabled={!createForm.companyId}
                  >
                    <option value="">No client</option>
                    {clients
                      .filter(c => !createForm.companyId || c.companyId === createForm.companyId)
                      .map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.billingCurrency})</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Project (optional)</label>
                  <select
                    value={createForm.projectId}
                    onChange={e => {
                      const p = projects.find(p => p.id === e.target.value);
                      setCreateForm({
                        ...createForm,
                        projectId: e.target.value,
                        currency: p?.currency || createForm.currency,
                      });
                    }}
                    className="3boxes-input w-full"
                    disabled={!createForm.companyId}
                  >
                    <option value="">No project</option>
                    {projects
                      .filter(p => !createForm.companyId || p.companyId === createForm.companyId)
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Invoice Type</label>
                  <select
                    value={createForm.invoiceType}
                    onChange={e => setCreateForm({ ...createForm, invoiceType: e.target.value })}
                    className="3boxes-input w-full"
                  >
                    <option value="timesheet">Timesheet</option>
                    <option value="milestone">Milestone</option>
                    <option value="fixed">Fixed</option>
                    <option value="retainer">Retainer</option>
                    <option value="expense">Expense</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Billing Type</label>
                  <select
                    value={createForm.billingType}
                    onChange={e => setCreateForm({ ...createForm, billingType: e.target.value })}
                    className="3boxes-input w-full"
                  >
                    <option value="time_and_material">Time &amp; Material</option>
                    <option value="fixed">Fixed Price</option>
                    <option value="retainer">Retainer</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="non_billable">Non-Billable</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Invoice Currency</label>
                  <select
                    value={createForm.currency}
                    onChange={e => setCreateForm({ ...createForm, currency: e.target.value })}
                    className="3boxes-input w-full"
                  >
                    <option value="">Auto (INR default)</option>
                    <option value="INR">INR (₹) — Default</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="SGD">SGD (S$)</option>
                    <option value="AED">AED (د.إ)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Base Currency (reporting)</label>
                  <select
                    value={createForm.baseCurrency}
                    onChange={e => setCreateForm({ ...createForm, baseCurrency: e.target.value })}
                    className="3boxes-input w-full"
                  >
                    <option value="">Auto (INR default)</option>
                    <option value="INR">INR (₹) — Default</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Issue Date *</label>
                  <input
                    type="date"
                    value={createForm.issueDate}
                    onChange={e => setCreateForm({ ...createForm, issueDate: e.target.value })}
                    className="3boxes-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={createForm.dueDate}
                    onChange={e => setCreateForm({ ...createForm, dueDate: e.target.value })}
                    className="3boxes-input w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Period Start</label>
                  <input
                    type="date"
                    value={createForm.periodStart}
                    onChange={e => setCreateForm({ ...createForm, periodStart: e.target.value })}
                    className="3boxes-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Period End</label>
                  <input
                    type="date"
                    value={createForm.periodEnd}
                    onChange={e => setCreateForm({ ...createForm, periodEnd: e.target.value })}
                    className="3boxes-input w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={createForm.taxRate}
                    onChange={e => setCreateForm({ ...createForm, taxRate: Number(e.target.value) })}
                    className="3boxes-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Discount Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={createForm.discountRate}
                    onChange={e => setCreateForm({ ...createForm, discountRate: Number(e.target.value) })}
                    className="3boxes-input w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes (visible to client)</label>
                <textarea
                  value={createForm.notes}
                  onChange={e => setCreateForm({ ...createForm, notes: e.target.value })}
                  rows={2}
                  className="3boxes-input w-full"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200 bg-slate-50 sticky bottom-0">
              <button onClick={() => setShowCreate(false)} className="3boxes-btn-secondary">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating} className="3boxes-btn-primary flex items-center gap-2">
                {creating ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiPlus className="w-4 h-4" />}
                Create Draft Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
