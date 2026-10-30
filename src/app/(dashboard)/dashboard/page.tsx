'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiCalendar, FiClock, FiFileText, FiHeadphones, FiUser, FiUsers,
  FiDollarSign, FiBookOpen, FiTrendingUp, FiCheckCircle,
  FiPlus, FiDownload,
  FiActivity, FiAward, FiBriefcase, FiFolder,
  FiSend, FiMessageCircle, FiZap, FiHeart,
  FiArrowRight, FiInfo, FiRefreshCw, FiVolume2, FiBell, FiPhone, FiLogIn, FiLogOut,
} from 'react-icons/fi';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadialBarChart, RadialBar,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import BirthdaysCard from '@/components/dashboard/BirthdaysCard';
import SocialFeedSection from '@/components/dashboard/SocialFeedSection';
/* Task 145/147 — shared SmartHR widgets. Task 147: exact template pattern
   (breadcrumbs + alert + profile hero + attendance overview rows). */
import {
  PageBreadcrumbs, DateChip, CollapseToggle, TemplateAlert, ProfileHeroCard,
  Panel, EmptyState, statusBadge, SkeletonBlock,
} from '@/components/dashboard/smarthr-widgets';
import { dashboardHrefForRole, ADMIN_DASHBOARD_ROLES } from '@/lib/roleAccess';
import { normalizeLeaveBalances } from '@/lib/leave-balance-rules';
import { loggedInPhotoUrl } from '@/lib/profile-photo';

/* ---------- helpers ---------- */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const LEAVE_COLORS = ['#3A57C4', '#6C4FD6', '#FF9B44', '#009EFB', '#10B981', '#FFC107'];

/* ---------- types ---------- */

interface LeaveBalanceItem {
  id: string;
  leaveTypeId: string;
  leaveType: { id: string; name: string; code: string };
  year: number;
  total: number;
  used: number;
  remaining: number;
  carryForward: number;
}

interface AttendanceRow {
  id?: string;
  date: string;
  status: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workHours?: number | null;
}

/* Task 141 — announcements banner source (pinned/announcement social feeds) */
interface AnnouncementItem {
  id: string;
  content: string;
  postType: string;
  isPinned: boolean;
  createdAt: string;
  likesCount?: number;
  commentsCount?: number;
  author?: { firstName?: string; lastName?: string; avatar?: string | null } | null;
}

interface PerformanceRow {
  id: string;
  reviewCycle: string;
  rating: number;
  overallRating?: number;
  status: string;
  reviewDate?: string | null;
  reviewer?: { firstName: string; lastName: string } | null;
}

interface GoalRow {
  id: string;
  title: string;
  progress: number;
  status: string;
  priority: string;
  endDate?: string | null;
}

interface TrainingEnrollmentRow {
  id: string;
  status: string;
  score?: number | null;
  training: { id: string; title: string; startDate?: string | null; endDate?: string | null };
}

interface TimesheetRow {
  id: string;
  date: string;
  project?: string | { id: string; name: string; code?: string; currency?: string; billingType?: string } | null;
  task?: string | null;
  hours: number;
  status: string;
}

interface RegularizationRow {
  id: string;
  date: string;
  punchType: string;
  reason: string;
  status: string;
}

interface LeaveRequestRow {
  id: string;
  startDate: string;
  endDate?: string | null;
  status: string;
  leaveType?: { name?: string } | null;
}

interface TeamMemberRow {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  designation?: { title?: string } | null;
  department?: { name?: string } | null;
}

interface ProfileExtra {
  phone?: string | null;
  dateOfJoining?: string | null;
  reportingManager?: { firstName?: string; lastName?: string } | null;
  branch?: { name?: string } | null;
  /* Task 149 — unified detail set (same as Employee List → View Details) */
  employeeCode?: string | null;
  totalExperience?: string | null;
  departmentName?: string | null;
  designationTitle?: string | null;
}

/* ---------- main component ---------- */

