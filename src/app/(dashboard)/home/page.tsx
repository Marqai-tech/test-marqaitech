'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
/* Task 163 — /home is now the ADMIN DASHBOARD (renamed from "Home"):
   admin-roles only, every tile fed from live APIs (no dummy/static data).
   Non-admin roles are redirected straight to the Employee Dashboard. */
import AdminTemplateBoard, { type AdminTemplateData, type AdminStatTile } from '@/components/dashboard/admin-template';
import BirthdaysCard from '@/components/dashboard/BirthdaysCard';
import { ADMIN_DASHBOARD_ROLES, homeHrefForRole } from '@/lib/roleAccess';
import {
  FiUsers, FiUserCheck, FiUserPlus, FiCalendar, FiClock,
  FiDollarSign, FiFileText,
  FiBriefcase, FiShield, FiServer, FiActivity,
  FiCheckCircle, FiLayers, FiGrid, FiBarChart2,
} from 'react-icons/fi';

/* ---------- helpers ---------- */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const todayChip = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

interface EmpRow {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  status?: string;
  dateOfJoining?: string;
  department?: { name?: string } | null;
  designation?: { title?: string } | null;
  employmentType?: string | null;
}

function empName(e: { firstName?: string; lastName?: string }) {
  return `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Unknown';
}
function fmtJoin(d?: string) {
  return d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Team member';
}
function hourLabel(h?: number | null) {
  if (h == null) return '—';
  return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
}

/* Derive dept distribution + status breakdown from employee rows */
function deriveWorkforce(empRows: EmpRow[]) {
  const deptMap: Record<string, number> = {};
  const statusMap: Record<string, number> = {};
  empRows.forEach((e) => {
    const dep = e.department?.name || 'Unassigned';
    deptMap[dep] = (deptMap[dep] || 0) + 1;
    const st = (e.status || 'active').toLowerCase();
    statusMap[st] = (statusMap[st] || 0) + 1;
  });
  const deptDist = Object.entries(deptMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  const statusColors: Record<string, string> = {
    active: '#10B981', probation: '#FF9B44', inactive: '#94A3B8', terminated: '#EF4444', resigned: '#6C4FD6',
  };
  const employeeStatus = Object.entries(statusMap).map(([label, count]) => ({
    label: label.charAt(0).toUpperCase() + label.slice(1),
    count,
    color: statusColors[label] || '#3A57C4',
  })).sort((a, b) => b.count - a.count);
  return { deptDist, employeeStatus };
}

/* ══════════════ SUPER ADMIN / PLATFORM ══════════════ */
function SuperAdminHome() {
  const { selectedTenantId, selectedCompanyId, availableTenants, availableCompanies, hydrate } = useCompanyContextStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalEmployees: 0, totalUsers: 0, totalDepartments: 0, totalBranches: 0, auditCount: 0, activeTenants: 0 });
  const [empRows, setEmpRows] = useState<EmpRow[]>([]);
  const [recentLogs, setRecentLogs] = useState<{ id: string; action: string; module: string; createdAt: string; user?: { name: string } }[]>([]);

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      const headers = getAuthHeaders();
      const safe = async (url: string) => {
        try {
          const res = await fetch(url, { headers, signal: ac.signal });
          if (!res.ok) return null;
          return await res.json();
        } catch { return null; }
      };
      const [empData, deptData, logsData, branchData, platformData] = await Promise.all([
        safe('/api/employees?limit=300&includeStats=1'),
        safe('/api/departments?limit=1'),
        safe('/api/super-admin/audit-logs?limit=8'),
        safe('/api/branches?limit=1'),
        safe('/api/super-admin/dashboard'),
      ]);
      const rows: EmpRow[] = empData?.employees || empData?.data || [];
      const total = empData?.pagination?.total ?? empData?.stats?.total ?? rows.length;
      setEmpRows(rows);
      setStats({
        totalEmployees: total,
        totalUsers: empData?.stats?.active ?? total,
        totalDepartments: deptData?.pagination?.total || deptData?.total || 0,
        totalBranches: branchData?.pagination?.total || branchData?.total || 0,
        auditCount: logsData?.pagination?.total || 0,
        activeTenants: typeof platformData?.activeTenants === 'number' ? platformData.activeTenants : 0,
      });
      const logs = logsData?.auditLogs || logsData?.logs || logsData?.data || logsData?.recentActivity || [];
      if (Array.isArray(logs)) setRecentLogs(logs.slice(0, 8));
      setLoading(false);
    })();
    return () => ac.abort();
  }, []);

  const { deptDist, employeeStatus } = useMemo(() => deriveWorkforce(empRows), [empRows]);

  const tiles: AdminStatTile[] = [
    { label: 'Total Employees', value: stats.totalEmployees, icon: <FiUsers className="w-4 h-4" />, bg: 'bg-[#3A57C4]/10 text-[#3A57C4]', ring: 'ring-[#3A57C4]/20', href: '/employees' },
    { label: 'Active Accounts', value: stats.totalUsers, icon: <FiUserCheck className="w-4 h-4" />, bg: 'bg-[#6C4FD6]/10 text-[#6C4FD6]', ring: 'ring-[#6C4FD6]/20', href: '/employees' },
    { label: 'Departments', value: stats.totalDepartments, icon: <FiLayers className="w-4 h-4" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100', href: '/company/departments' },
    { label: 'Branches', value: stats.totalBranches, icon: <FiBriefcase className="w-4 h-4" />, bg: 'bg-sky-50 text-sky-600', ring: 'ring-sky-100', href: '/company/branches' },
    { label: 'Companies', value: availableCompanies.length, icon: <FiBriefcase className="w-4 h-4" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100', href: '/company/companies' },
    { label: 'Active Tenants', value: stats.activeTenants, icon: <FiShield className="w-4 h-4" />, bg: 'bg-[#FF9B44]/15 text-[#FF9B44]', ring: 'ring-orange-200', href: '/super-admin' },
    { label: 'Audit Events', value: stats.auditCount, icon: <FiActivity className="w-4 h-4" />, bg: 'bg-rose-50 text-rose-600', ring: 'ring-rose-100', href: '/super-admin/audit-logs' },
    { label: 'Available Tenants', value: availableTenants.length, icon: <FiServer className="w-4 h-4" />, bg: 'bg-teal-50 text-teal-600', ring: 'ring-teal-100', href: '/super-admin' },
  ];

  const data: AdminTemplateData = {
    todayChip,
    stats: tiles,
    deptDist,
    employeeStatus,
    attendanceTrend: [],
    clock: null,
    applicants: [],
    employees: empRows.slice(0, 4).map((e) => ({ id: e.id, name: empName(e), sub: e.department?.name || 'Team member', avatar: e.avatar || null })),
    todos: [],
    sales: [],
    invoices: [],
    projects: [],
    taskStats: [],
    schedules: [],
    activities: recentLogs.map((l) => ({ id: l.id, title: l.action, sub: `${l.user?.name || 'System'} · ${l.module}`, time: new Date(l.createdAt).toLocaleString() })),
    loading,
    birthdays: <BirthdaysCard />,
  };
  return <AdminTemplateBoard data={data} />;
}

/* ══════════════ HR ADMIN (also tenant_admin / ceo / admin) ══════════════ */
function HRAdminHome() {
  const { selectedCompanyId, hydrated, hydrate } = useCompanyContextStore();
  const [loading, setLoading] = useState(true);
  const [empRows, setEmpRows] = useState<EmpRow[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [pendingPayroll, setPendingPayroll] = useState(0);
  const [leaveRows, setLeaveRows] = useState<{ id: string; employee?: { firstName: string; lastName: string }; leaveType?: { name: string }; startDate: string; status: string }[]>([]);
  const [attRows, setAttRows] = useState<{ date: string; status: string; checkIn?: string | null; checkOut?: string | null; workHours?: number | null }[]>([]);
  const [candidates, setCandidates] = useState<{ id: string; name: string; position?: string; stage?: string; avatar?: string | null }[]>([]);
  const [payslips, setPayslips] = useState<{ id: string; month: number; year: number; netSalary: number; status: string; currency?: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; client?: { name?: string } | null; progress?: number | null; status?: string }[]>([]);

  const scopeQuery = useMemo(() => (selectedCompanyId ? `&companyId=${encodeURIComponent(selectedCompanyId)}` : ''), [selectedCompanyId]);

  useEffect(() => {
    if (!hydrated) { hydrate(); return; }
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      const headers = getAuthHeaders();
      const safe = async (url: string) => {
        try {
          const res = await fetch(url, { headers, signal: ac.signal });
          if (!res.ok) return null;
          return await res.json();
        } catch { return null; }
      };
      const [empList, leaveData, payrollData, attData, candData, payslipData, projData] = await Promise.all([
        safe(`/api/employees?limit=300&status=active${scopeQuery}`),
        safe(`/api/leave?status=pending&limit=10${scopeQuery}`),
        safe(`/api/payroll?status=draft&limit=1${scopeQuery}`),
        safe(`/api/attendance?limit=300${scopeQuery}`),
        safe(`/api/candidates?limit=6${scopeQuery}`),
        safe(`/api/payroll/payslips?limit=5${scopeQuery}`),
        safe(`/api/projects?limit=4${scopeQuery}`),
      ]);
      const rows: EmpRow[] = empList?.employees || empList?.data || [];
      setEmpRows(rows);
      setTotalEmployees(empList?.pagination?.total ?? empList?.total ?? rows.length);
      setPendingLeaves(leaveData?.pagination?.total || leaveData?.total || 0);
      setPendingPayroll(payrollData?.pagination?.total || payrollData?.total || 0);
      setLeaveRows((leaveData?.leaveRequests || leaveData?.leaves || leaveData?.data || []).slice(0, 5));
      setAttRows(attData?.attendance || attData?.records || []);
      setCandidates((candData?.candidates || candData?.data || []).slice(0, 5).map((c: { id: string; firstName?: string; lastName?: string; name?: string; position?: string; stage?: string; avatar?: string | null }) => ({
        id: c.id,
        name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Candidate',
        position: c.position,
        stage: c.stage,
        avatar: c.avatar || null,
      })));
      setPayslips((payslipData?.payslips || payslipData?.data || []).slice(0, 5));
      setProjects((projData?.projects || projData?.data || []).slice(0, 4));
      setLoading(false);
    })();
    return () => ac.abort();
  }, [hydrated, hydrate, scopeQuery]);

  const { deptDist, employeeStatus } = useMemo(() => deriveWorkforce(empRows), [empRows]);

  /* attendance trend — org-wide headcount present per day, last 7 days */
  const attendanceTrend = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dayRecords = attRows.filter((a) => new Date(a.date).toDateString() === d.toDateString());
      return {
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        hours: dayRecords.filter((a) => ['present', 'late'].includes((a.status || '').toLowerCase())).length,
      };
    });
  }, [attRows]);

  /* org-wide clock summary from today's punches */
  const clock = useMemo(() => {
    const todayStr = new Date().toDateString();
    const todayRows = attRows.filter((a) => new Date(a.date).toDateString() === todayStr && a.checkIn);
    if (todayRows.length === 0) return null;
    const ins = todayRows.map((a) => new Date(a.checkIn as string).getTime()).filter((t) => !Number.isNaN(t));
    const outs = todayRows.map((a) => (a.checkOut ? new Date(a.checkOut).getTime() : NaN)).filter((t) => !Number.isNaN(t));
    const totalH = attRows.filter((a) => new Date(a.date).toDateString() === todayStr).reduce((s, a) => s + (a.workHours || 0), 0);
    const fmt = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return {
      checkIn: ins.length ? fmt(Math.min(...ins)) : null,
      checkOut: outs.length ? fmt(Math.max(...outs)) : null,
      totalHours: hourLabel(totalH),
      production: `${todayRows.length} punches`,
    };
  }, [attRows]);

  const monthLabel = (m: number, y: number) => new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const fmtMoney = (n: number, currency = 'INR') => {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0); }
    catch { return `₹${(n || 0).toLocaleString('en-IN')}`; }
  };

  const sales = useMemo(() => {
    return payslips
      .slice()
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .map((p) => ({ month: monthLabel(p.month, p.year).split(' ')[0], amount: p.netSalary || 0 }));
  }, [payslips]);

  const data: AdminTemplateData = {
    todayChip,
    stats: [
      { label: 'Total Employees', value: totalEmployees, icon: <FiUsers className="w-4 h-4" />, bg: 'bg-[#3A57C4]/10 text-[#3A57C4]', ring: 'ring-[#3A57C4]/20', href: '/employees' },
      { label: 'New Joiners', value: empRows.filter((e) => e.dateOfJoining && new Date(e.dateOfJoining) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)).length, icon: <FiUserPlus className="w-4 h-4" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100', href: '/employees' },
      { label: 'Pending Leaves', value: pendingLeaves, icon: <FiCalendar className="w-4 h-4" />, bg: 'bg-orange-50 text-orange-600', ring: 'ring-orange-100', href: '/leave' },
      { label: 'Draft Payrolls', value: pendingPayroll, icon: <FiDollarSign className="w-4 h-4" />, bg: 'bg-[#6C4FD6]/10 text-[#6C4FD6]', ring: 'ring-[#6C4FD6]/20', href: '/payroll/processing' },
      { label: 'Job Applicants', value: candidates.length, icon: <FiBriefcase className="w-4 h-4" />, bg: 'bg-[#FF9B44]/15 text-[#FF9B44]', ring: 'ring-orange-200', href: '/recruitment' },
      { label: 'Payslips Issued', value: payslips.length, icon: <FiFileText className="w-4 h-4" />, bg: 'bg-sky-50 text-sky-600', ring: 'ring-sky-100', href: '/payroll' },
      { label: 'Active Projects', value: projects.length, icon: <FiLayers className="w-4 h-4" />, bg: 'bg-teal-50 text-teal-600', ring: 'ring-teal-100', href: '/projects' },
      { label: 'Departments', value: deptDist.length, icon: <FiBarChart2 className="w-4 h-4" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100', href: '/company/departments' },
    ],
    deptDist,
    employeeStatus,
    attendanceTrend,
    clock,
    applicants: candidates.map((c) => ({ id: c.id, name: c.name, role: c.position || 'General', sub: c.stage || 'Sourced', avatar: c.avatar || null })),
    employees: empRows.slice(0, 4).map((e) => ({ id: e.id, name: empName(e), sub: e.designation?.title || e.department?.name || fmtJoin(e.dateOfJoining), avatar: e.avatar || null })),
    todos: leaveRows.map((l) => ({ id: l.id, label: `${empName(l.employee || {})} — ${l.leaveType?.name || 'Leave'}`, sub: `From ${new Date(l.startDate).toLocaleDateString()}`, done: false })),
    sales,
    invoices: payslips.map((p) => ({ id: p.id, label: monthLabel(p.month, p.year), sub: `Net ${fmtMoney(p.netSalary, p.currency)}`, status: p.status })),
    projects: projects.map((p) => ({ id: p.id, name: p.name, client: p.client?.name || p.status || 'Internal', progress: Math.min(100, Math.round(p.progress ?? 60)), meta: p.status })),
    taskStats: [
      { label: 'Pending Leave Requests', value: pendingLeaves, total: Math.max(pendingLeaves, 1), color: '#FF9B44' },
      { label: 'Draft Payrolls', value: pendingPayroll, total: Math.max(pendingPayroll, 1), color: '#6C4FD6' },
      { label: 'Open Requisitions', value: candidates.length, total: Math.max(candidates.length, 1), color: '#3A57C4' },
      { label: 'Active Projects', value: projects.length, total: Math.max(projects.length, 1), color: '#10B981' },
    ],
    schedules: leaveRows.filter((l) => l.status === 'approved' || l.status === 'pending').slice(0, 5).map((l) => ({
      id: l.id,
      title: `${empName(l.employee || {})} · ${l.leaveType?.name || 'Leave'}`,
      time: new Date(l.startDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      sub: 'Leave',
      tone: 'bg-[#6C4FD6]/10 text-[#6C4FD6]',
    })),
    activities: [],
    loading,
    birthdays: <BirthdaysCard />,
  };
  return <AdminTemplateBoard data={data} />;
}

/* ============== MAIN PAGE ============== */

/* Task 163 — ADMIN DASHBOARD (formerly "Home").
   Admin roles only: super_admin / tenant_admin / ceo / admin / hr_admin.
   Employees and other self-service roles are redirected straight to the
   Employee Dashboard (/dashboard) — they never see this page. */
export default function HomePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const userRole = (user?.role || '').toLowerCase();
  const isAdmin = ADMIN_DASHBOARD_ROLES.includes(userRole);

  useEffect(() => {
    if (user && !isAdmin) {
      router.replace(homeHrefForRole(userRole));
    }
  }, [user, isAdmin, userRole, router]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3A57C4] mx-auto mb-4" />
          <p className="text-sm text-slate-500">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto mb-4" />
          <p className="text-sm text-slate-500">Opening your dashboard…</p>
        </div>
      </div>
    );
  }

  if (userRole === 'super_admin') return <SuperAdminHome />;
  return <HRAdminHome />;
}
