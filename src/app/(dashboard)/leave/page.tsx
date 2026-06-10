'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiCalendar,
  FiPlus,
  FiCheck,
  FiX,
  FiClock,
  FiMessageSquare,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';

/* ── Leave Tips ── */
const leaveTips = [
  {
    title: 'Configure Leave Types First',
    description: 'Configure leave types and entitlement rules in Settings before employees apply',
  },
  {
    title: 'Set Up Carry-Forward Rules',
    description: 'Set up leave carry-forward rules to define how unused leaves roll over',
  },
  {
    title: 'Sandwich Leave Policy',
    description: 'Use the Sandwich Leave policy setting to control how holidays between leaves are treated',
  },
  {
    title: 'Leave Encashment',
    description: 'Leave encashment can be configured to pay out unused leaves at Basic or Gross rate',
  },
  {
    title: 'Check Balance Reports',
    description: 'Check the Leave Balance report regularly to ensure accurate tracking',
  },
];

/* ── Leave Workflow Steps ── */
const leaveWorkflowSteps = [
  { step: 1, title: 'Configure Leave Types', description: 'Set up leave categories and entitlement rules in Settings' },
  { step: 2, title: 'Set Leave Balances', description: 'Initialize leave balances for each employee' },
  { step: 3, title: 'Employee Applies for Leave', description: 'Employees submit leave requests through the portal' },
  { step: 4, title: 'Manager Reviews', description: 'Reporting manager reviews the leave application' },
  { step: 5, title: 'Approve/Reject Leave', description: 'Manager approves or rejects with optional comments' },
  { step: 6, title: 'Update Balance', description: 'Leave balance is automatically updated upon approval' },
  { step: 7, title: 'Generate Leave Report', description: 'Run reports to track leave usage across the team' },
];

/* ── Types ── */
interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: string;
  halfDay: boolean;
  comments?: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string; avatar?: string | null };
  leaveType?: { id: string; name: string; code: string };
  employeeId: string;
  leaveTypeId: string;
}

