'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { getLeaveCategory, normalizeLeaveBalances } from '@/lib/leave-balance-rules';
/* Task 147 — every admin role renders the EXACT SmartHR admin template
   pattern through AdminTemplateBoard (smarthr.co.in index.html layout). */
import AdminTemplateBoard, { type AdminTemplateData, type AdminStatTile } from '@/components/dashboard/admin-template';
import BirthdaysCard from '@/components/dashboard/BirthdaysCard';
import {
  FiUsers, FiUserCheck, FiUserPlus, FiCalendar, FiClock,
  FiDollarSign, FiFileText, FiHeadphones,
  FiBriefcase, FiPackage, FiShield, FiServer, FiActivity,
  FiCheckCircle, FiLayers, FiCreditCard, FiPercent, FiStar,
  FiAward, FiBell, FiGrid, FiBarChart2, FiTrendingUp,
} from 'react-icons/fi';

/* ---------- helpers ---------- */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const PALETTE = ['#3A57C4', '#6C4FD6', '#FF9B44', '#009EFB', '#10B981', '#FFC107', '#EC4899', '#14B8A6'];
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
function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
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
  const [stats, setStats] = useState({ totalEmployees: 0, totalUsers: 0, totalDepartments: 0, totalBranches: 0, auditCount: 0 });
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
      const [empData, deptData, logsData, branchData] = await Promise.all([
        safe('/api/employees?limit=300&includeStats=1'),
        safe('/api/departments?limit=1'),
        safe('/api/super-admin/audit-logs?limit=8'),
        safe('/api/branches?limit=1'),
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
    { label: 'Tenants', value: availableTenants.length, icon: <FiServer className="w-4 h-4" />, bg: 'bg-[#FF9B44]/15 text-[#FF9B44]', ring: 'ring-orange-200', href: '/super-admin' },
    { label: 'Audit Events', value: stats.auditCount, icon: <FiActivity className="w-4 h-4" />, bg: 'bg-rose-50 text-rose-600', ring: 'ring-rose-100', href: '/super-admin/audit-logs' },
    { label: 'Modules', value: 'All', icon: <FiGrid className="w-4 h-4" />, bg: 'bg-teal-50 text-teal-600', ring: 'ring-teal-100', href: '/modules' },
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

/* ══════════════ MANAGER ══════════════ */
function ManagerHome() {
  const { selectedCompanyId, hydrated, hydrate } = useCompanyContextStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ teamSize: 0, presentToday: 0, onLeave: 0, pendingApprovals: 0 });
  const [teamAttendance, setTeamAttendance] = useState<{ day: string; present: number; absent: number }[]>([]);
  const [teamMembers, setTeamMembers] = useState<EmpRow[]>([]);
  const [pendingLeaveRows, setPendingLeaveRows] = useState<{ id: string; employee?: { firstName: string; lastName: string }; leaveType?: { name: string }; startDate: string }[]>([]);

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
      const nowD = new Date();
      const todayStr = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
      const [empData, attData, pendingLeaveData, approvedLeaveData] = await Promise.all([
        safe(`/api/employees?limit=200&status=active${scopeQuery}`),
        safe(`/api/attendance?limit=300${scopeQuery}`),
        safe(`/api/leave?status=pending&limit=20${scopeQuery}`),
        safe(`/api/leave?status=approved&fromDate=${todayStr}&toDate=${todayStr}&limit=500${scopeQuery}`),
      ]);
      const rows: EmpRow[] = empData?.employees || empData?.data || [];
      const attRows = attData?.attendance || attData?.records || [];
      const todayRecords = attRows.filter((a: { date: string }) => (typeof a.date === 'string' ? a.date.split('T')[0] : '') === todayStr);
      const presentCount = todayRecords.filter((a: { status: string }) => ['present', 'late', 'half_day'].includes(a.status?.toLowerCase())).length;
      setStats({
        teamSize: empData?.pagination?.total || rows.length,
        presentToday: presentCount > 0 ? presentCount : todayRecords.filter((a: { status: string }) => a.status !== 'absent').length,
        onLeave: (approvedLeaveData?.leaveRequests || approvedLeaveData?.leaves || []).length,
        pendingApprovals: pendingLeaveData?.pagination?.total || 0,
      });
      setTeamMembers(rows.slice(0, 6));
      setPendingLeaveRows((pendingLeaveData?.leaveRequests || pendingLeaveData?.leaves || pendingLeaveData?.data || []).slice(0, 5));
      setTeamAttendance(Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dayRecords = attRows.filter((a: { date: string }) => new Date(a.date).toDateString() === d.toDateString());
        return {
          day: d.toLocaleDateString('en-US', { weekday: 'short' }),
          present: dayRecords.filter((a: { status: string }) => ['present', 'late'].includes(a.status)).length,
          absent: dayRecords.filter((a: { status: string }) => a.status === 'absent').length,
        };
      }));
      setLoading(false);
    })();
    return () => ac.abort();
  }, [hydrated, hydrate, scopeQuery]);

  const { deptDist, employeeStatus } = useMemo(() => deriveWorkforce(teamMembers), [teamMembers]);
  const weekPresent = teamAttendance.reduce((s, d) => s + d.present, 0);
  const weekAbsent = teamAttendance.reduce((s, d) => s + d.absent, 0);

  const data: AdminTemplateData = {
    todayChip,
    stats: [
      { label: 'Team Size', value: stats.teamSize, icon: <FiUsers className="w-4 h-4" />, bg: 'bg-[#3A57C4]/10 text-[#3A57C4]', ring: 'ring-[#3A57C4]/20', href: '/employees' },
      { label: 'Present Today', value: stats.presentToday, icon: <FiUserCheck className="w-4 h-4" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100', href: '/attendance' },
      { label: 'On Leave Today', value: stats.onLeave, icon: <FiCalendar className="w-4 h-4" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100', href: '/leave' },
      { label: 'Pending Approvals', value: stats.pendingApprovals, icon: <FiClock className="w-4 h-4" />, bg: 'bg-rose-50 text-rose-600', ring: 'ring-rose-100', href: '/leave' },
      { label: 'Present This Week', value: weekPresent, icon: <FiActivity className="w-4 h-4" />, bg: 'bg-teal-50 text-teal-600', ring: 'ring-teal-100', href: '/attendance' },
      { label: 'Absent This Week', value: weekAbsent, icon: <FiUsers className="w-4 h-4" />, bg: 'bg-[#6C4FD6]/10 text-[#6C4FD6]', ring: 'ring-[#6C4FD6]/20', href: '/attendance' },
      { label: 'Departments', value: deptDist.length, icon: <FiLayers className="w-4 h-4" />, bg: 'bg-sky-50 text-sky-600', ring: 'ring-sky-100', href: '/employees' },
      { label: 'Timesheets', value: 'Team', icon: <FiClock className="w-4 h-4" />, bg: 'bg-[#FF9B44]/15 text-[#FF9B44]', ring: 'ring-orange-200', href: '/timesheets' },
    ],
    deptDist,
    employeeStatus,
    attendanceTrend: teamAttendance.map((t) => ({ day: t.day, hours: t.present })),
    clock: null,
    applicants: [],
    employees: teamMembers.slice(0, 4).map((m) => ({ id: m.id, name: empName(m), sub: m.department?.name || 'Team', avatar: m.avatar || null })),
    todos: pendingLeaveRows.map((l) => ({ id: l.id, label: `${empName(l.employee || {})} — ${l.leaveType?.name || 'Leave'}`, sub: `From ${new Date(l.startDate).toLocaleDateString()}`, done: false })),
    sales: [],
    invoices: [],
    projects: [],
    taskStats: [],
    schedules: pendingLeaveRows.slice(0, 5).map((l) => ({
      id: l.id,
      title: `${empName(l.employee || {})} · ${l.leaveType?.name || 'Leave'}`,
      time: new Date(l.startDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      sub: 'Leave request',
      tone: 'bg-[#6C4FD6]/10 text-[#6C4FD6]',
    })),
    activities: [],
    loading,
    birthdays: <BirthdaysCard />,
  };
  return <AdminTemplateBoard data={data} />;
}

/* ══════════════ RECRUITER ══════════════ */
function RecruiterHome() {
  const { selectedCompanyId, hydrated, hydrate } = useCompanyContextStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ openPositions: 0, totalCandidates: 0, interviewsScheduled: 0 });
  const [recentCandidates, setRecentCandidates] = useState<{ id: string; name: string; position?: string; stage?: string; createdAt: string; avatar?: string | null }[]>([]);
  const [pipeline, setPipeline] = useState<{ stage: string; count: number }[]>([]);
  const [interviewRows, setInterviewRows] = useState<{ id: string; candidate?: { firstName?: string; lastName?: string } | null; candidateName?: string | null; scheduledAt?: string | null; interviewDate?: string | null }[]>([]);

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
      const [reqData, candData, interviewData] = await Promise.all([
        safe(`/api/requisitions?limit=1${scopeQuery}`),
        safe(`/api/candidates?limit=10${scopeQuery}`),
        safe(`/api/interviews?limit=6${scopeQuery}`),
      ]);
      setStats({
        openPositions: reqData?.pagination?.total || reqData?.total || 0,
        totalCandidates: candData?.pagination?.total || candData?.total || 0,
        interviewsScheduled: interviewData?.pagination?.total || interviewData?.total || 0,
      });
      const cands = candData?.candidates || candData?.data || [];
      setRecentCandidates(cands.slice(0, 5).map((c: { id: string; firstName?: string; lastName?: string; name?: string; position?: string; stage?: string; createdAt: string; avatar?: string | null }) => ({
        id: c.id,
        name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Candidate',
        position: c.position,
        stage: c.stage,
        createdAt: c.createdAt,
        avatar: c.avatar || null,
      })));
      const stages = ['Sourced', 'Screening', 'Interview', 'Offer', 'Hired'];
      const stageCounts: Record<string, number> = {};
      cands.forEach((c: { stage?: string }) => {
        const s = c.stage || 'Sourced';
        stageCounts[s] = (stageCounts[s] || 0) + 1;
      });
      setPipeline(stages.map((s) => ({ stage: s, count: stageCounts[s] || 0 })));
      setInterviewRows(interviewData?.interviews || interviewData?.data || []);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [hydrated, hydrate, scopeQuery]);

  const candTotal = Math.max(stats.totalCandidates, recentCandidates.length, 1);
  const stageColors = ['#3A57C4', '#6C4FD6', '#FF9B44', '#009EFB', '#10B981'];

  const data: AdminTemplateData = {
    todayChip,
    stats: [
      { label: 'Open Positions', value: stats.openPositions, icon: <FiBriefcase className="w-4 h-4" />, bg: 'bg-[#3A57C4]/10 text-[#3A57C4]', ring: 'ring-[#3A57C4]/20', href: '/requisitions' },
      { label: 'Candidates', value: stats.totalCandidates, icon: <FiUsers className="w-4 h-4" />, bg: 'bg-[#6C4FD6]/10 text-[#6C4FD6]', ring: 'ring-[#6C4FD6]/20', href: '/candidates' },
      { label: 'Interviews', value: stats.interviewsScheduled, icon: <FiCalendar className="w-4 h-4" />, bg: 'bg-orange-50 text-orange-600', ring: 'ring-orange-100', href: '/interviews' },
      { label: 'Offers Stage', value: pipeline.find((p) => p.stage === 'Offer')?.count || 0, icon: <FiFileText className="w-4 h-4" />, bg: 'bg-sky-50 text-sky-600', ring: 'ring-sky-100', href: '/offers' },
      { label: 'Sourced', value: pipeline[0]?.count || 0, icon: <FiUsers className="w-4 h-4" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100', href: '/candidates' },
      { label: 'Screening', value: pipeline[1]?.count || 0, icon: <FiUserCheck className="w-4 h-4" />, bg: 'bg-[#FF9B44]/15 text-[#FF9B44]', ring: 'ring-orange-200', href: '/candidates' },
      { label: 'Hired', value: pipeline[4]?.count || 0, icon: <FiAward className="w-4 h-4" />, bg: 'bg-teal-50 text-teal-600', ring: 'ring-teal-100', href: '/onboarding' },
      { label: 'Job Portal', value: 'Live', icon: <FiGrid className="w-4 h-4" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100', href: '/job-portal' },
    ],
    deptDist: [],
    employeeStatus: pipeline.map((p, i) => ({ label: p.stage, count: p.count, color: stageColors[i % stageColors.length] })),
    attendanceTrend: [],
    clock: null,
    applicants: recentCandidates.map((c) => ({ id: c.id, name: c.name, role: c.position || 'General', sub: c.stage || 'Sourced', avatar: c.avatar || null })),
    employees: [],
    todos: [],
    sales: [],
    invoices: [],
    projects: [],
    taskStats: pipeline.map((p, i) => ({ label: p.stage, value: p.count, total: candTotal, color: stageColors[i % stageColors.length] })),
    schedules: interviewRows.slice(0, 5).map((iv) => ({
      id: iv.id,
      title: `Interview · ${iv.candidateName || (iv.candidate ? `${iv.candidate.firstName || ''} ${iv.candidate.lastName || ''}`.trim() : 'Candidate')}`,
      time: iv.scheduledAt || iv.interviewDate ? new Date((iv.scheduledAt || iv.interviewDate) as string).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'TBD',
      sub: 'Interview',
      tone: 'bg-[#FF9B44]/15 text-[#FF9B44]',
    })),
    activities: [],
    loading,
    birthdays: <BirthdaysCard />,
  };
  return <AdminTemplateBoard data={data} />;
}

/* ══════════════ FINANCE ══════════════ */
function FinanceHome() {
  const { selectedCompanyId, hydrated, hydrate } = useCompanyContextStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pendingPayroll: 0, pendingExpenses: 0, totalDisbursed: 0, paidCount: 0, cycleTotal: 0 });
  const [recentPayrolls, setRecentPayrolls] = useState<{ id: string; month: number; year: number; netSalary: number; status: string }[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<{ id: string; title: string; amount: number; employee?: { firstName: string; lastName: string }; status: string }[]>([]);

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
      const [payrollData, expData] = await Promise.all([
        safe(`/api/payroll?limit=12${scopeQuery}`),
        safe(`/api/expenses?status=pending&limit=10${scopeQuery}`),
      ]);
      const payrolls = payrollData?.payrolls || payrollData?.data || [];
      setStats({
        pendingPayroll: payrollData?.pagination?.total || payrolls.length || 0,
        pendingExpenses: expData?.pagination?.total || 0,
        totalDisbursed: payrolls.filter((p: { status: string }) => p.status === 'paid').reduce((s: number, p: { netSalary: number }) => s + (p.netSalary || 0), 0),
        paidCount: payrolls.filter((p: { status: string }) => p.status === 'paid').length,
        cycleTotal: payrolls.reduce((s: number, p: { netSalary: number }) => s + (p.netSalary || 0), 0),
      });
      setRecentPayrolls(payrolls.slice(0, 6));
      setPendingExpenses((expData?.expenses || expData?.data || []).slice(0, 5));
      setLoading(false);
    })();
    return () => ac.abort();
  }, [hydrated, hydrate, scopeQuery]);

  const fmtMoney = (n: number) => {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0); }
    catch { return `₹${(n || 0).toLocaleString('en-IN')}`; }
  };
  const monthLabel = (m: number, y: number) => new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const data: AdminTemplateData = {
    todayChip,
    stats: [
      { label: 'Payroll Cycles', value: stats.pendingPayroll, icon: <FiDollarSign className="w-4 h-4" />, bg: 'bg-[#6C4FD6]/10 text-[#6C4FD6]', ring: 'ring-[#6C4FD6]/20', href: '/payroll/processing' },
      { label: 'Pending Expenses', value: stats.pendingExpenses, icon: <FiCreditCard className="w-4 h-4" />, bg: 'bg-orange-50 text-orange-600', ring: 'ring-orange-100', href: '/expenses' },
      { label: 'Total Disbursed', value: fmtMoney(stats.totalDisbursed), icon: <FiTrendingUp className="w-4 h-4" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100', href: '/payroll' },
      { label: 'Paid Runs', value: stats.paidCount, icon: <FiCheckCircle className="w-4 h-4" />, bg: 'bg-sky-50 text-sky-600', ring: 'ring-sky-100', href: '/payroll' },
      { label: 'Cycle Value', value: fmtMoney(stats.cycleTotal), icon: <FiDollarSign className="w-4 h-4" />, bg: 'bg-[#3A57C4]/10 text-[#3A57C4]', ring: 'ring-[#3A57C4]/20', href: '/payroll' },
      { label: 'Tax Setup', value: 'India', icon: <FiPercent className="w-4 h-4" />, bg: 'bg-teal-50 text-teal-600', ring: 'ring-teal-100', href: '/payroll/income-tax' },
      { label: 'Salary Structures', value: 'CTC', icon: <FiLayers className="w-4 h-4" />, bg: 'bg-[#FF9B44]/15 text-[#FF9B44]', ring: 'ring-orange-200', href: '/payroll/ctc-templates' },
      { label: 'Reports', value: 'View', icon: <FiBarChart2 className="w-4 h-4" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100', href: '/reports' },
    ],
    deptDist: [],
    employeeStatus: [],
    attendanceTrend: [],
    clock: null,
    applicants: [],
    employees: [],
    todos: pendingExpenses.map((e) => ({ id: e.id, label: e.title, sub: `${e.employee ? `${e.employee.firstName} ${e.employee.lastName} · ` : ''}${fmtMoney(e.amount)}`, done: false })),
    sales: recentPayrolls.slice().sort((a, b) => a.year - b.year || a.month - b.month).map((p) => ({ month: monthLabel(p.month, p.year).split(' ')[0], amount: p.netSalary || 0 })),
    invoices: recentPayrolls.map((p) => ({ id: p.id, label: monthLabel(p.month, p.year), sub: `Net ${fmtMoney(p.netSalary)}`, status: p.status })),
    projects: [],
    taskStats: [
      { label: 'Pending Expenses', value: stats.pendingExpenses, total: Math.max(stats.pendingExpenses, 1), color: '#FF9B44' },
      { label: 'Paid Runs', value: stats.paidCount, total: Math.max(recentPayrolls.length, 1), color: '#10B981' },
    ],
    schedules: [],
    activities: [],
    loading,
    birthdays: <BirthdaysCard />,
  };
  return <AdminTemplateBoard data={data} />;
}

/* ══════════════ IT ADMIN ══════════════ */
function ITAdminHome() {
  const { selectedCompanyId, hydrated, hydrate } = useCompanyContextStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalAssets: 0, assignedAssets: 0, openTickets: 0, resolvedTickets: 0, maintenanceAssets: 0, highPriority: 0 });
  const [recentTickets, setRecentTickets] = useState<{ id: string; ticketId: string; subject: string; status: string; priority: string; createdAt: string }[]>([]);

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
      const [assetData, ticketData] = await Promise.all([
        safe(`/api/assets?limit=200${scopeQuery}`),
        safe(`/api/tickets?limit=10${scopeQuery}`),
      ]);
      const assets = assetData?.assets || assetData?.data || [];
      const tickets = ticketData?.tickets || ticketData?.data || [];
      setStats({
        totalAssets: assetData?.pagination?.total || assets.length || 0,
        assignedAssets: assets.filter((a: { status: string }) => a.status === 'assigned').length,
        openTickets: tickets.filter((t: { status: string }) => ['open', 'in_progress'].includes(t.status)).length,
        resolvedTickets: tickets.filter((t: { status: string }) => ['resolved', 'closed'].includes(t.status)).length,
        maintenanceAssets: assets.filter((a: { status: string }) => ['maintenance', 'repair'].includes((a.status || '').toLowerCase())).length,
        highPriority: tickets.filter((t: { priority: string }) => ['high', 'urgent'].includes((t.priority || '').toLowerCase())).length,
      });
      setRecentTickets(tickets.slice(0, 6));
      setLoading(false);
    })();
    return () => ac.abort();
  }, [hydrated, hydrate, scopeQuery]);

  const data: AdminTemplateData = {
    todayChip,
    stats: [
      { label: 'Total Assets', value: stats.totalAssets, icon: <FiPackage className="w-4 h-4" />, bg: 'bg-[#3A57C4]/10 text-[#3A57C4]', ring: 'ring-[#3A57C4]/20', href: '/assets' },
      { label: 'Assigned Assets', value: stats.assignedAssets, icon: <FiServer className="w-4 h-4" />, bg: 'bg-green-50 text-green-600', ring: 'ring-green-100', href: '/assets' },
      { label: 'In Maintenance', value: stats.maintenanceAssets, icon: <FiServer className="w-4 h-4" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100', href: '/assets' },
      { label: 'Open Tickets', value: stats.openTickets, icon: <FiHeadphones className="w-4 h-4" />, bg: 'bg-orange-50 text-orange-600', ring: 'ring-orange-100', href: '/helpdesk' },
      { label: 'Resolved Tickets', value: stats.resolvedTickets, icon: <FiCheckCircle className="w-4 h-4" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100', href: '/helpdesk' },
      { label: 'High Priority', value: stats.highPriority, icon: <FiShield className="w-4 h-4" />, bg: 'bg-rose-50 text-rose-600', ring: 'ring-rose-100', href: '/helpdesk' },
      { label: 'Access Mgmt', value: 'RBAC', icon: <FiShield className="w-4 h-4" />, bg: 'bg-teal-50 text-teal-600', ring: 'ring-teal-100', href: '/tenant-admin/rbac' },
      { label: 'Audit Logs', value: 'View', icon: <FiActivity className="w-4 h-4" />, bg: 'bg-[#6C4FD6]/10 text-[#6C4FD6]', ring: 'ring-[#6C4FD6]/20', href: '/super-admin/audit-logs' },
    ],
    deptDist: [],
    employeeStatus: [
      { label: 'Assigned', count: stats.assignedAssets, color: '#10B981' },
      { label: 'In Maintenance', count: stats.maintenanceAssets, color: '#FF9B44' },
      { label: 'Available', count: Math.max(0, stats.totalAssets - stats.assignedAssets - stats.maintenanceAssets), color: '#3A57C4' },
    ],
    attendanceTrend: [],
    clock: null,
    applicants: [],
    employees: [],
    todos: recentTickets.filter((t) => ['open', 'in_progress'].includes(t.status)).slice(0, 5).map((t) => ({
      id: t.id,
      label: `#${t.ticketId} ${t.subject}`,
      sub: `${t.priority} priority · ${new Date(t.createdAt).toLocaleDateString()}`,
      done: false,
    })),
    sales: [],
    invoices: recentTickets.slice(0, 5).map((t) => ({ id: t.id, label: `#${t.ticketId} ${t.subject}`, sub: new Date(t.createdAt).toLocaleString(), status: t.status })),
    projects: [],
    taskStats: [
      { label: 'Open Tickets', value: stats.openTickets, total: Math.max(stats.openTickets + stats.resolvedTickets, 1), color: '#FF9B44' },
      { label: 'Resolved Tickets', value: stats.resolvedTickets, total: Math.max(stats.openTickets + stats.resolvedTickets, 1), color: '#10B981' },
    ],
    schedules: [],
    activities: recentTickets.slice(0, 5).map((t) => ({ id: t.id, title: `#${t.ticketId} ${t.subject}`, sub: `Priority: ${t.priority}`, time: new Date(t.createdAt).toLocaleString() })),
    loading,
    birthdays: <BirthdaysCard />,
  };
  return <AdminTemplateBoard data={data} />;
}

/* ══════════════ EMPLOYEE (DEFAULT / FALLBACK on /home) ══════════════ */
function EmployeeHome() {
  const { selectedCompanyId, effectiveCompanyId, effectiveCompanyLabel, hydrated, hydrate } = useCompanyContextStore();
  const [loading, setLoading] = useState(true);
  const [leaveBalances, setLeaveBalances] = useState<import('@/lib/leave-balance-rules').LeaveBalanceLike[]>([]);
  const [isProbation, setIsProbation] = useState(false);
  const [attendanceRate, setAttendanceRate] = useState<number | null>(null);
  const [attendanceSub, setAttendanceSub] = useState('This month');
  const [openTickets, setOpenTickets] = useState(0);
  const [latestPayslips, setLatestPayslips] = useState<{ id: string; month: number; year: number; netSalary: number; status: string }[]>([]);
  const [latestTimesheets, setLatestTimesheets] = useState<{ id: string; date: string; hours: number; project?: { name: string }; projectTask?: { name: string }; status: string }[]>([]);
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; date: string; type: string }[]>([]);
  const [policySummary, setPolicySummary] = useState({ total: 0, pending: 0, acknowledged: 0 });

  const scopeQuery = useMemo(() => {
    const cid = effectiveCompanyId();
    return cid ? `&companyId=${encodeURIComponent(cid)}` : '';
  }, [selectedCompanyId, effectiveCompanyId]);
  const companyName = effectiveCompanyLabel();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const headers = getAuthHeaders();
    const safe = async (url: string) => {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };
    const [leaveData, summaryData, ticketData, payslipData, timesheetData, policyData, announcementData] = await Promise.all([
      safe(`/api/leave/balance?limit=50${scopeQuery}`),
      safe(`/api/attendance/my-summary${scopeQuery ? '?' + scopeQuery.slice(1) : ''}`),
      safe(`/api/tickets?limit=10${scopeQuery}`),
      safe(`/api/payroll/payslips?limit=5${scopeQuery}`),
      safe(`/api/timesheets?limit=5${scopeQuery}`),
      safe('/api/policies/handbook?summary=1'),
      safe(`/api/announcements?limit=5${scopeQuery}`),
    ]);

    const balances = leaveData?.balances || leaveData?.data?.balances || [];
    const probation = Boolean(leaveData?.probation || leaveData?.data?.probation);
    const gender = leaveData?.gender || leaveData?.data?.gender;
    setIsProbation(probation);
    if (balances.length > 0) {
      const normalized = normalizeLeaveBalances(balances, { gender, probation });
      if (probation && !normalized.some((balance) => getLeaveCategory(balance.leaveType) === 'personal')) {
        normalized.push({ id: 'synthetic-personal-leave', leaveType: { name: 'Personal Leave', code: 'PL' }, remaining: 0, total: 0, used: 0 });
      }
      setLeaveBalances(normalized);
    } else {
      setLeaveBalances(probation ? [{ id: 'synthetic-personal-leave', leaveType: { name: 'Personal Leave', code: 'PL' }, remaining: 0, total: 0, used: 0 }] : []);
    }

    if (summaryData && typeof summaryData === 'object' && 'month' in summaryData) {
      const rate = typeof summaryData.attendanceRate === 'number' ? summaryData.attendanceRate : null;
      const wd = typeof summaryData.workingDays === 'number' ? summaryData.workingDays : 0;
      setAttendanceRate(rate);
      setAttendanceSub(rate === null ? (wd === 0 ? 'No working days yet' : 'This month') : `This month · ${wd} day${wd === 1 ? '' : 's'}`);
    } else {
      setAttendanceRate(null);
      setAttendanceSub('This month');
    }

    if (ticketData?.tickets || ticketData?.data) {
      const tickets = ticketData.tickets || ticketData.data || [];
      setOpenTickets(tickets.filter((t: { status: string }) => ['open', 'in_progress'].includes(t.status)).length);
    }

    setLatestPayslips((payslipData?.data || payslipData?.payrolls || []).slice(0, 5));
    setLatestTimesheets((timesheetData?.timesheets || timesheetData?.data || []).slice(0, 5));

    if (policyData?.summary) setPolicySummary(policyData.summary);
    else setPolicySummary({ total: 0, pending: 0, acknowledged: 0 });

    const apiAnnouncements = announcementData?.announcements || announcementData?.data || [];
    if (apiAnnouncements.length > 0) {
      setAnnouncements(apiAnnouncements.map((a: { id?: string; title: string; createdAt: string; type?: string }, i: number) => ({
        id: a.id || `ann-${i}`,
        title: a.title,
        date: new Date(a.createdAt).toLocaleDateString(),
        type: a.type || 'info',
      })));
    }
    setLoading(false);
  }, [scopeQuery]);

  useEffect(() => {
    if (hydrated) fetchData();
  }, [fetchData, hydrated]);
  useEffect(() => { hydrate(); }, [hydrate]);

  const totalRemaining = leaveBalances.reduce((s, b) => s + (b.remaining || 0), 0);
  const totalUsed = leaveBalances.reduce((s, b) => s + (b.used || 0), 0);
  const monthLabel = (m: number, y: number) => new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const data: AdminTemplateData = {
    todayChip,
    stats: [
      { label: 'Attendance Rate', value: attendanceRate === null ? '—' : `${attendanceRate}%`, icon: <FiActivity className="w-4 h-4" />, bg: 'bg-[#3A57C4]/10 text-[#3A57C4]', ring: 'ring-[#3A57C4]/20', href: '/attendance' },
      { label: 'Leave Balance', value: totalRemaining, icon: <FiCalendar className="w-4 h-4" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100', href: '/leave' },
      { label: 'Open Tickets', value: openTickets, icon: <FiHeadphones className="w-4 h-4" />, bg: 'bg-[#6C4FD6]/10 text-[#6C4FD6]', ring: 'ring-[#6C4FD6]/20', href: '/helpdesk' },
      { label: 'My Payslips', value: latestPayslips.length, icon: <FiFileText className="w-4 h-4" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100', href: '/payroll' },
      { label: 'Timesheet Entries', value: latestTimesheets.length, icon: <FiClock className="w-4 h-4" />, bg: 'bg-sky-50 text-sky-600', ring: 'ring-sky-100', href: '/timesheets' },
      { label: 'Pending Policies', value: policySummary.pending, icon: <FiFileText className="w-4 h-4" />, bg: 'bg-orange-50 text-orange-600', ring: 'ring-orange-100', href: '/policies-handbook' },
      { label: 'Announcements', value: announcements.length, icon: <FiBell className="w-4 h-4" />, bg: 'bg-rose-50 text-rose-600', ring: 'ring-rose-100', href: '/social-feed' },
      { label: 'Full ESS', value: 'Open', icon: <FiGrid className="w-4 h-4" />, bg: 'bg-[#FF9B44]/15 text-[#FF9B44]', ring: 'ring-orange-200', href: '/dashboard' },
    ],
    deptDist: [],
    employeeStatus: [
      { label: 'Leave Used', count: totalUsed, color: '#FF9B44' },
      { label: 'Leave Remaining', count: totalRemaining, color: '#10B981' },
    ],
    attendanceTrend: [],
    clock: null,
    applicants: [],
    employees: [],
    todos: policySummary.pending > 0
      ? [{ id: 'policy-ack', label: `Acknowledge ${policySummary.pending} polic${policySummary.pending > 1 ? 'ies' : 'y'}`, sub: 'Policies & Handbook', done: false }]
      : [],
    sales: [],
    invoices: latestPayslips.map((p) => ({ id: p.id, label: monthLabel(p.month, p.year), sub: `Net ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.netSalary || 0)}`, status: p.status })),
    projects: latestTimesheets.slice(0, 4).map((t) => ({
      id: t.id,
      name: t.project?.name || t.projectTask?.name || 'General',
      client: `${new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${t.hours}h`,
      progress: Math.min(100, Math.round((t.hours / 9) * 100)),
      meta: t.status,
    })),
    taskStats: leaveBalances.slice(0, 4).map((b, i) => ({ label: b.leaveType?.name || 'Leave', value: b.used || 0, total: Math.max(b.total || 0, 1), color: PALETTE[i % PALETTE.length] })),
    schedules: announcements.slice(0, 5).map((a) => ({
      id: a.id,
      title: a.title,
      time: a.date,
      sub: 'Announcement',
      tone: a.type === 'holiday' ? 'bg-emerald-50 text-emerald-600' : 'bg-teal-50 text-teal-600',
    })),
    activities: [],
    loading,
    birthdays: <BirthdaysCard />,
  };

  return <AdminTemplateBoard data={data} />;
}

/* ============== MAIN PAGE ============== */

export default function HomePage() {
  const { user } = useAuthStore();
  const userRole = (user?.role || 'employee').toLowerCase();

  if (userRole === 'super_admin') return <SuperAdminHome />;
  if (['tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(userRole)) return <HRAdminHome />;
  if (userRole === 'manager') return <ManagerHome />;
  if (userRole === 'recruiter') return <RecruiterHome />;
  if (userRole === 'finance_admin') return <FinanceHome />;
  if (userRole === 'it_admin') return <ITAdminHome />;
  return <EmployeeHome />;
}
