'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiDollarSign,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiTrendingUp,
  FiTrendingDown,
  FiUsers,
  FiEye,
  FiCheck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface PayrollRecord {
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
  paidDate: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string };
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  salary?: number | null;
  salaryCurrency?: string;
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

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function getMonthName(m: number) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] || '';
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'nexus-badge nexus-badge-warning',
    processing: 'bg-cyan-50 text-cyan-700 nexus-badge',
    approved: 'nexus-badge nexus-badge-success',
    paid: 'bg-emerald-50 text-emerald-700 nexus-badge',
    cancelled: 'nexus-badge nexus-badge-error',
  };
  const labels: Record<string, string> = {
    draft: 'Draft',
    processing: 'Processing',
    approved: 'Approved',
    paid: 'Paid',
    cancelled: 'Cancelled',
  };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

const initialGenForm = {
  employeeId: '',
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
};

const initialEditForm = {
  basicSalary: 0,
  hra: 0,
  da: 0,
  conveyance: 0,
  medical: 0,
  otherAllowances: 0,
  pf: 0,
  esi: 0,
  tax: 0,
  professionalTax: 0,
  otherDeductions: 0,
  status: 'draft',
};

/* ── Component ── */
export default function PayrollPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showGenForm, setShowGenForm] = useState(false);
  const [genForm, setGenForm] = useState(initialGenForm);
  const [generating, setGenerating] = useState(false);

  const [showEditForm, setShowEditForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(initialEditForm);
  const [editCurrency, setEditCurrency] = useState('USD');
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [payslipRecord, setPayslipRecord] = useState<PayrollRecord | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (filterMonth) params.set('month', filterMonth);
      if (filterYear) params.set('year', filterYear);
      if (filterStatus) params.set('status', filterStatus);

      const [payRes, empRes] = await Promise.allSettled([
        fetch(`/api/payroll?${params.toString()}`, { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);

      if (payRes.status === 'fulfilled' && payRes.value.ok) {
        const data = await payRes.value.json();
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

  /* Filtered payrolls (client-side search) */
  const filteredPayrolls = payrolls.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.employee?.firstName?.toLowerCase().includes(s) ||
      p.employee?.lastName?.toLowerCase().includes(s) ||
      p.employee?.employeeId?.toLowerCase().includes(s) ||
      p.status.toLowerCase().includes(s)
    );
  });

  /* Summary */
  const totalGross = payrolls.reduce((s, p) => s + p.grossSalary, 0);
  const totalDeductions = payrolls.reduce((s, p) => s + p.totalDeductions, 0);
  const totalNet = payrolls.reduce((s, p) => s + p.netSalary, 0);
  const paidCount = payrolls.filter(p => p.status === 'paid').length;

  /* Generate Payroll */
  const handleGenerate = async () => {
    if (!genForm.employeeId) { toast.error('Please select an employee'); return; }
    try {
      setGenerating(true);
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId: genForm.employeeId, month: genForm.month, year: genForm.year }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Payroll generated successfully');
      setShowGenForm(false);
      setGenForm(initialGenForm);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate payroll');
    } finally {
      setGenerating(false);
    }
  };

  /* Show Edit Form */
  const handleShowEditForm = (p: PayrollRecord) => {
    setEditForm({
      basicSalary: p.basicSalary,
      hra: p.hra,
      da: p.da,
      conveyance: p.conveyance,
      medical: p.medical,
      otherAllowances: p.otherAllowances,
      pf: p.pf,
      esi: p.esi,
      tax: p.tax,
      professionalTax: p.professionalTax,
      otherDeductions: p.otherDeductions,
      status: p.status,
    });
    setEditCurrency(p.currency);
    setEditingId(p.id);
    setShowEditForm(true);
    setShowGenForm(false);
    setPayslipRecord(null);
    setTimeout(() => {
      document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  /* Submit Edit */
  const handleEditSubmit = async () => {
    if (!editingId) return;
    try {
      setSubmitting(true);
      const grossSalary = editForm.basicSalary + editForm.hra + editForm.da + editForm.conveyance + editForm.medical + editForm.otherAllowances;
      const totalDed = editForm.pf + editForm.esi + editForm.tax + editForm.professionalTax + editForm.otherDeductions;
      const netSalary = grossSalary - totalDed;

      const res = await fetch(`/api/payroll/${editingId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...editForm,
          grossSalary,
          totalDeductions: totalDed,
          netSalary,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Payroll updated successfully');
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update payroll');
    } finally {
      setSubmitting(false);
    }
  };

  /* Mark as Paid */
  const handleMarkPaid = async (id: string) => {
    try {
      setMarkingPaidId(id);
      const res = await fetch(`/api/payroll/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'paid' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Marked as paid');
      fetchData();
    } catch {
      toast.error('Failed to update payroll status');
    } finally {
      setMarkingPaidId(null);
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

  /* Cancel Form */
  const handleCancelForm = () => {
    setShowGenForm(false);
    setShowEditForm(false);
    setEditingId(null);
    setGenForm(initialGenForm);
    setEditForm(initialEditForm);
  };

  const colCount = 8;

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <FiDollarSign className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" />
          <p className="text-nexus-text-secondary font-medium">Access Restricted</p>
          <p className="text-sm text-nexus-text-muted mt-1">You don&apos;t have permission to view payroll data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiDollarSign className="w-6 h-6 text-emerald-500" />
            Payroll
          </h1>
          <p className="text-nexus-text-secondary mt-1">Process and manage employee payroll</p>
        </div>
        <button onClick={() => { setShowGenForm(true); setShowEditForm(false); setPayslipRecord(null); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" />
          Generate Payroll
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Gross', value: formatCurrency(totalGross), icon: <FiTrendingUp className="w-5 h-5" />, bg: 'bg-blue-50', iconColor: 'text-blue-500', ring: 'ring-blue-100' },
          { label: 'Total Deductions', value: formatCurrency(totalDeductions), icon: <FiTrendingDown className="w-5 h-5" />, bg: 'bg-red-50', iconColor: 'text-red-500', ring: 'ring-red-100' },
          { label: 'Total Net', value: formatCurrency(totalNet), icon: <FiDollarSign className="w-5 h-5" />, bg: 'bg-emerald-50', iconColor: 'text-emerald-500', ring: 'ring-emerald-100' },
          { label: 'Paid', value: paidCount, icon: <FiUsers className="w-5 h-5" />, bg: 'bg-violet-50', iconColor: 'text-violet-500', ring: 'ring-violet-100' },
        ].map(card => (
          <div key={card.label} className="nexus-card nexus-card-hover p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary">{card.label}</p>
                <p className="text-2xl font-bold text-nexus-text-primary mt-1">{card.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center ${card.iconColor} ring-1 ${card.ring}`}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-nexus-text-muted" />
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Months</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{getMonthName(m)}</option>
            ))}
          </select>
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Years</option>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
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

      {/* Embedded Generate Payroll Form */}
      {showGenForm && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-blue-500 animate-slide-in-down">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Generate Payroll</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                <select
                  value={genForm.employeeId}
                  onChange={e => setGenForm(p => ({ ...p, employeeId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                >
                  <option value="">Select Employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Month *</label>
                <select
                  value={genForm.month}
                  onChange={e => setGenForm(p => ({ ...p, month: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{getMonthName(m)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Year *</label>
                <input
                  type="number"
                  value={genForm.year}
                  onChange={e => setGenForm(p => ({ ...p, year: Number(e.target.value) }))}
                  min={2020}
                  max={2030}
                  className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
            {genForm.employeeId && (() => {
              const emp = employees.find(e => e.id === genForm.employeeId);
              return emp?.salary ? (
                <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-sm text-blue-700 font-medium">Current Salary: {formatCurrency(emp.salary, emp.salaryCurrency || 'USD')}</p>
                </div>
              ) : null;
            })()}
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleGenerate} disabled={generating} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Edit Payroll Form */}
      {showEditForm && editingId && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-amber-500 animate-slide-in-down">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Edit Payroll Details</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Earnings */}
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Basic Salary</label>
                <input type="number" value={editForm.basicSalary} onChange={e => setEditForm(p => ({ ...p, basicSalary: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">HRA</label>
                <input type="number" value={editForm.hra} onChange={e => setEditForm(p => ({ ...p, hra: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">DA</label>
                <input type="number" value={editForm.da} onChange={e => setEditForm(p => ({ ...p, da: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Conveyance</label>
                <input type="number" value={editForm.conveyance} onChange={e => setEditForm(p => ({ ...p, conveyance: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Medical</label>
                <input type="number" value={editForm.medical} onChange={e => setEditForm(p => ({ ...p, medical: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Other Allowances</label>
                <input type="number" value={editForm.otherAllowances} onChange={e => setEditForm(p => ({ ...p, otherAllowances: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              {/* Deductions */}
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">PF</label>
                <input type="number" value={editForm.pf} onChange={e => setEditForm(p => ({ ...p, pf: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">ESI</label>
                <input type="number" value={editForm.esi} onChange={e => setEditForm(p => ({ ...p, esi: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Tax</label>
                <input type="number" value={editForm.tax} onChange={e => setEditForm(p => ({ ...p, tax: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Professional Tax</label>
                <input type="number" value={editForm.professionalTax} onChange={e => setEditForm(p => ({ ...p, professionalTax: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Other Deductions</label>
                <input type="number" value={editForm.otherDeductions} onChange={e => setEditForm(p => ({ ...p, otherDeductions: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="draft">Draft</option>
                  <option value="processing">Processing</option>
                  <option value="approved">Approved</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            {/* Computed totals preview */}
            <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-nexus-border grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-nexus-text-muted">Gross Salary</p>
                <p className="text-sm font-bold text-nexus-text-primary">{formatCurrency(editForm.basicSalary + editForm.hra + editForm.da + editForm.conveyance + editForm.medical + editForm.otherAllowances, editCurrency)}</p>
              </div>
              <div>
                <p className="text-xs text-nexus-text-muted">Total Deductions</p>
                <p className="text-sm font-bold text-red-600">{formatCurrency(editForm.pf + editForm.esi + editForm.tax + editForm.professionalTax + editForm.otherDeductions, editCurrency)}</p>
              </div>
              <div>
                <p className="text-xs text-nexus-text-muted">Net Salary</p>
                <p className="text-sm font-bold text-emerald-600">{formatCurrency((editForm.basicSalary + editForm.hra + editForm.da + editForm.conveyance + editForm.medical + editForm.otherAllowances) - (editForm.pf + editForm.esi + editForm.tax + editForm.professionalTax + editForm.otherDeductions), editCurrency)}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleEditSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payslip View */}
      {payslipRecord && (
        <div className="nexus-card border-l-4 border-l-emerald-500 animate-slide-in-down">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-nexus-text-primary">Payslip</h2>
                <p className="text-sm text-nexus-text-secondary">{getMonthName(payslipRecord.month)} {payslipRecord.year}</p>
              </div>
              <button onClick={() => setPayslipRecord(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-slate-50 border border-nexus-border">
                <p className="text-sm font-semibold text-nexus-text-primary">{payslipRecord.employee?.firstName} {payslipRecord.employee?.lastName}</p>
                <p className="text-xs text-nexus-text-muted">ID: {payslipRecord.employee?.employeeId}</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider mb-2">Earnings</h3>
                <div className="space-y-1">
                  {([['Basic Salary', payslipRecord.basicSalary], ['HRA', payslipRecord.hra], ['DA', payslipRecord.da], ['Conveyance', payslipRecord.conveyance], ['Medical', payslipRecord.medical], ['Other Allowances', payslipRecord.otherAllowances]] as const).map(([label, amt]) => (
                    <div key={label} className="flex justify-between text-sm"><span className="text-nexus-text-secondary">{label}</span><span className="text-nexus-text-primary">{formatCurrency(amt, payslipRecord.currency)}</span></div>
                  ))}
                  <div className="flex justify-between text-sm font-bold border-t border-nexus-border pt-1 mt-1"><span className="text-nexus-text-primary">Gross Salary</span><span className="text-emerald-600">{formatCurrency(payslipRecord.grossSalary, payslipRecord.currency)}</span></div>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider mb-2">Deductions</h3>
                <div className="space-y-1">
                  {([['Provident Fund', payslipRecord.pf], ['ESI', payslipRecord.esi], ['Income Tax', payslipRecord.tax], ['Professional Tax', payslipRecord.professionalTax], ['Other Deductions', payslipRecord.otherDeductions]] as const).map(([label, amt]) => (
                    <div key={label} className="flex justify-between text-sm"><span className="text-nexus-text-secondary">{label}</span><span className="text-red-600">-{formatCurrency(amt, payslipRecord.currency)}</span></div>
                  ))}
                  <div className="flex justify-between text-sm font-bold border-t border-nexus-border pt-1 mt-1"><span className="text-nexus-text-primary">Total Deductions</span><span className="text-red-600">{formatCurrency(payslipRecord.totalDeductions, payslipRecord.currency)}</span></div>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-r from-blue-50 to-emerald-50 border border-blue-100">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-nexus-text-primary">Net Salary</span>
                  <span className="text-xl font-bold text-emerald-600">{formatCurrency(payslipRecord.netSalary, payslipRecord.currency)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-nexus-text-secondary">Status:</span>
                <span className={getStatusBadge(payslipRecord.status).className}>{getStatusBadge(payslipRecord.status).label}</span>
                {payslipRecord.paidDate && <span className="text-xs text-nexus-text-muted ml-2">Paid on {formatDate(payslipRecord.paidDate)}</span>}
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
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Gross Salary</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Total Deductions</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Net Salary</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-200 rounded" style={{ width: j === 0 ? '120px' : '80px' }} /></td>
                    ))}
                  </tr>
                ))
              ) : filteredPayrolls.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center">
                    <FiDollarSign className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No payroll records found</p>
                    <p className="text-sm text-nexus-text-muted mt-1">Generate payroll to get started</p>
                  </td>
                </tr>
              ) : (
                filteredPayrolls.map(p => {
                  const statusBadge = getStatusBadge(p.status);
                  return (
                    <tr key={p.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      {deleteConfirmId === p.id ? (
                        <td colSpan={colCount} className="px-4 py-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Are you sure you want to delete this payroll record for {p.employee?.firstName} {p.employee?.lastName}?</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(p.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                                {deleting ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-nexus-text-primary">{p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : 'Unknown'}</p>
                            <p className="text-xs text-nexus-text-muted">{p.employee?.employeeId}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{getMonthName(p.month)} {p.year}</td>
                          <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary text-right">{formatCurrency(p.grossSalary, p.currency)}</td>
                          <td className="px-4 py-3 text-sm text-red-600 text-right">{formatCurrency(p.totalDeductions, p.currency)}</td>
                          <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">{formatCurrency(p.netSalary, p.currency)}</td>
                          <td className="px-4 py-3"><span className={statusBadge.className}>{statusBadge.label}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => { setPayslipRecord(p); setShowGenForm(false); setShowEditForm(false); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="View Payslip">
                                <FiEye className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleShowEditForm(p)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit">
                                <FiEdit2 className="w-4 h-4" />
                              </button>
                              {p.status !== 'paid' && (
                                <button onClick={() => handleMarkPaid(p.id)} disabled={markingPaidId === p.id} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Mark as Paid">
                                  <FiCheck className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => setDeleteConfirmId(p.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                <FiTrash2 className="w-4 h-4" />
                              </button>
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