interface LeaveBalance {
  id: string;
  total: number;
  used: number;
  remaining: number;
  year: number;
  leaveType: { id: string; name: string; code: string };
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  defaultDays: number;
  isPaid: boolean;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  leaveBalances?: LeaveBalance[];
}

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
    pending: 'nexus-badge nexus-badge-warning',
    approved: 'nexus-badge nexus-badge-success',
    rejected: 'nexus-badge nexus-badge-error',
    cancelled: 'bg-slate-100 text-slate-600 nexus-badge',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getDaysBetween(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

const initialForm = {
  leaveTypeId: '',
  startDate: '',
  endDate: '',
  reason: '',
  halfDay: false,
};

/* ── Component ── */
export default function LeavePage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [activeTab, setActiveTab] = useState<'my' | 'team' | 'balances'>('my');
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [actionRowId, setActionRowId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approved' | 'rejected' | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actioning, setActioning] = useState(false);

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      // Fetch leave requests
      const leaveRes = await fetch('/api/leave?limit=50', { headers });
      if (leaveRes.ok) {
        const data = await leaveRes.json();
        setLeaveRequests(data.leaveRequests || []);
      }

      // Fetch current user's employee record to get leave balances
      const empRes = await fetch('/api/employees?limit=500', { headers });
      if (empRes.ok) {
        const empData = await empRes.json();
        const myEmp = empData.employees?.find((e: { email: string }) => e.email === user?.email);
        if (myEmp) {
          setEmployee(myEmp);
          // Fetch full employee details with leave balances
          const detailRes = await fetch(`/api/employees/${myEmp.id}`, { headers });
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setLeaveBalances(detailData.employee?.leaveBalances || []);
          }
        }

        // Extract leave types from leave balances and requests
        const ltMap = new Map<string, LeaveType>();
        (empData.employees || []).forEach((e: Employee) => {
          e.leaveBalances?.forEach((lb: LeaveBalance) => {
            ltMap.set(lb.leaveType.id, { ...lb.leaveType, defaultDays: 0, isPaid: true });
          });
        });
        if (ltMap.size === 0) {
          // Provide default leave types
          setLeaveTypes([
            { id: 'lt_cl', name: 'Casual Leave', code: 'CL', defaultDays: 12, isPaid: true },
            { id: 'lt_sl', name: 'Sick Leave', code: 'SL', defaultDays: 10, isPaid: true },
            { id: 'lt_pl', name: 'Privileged Leave', code: 'PL', defaultDays: 15, isPaid: true },
            { id: 'lt_ml', name: 'Maternity Leave', code: 'ML', defaultDays: 180, isPaid: true },
          ]);
        } else {
          setLeaveTypes(Array.from(ltMap.values()));
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load leave data');
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Apply Leave */
  const handleOpenApplyForm = () => {
    setForm(initialForm);
    setShowForm(true);
    setActionRowId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setForm(initialForm);
  };

  const handleApply = async () => {
    if (!form.leaveTypeId || !form.startDate || !form.endDate) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!employee?.id) {
      toast.error('Employee record not found');
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeId: employee.id,
          leaveTypeId: form.leaveTypeId,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason,
          halfDay: form.halfDay,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Leave request submitted successfully');
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  /* Approve / Reject inline */
  const handleOpenAction = (id: string, action: 'approved' | 'rejected') => {
    setActionRowId(id);
    setActionType(action);
    setActionComment('');
    setShowForm(false);
  };

  const handleCancelAction = () => {
    setActionRowId(null);
    setActionType(null);
    setActionComment('');
  };

  const handleAction = async () => {
    if (!actionRowId || !actionType) return;
    try {
      setActioning(true);
      const res = await fetch(`/api/leave/${actionRowId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: actionType, comments: actionComment }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(`Leave ${actionType === 'approved' ? 'approved' : 'rejected'} successfully`);
      handleCancelAction();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActioning(false);
    }
  };

  /* Cancel leave */
  const handleCancel = async (id: string) => {
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Leave cancelled');
      fetchData();
    } catch {
      toast.error('Failed to cancel leave');
    }
  };

  /* Filter leave requests */
  const myLeaves = leaveRequests.filter(lr => lr.employeeId === employee?.id);
  const teamLeaves = leaveRequests.filter(lr => lr.employeeId !== employee?.id);

  const renderLeaveTable = (leaves: LeaveRequest[], showActions: 'cancel' | 'approve' | 'none') => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-nexus-border bg-slate-50/50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Leave Type</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">From</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">To</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Days</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Reason</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                <td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td>
                <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td>
              </tr>
            ))
          ) : leaves.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center">
                <FiCalendar className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                <p className="text-nexus-text-secondary font-medium">No leave requests found</p>
              </td>
            </tr>
          ) : (
            leaves.map(lr => {
              const isActionRow = actionRowId === lr.id;
              return (
                <>
                  <tr key={lr.id} className={`border-b border-nexus-border/50 transition-colors ${isActionRow ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`}>
                    {isActionRow && actionType ? (
                      <td colSpan={7} className="px-4 py-3">
                        <div className={`rounded-lg border p-4 ${actionType === 'approved' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${actionType === 'approved' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                              {actionType === 'approved' ? <FiCheck className="w-4 h-4 text-emerald-500" /> : <FiX className="w-4 h-4 text-red-500" />}
                            </div>
                            <div className="flex-1">
                              <h4 className="text-sm font-semibold text-nexus-text-primary">
                                {actionType === 'approved' ? 'Approve Leave' : 'Reject Leave'}
                              </h4>
                              <p className="text-xs text-nexus-text-secondary mt-0.5">
                                {lr.leaveType?.name || 'Leave'} · {formatDate(lr.startDate)} – {formatDate(lr.endDate)}
                              </p>
                              <div className="mt-3">
                                <label className="flex items-center gap-2 text-xs text-nexus-text-secondary mb-1.5">
                                  <FiMessageSquare className="w-3.5 h-3.5" />Comment (optional)
                                </label>
                                <textarea
                                  rows={2}
                                  value={actionComment}
                                  onChange={e => setActionComment(e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                                  placeholder="Add your comment here..."
                                />
                              </div>
                              <div className="flex items-center gap-2 mt-3">
                                <button
                                  onClick={handleAction}
                                  disabled={actioning}
                                  className={`px-3 py-1.5 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors ${actionType === 'approved' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}
                                >
                                  {actioning ? 'Processing...' : actionType === 'approved' ? 'Confirm Approve' : 'Confirm Reject'}
                                </button>
                                <button onClick={handleCancelAction} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">
                          {lr.leaveType?.name || 'Leave'}
                          {lr.halfDay && <span className="text-xs text-nexus-text-muted ml-1">(Half Day)</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(lr.startDate)}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(lr.endDate)}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{getDaysBetween(lr.startDate, lr.endDate)}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary truncate max-w-[200px]">{lr.reason || '—'}</td>
                        <td className="px-4 py-3"><span className={getStatusBadge(lr.status)}>{lr.status}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {showActions === 'cancel' && lr.status === 'pending' && (
                              <button onClick={() => handleCancel(lr.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Cancel">
                                <FiX className="w-4 h-4" />
                              </button>
                            )}
                            {showActions === 'approve' && lr.status === 'pending' && (
                              <>
                                <button onClick={() => handleOpenAction(lr.id, 'approved')} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Approve">
                                  <FiCheck className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleOpenAction(lr.id, 'rejected')} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Reject">
                                  <FiX className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                </>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiCalendar className="w-6 h-6 text-amber-500" />
            Leave Management
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage your leaves and approvals</p>
        </div>
        <button onClick={handleOpenApplyForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" />
          Apply Leave
        </button>
      </div>

      {/* Module Tips */}
      <ModuleTips
        moduleKey="leave"
        title="Leave Tips"
        tips={leaveTips}
        userRole={user?.role}
      />

      <ModuleWorkflow
        moduleKey="leave"
        title="How to Process Leave Requests"
        subtitle="Follow this workflow to manage leave requests end-to-end"
        steps={leaveWorkflowSteps}
        accentColor="amber"
        userRole={user?.role}
      />

      {/* Embedded Apply Leave Form */}
      {showForm && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-amber-500 transition-all duration-300 ease-in-out">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Apply Leave</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Leave Type *</label>
                <select value={form.leaveTypeId} onChange={e => setForm(p => ({ ...p, leaveTypeId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select Leave Type</option>
                  {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name} ({lt.defaultDays} days)</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Start Date *</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">End Date *</label>
                  <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} min={form.startDate} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
              </div>
              {form.startDate && form.endDate && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-sm text-blue-700 font-medium">
                    <FiClock className="w-4 h-4 inline mr-1" />
                    Duration: {getDaysBetween(form.startDate, form.endDate)} day(s){form.halfDay ? ' (0.5 for half day)' : ''}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Reason</label>
                <textarea rows={3} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Provide a reason for your leave..." />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.halfDay} onChange={e => setForm(p => ({ ...p, halfDay: e.target.checked }))} className="w-4 h-4 rounded border-nexus-border text-blue-500 focus:ring-blue-500/20" />
                <span className="text-sm text-nexus-text-primary">Half Day Leave</span>
              </label>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-nexus-border">
                <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleApply} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                  {submitting ? 'Submitting...' : 'Submit Leave'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button onClick={() => setActiveTab('my')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'my' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
          My Leaves
        </button>
        {isAdmin && (
          <button onClick={() => setActiveTab('team')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'team' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
            Team Leaves
          </button>
        )}
        <button onClick={() => setActiveTab('balances')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'balances' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
          Leave Balances
        </button>
      </div>

      {/* My Leaves Tab */}
      {activeTab === 'my' && (
        <div className="nexus-card overflow-hidden">
          {renderLeaveTable(myLeaves, 'cancel')}
        </div>
      )}

      {/* Team Leaves Tab */}
      {activeTab === 'team' && isAdmin && (
        <div className="nexus-card overflow-hidden">
          {renderLeaveTable(teamLeaves, 'approve')}
        </div>
      )}

      {/* Leave Balances Tab */}
      {activeTab === 'balances' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="nexus-card p-6 animate-pulse">
                <div className="h-4 w-28 bg-slate-200 rounded mb-4" />
                <div className="flex justify-between mb-2"><div className="h-3 w-12 bg-slate-200 rounded" /><div className="h-3 w-12 bg-slate-200 rounded" /></div>
                <div className="h-3 bg-slate-200 rounded-full" />
              </div>
            ))
          ) : leaveBalances.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3 text-center py-12 nexus-card">
              <FiClock className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
              <p className="text-nexus-text-secondary font-medium">No leave balance data</p>
              <p className="text-sm text-nexus-text-muted mt-1">Leave balances will appear once your account is configured</p>
            </div>
          ) : (
            leaveBalances.map(lb => {
              const usedPct = lb.total > 0 ? (lb.used / lb.total) * 100 : 0;
              const barColor = usedPct > 80 ? 'bg-red-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div key={lb.id} className="nexus-card p-6">
                  <h3 className="text-sm font-semibold text-nexus-text-primary mb-1">{lb.leaveType.name}</h3>
                  <p className="text-xs text-nexus-text-muted mb-4">Year {lb.year}</p>
                  <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                    <div className="p-2 rounded-lg bg-blue-50">
                      <p className="text-lg font-bold text-blue-700">{lb.total}</p>
                      <p className="text-[10px] text-blue-500">Total</p>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-50">
                      <p className="text-lg font-bold text-amber-700">{lb.used}</p>
                      <p className="text-[10px] text-amber-500">Used</p>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50">
                      <p className="text-lg font-bold text-emerald-700">{lb.remaining}</p>
                      <p className="text-[10px] text-emerald-500">Remaining</p>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
                  </div>
                  <p className="text-xs text-nexus-text-muted mt-1">{Math.round(usedPct)}% used</p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