export default function ESSDashboardPage() {
  const router = useRouter();
  const { user, fetchUser } = useAuthStore();
  const { effectiveCompanyLabel, effectiveCompanyId, hydrated, hydrate } = useCompanyContextStore();
  const notifications = useNotificationStore((s) => s.notifications);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const companyName = effectiveCompanyLabel();

  const firstName = user?.name?.split(' ')[0] || 'there';
  const userRole = user?.role || 'employee';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const todayChip = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  useEffect(() => {
    if (userRole === 'super_admin') {
      router.replace(dashboardHrefForRole(userRole));
    }
  }, [userRole, router]);

  /* ----- state ----- */
  const [loading, setLoading] = useState(true);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalanceItem[]>([]);
  const [isProbation, setIsProbation] = useState(false);
  const [leaveSummary, setLeaveSummary] = useState({ total: 0, used: 0, remaining: 0 });
  const [attendanceRate, setAttendanceRate] = useState<number | null>(null);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [payslips, setPayslips] = useState<{ id: string; month: number; year: number; netSalary: number; status: string; currency?: string }[]>([]);
  const [performance, setPerformance] = useState<PerformanceRow | null>(null);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [training, setTraining] = useState<TrainingEnrollmentRow[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetRow[]>([]);
  const [regularizations, setRegularizations] = useState<RegularizationRow[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [profileExtra, setProfileExtra] = useState<ProfileExtra | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [contentCollapsed, setContentCollapsed] = useState(false);

  /* ----- fetch all ESS data (Task 147: template-mapped) ----- */
  const fetchESS = useCallback(async () => {
    if (userRole === 'super_admin') {
      setLoading(false);
      return;
    }
    setLoading(true);
    const headers = getAuthHeaders();
    const cid = effectiveCompanyId();
    const scopeQuery = cid ? `companyId=${cid}&` : '';

    const safe = async (url: string) => {
      try {
        const res = await fetch(url, { headers, cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    };

    const [leaveData, attData, payslipData, perfData, goalsData, trainData, tsData, regData, summaryData, feedData, leaveListData, teamData] =
      await Promise.all([
        safe(`/api/leave/balance?${scopeQuery}limit=50`),
        safe(`/api/attendance?${scopeQuery}limit=100`),
        safe(`/api/payroll/payslips?${scopeQuery}limit=5`),
        safe(`/api/performance?${scopeQuery}limit=1`),
        safe(`/api/goals?${scopeQuery}limit=5`),
        safe(`/api/training?${scopeQuery}limit=10`),
        safe(`/api/timesheets?${scopeQuery}limit=8`),
        safe(`/api/attendance/regularize?${scopeQuery}limit=6`),
        safe(`/api/attendance/my-summary?${scopeQuery}`),
        safe(`/api/social-feed?${scopeQuery}limit=10`),
        // BUG_028 FIX: Fetch only the employee's OWN leave requests (view=self)
        // so the Leave Summary card shows correct Days Used + Pending counts.
        safe(`/api/leave?view=self&${scopeQuery}limit=6`),
        safe(`/api/employees?limit=5&excludeInactive=true${cid ? `&${scopeQuery.slice(0, -1)}` : ''}`),
      ]);

    /* profile extras — phone, joined-on, report office.
       Task 151 FIX: `user.employee` is only populated by /api/auth/me and is
       often null right after login (login response doesn't include it), which
       left the hero card rows (Employee ID / Phone / Dept / Designation /
       Report Office / Joined on / Experience) permanently empty. Fall back to
       /api/auth/me to resolve the employee id before fetching details. */
    let empId = user?.employee?.id || null;
    if (!empId) {
      const me = await safe('/api/auth/me');
      empId = me?.employee?.id || null;
      if (me?.employee?.id) {
        // Backfill the auth store so other widgets also see user.employee.
        void fetchUser();
      }
    }
    if (empId) {
      const prof = await safe(`/api/employees/${empId}`);
      const p = prof?.employee || prof;
      if (p && (p.phone || p.dateOfJoining || p.reportingManager || p.employeeId || p.department || p.designation)) {
        setProfileExtra({
          phone: p.phone,
          dateOfJoining: p.dateOfJoining,
          reportingManager: p.reportingManager,
          branch: p.branch,
          employeeCode: p.employeeId,
          totalExperience: p.totalExperience,
          departmentName: p.department?.name || null,
          designationTitle: p.designation?.title || null,
        });
      }
    }

    /* announcements (template alert banner) */
    if (feedData?.posts && Array.isArray(feedData.posts)) {
      const important = (feedData.posts as AnnouncementItem[]).filter(
        (p) => p && (p.isPinned || p.postType === 'announcement')
      );
      setAnnouncements(important.slice(0, 5));
    }

    /* leave balance */
    if (leaveData?.balances) {
      const probation = Boolean(leaveData.probation);
      const balances = normalizeLeaveBalances(leaveData.balances as LeaveBalanceItem[], {
        gender: leaveData.gender,
        probation,
      });
      setLeaveBalances(balances);
      setIsProbation(probation);
      const sum = balances.reduce(
        (acc: { total: number; used: number; remaining: number }, b) => {
          acc.total += b.total || 0;
          acc.used += b.used || 0;
          acc.remaining += b.remaining || 0;
          return acc;
        },
        { total: 0, used: 0, remaining: 0 }
      );
      setLeaveSummary(sum);
    } else if (leaveData?.summary) {
      const probation = Boolean(leaveData.probation);
      setIsProbation(probation);
      setLeaveSummary(probation ? { total: 0, used: 0, remaining: 0 } : leaveData.summary);
    }

    /* attendance — current month for accurate metrics */
    if (attData?.attendance || attData?.records) {
      const allRows: AttendanceRow[] = attData.attendance || attData.records || [];
      const now = new Date();
      const rows = allRows.filter((a) => {
        const d = new Date(a.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      setAttendanceRows(rows.length > 0 ? rows : allRows.slice(0, 30));
    }
    setAttendanceRate(typeof summaryData?.attendanceRate === 'number' ? summaryData.attendanceRate : null);

    /* payslips */
    if (payslipData?.payslips || payslipData?.data) {
      setPayslips((payslipData.payslips || payslipData.data).slice(0, 5));
    }

    /* performance */
    const perfRows = perfData?.reviews || perfData?.data || [];
    if (Array.isArray(perfRows) && perfRows.length > 0) {
      setPerformance(perfRows[0]);
    }

    /* goals */
    if (goalsData?.goals || goalsData?.data) {
      setGoals((goalsData.goals || goalsData.data).slice(0, 5));
    }

    /* training enrollments */
    if (Array.isArray(trainData?.trainings)) {
      const upcoming = trainData.trainings
        .filter((t: { status: string }) => ['upcoming', 'ongoing'].includes(t.status))
        .slice(0, 5)
        .map((t: { id: string; status: string; title: string; startDate?: string | null; endDate?: string | null }) => ({
          id: t.id,
          status: t.status,
          score: null,
          training: { id: t.id, title: t.title, startDate: t.startDate, endDate: t.endDate },
        }));
      setTraining(upcoming);
    }

    /* timesheets */
    if (tsData?.timesheets || tsData?.data) {
      setTimesheets((tsData.timesheets || tsData.data).slice(0, 8));
    }

    /* regularizations */
    if (regData?.regularizations) {
      setRegularizations((regData.regularizations as RegularizationRow[]).slice(0, 5));
    }

    /* leave requests (schedule feed) */
    if (leaveListData?.leaveRequests || leaveListData?.leaves || leaveListData?.data) {
      setLeaveRequests((leaveListData.leaveRequests || leaveListData.leaves || leaveListData.data).slice(0, 5));
    }

    /* team members (may be forbidden for pure ESS — safe) */
    if (teamData?.employees || teamData?.data) {
      setTeamMembers((teamData.employees || teamData.data).slice(0, 4));
    }

    setLoading(false);
  }, [userRole, effectiveCompanyId, user?.employee?.id, fetchUser]);

  useEffect(() => {
    fetchESS();
  }, [fetchESS]);

  /* auto-rotate announcements every 6s */
  useEffect(() => {
    if (announcements.length <= 1) return;
    const t = setInterval(() => setBannerIndex((i) => (i + 1) % announcements.length), 6000);
    return () => clearInterval(t);
  }, [announcements.length]);

  /* ----- derived (template metrics) ----- */

  const leaveChartData = useMemo(() => {
    if (leaveBalances.length === 0) return [];
    return leaveBalances.map((b, i) => ({
      name: b.leaveType?.name || 'Leave',
      remaining: b.remaining || 0,
      used: b.used || 0,
      color: LEAVE_COLORS[i % LEAVE_COLORS.length],
    }));
  }, [leaveBalances]);

  /* Leave summary extras — pending requests + next approved time off.
     These rows fill the Leave Summary card so its height lines up with the
     profile hero card and the Leave Details chart beside it. */
  const pendingLeaveCount = useMemo(
    () => leaveRequests.filter((l) => l.status === 'pending').length,
    [leaveRequests]
  );
  const nextApprovedLeave = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return (
      leaveRequests
        .filter((l) => l.status === 'approved' && new Date(l.startDate) >= startOfToday)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0] || null
    );
  }, [leaveRequests]);

  /* attendance punch metrics — today / week / month / overtime */
  const attMetrics = useMemo(() => {
    const toHours = (a: AttendanceRow) => {
      if (a.workHours != null && !Number.isNaN(Number(a.workHours))) return Number(a.workHours);
      if (a.checkIn && a.checkOut) {
        const h = (new Date(a.checkOut).getTime() - new Date(a.checkIn).getTime()) / 3600000;
        return h > 0 ? Math.round(h * 100) / 100 : 0;
      }
      return 0;
    };
    const fmtTime = (v?: string | null) => (v ? new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null);
    const todayStr = new Date().toDateString();
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const todayRows = attendanceRows.filter((a) => new Date(a.date).toDateString() === todayStr);
    const weekRows = attendanceRows.filter((a) => new Date(a.date) >= weekAgo);
    const monthHours = attendanceRows.reduce((s, a) => s + toHours(a), 0);
    const overtime = attendanceRows.reduce((s, a) => s + Math.max(0, toHours(a) - 9), 0);
    return {
      todayHours: Math.round(todayRows.reduce((s, a) => s + toHours(a), 0) * 10) / 10,
      todayTarget: 9,
      weekHours: Math.round(weekRows.reduce((s, a) => s + toHours(a), 0) * 10) / 10,
      weekTarget: 45,
      monthHours: Math.round(monthHours * 10) / 10,
      overtime: Math.round(overtime * 10) / 10,
      checkIn: fmtTime(todayRows[0]?.checkIn || attendanceRows[attendanceRows.length - 1]?.checkIn),
      checkOut: fmtTime(todayRows[0]?.checkOut || attendanceRows[attendanceRows.length - 1]?.checkOut),
      nowClock: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      todayLabel: new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    };
  }, [attendanceRows]);

  const attendanceTrend = useMemo(() => {
    return [...attendanceRows]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7)
      .map((a) => {
        const d = new Date(a.date);
        return {
          day: d.toLocaleDateString('en-US', { weekday: 'short' }),
          hours: Math.round((a.workHours || 0) * 10) / 10,
          status: a.status,
        };
      });
  }, [attendanceRows]);

  /* projects from timesheets (template Projects panel) */
  const projects = useMemo(() => {
    const map: Record<string, { name: string; hours: number; tasks: number }> = {};
    timesheets.forEach((t) => {
      const name = (typeof t.project === 'object' && t.project ? t.project.name : t.project) || t.task || 'General';
      if (!map[name]) map[name] = { name, hours: 0, tasks: 0 };
      map[name].hours += t.hours || 0;
      map[name].tasks += 1;
    });
    return Object.values(map).slice(0, 5);
  }, [timesheets]);
  const maxProjectHours = Math.max(1, ...projects.map((p) => p.hours));

  /* skills chips — from training + designation */
  const skills = useMemo(() => {
    const set = new Set<string>();
    training.slice(0, 4).forEach((t) => set.add(t.training.title.split(' ').slice(0, 2).join(' ')));
    if (user?.employee?.designation) set.add(user.employee.designation);
    if (set.size === 0 && user?.employee?.department) set.add(user.employee.department);
    return Array.from(set).slice(0, 6);
  }, [training, user]);

  /* meetings / schedule feed — trainings + approved leaves + regularizations */
  const schedule = useMemo(() => {
    const items: { id: string; title: string; time: string; sub: string; tone: string }[] = [];
    training.forEach((t) => {
      if (t.training.startDate) {
        items.push({
          id: `tr-${t.id}`,
          title: t.training.title,
          time: new Date(t.training.startDate).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          sub: 'Training session',
          tone: 'bg-[#FF9B44]/15 text-[#FF9B44]',
        });
      }
    });
    leaveRequests
      .filter((l) => l.status === 'approved' && new Date(l.startDate) >= new Date(Date.now() - 86400000))
      .forEach((l) => {
        items.push({
          id: `lv-${l.id}`,
          title: l.leaveType?.name || 'Approved leave',
          time: new Date(l.startDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          sub: 'Time off',
          tone: 'bg-[#10B981]/10 text-[#10B981]',
        });
      });
    return items.slice(0, 5);
  }, [training, leaveRequests]);

  const photoUrl = loggedInPhotoUrl(user);

  /* Task 149 — "no of yrs of exp": stored totalExperience wins; otherwise
     tenure is derived from the date of joining. */
  const experienceLabel = useMemo(() => {
    const stored = (profileExtra?.totalExperience || '').trim();
    if (stored) return stored;
    const doj = profileExtra?.dateOfJoining;
    if (!doj) return null;
    const start = new Date(doj);
    if (isNaN(start.getTime())) return null;
    const months = Math.max(0, Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
    const yrs = Math.floor(months / 12);
    const rem = months % 12;
    if (yrs === 0 && rem === 0) return 'New joiner';
    if (yrs === 0) return `${rem} mo at company`;
    return rem ? `${yrs}.${Math.round(rem / 12 * 10)} yrs at company` : `${yrs} yrs at company`;
  }, [profileExtra?.totalExperience, profileExtra?.dateOfJoining]);

  const fmtMoney = (n: number, currency = 'INR') => {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0);
    } catch {
      return `₹${(n || 0).toLocaleString('en-IN')}`;
    }
  };
  const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const monthLabel = (m: number, y: number) => new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const quickActions = [
    { icon: <FiMessageCircle className="w-5 h-5" />, label: 'Chat', href: '/collaboration/chat', pastel: 'bg-[#10B981]/10 text-[#10B981]' },
    // BUG_029 FIX: Apply Leave should open the apply leave form, not just the leave dashboard
    { icon: <FiCalendar className="w-5 h-5" />, label: 'Apply Leave', href: '/leave?action=apply', pastel: 'bg-[#FF9B44]/15 text-[#FF9B44]' },
    { icon: <FiClock className="w-5 h-5" />, label: 'My Attendance', href: '/attendance', pastel: 'bg-[#009EFB]/10 text-[#009EFB]' },
    // BUG_036 FIX: My Payslips should go to /payroll/payslips, not /payroll (which is admin-only)
    { icon: <FiFileText className="w-5 h-5" />, label: 'My Payslips', href: '/payroll/payslips', pastel: 'bg-[#3A57C4]/10 text-[#3A57C4]' },
    { icon: <FiHeadphones className="w-5 h-5" />, label: 'Raise Ticket', href: '/helpdesk', pastel: 'bg-[#6C4FD6]/10 text-[#6C4FD6]' },
    { icon: <FiUser className="w-5 h-5" />, label: 'My Profile', href: '/my-profile', pastel: 'bg-pink-50 text-pink-600' },
    { icon: <FiDollarSign className="w-5 h-5" />, label: 'Expenses', href: '/expenses', pastel: 'bg-[#FFC107]/20 text-amber-600' },
    { icon: <FiBookOpen className="w-5 h-5" />, label: 'Training', href: '/training', pastel: 'bg-emerald-50 text-emerald-600' },
    { icon: <FiTrendingUp className="w-5 h-5" />, label: 'Performance', href: '/performance', pastel: 'bg-[#8A5CF6]/10 text-[#8A5CF6]' },
    { icon: <FiSend className="w-5 h-5" />, label: 'Timesheet', href: '/timesheets', pastel: 'bg-sky-50 text-sky-600' },
    { icon: <FiFolder className="w-5 h-5" />, label: 'Documents', href: '/documents', pastel: 'bg-rose-50 text-rose-600' },
    { icon: <FiFileText className="w-5 h-5" />, label: 'Policies', href: '/policies-handbook', pastel: 'bg-teal-50 text-teal-600' },
  ];

  /* ----- render ----- */

  if (!user || userRole === 'super_admin') {
    return <div className="py-12 text-center text-thb-text-secondary">Loading dashboard...</div>;
  }

  const announcement = announcements[bannerIndex];

  return (
    <div>
      {/* ══ TEMPLATE: breadcrumb bar + date + collapse ══ */}
      <PageBreadcrumbs
        title="Employee Dashboard"
        trail={['Dashboard', 'Employee Dashboard']}
        right={
          <>
            <DateChip value={todayChip} />
            <CollapseToggle collapsed={contentCollapsed} onToggle={() => setContentCollapsed((c) => !c)} />
          </>
        }
      />

      {contentCollapsed ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 py-10 text-center text-sm text-slate-400">
          Content collapsed — press the chevron button to expand the dashboard.
        </div>
      ) : (
        <div className="space-y-6">
          {/* ══ TEMPLATE ROW 0: alert banner (announcements) ══ */}
          {announcement && !alertDismissed && (
            <TemplateAlert onClose={() => setAlertDismissed(true)}>
              <span className="font-bold text-slate-900">
                {announcement.isPinned ? 'Pinned Announcement: ' : 'Announcement: '}
              </span>
              {announcement.content}
              {announcements.length > 1 && (
                <span className="ml-2 text-xs text-slate-400">
                  ({bannerIndex + 1}/{announcements.length})
                </span>
              )}
            </TemplateAlert>
          )}

          {/* ══ TEMPLATE ROW 1: Profile hero (4) + Leave Details (4) + Leave Summary (4)
              — equal thirds so the three cards align edge to edge; the Leave
              Summary card carries extra rows (pending + upcoming) to match height ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-4">
              <ProfileHeroCard
                name={user.name}
                designation={profileExtra?.designationTitle || user.employee?.designation || 'Employee'}
                department={profileExtra?.departmentName || user.employee?.department || companyName}
                phone={profileExtra?.phone}
                email={user.email}
                reportTo={
                  profileExtra?.reportingManager
                    ? `${profileExtra.reportingManager.firstName || ''} ${profileExtra.reportingManager.lastName || ''}`.trim()
                    : profileExtra?.branch?.name || null
                }
                joinedOn={profileExtra?.dateOfJoining ? fmtDate(profileExtra.dateOfJoining) : null}
                photoUrl={photoUrl}
                employeeCode={profileExtra?.employeeCode || user.employee?.employeeId || null}
                experience={experienceLabel}
              />
            </div>

            <div className="xl:col-span-4">
              <Panel title="Leave Details" icon={<FiCalendar className="w-4 h-4" />} href="/leave" accent="text-[#3A57C4]">
                {isProbation && (
                  <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                    <p className="font-bold text-emerald-800">Probationary Employee – 6 Months</p>
                    <p className="mt-1 text-xs text-emerald-700">All leave balances are zero during probation.</p>
                  </div>
                )}
                {loading ? (
                  <div className="h-56"><SkeletonBlock className="h-full w-full" /></div>
                ) : leaveChartData.length === 0 ? (
                  <EmptyState icon={<FiInfo className="w-8 h-8 mb-2" />} message="No leave balances configured" />
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="w-40 h-40 flex-shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={leaveChartData} dataKey="remaining" nameKey="name" innerRadius={44} outerRadius={64} paddingAngle={2}>
                            {leaveChartData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v, _n, p) => {
                              const item = p?.payload;
                              return [`${v} day(s) remaining · ${item?.used || 0} used`, item?.name];
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 w-full space-y-2">
                      {leaveBalances
                        .filter((b) => !/loss of pay|lop/i.test(`${b.leaveType?.name || ''} ${b.leaveType?.code || ''}`))
                        .slice(0, 6)
                        .map((b, i) => (
                          <div key={b.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: LEAVE_COLORS[i % LEAVE_COLORS.length] }} />
                              <span className="font-medium text-slate-700 truncate">{b.leaveType?.name || 'Leave'}</span>
                            </div>
                            <span className="text-slate-500 font-medium whitespace-nowrap">
                              <span className="text-slate-900 font-bold">{b.remaining}</span>
                              <span className="text-slate-400"> / {b.total}</span>
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </Panel>
            </div>

            <div className="xl:col-span-4">
              {/* Task 148 — template bg-secondary pattern: FULL violet card.
                  Extra rows (pending requests + upcoming approved leave) keep
                  the card the same height as the hero card next to it. */}
              <Panel title="Leave Summary" icon={<FiCheckCircle className="w-4 h-4" />} href="/leave" accent="text-[#10B981]" tone="violet">
                {loading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-14 w-full !bg-white/20" />)}</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { label: 'Total Allocation', value: leaveSummary.total, tone: 'from-[#FF9B44] to-[#FF7A3D]', icon: <FiCalendar className="w-4 h-4" /> },
                        { label: 'Days Used', value: leaveSummary.used, tone: 'from-rose-400 to-pink-500', icon: <FiClock className="w-4 h-4" /> },
                        { label: 'Remaining', value: leaveSummary.remaining, tone: 'from-emerald-400 to-teal-400', icon: <FiCheckCircle className="w-4 h-4" /> },
                        { label: 'Pending Requests', value: pendingLeaveCount, tone: 'from-amber-400 to-orange-500', icon: <FiSend className="w-4 h-4" /> },
                      ].map((s) => (
                        <div key={s.label} className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.12] px-3 py-2.5">
                          <span className={`w-9 h-9 rounded-full bg-gradient-to-br ${s.tone} text-white flex items-center justify-center flex-shrink-0 shadow-md`}>
                            {s.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="text-lg font-bold text-white leading-none">{s.value}</p>
                            <p className="text-[10px] text-white/65 mt-1 leading-tight">{s.label}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* upcoming approved leave — extra context row */}
                    <div className="mt-3 rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Upcoming Approved Leave</p>
                      {nextApprovedLeave ? (
                        <p className="text-xs text-white font-medium mt-1">
                          {nextApprovedLeave.leaveType?.name || 'Leave'} · {fmtDate(nextApprovedLeave.startDate)}
                          {nextApprovedLeave.endDate ? ` → ${fmtDate(nextApprovedLeave.endDate)}` : ''}
                        </p>
                      ) : (
                        <p className="text-xs text-white/70 mt-1">No upcoming approved leave</p>
                      )}
                    </div>
                    <button
                      onClick={() => router.push('/leave')}
                      className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-[#3A57C4] text-sm font-bold shadow-lg hover:bg-blue-50 transition-all"
                    >
                      <FiPlus className="w-4 h-4" /> Apply Leave
                    </button>
                  </>
                )}
              </Panel>
            </div>
          </div>

          {/* ══ TEMPLATE ROW 2: Attendance punch (4) + Attendance Overview (8) ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-4">
              <Panel title="Attendance" icon={<FiClock className="w-4 h-4" />} href="/attendance" accent="text-[#009EFB]">
                <div className="text-center">
                  <p className="text-3xl font-bold text-slate-900 tracking-tight">{attMetrics.nowClock}</p>
                  <p className="text-xs text-slate-500 mt-1">{attMetrics.todayLabel}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600/70">Punch In</p>
                      <p className="text-sm font-bold text-emerald-700 mt-0.5 flex items-center justify-center gap-1.5">
                        <FiLogIn className="w-3.5 h-3.5" /> {attMetrics.checkIn || '--:--'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600/70">Punch Out</p>
                      <p className="text-sm font-bold text-rose-700 mt-0.5 flex items-center justify-center gap-1.5">
                        <FiLogOut className="w-3.5 h-3.5" /> {attMetrics.checkOut || '--:--'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total Hours Today</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">
                      {Math.floor(attMetrics.todayHours)}h {Math.round((attMetrics.todayHours % 1) * 60)}m
                    </p>
                  </div>
                  <button
                    onClick={() => router.push('/attendance')}
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#3A57C4] to-[#4C51D6] text-white text-sm font-semibold shadow-lg shadow-[#3A57C4]/25 hover:shadow-[#3A57C4]/45 transition-all"
                  >
                    Punch In / Out
                  </button>
                </div>
              </Panel>
            </div>

            <div className="xl:col-span-8">
              <Panel title="Attendance Overview" icon={<FiActivity className="w-4 h-4" />} href="/attendance" accent="text-[#3A57C4]">
                {loading ? (
                  <div className="h-56"><SkeletonBlock className="h-full w-full" /></div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { label: 'Total Hours Today', value: `${attMetrics.todayHours} / ${attMetrics.todayTarget}`, sub: 'hrs', bg: 'bg-[#3A57C4]/10 text-[#3A57C4]', ring: 'ring-[#3A57C4]/20' },
                        { label: 'Total Hours Week', value: `${attMetrics.weekHours} / ${attMetrics.weekTarget}`, sub: 'hrs', bg: 'bg-[#6C4FD6]/10 text-[#6C4FD6]', ring: 'ring-[#6C4FD6]/20' },
                        { label: 'Total Hours Month', value: `${attMetrics.monthHours}`, sub: 'hrs', bg: 'bg-[#FF9B44]/15 text-[#FF9B44]', ring: 'ring-orange-200' },
                        { label: 'Overtime this Month', value: `${attMetrics.overtime}`, sub: 'hrs', bg: 'bg-[#FFC107]/20 text-amber-600', ring: 'ring-amber-200' },
                      ].map((t) => (
                        <div key={t.label} className="rounded-xl border border-slate-100 bg-slate-50/40 p-3.5">
                          <span className={`w-9 h-9 rounded-full ${t.bg} ring-1 ${t.ring} flex items-center justify-center`}>
                            <FiClock className="w-4 h-4" />
                          </span>
                          <p className="text-lg font-bold text-slate-900 mt-2 leading-none">{t.value}</p>
                          <p className="text-[11px] text-slate-500 mt-1">{t.label} ({t.sub})</p>
                        </div>
                      ))}
                    </div>
                    {attendanceTrend.length === 0 ? (
                      <div className="mt-4"><EmptyState icon={<FiInfo className="w-7 h-7 mb-1" />} message="No attendance records this month yet" /></div>
                    ) : (
                      <div className="h-44 mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={attendanceTrend} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                            <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                            <Tooltip
                              formatter={(v) => [`${v} hrs`, 'Worked']}
                              contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }}
                            />
                            <Bar dataKey="hours" fill="#3A57C4" radius={[6, 6, 0, 0]} barSize={26} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
              </Panel>
            </div>
          </div>

          {/* ══ TEMPLATE ROW 3: Projects (6) + Tasks (6) ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-6">
              <Panel title="Projects" icon={<FiBriefcase className="w-4 h-4" />} href="/timesheets" accent="text-[#6C4FD6]">
                {loading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
                ) : projects.length === 0 ? (
                  <EmptyState icon={<FiBriefcase className="w-8 h-8 mb-2" />} message="No project activity yet — log time in your timesheet" />
                ) : (
                  <div className="space-y-4">
                    {projects.map((p) => (
                      <div key={p.name}>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">{p.hours}h · {p.tasks} entries</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#6C4FD6] to-[#3A57C4]"
                            style={{ width: `${Math.max(6, Math.round((p.hours / maxProjectHours) * 100))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="xl:col-span-6">
              <Panel title="Tasks" icon={<FiCheckCircle className="w-4 h-4" />} href="/timesheets" accent="text-[#FF9B44]">
                {loading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
                ) : timesheets.length === 0 ? (
                  <EmptyState icon={<FiCheckCircle className="w-8 h-8 mb-2" />} message="No tasks logged yet" />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {timesheets.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex items-center justify-between py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{t.task || 'General task'}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {(typeof t.project === 'object' && t.project ? t.project.name : t.project) || 'General'} · {t.hours}h · {fmtDate(t.date)}
                          </p>
                        </div>
                        {statusBadge(t.status)}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {/* ══ TEMPLATE ROW 4: Performance (5) + My Skills (4) + Team Birthday (3) ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-5">
              <Panel title="Performance" icon={<FiTrendingUp className="w-4 h-4" />} href="/performance" accent="text-[#6C4FD6]">
                {loading ? (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
                ) : (
                  <>
                    {performance ? (
                      <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-[#6C4FD6]/10 to-[#3A57C4]/10 border border-[#6C4FD6]/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-[#6C4FD6]/70">Latest Review · {performance.reviewCycle || 'Current cycle'}</p>
                            <p className="text-2xl font-bold text-[#3A57C4] mt-0.5">
                              {(performance.overallRating ?? performance.rating ?? 0).toFixed(1)}
                              <span className="text-sm font-medium text-[#6C4FD6]/60"> / 5</span>
                            </p>
                            <p className="text-xs text-[#6C4FD6]/70 mt-0.5">
                              {performance.reviewer ? `By ${performance.reviewer.firstName} ${performance.reviewer.lastName}` : 'Self / Manager review'}
                            </p>
                          </div>
                          <div className="w-14 h-14 rounded-full bg-white/70 flex items-center justify-center">
                            <FiAward className="w-7 h-7 text-[#6C4FD6]" />
                          </div>
                        </div>
                        <div className="mt-2">{statusBadge(performance.status)}</div>
                      </div>
                    ) : (
                      <EmptyState icon={<FiInfo className="w-8 h-8 mb-2" />} message="No performance reviews yet" />
                    )}
                    <div className="space-y-2.5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Goals</p>
                      {goals.length === 0 ? (
                        <p className="text-sm text-slate-400 py-2">No active goals</p>
                      ) : (
                        goals.slice(0, 3).map((g) => (
                          <div key={g.id} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium text-slate-700 truncate">{g.title}</span>
                              <span className="text-xs font-semibold text-slate-500">{g.progress || 0}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${g.progress >= 75 ? 'bg-emerald-500' : g.progress >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${Math.min(g.progress || 0, 100)}%` }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </Panel>
            </div>

            <div className="xl:col-span-4">
              {/* Task 148 — template bg-warning pattern: FULL gold card */}
              <Panel title="My Skills" icon={<FiAward className="w-4 h-4" />} href="/my-profile" accent="text-[#FFC107]" tone="amber">
                {loading ? (
                  <div className="flex flex-wrap gap-2">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-8 w-24 rounded-full !bg-white/40" />)}</div>
                ) : skills.length === 0 ? (
                  <EmptyState icon={<FiAward className="w-8 h-8 mb-2" />} message="Add skills from your profile" />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {skills.map((s) => (
                      <span key={s} className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-white/70 text-xs font-semibold text-amber-900 ring-1 ring-white/60 shadow-sm">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => router.push('/my-profile')}
                  className="mt-4 text-xs font-bold text-amber-950 hover:text-amber-900 inline-flex items-center gap-1"
                >
                  Manage skills <FiArrowRight className="w-3 h-3" />
                </button>
              </Panel>
            </div>

            <div className="xl:col-span-3">
              <BirthdaysCard />
            </div>
          </div>

          {/* ══ TEMPLATE ROW 5: Team Members (4) + Notifications (4) + Meetings Schedule (4) ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-4">
              <Panel title="Team Members" icon={<FiUsers className="w-4 h-4" />} href="/collaboration" accent="text-[#3A57C4]">
                {loading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
                ) : teamMembers.length === 0 ? (
                  <EmptyState icon={<FiUsers className="w-8 h-8 mb-2" />} message="Directory access restricted" />
                ) : (
                  <div className="space-y-3">
                    {teamMembers.map((m) => {
                      const ini = `${m.firstName?.[0] || ''}${m.lastName?.[0] || ''}`.toUpperCase();
                      return (
                        <div key={m.id} className="flex items-center gap-3">
                          <span className="relative flex-shrink-0">
                            {m.avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.avatar} alt={`${m.firstName} ${m.lastName}`} className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm" />
                            ) : (
                              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3A57C4] to-[#6C4FD6] text-white text-[11px] font-bold flex items-center justify-center">{ini || '?'}</span>
                            )}
                            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{m.firstName} {m.lastName}</p>
                            <p className="text-[11px] text-slate-400 truncate">{m.designation?.title || m.department?.name || 'Team member'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>

            <div className="xl:col-span-4">
              <Panel title="Notifications" icon={<FiBell className="w-4 h-4" />} href="/notifications" accent="text-[#FF9B44]">
                {notifications.length === 0 ? (
                  <EmptyState icon={<FiBell className="w-8 h-8 mb-2" />} message="No notifications yet" />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {notifications.slice(0, 5).map((n) => (
                      <button
                        key={n.id}
                        // BUG_038 FIX: Use router.push instead of window.location.href for SPA
                        // navigation. Fall back to /notifications only when n.link is truly empty.
                        // Also handle the case where n.link is '/' or '/my-profile' (default) —
                        // route to /notifications instead so the user sees the full notification list.
                        onClick={() => {
                          if (n.link && n.link !== '/' && n.link !== '/my-profile') {
                            router.push(n.link);
                          } else {
                            router.push('/notifications');
                          }
                        }}
                        className="w-full text-left py-3 flex items-start gap-2.5 hover:bg-slate-50 transition-colors"
                      >
                        <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${n.isRead ? 'bg-slate-300' : 'bg-[#FF9B44]'}`} />
                        <div className="min-w-0">
                          <p className={`text-sm truncate ${n.isRead ? 'text-slate-600 font-medium' : 'text-slate-900 font-semibold'}`}>{n.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{n.message}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="xl:col-span-4">
              <Panel title="Meetings Schedule" icon={<FiCalendar className="w-4 h-4" />} href="/calendar" accent="text-[#6C4FD6]">
                {loading ? (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
                ) : schedule.length === 0 ? (
                  <EmptyState icon={<FiCalendar className="w-8 h-8 mb-2" />} message="Nothing scheduled — check the calendar" />
                ) : (
                  <div className="space-y-3">
                    {schedule.map((s) => (
                      <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/60 border border-slate-100">
                        <span className={`w-9 h-9 rounded-lg ${s.tone} flex items-center justify-center flex-shrink-0`}>
                          <FiCalendar className="w-4 h-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{s.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{s.time} · {s.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {/* ══ ROW 6: Recent Payslips (full width) — kept above the feeds so
                 the page ends evenly with Social Feeds + Quick Actions ══ */}
          <Panel title="Recent Payslips" icon={<FiFileText className="w-4 h-4" />} href="/payroll" accent="text-[#10B981]">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
            ) : payslips.length === 0 ? (
              <EmptyState icon={<FiInfo className="w-8 h-8 mb-2" />} message="No payslips available yet" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {payslips.map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">{monthLabel(p.month, p.year)}</p>
                      <FiDownload className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{fmtMoney(p.netSalary, p.currency)}</p>
                    <div className="mt-1.5">{statusBadge(p.status)}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ══ LAST ROW: Social Feeds (8) + Quick Actions (4) — feeds close the page ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-8">
              <Panel title="Social Feeds" icon={<FiUsers className="w-4 h-4" />} href="/social-feed" accent="text-pink-500">
                <SocialFeedSection limit={6} />
              </Panel>
            </div>
            <div className="xl:col-span-4">
              <Panel
                title="Quick Actions"
                icon={<FiZap className="w-4 h-4" />}
                accent="text-[#FFC107]"
                action={<span className="text-[10px] text-slate-400">Self-service shortcuts</span>}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {quickActions.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => router.push(a.href)}
                      className="group flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-slate-100 hover:border-[#6C4FD6]/30 hover:shadow-lg hover:-translate-y-0.5 transition-all"
                    >
                      <div className={`w-10 h-10 rounded-full ${a.pastel} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
                        {a.icon}
                      </div>
                      <span className="text-[11px] font-semibold text-slate-700 text-center group-hover:text-slate-900 leading-tight">{a.label}</span>
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          {/* Footer hint — Task 163: admins only (employees have no Admin Dashboard) */}
          {ADMIN_DASHBOARD_ROLES.includes(userRole.toLowerCase()) && (
            <div className="flex items-center justify-center pt-2 pb-4">
              <button
                onClick={() => router.push('/home')}
                className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-emerald-600 transition-colors"
              >
                <FiArrowRight className="w-3 h-3 rotate-180" /> Open Admin Dashboard
              </button>
            </div>
          )}
        </div>
      )}

      {/* floating chat icon */}
      <button
        onClick={() => router.push('/collaboration/chat')}
        title="Chat — project & team conversations"
        aria-label="Open chat"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-[#6C4FD6] to-[#3A57C4] text-white shadow-xl shadow-[#6C4FD6]/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        <FiMessageCircle className="w-6 h-6" />
        <span className="absolute inset-0 rounded-full ring-2 ring-[#6C4FD6]/40 animate-ping" style={{ animationDuration: '3s' }} />
      </button>
    </div>
  );
}
