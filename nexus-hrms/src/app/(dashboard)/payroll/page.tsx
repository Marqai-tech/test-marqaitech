'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiDollarSign,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiCheck,
  FiX,
  FiTrendingUp,
  FiTrendingDown,
  FiCreditCard,
  FiEye,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Payroll {
  id: string;
  employeeId: string;
  month: number;
  year: number;
  basicSalary: number;
  hra: number;
  da: number;
  conveyance: number;
  medical: number;
  otherAllowances: number;
  grossSalary: number;
  pf: number;
  esi: number;
  tax: number;
  professionalTax: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  currency: string;
  status: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
    avatar?: string | null;
  } | null;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  salary?: number;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(amount: number, currency: string = 'INR') {
  const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
  const sym = symbols[currency] || currency;
  return `${sym}${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'nexus-badge nexus-badge-warning',
    processing: 'nexus-badge nexus-badge-info',
    approved: 'nexus-badge nexus-badge-success',
    paid: 'bg-emerald-100 text-emerald-700 nexus-badge',
    cancelled: 'nexus-badge nexus-badge-error',
  };
  const labels: Record<string, string> = { draft: 'Draft', processing: 'Processing', approved: 'Approved', paid: 'Paid', cancelled: 'Cancelled' };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

const initialForm = {
  employeeId: '',
  month: String(new Date().getMonth() + 1),
  year: String(new Date().getFullYear()),
  basicSalary: '',
  hra: '',
  da: '',
  conveyance: '',
  medical: '',
  otherAllowances: '',
  pf: '',
  esi: '',
  tax: '',
  professionalTax: '',
  otherDeductions: '',
  currency: 'INR',
  status: 'draft',
};

/* ── Component ── */
export default function PayrollPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<Payroll | null>(null);

  const [search, setSearch] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      const params = new URLSearchParams();
      if (filterMonth) params.set('month', filterMonth);
      if (filterYear) params.set('year', filterYear);
      if (filterStatus) params.set('status', filterStatus);
      params.set('limit', '50');

      const [payrollRes, empRes] = await Promise.allSettled([
        fetch(`/api/payroll?${params.toString()}`, { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);

      if (payrollRes.status === 'fulfilled' && payrollRes.value.ok) {
        const data = await payrollRes.value.json();
        setPayrolls(data.payrolls || []);
      }

      if (empRes.status === 'fulfilled' && empRes.value.ok) {
        const data = await empRes.value.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear, filterStatus]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Auto-calculate salary components */
  const getComputedTotals = () => {
    const basic = parseFloat(String(form.basicSalary)) || 0;
    const hra = parseFloat(String(form.hra)) || 0;
    const da = parseFloat(String(form.da)) || 0;
    const conveyance = parseFloat(String(form.conveyance)) || 0;
    const medical = parseFloat(String(form.medical)) || 0;
    const otherAllowances = parseFloat(String(form.otherAllowances)) || 0;
    const pf = parseFloat(String(form.pf)) || 0;
    const esi = parseFloat(String(form.esi)) || 0;
    const tax = parseFloat(String(form.tax)) || 0;
    const professionalTax = parseFloat(String(form.professionalTax)) || 0;
    const otherDeductions = parseFloat(String(form.otherDeductions)) || 0;

    const grossSalary = basic + hra + da + conveyance + medical + otherAllowances;
    const totalDeductions = pf + esi + tax + professionalTax + otherDeductions;
    const netSalary = grossSalary - totalDeductions;

    return { grossSalary, totalDeductions, netSalary };
  };

  const computed = getComputedTotals();

  /* Open Add Form */
  const handleOpenAddForm = () => {
    setEditingId(null);
    setViewingId(null);
    setViewingRecord(null);
    setForm(initialForm);
    setShowForm(true);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  /* Open Edit Form */
  const handleOpenView = (record: Payroll) => {
    setViewingId(record.id);
    setViewingRecord(record);
    setShowForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCloseView = () => {
    setViewingId(null);
    setViewingRecord(null);
  };

  const handleOpenEditForm = (p: Payroll) => {
    setViewingId(null);
    setViewingRecord(null);
    setEditingId(p.id);
    setForm({
      employeeId: p.employeeId,
      month: String(p.month),
      year: String(p.year),
      basicSalary: String(p.basicSalary),
      hra: String(p.hra),
      da: String(p.da),
      conveyance: String(p.conveyance),
      medical: String(p.medical),
      otherAllowances: String(p.otherAllowances),
      pf: String(p.pf),
      esi: String(p.esi),
      tax: String(p.tax),
      professionalTax: String(p.professionalTax),
      otherDeductions: String(p.otherDeductions),
      currency: p.currency || 'INR',
      status: p.status,
    });
    setShowForm(true);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  /* Handle employee selection - auto-fill salary */
  const handleEmployeeChange = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    if (emp && emp.salary) {
      const basic = emp.salary;
      setForm(p => ({
        ...p,
        employeeId,
        basicSalary: String(basic),
        hra: String(Math.round(basic * 0.4)),
        da: String(Math.round(basic * 0.1)),
        conveyance: String(Math.round(basic * 0.1)),
        medical: String(Math.round(basic * 0.05)),
        otherAllowances: '0',
        pf: String(Math.round(basic * 0.12)),
        esi: String(Math.round(basic * 0.0175)),
        tax: '0',
        professionalTax: String(200),
        otherDeductions: '0',
      }));
    } else {
      setForm(p => ({ ...p, employeeId }));
    }
  };

  /* Create / Update Payroll */
  const handleSave = async () => {
    if (!form.employeeId || !form.month || !form.year) {
      toast.error('Please fill in required fields: Employee, Month, Year');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        employeeId: form.employeeId,
        month: parseInt(form.month),
        year: parseInt(form.year),
        basicSalary: parseFloat(form.basicSalary) || 0,
        hra: parseFloat(form.hra) || 0,
        da: parseFloat(form.da) || 0,
        conveyance: parseFloat(form.conveyance) || 0,
        medical: parseFloat(form.medical) || 0,
        otherAllowances: parseFloat(form.otherAllowances) || 0,
        grossSalary: computed.grossSalary,
        pf: parseFloat(form.pf) || 0,
        esi: parseFloat(form.esi) || 0,
        tax: parseFloat(form.tax) || 0,
        professionalTax: parseFloat(form.professionalTax) || 0,
        otherDeductions: parseFloat(form.otherDeductions) || 0,
        totalDeductions: computed.totalDeductions,
        netSalary: computed.netSalary,
        currency: form.currency,
        status: form.status,
      };

      if (editingId) {
        const res = await fetch(`/api/payroll/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Payroll updated successfully');
      } else {
        const res = await fetch('/api/payroll', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Payroll generated successfully');
      }
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save payroll');
    } finally {
      setSubmitting(false);
    }
  };

  /* Delete Payroll */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/payroll/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Payroll deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete payroll');
    } finally {
      setDeleting(false);
    }
  };

  /* Mark as Paid */
  const handleMarkPaid = async (id: string) => {
    try {
      const res = await fetch(`/api/payroll/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'paid' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Payroll marked as paid');
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  /* Filtered payrolls */
  const filteredPayrolls = payrolls.filter(p => {
    if (!search) return true;
    const empName = `${p.employee?.firstName || ''} ${p.employee?.lastName || ''}`.toLowerCase();
    return empName.includes(search.toLowerCase()) || (p.employee?.employeeId || '').toLowerCase().includes(search.toLowerCase());
  });

  /* Summary cards */
  const totalGross = payrolls.reduce((s, p) => s + (p.grossSalary || 0), 0);
  const totalDeductions = payrolls.reduce((s, p) => s + (p.totalDeductions || 0), 0);
  const totalNet = payrolls.reduce((s, p) => s + (p.netSalary || 0), 0);
  const paidCount = payrolls.filter(p => p.status === 'paid').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiDollarSign className="w-6 h-6 text-emerald-500" />
            Payroll
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage employee salaries and compensation</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Generate Payroll
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <FiTrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Total Gross</p>
              <p className="text-lg font-bold text-nexus-text-primary">{formatCurrency(totalGross)}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <FiTrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Total Deductions</p>
              <p className="text-lg font-bold text-nexus-text-primary">{formatCurrency(totalDeductions)}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <FiDollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Total Net</p>
              <p className="text-lg font-bold text-nexus-text-primary">{formatCurrency(totalNet)}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <FiCreditCard className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Paid</p>
              <p className="text-lg font-bold text-nexus-text-primary">{paidCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="nexus-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
            <input
              type="text"
              placeholder="Search by employee name or ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <FiFilter className="w-4 h-4 text-nexus-text-muted flex-shrink-0" />
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Months</option>
              {monthNames.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
            </select>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Years</option>
              {[2024, 2025, 2026].map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="processing">Processing</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Embedded Form (Add/Edit) */}
      {viewingId && viewingRecord && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-violet-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                <FiEye className="w-5 h-5 text-violet-500" />
                View Payroll
              </h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Employee</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.employee ? `${viewingRecord.employee.firstName} ${viewingRecord.employee.lastName}` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Month/Year</p>
                <p className="text-sm text-nexus-text-primary">{`${monthNames[viewingRecord.month - 1]} ${viewingRecord.year}`}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Basic Salary</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.basicSalary, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">HRA</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.hra, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">DA</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.da, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Conveyance</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.conveyance, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Medical</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.medical, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Other Allowances</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.otherAllowances, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Gross Salary</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.grossSalary, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">PF</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.pf, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">ESI</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.esi, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Tax</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.tax, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Professional Tax</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.professionalTax, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Other Deductions</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.otherDeductions, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Total Deductions</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.totalDeductions, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Net Salary</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.netSalary, viewingRecord.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Currency</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.currency}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Status</p>
                <p className="text-sm"><span className={getStatusBadge(viewingRecord.status).className}>{getStatusBadge(viewingRecord.status).label}</span></p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={() => { handleOpenEditForm(viewingRecord); setViewingId(null); }} className="px-4 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
                <FiEdit2 className="w-4 h-4 inline mr-1" /> Edit
              </button>
              <button onClick={handleCloseView} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 transition-all duration-300 ease-in-out ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">
                {editingId ? 'Edit Payroll' : 'Generate Payroll'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {/* Employee & Period */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                  <select
                    value={form.employeeId}
                    onChange={e => handleEmployeeChange(e.target.value)}
                    disabled={!!editingId}
                    className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-nexus-text-muted"
                  >
                    <option value="">Select Employee</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeId})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Month *</label>
                  <select value={form.month} onChange={e => setForm(p => ({ ...p, month: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    {monthNames.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Year *</label>
                  <input type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
              </div>

              {/* Earnings */}
              <div>
                <h3 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2">
                  <FiTrendingUp className="w-4 h-4 text-emerald-500" /> Earnings
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Basic Salary</label>
                    <input type="number" value={form.basicSalary} onChange={e => setForm(p => ({ ...p, basicSalary: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">HRA</label>
                    <input type="number" value={form.hra} onChange={e => setForm(p => ({ ...p, hra: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">DA</label>
                    <input type="number" value={form.da} onChange={e => setForm(p => ({ ...p, da: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Conveyance</label>
                    <input type="number" value={form.conveyance} onChange={e => setForm(p => ({ ...p, conveyance: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Medical</label>
                    <input type="number" value={form.medical} onChange={e => setForm(p => ({ ...p, medical: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Other Allowances</label>
                    <input type="number" value={form.otherAllowances} onChange={e => setForm(p => ({ ...p, otherAllowances: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div>
                <h3 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2">
                  <FiTrendingDown className="w-4 h-4 text-red-500" /> Deductions
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">PF</label>
                    <input type="number" value={form.pf} onChange={e => setForm(p => ({ ...p, pf: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">ESI</label>
                    <input type="number" value={form.esi} onChange={e => setForm(p => ({ ...p, esi: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Tax</label>
                    <input type="number" value={form.tax} onChange={e => setForm(p => ({ ...p, tax: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Professional Tax</label>
                    <input type="number" value={form.professionalTax} onChange={e => setForm(p => ({ ...p, professionalTax: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Other Deductions</label>
                    <input type="number" value={form.otherDeductions} onChange={e => setForm(p => ({ ...p, otherDeductions: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                </div>
              </div>

              {/* Computed Totals Preview */}
              <div className="p-4 rounded-lg bg-slate-50 border border-nexus-border">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-nexus-text-secondary mb-1">Gross Salary</p>
                    <p className="text-lg font-bold text-emerald-600">{formatCurrency(computed.grossSalary, form.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-nexus-text-secondary mb-1">Total Deductions</p>
                    <p className="text-lg font-bold text-red-600">{formatCurrency(computed.totalDeductions, form.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-nexus-text-secondary mb-1">Net Salary</p>
                    <p className="text-lg font-bold text-blue-600">{formatCurrency(computed.netSalary, form.currency)}</p>
                  </div>
                </div>
              </div>

              {/* Currency & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Currency</label>
                  <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
                {editingId && (
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                    <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="draft">Draft</option>
                      <option value="processing">Processing</option>
                      <option value="approved">Approved</option>
                      <option value="paid">Paid</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-nexus-border">
                <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                  {submitting ? 'Saving...' : editingId ? 'Update Payroll' : 'Generate Payroll'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payroll Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Month/Year</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Gross Salary</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Total Deductions</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Net Salary</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredPayrolls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <FiDollarSign className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No payroll records found</p>
                    <p className="text-sm text-nexus-text-muted mt-1">Generate payroll to get started</p>
                  </td>
                </tr>
              ) : (
                filteredPayrolls.map(p => {
                  const badge = getStatusBadge(p.status);
                  const isDeleting = deleteConfirmId === p.id;
                  return (
                    <tr key={p.id} className={`border-b border-nexus-border/50 transition-colors ${isDeleting ? 'bg-red-50' : 'hover:bg-slate-50/50'}`}>
                      {isDeleting ? (
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                <FiTrash2 className="w-4 h-4 text-red-500" />
                              </div>
                              <span className="text-sm text-red-700 font-medium">Are you sure you want to delete this payroll record? This action cannot be undone.</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(p.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                                {deleting ? 'Deleting...' : 'Confirm Delete'}
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-nexus-text-primary">{p.employee?.firstName} {p.employee?.lastName}</p>
                            <p className="text-xs text-nexus-text-muted">{p.employee?.employeeId}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">
                            {monthNames[p.month - 1]} {p.year}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-emerald-600">{formatCurrency(p.grossSalary, p.currency)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-red-600">{formatCurrency(p.totalDeductions, p.currency)}</td>
                          <td className="px-4 py-3 text-sm font-bold text-nexus-text-primary">{formatCurrency(p.netSalary, p.currency)}</td>
                          <td className="px-4 py-3"><span className={badge.className}>{badge.label}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {isAdmin && p.status !== 'paid' && p.status !== 'cancelled' && (
                                <button onClick={() => handleMarkPaid(p.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Mark as Paid">
                                  <FiCheck className="w-4 h-4" />
                                </button>
                              )}
                              {isAdmin && (
                                <>
                                  <button onClick={() => handleOpenView(p)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                                  <button onClick={() => handleOpenEditForm(p)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit">
                                    <FiEdit2 className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setDeleteConfirmId(p.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                    <FiTrash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
