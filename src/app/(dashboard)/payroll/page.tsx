'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiDollarSign,
  FiPlus,
  FiX,
  FiEye,
  FiCheck,
  FiTrendingDown,
  FiTrendingUp,
  FiUsers,
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
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
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
    processed: 'nexus-badge nexus-badge-info',
    paid: 'nexus-badge nexus-badge-success',
    cancelled: 'nexus-badge nexus-badge-error',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

/* ── Component ── */
export default function PayrollPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genEmployeeId, setGenEmployeeId] = useState('');

  const [payslipRecord, setPayslipRecord] = useState<PayrollRecord | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [payRes, empRes] = await Promise.all([
        fetch(`/api/payroll?month=${filterMonth}&year=${filterYear}&limit=100`, { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (payRes.ok) {
        const data = await payRes.json();
        setPayrolls(data.payrolls || []);
      }
      if (empRes.ok) {
        const data = await empRes.json();
        setEmployees(data.employees || []);
      }
    } catch {
      toast.error('Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Summary */
  const totalGross = payrolls.reduce((s, p) => s + p.grossSalary, 0);
  const totalDeductions = payrolls.reduce((s, p) => s + p.totalDeductions, 0);
  const totalNet = payrolls.reduce((s, p) => s + p.netSalary, 0);
  const processedCount = payrolls.filter(p => p.status === 'paid' || p.status === 'processed').length;

  /* Generate Payroll */
  const handleGenerate = async () => {
    if (!genEmployeeId) { toast.error('Select an employee'); return; }
    try {
      setGenerating(true);
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId: genEmployeeId, month: filterMonth, year: filterYear }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Payroll generated successfully');
      setShowGenerateModal(false);
      setGenEmployeeId('');
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate payroll');
    } finally {
      setGenerating(false);
    }
  };

  /* Mark as Paid */
  const handleMarkPaid = async (id: string) => {
    try {
      setMarkingPaid(id);
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
      setMarkingPaid(null);
    }
  };

  const summaryCards = [
    { label: 'Total Gross', value: formatCurrency(totalGross), icon: <FiTrendingUp className="w-5 h-5" />, color: 'blue' },
    { label: 'Total Deductions', value: formatCurrency(totalDeductions), icon: <FiTrendingDown className="w-5 h-5" />, color: 'red' },
    { label: 'Total Net', value: formatCurrency(totalNet), icon: <FiDollarSign className="w-5 h-5" />, color: 'emerald' },
    { label: 'Employees Processed', value: processedCount, icon: <FiUsers className="w-5 h-5" />, color: 'violet' },
  ];

  function getColorClasses(color: string) {
    const map: Record<string, { bg: string; icon: string; ring: string }> = {
      blue: { bg: 'bg-blue-50', icon: 'text-blue-500', ring: 'ring-blue-100' },
      red: { bg: 'bg-red-50', icon: 'text-red-500', ring: 'ring-red-100' },
      emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500', ring: 'ring-emerald-100' },
      violet: { bg: 'bg-violet-50', icon: 'text-violet-500', ring: 'ring-violet-100' },
    };
    return map[color] || map.blue;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <FiDollarSign className="w-6 h-6" />
            Payroll Management
          </h1>
          <p className="text-nexus-text-secondary mt-1">Process and manage employee payroll</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowGenerateModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Generate Payroll
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-nexus-text-secondary font-medium">Month:</label>
          <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{getMonthName(m)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-nexus-text-secondary font-medium">Year:</label>
          <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="nexus-card p-5 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="space-y-2"><div className="h-3 w-24 bg-slate-200 rounded" /><div className="h-7 w-20 bg-slate-200 rounded" /></div>
                <div className="h-10 w-10 bg-slate-200 rounded-xl" />
              </div>
            </div>
          ))
        ) : (
          summaryCards.map(card => {
            const colors = getColorClasses(card.color);
            return (
              <div key={card.label} className="nexus-card nexus-card-hover p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-nexus-text-secondary">{card.label}</p>
                    <p className="text-2xl font-bold text-nexus-text-primary mt-1">{card.value}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center ${colors.icon} ring-1 ${colors.ring}`}>{card.icon}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Payroll Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Basic</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">HRA</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Gross</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">PF</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Tax</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Deductions</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Net</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-200 rounded" style={{ width: j === 0 ? '120px' : '60px' }} /></td>
                    ))}
                  </tr>
                ))
              ) : payrolls.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <FiDollarSign className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No payroll records found</p>
                    <p className="text-sm text-nexus-text-muted mt-1">Generate payroll for {getMonthName(filterMonth)} {filterYear}</p>
                  </td>
                </tr>
              ) : (
                payrolls.map(p => (
                  <tr key={p.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">
                      {p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : 'Unknown'}
                      <p className="text-xs text-nexus-text-muted">{p.employee?.employeeId}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary text-right">{formatCurrency(p.basicSalary, p.currency)}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary text-right">{formatCurrency(p.hra, p.currency)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary text-right">{formatCurrency(p.grossSalary, p.currency)}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary text-right">{formatCurrency(p.pf, p.currency)}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary text-right">{formatCurrency(p.tax + p.professionalTax, p.currency)}</td>
                    <td className="px-4 py-3 text-sm text-red-600 text-right">{formatCurrency(p.totalDeductions, p.currency)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">{formatCurrency(p.netSalary, p.currency)}</td>
                    <td className="px-4 py-3"><span className={getStatusBadge(p.status)}>{p.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setPayslipRecord(p)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="View Payslip">
                          <FiEye className="w-4 h-4" />
                        </button>
                        {isAdmin && p.status !== 'paid' && (
                          <button onClick={() => handleMarkPaid(p.id)} disabled={markingPaid === p.id} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Mark as Paid">
                            <FiCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Payroll Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowGenerateModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-slide-in-down" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Generate Payroll</h2>
              <button onClick={() => setShowGenerateModal(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                <select value={genEmployeeId} onChange={e => setGenEmployeeId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select Employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeId})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Month</label>
                  <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{getMonthName(m)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Year</label>
                  <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              {genEmployeeId && (() => {
                const emp = employees.find(e => e.id === genEmployeeId);
                return emp?.salary ? (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <p className="text-sm text-blue-700 font-medium">Current Salary: {formatCurrency(emp.salary)}</p>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowGenerateModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleGenerate} disabled={generating} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {generating ? 'Generating...' : 'Generate Payroll'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payslip Modal */}
      {payslipRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setPayslipRecord(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full animate-slide-in-down max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <div>
                <h2 className="text-lg font-semibold text-nexus-text-primary">Payslip</h2>
                <p className="text-sm text-nexus-text-secondary">{getMonthName(payslipRecord.month)} {payslipRecord.year}</p>
              </div>
              <button onClick={() => setPayslipRecord(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
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
              <div className="p-4 rounded-lg bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-100">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-nexus-text-primary">Net Salary</span>
                  <span className="text-xl font-bold gradient-text">{formatCurrency(payslipRecord.netSalary, payslipRecord.currency)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-nexus-text-secondary">Status:</span>
                <span className={getStatusBadge(payslipRecord.status)}>{payslipRecord.status}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
