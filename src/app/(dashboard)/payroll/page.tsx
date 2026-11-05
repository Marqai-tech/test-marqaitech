'use client';

/**
 * Task 153 — Payroll Dashboard split into TWO role variants on ONE route:
 *
 *  ADMIN / HR / CEO / MANAGER variant (SmartHR payroll-dashboard template):
 *    1. Header — title + period (month/year) selector + Process Payroll CTA
 *    2. Four stat cards — Team Members, Gross Payroll, Total Deductions,
 *       Net Payout (computed from the REAL payslips of the period)
 *    3. Charts row — Payroll Composition donut + 6-Month Payroll Trend bars
 *    4. Salary Range Distribution — headcount per salary band (was: Recent
 *       Payslips table, removed per user request)
 *    5. Payroll Processing Pipeline — Draft → Processed → Approved → Paid
 *       live stage tracker with counts + amounts
 *    6. How Can I Help You? — support quick actions
 *    7. Quick access tiles — Masters / Transactions / Reports entry points
 *
 *  EMPLOYEE variant (renders in place — no more redirect to My Payslips):
 *    - My Salary cards (annual CTC + latest month gross/net/deductions)
 *    - My Salary Composition donut for the selected period
 *    - My Recent Payslips list + View all → /payroll/payslips
 *    - IT Calculator / IT Declaration / Advance Request icon tiles
 *    - How Can I Help You? support section
 *
 * Data comes from the governed /api/payroll endpoint — company-scoped for
 * admins and automatically SELF-scoped for employee logins, so each variant
 * only ever sees what its role is allowed to see.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUsers, FiDollarSign, FiTrendingDown, FiCreditCard, FiArrowRight,
  FiPlayCircle, FiDatabase, FiEdit3, FiFileText, FiRefreshCw, FiChevronLeft, FiChevronRight,
  FiHelpCircle, FiLifeBuoy, FiMail, FiBookOpen, FiPercent, FiClipboard,
  FiCheckCircle, FiClock, FiSend, FiLock, FiUserCheck, FiCheck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
/* Task 156-a — shared SmartHR widgets: same gradient banner + white stat
   cards / panels as the Employee module dashboard restyle (Task 155). */
import { PageBreadcrumbs, DateChip, Panel, StatCard } from '@/components/dashboard/smarthr-widgets';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface PayrollRow {
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
  lopDeduction: number;
  totalDeductions: number;
  netSalary: number;
  currency: string;
  status: string;
  paidDate?: string | null;
  employee?: { id: string; firstName?: string | null; lastName?: string | null; employeeId?: string | null } | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'manager'];

function money(v: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v || 0);
}

function initials(first?: string | null, last?: string | null) {
  return `${(first || '?')[0]}${(last || '')[0] || ''}`.toUpperCase();
}

/* ────────────────────────────────────────────────────────────────
   Task 153 — "How Can I Help You?" shared support section.
   Renders on BOTH the admin and the employee payroll dashboard.
   ──────────────────────────────────────────────────────────────── */
function HowCanIHelpYou({ router, isEmployee }: { router: ReturnType<typeof useRouter>; isEmployee: boolean }) {
  const tiles = isEmployee
    ? [
        { icon: FiLifeBuoy, label: 'Raise a Payroll Ticket', desc: 'Wrong amount, missing payslip, tax query — the HR desk replies to you.', href: '/helpdesk', tone: 'from-violet-500 to-purple-600' },
        { icon: FiBookOpen, label: 'Salary & Tax FAQs', desc: 'How your CTC, PF, TDS and declarations work — explained simply.', href: '/policies-handbook', tone: 'from-blue-500 to-indigo-600' },
        { icon: FiMail, label: 'Contact HR / Payroll Team', desc: 'Write to the payroll team for anything sensitive or urgent.', href: '/helpdesk?module=payroll', tone: 'from-emerald-500 to-teal-600' },
      ]
    : [
        { icon: FiLifeBuoy, label: 'Raise a Ticket', desc: 'Processing issues, bank-file errors, employee payroll disputes.', href: '/helpdesk', tone: 'from-violet-500 to-purple-600' },
        { icon: FiBookOpen, label: 'Payroll Policies & SOPs', desc: 'Statutory rules, processing calendar and approval checklists.', href: '/policies-handbook', tone: 'from-blue-500 to-indigo-600' },
        { icon: FiMail, label: 'Contact HR / Accounts', desc: 'Escalate directly to HR and accounts owners in one click.', href: '/helpdesk?module=payroll', tone: 'from-emerald-500 to-teal-600' },
      ];
  return (
    <Panel title="How Can I Help You?" icon={<FiHelpCircle className="w-4 h-4" />} accent="text-[#FFC107]">
      <p className="text-xs text-slate-500 mb-4">Quick answers and direct lines to the people who can fix payroll issues</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {tiles.map(t => (
          <button key={t.label} onClick={() => router.push(t.href)} className="text-left p-4 rounded-xl border border-thb-border bg-slate-50/60 hover:bg-white hover:shadow-md hover:-translate-y-0.5 transition-all group">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${t.tone} flex items-center justify-center shadow-sm mb-2.5`}>
              <t.icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm font-bold text-thb-text-primary group-hover:text-green-600 transition-colors">{t.label}</p>
            <p className="text-[11px] text-thb-text-muted mt-1 leading-relaxed">{t.desc}</p>
          </button>
        ))}
      </div>
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────
   Task 153 — Salary Range Distribution (admin variant).
   Buckets the selected period's payslips into human salary bands.
   ──────────────────────────────────────────────────────────────── */
function SalaryRangeDistribution({ rows, currency }: { rows: PayrollRow[]; currency: string }) {
  const bands = useMemo(() => {
    const defs = [
      { label: 'Below ₹25K', min: 0, max: 25000, color: '#22B573' },
      { label: '₹25K – ₹50K', min: 25000, max: 50000, color: '#3A57C4' },
      { label: '₹50K – ₹1L', min: 50000, max: 100000, color: '#6C4FD6' },
      { label: '₹1L – ₹2L', min: 100000, max: 200000, color: '#FF9B44' },
      { label: 'Above ₹2L', min: 200000, max: Infinity, color: '#E11D48' },
    ];
    return defs.map(d => ({
      ...d,
      count: rows.filter(r => (r.grossSalary || 0) >= d.min && (r.grossSalary || 0) < d.max).length,
    }));
  }, [rows]);

  const max = Math.max(1, ...bands.map(b => b.count));
  const total = rows.length;

  return (
    <Panel title="Salary Range Distribution" icon={<FiPercent className="w-4 h-4" />} accent="text-[#009EFB]">
      <p className="text-xs text-slate-500 mb-4">How your {total || '—'} payslip{total === 1 ? '' : 's'} this period spread across salary bands (monthly gross)</p>
      {total > 0 ? (
        <div className="space-y-3">
          {bands.map(b => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="w-24 text-[11px] font-semibold text-thb-text-secondary shrink-0">{b.label}</span>
              <div className="flex-1 h-6 rounded-lg bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                  style={{ width: `${Math.max(b.count ? 8 : 0, (b.count / max) * 100)}%`, background: `linear-gradient(90deg, ${b.color}CC, ${b.color})` }}
                >
                  {b.count > 0 && <span className="text-[10px] font-bold text-white">{b.count}</span>}
                </div>
              </div>
              <span className="w-14 text-right text-[11px] font-semibold text-thb-text-muted shrink-0">{Math.round((b.count / total) * 100)}%</span>
            </div>
          ))}
          <p className="text-[11px] text-thb-text-muted pt-1">Bands use the monthly gross of the selected pay period · currency {currency}</p>
        </div>
      ) : (
        <div className="h-44 flex items-center justify-center text-sm text-slate-400">No payslips for this period</div>
      )}
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────
   Task 153 — Payroll Processing Pipeline (admin variant).
   Live stage tracker: every payslip of the period sits in exactly
   one stage — Draft → Processed → Approved → Paid.
   ──────────────────────────────────────────────────────────────── */
function ProcessingPipeline({ rows, currency, router, month, year }: { rows: PayrollRow[]; currency: string; router: ReturnType<typeof useRouter>; month: number; year: number }) {
  const stages = useMemo(() => {
    const inStage = (s: string) => rows.filter(r => (r.status || 'draft').toLowerCase() === s);
    const paid = inStage('paid');
    const approved = inStage('approved');
    const processed = inStage('processed');
    const draft = rows.filter(r => !['paid', 'approved', 'processed'].includes((r.status || 'draft').toLowerCase()));
    return [
      { key: 'draft', label: 'Draft', icon: FiEdit3, tone: 'bg-slate-400', ring: 'ring-slate-200', rows: draft, desc: 'awaiting inputs' },
      { key: 'processed', label: 'Processed', icon: FiClock, tone: 'bg-blue-500', ring: 'ring-blue-200', rows: processed, desc: 'calculations done' },
      { key: 'approved', label: 'Authorized', icon: FiUserCheck, tone: 'bg-violet-500', ring: 'ring-violet-200', rows: approved, desc: 'signed off' },
      { key: 'paid', label: 'Paid', icon: FiCheckCircle, tone: 'bg-emerald-500', ring: 'ring-emerald-200', rows: paid, desc: 'money out' },
    ];
  }, [rows]);

  const done = rows.length > 0 && stages[3].rows.length === rows.length;
  const progress = rows.length ? Math.round((stages[3].rows.length / rows.length) * 100) : 0;

  return (
    <Panel
      title="Payroll Processing Pipeline"
      icon={<FiClock className="w-4 h-4" />}
      accent="text-[#10B981]"
      action={
        <button onClick={() => router.push('/payroll/processing')} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-[#FF9B44] to-[#FFC107] text-white text-xs font-semibold shadow-sm hover:opacity-90 transition-all">
          <FiPlayCircle className="w-3.5 h-3.5" /> Open Processing
        </button>
      }
    >
      <p className="text-xs text-slate-500 mb-4">Where every payslip of {MONTHS[month - 1]} {year} stands right now</p>
      {rows.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stages.map((s, i) => (
              <div key={s.key} className={`relative rounded-xl border border-thb-border bg-slate-50/60 p-3.5 ${i === 0 ? '' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className={`w-8 h-8 rounded-lg ${s.tone} flex items-center justify-center shadow-sm`}>
                    <s.icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xl font-bold text-thb-text-primary">{s.rows.length}</span>
                </div>
                <p className="text-xs font-bold text-thb-text-primary mt-2">{s.label}</p>
                <p className="text-[10px] text-thb-text-muted">{s.desc}</p>
                <p className="text-[11px] font-semibold text-thb-text-secondary mt-1.5">{money(s.rows.reduce((a, r) => a + (r.netSalary || 0), 0), currency)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] font-semibold text-thb-text-secondary mb-1.5">
              <span>{done ? 'Payroll fully disbursed — cycle complete' : 'Disbursement progress'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500" style={{ width: `${Math.max(progress, 3)}%` }} />
            </div>
          </div>
        </>
      ) : (
        <div className="h-40 flex flex-col items-center justify-center text-sm text-slate-400 gap-2">
          <FiLock className="w-6 h-6 text-slate-300" />
          No payslips in the pipeline for this period
        </div>
      )}
    </Panel>
  );
}

export default function PayrollDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const effectiveCompanyId = useCompanyContextStore(s => s.effectiveCompanyId);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  /* Task 153 — employees land on the month of their LATEST payslip (not the
     calendar month) so the dashboard is never empty on first paint. */
  const autoPeriodRef = useRef(false);

  /* Task 153 — employees no longer bounce to My Payslips; the SAME route
     renders a personal "My Payroll" dashboard for them. */
  const isAdminView = ADMIN_ROLES.includes(user?.role || '');
  const isEmployeeView = !isAdminView;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cid = effectiveCompanyId?.();
      const qs = new URLSearchParams();
      qs.set('limit', '300');
      if (cid) qs.set('companyId', cid);
      const res = await fetch(`/api/payroll?${qs.toString()}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const arr: PayrollRow[] = data.payrolls || data.data || [];
        setRows(arr);
        /* Auto-land on the latest real payslip period — employees only;
           admins keep the current calendar month as the default. */
        if (!isAdminView && !autoPeriodRef.current && arr.length) {
          setMonth(arr[0].month);
          setYear(arr[0].year);
          autoPeriodRef.current = true;
        }
      } else {
        toast.error('Failed to load payroll data');
      }
    } catch {
      toast.error('Network error loading payroll data');
    } finally {
      setLoading(false);
    }
  }, [effectiveCompanyId]);

  useEffect(() => { queueMicrotask(() => load()); }, [load]);

  /* Period rows + trend (6 months ending at the selected period). */
  const periodRows = useMemo(() => rows.filter(r => r.month === month && r.year === year), [rows, month, year]);

  const stats = useMemo(() => {
    const gross = periodRows.reduce((a, r) => a + (r.grossSalary || 0), 0);
    const ded = periodRows.reduce((a, r) => a + (r.totalDeductions || 0), 0);
    const net = periodRows.reduce((a, r) => a + (r.netSalary || 0), 0);
    const people = new Set(periodRows.map(r => r.employeeId)).size;
    return { gross, ded, net, people };
  }, [periodRows]);

  const composition = useMemo(() => {
    if (!periodRows.length) return [];
    const basic = periodRows.reduce((a, r) => a + (r.basicSalary || 0), 0);
    const hra = periodRows.reduce((a, r) => a + (r.hra || 0), 0);
    const allow = periodRows.reduce((a, r) => a + (r.da || 0) + (r.conveyance || 0) + (r.medical || 0) + (r.otherAllowances || 0), 0);
    const ded = periodRows.reduce((a, r) => a + (r.totalDeductions || 0), 0);
    return [
      { name: 'Basic', value: Math.round(basic), color: '#3A57C4' },
      { name: 'HRA', value: Math.round(hra), color: '#6C4FD6' },
      { name: 'Allowances', value: Math.round(allow), color: '#22B573' },
      { name: 'Deductions', value: Math.round(ded), color: '#F59E0B' },
    ].filter(d => d.value > 0);
  }, [periodRows]);

  const trend = useMemo(() => {
    const out: Array<{ label: string; net: number }> = [];
    let m = month, y = year;
    for (let i = 0; i < 6; i++) {
      const monthRows = rows.filter(r => r.month === m && r.year === y);
      out.unshift({
        label: MONTHS_SHORT[m - 1],
        net: Math.round(monthRows.reduce((a, r) => a + (r.netSalary || 0), 0)),
      });
      m -= 1;
      if (m === 0) { m = 12; y -= 1; }
    }
    return out;
  }, [rows, month, year]);

  const step = (dir: 1 | -1) => {
    let m = month + dir, y = year;
    if (m === 0) { m = 12; y -= 1; }
    if (m === 13) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };

  const currency = periodRows[0]?.currency || rows[0]?.currency || 'INR';
  const hasAnyData = rows.length > 0;
  // SmartHR banner date chip
  const todayChip = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  /* ── Employee "My Payroll" dashboard data (strictly the selected period) ── */
  const myRows = useMemo(() => rows, [rows]); // /api/payroll is already self-scoped for employees
  const myLatest = useMemo(() => myRows[0] || null, [myRows]);
  const myPeriodRows = useMemo(() => periodRows, [periodRows]);
  const myComposition = useMemo(() => {
    const src = myPeriodRows[0];
    if (!src) return [];
    const allow = (src.da || 0) + (src.conveyance || 0) + (src.medical || 0) + (src.otherAllowances || 0);
    return [
      { name: 'Basic', value: Math.round(src.basicSalary || 0), color: '#3A57C4' },
      { name: 'HRA', value: Math.round(src.hra || 0), color: '#6C4FD6' },
      { name: 'Allowances', value: Math.round(allow), color: '#22B573' },
      { name: 'Deductions', value: Math.round(src.totalDeductions || 0), color: '#F59E0B' },
    ].filter(d => d.value > 0);
  }, [myPeriodRows]);
  const myCurrency = myLatest?.currency || 'INR';
  const annualCtc = (user?.employee as Record<string, unknown> | undefined)?.salary as number | null | undefined;
  const myPeriod = myPeriodRows[0] ? { m: myPeriodRows[0].month, y: myPeriodRows[0].year } : null;

  /* ══════════════════ EMPLOYEE VARIANT ══════════════════ */
  if (isEmployeeView) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        {/* Header — SmartHR gradient breadcrumb banner (Task 156-a) */}
        <PageBreadcrumbs
          title="My Payroll Dashboard"
          trail={['Payroll', 'Dashboard']}
          right={
            <>
              <DateChip value={todayChip} />
              {myPeriod && (
                <div className="flex items-center rounded-lg bg-white/15 border border-white/25 overflow-hidden">
                  <button onClick={() => step(-1)} className="px-2.5 py-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"><FiChevronLeft className="w-4 h-4" /></button>
                  <span className="px-3 py-2 text-sm font-semibold text-white">{MONTHS[month - 1]} {year}</span>
                  <button onClick={() => step(1)} className="px-2.5 py-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"><FiChevronRight className="w-4 h-4" /></button>
                </div>
              )}
              <button onClick={load} className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/15 border border-white/25 text-white hover:bg-white/25 transition-colors" title="Refresh"><FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
            </>
          }
        />

        {/* My salary stat cards — shared SmartHR StatCard (Task 156-a) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="My Annual CTC"
            value={loading ? '…' : (annualCtc ? money(annualCtc, myCurrency) : '—')}
            sub={annualCtc ? 'as per your offer records' : 'ask HR to map your salary type'}
            icon={<FiDollarSign className="w-5 h-5" />}
            bg="bg-[#009EFB]/10 text-[#009EFB]"
            ring="ring-[#009EFB]/20"
          />
          <StatCard
            label={myPeriod ? `Gross — ${MONTHS_SHORT[myPeriod.m - 1]} ${myPeriod.y}` : 'Gross Earnings'}
            value={loading ? '…' : money(myPeriodRows.reduce((a, r) => a + (r.grossSalary || 0), 0), myCurrency)}
            sub="earnings before deductions"
            icon={<FiUsers className="w-5 h-5" />}
            bg="bg-[#3A57C4]/10 text-[#3A57C4]"
            ring="ring-[#3A57C4]/20"
          />
          <StatCard
            label="Total Deductions"
            value={loading ? '…' : money(myPeriodRows.reduce((a, r) => a + (r.totalDeductions || 0), 0), myCurrency)}
            sub="PF, tax & others"
            icon={<FiTrendingDown className="w-5 h-5" />}
            bg="bg-[#FF9B44]/10 text-[#FF9B44]"
            ring="ring-[#FF9B44]/20"
          />
          <StatCard
            label="Net Payout"
            value={loading ? '…' : money(myPeriodRows.reduce((a, r) => a + (r.netSalary || 0), 0), myCurrency)}
            sub="credited to your bank"
            icon={<FiCreditCard className="w-5 h-5" />}
            bg="bg-[#10B981]/10 text-[#10B981]"
            ring="ring-[#10B981]/20"
          />
        </div>

        {/* Empty state */}
        {!loading && !hasAnyData && (
          <div className="thb-card p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 text-violet-500 flex items-center justify-center mx-auto mb-3"><FiFileText className="w-6 h-6" /></div>
            <h3 className="text-base font-bold text-thb-text-primary">No payslips yet</h3>
            <p className="text-sm text-thb-text-secondary mt-1 max-w-md mx-auto">Your payslips will appear here as soon as payroll is run for the first time. Meanwhile you can raise a ticket if something looks off.</p>
          </div>
        )}

        {/* Composition + IT tools */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Panel title="My Salary Composition" icon={<FiDollarSign className="w-4 h-4" />} accent="text-[#009EFB]">
            <p className="text-xs text-slate-500 mb-3">{myPeriod ? `${MONTHS[myPeriod.m - 1]} ${myPeriod.y} · where your salary goes` : 'latest payslip breakdown'}</p>
            {myComposition.length > 0 ? (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={myComposition} cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={3} dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {myComposition.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} formatter={((v: number) => money(v, myCurrency)) as never} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-slate-400">No payslip for this period</div>
            )}
          </Panel>

          {/* IT tools — calculator, declaration, advances, payslips */}
          <Panel title="My Tax & Salary Tools" icon={<FiClipboard className="w-4 h-4" />} accent="text-[#6C4FD6]">
            <p className="text-xs text-slate-500 mb-4">Everything you need to plan and declare your taxes</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'IT Calculator', desc: 'Estimate your income tax across regimes', icon: FiPercent, href: '/payroll/income-tax', tone: 'from-blue-500 to-indigo-600' },
                { label: 'IT Declaration', desc: 'Declare investments & proofs', icon: FiClipboard, href: '/payroll/income-tax?tab=declarations', tone: 'from-violet-500 to-purple-600' },
                { label: 'My Payslips', desc: 'Download every payslip so far', icon: FiFileText, href: '/payroll/payslips', tone: 'from-emerald-500 to-teal-600' },
                { label: 'Advance Request', desc: 'Request a salary advance', icon: FiSend, href: '/payroll/loans', tone: 'from-amber-500 to-orange-600' },
              ].map(t => (
                <button key={t.label} onClick={() => router.push(t.href)} className="text-left p-4 rounded-xl border border-thb-border bg-slate-50/60 hover:bg-white hover:shadow-md hover:-translate-y-0.5 transition-all group">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${t.tone} flex items-center justify-center shadow-sm mb-2.5`}>
                    <t.icon className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-sm font-bold text-thb-text-primary group-hover:text-green-600 transition-colors">{t.label}</p>
                  <p className="text-[11px] text-thb-text-muted mt-0.5 leading-snug">{t.desc}</p>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {/* My recent payslips — SmartHR Panel (Task 156-a) */}
        <Panel
          title="My Recent Payslips"
          icon={<FiFileText className="w-4 h-4" />}
          accent="text-[#3A57C4]"
          action={<button onClick={() => router.push('/payroll/payslips')} className="text-xs font-semibold text-[#3A57C4] hover:text-[#2C43A3] inline-flex items-center gap-1">View all <FiArrowRight className="w-3 h-3" /></button>}
        >
          <p className="text-xs text-slate-500 mb-3">Your latest salary credits</p>
          {loading ? (
            <div className="p-5 space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
          ) : myRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-thb-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-thb-text-secondary">Period</th>
                    <th className="text-right px-4 py-3 font-medium text-thb-text-secondary">Gross</th>
                    <th className="text-right px-4 py-3 font-medium text-thb-text-secondary">Deductions</th>
                    <th className="text-right px-4 py-3 font-medium text-thb-text-secondary">Net Pay</th>
                    <th className="text-center px-4 py-3 font-medium text-thb-text-secondary">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {myRows.slice(0, 6).map((r) => (
                    <tr key={r.id} className="border-b border-thb-border last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-medium text-thb-text-primary">{MONTHS_SHORT[(r.month - 1) % 12]} {r.year}</td>
                      <td className="px-4 py-3 text-right text-thb-text-secondary">{money(r.grossSalary, r.currency)}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{money(r.totalDeductions, r.currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-thb-text-primary">{money(r.netSalary, r.currency)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full capitalize ${r.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {r.status === 'paid' ? <FiCheck className="w-3 h-3" /> : <FiClock className="w-3 h-3" />} {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-400">No payslips released yet</div>
          )}
        </Panel>

        <HowCanIHelpYou router={router} isEmployee />
      </div>
    );
  }

  /* ══════════════════ ADMIN VARIANT ══════════════════ */
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* 1. Header — SmartHR gradient breadcrumb banner (Task 156-a) */}
      <PageBreadcrumbs
        title="Payroll Dashboard"
        trail={['Payroll', 'Dashboard']}
        right={
          <>
            <DateChip value={todayChip} />
            <div className="flex items-center rounded-lg bg-white/15 border border-white/25 overflow-hidden">
              <button onClick={() => step(-1)} className="px-2.5 py-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"><FiChevronLeft className="w-4 h-4" /></button>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-2 py-2 text-sm font-semibold text-white bg-white/10 border-x border-white/25 focus:outline-none">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-2 py-2 text-sm font-semibold text-white bg-white/10 focus:outline-none">
                {[year + 1, year, year - 1, year - 2].filter((v, i, a) => a.indexOf(v) === i).map(y2 => <option key={y2} value={y2}>{y2}</option>)}
              </select>
              <button onClick={() => step(1)} className="px-2.5 py-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"><FiChevronRight className="w-4 h-4" /></button>
            </div>
            <button onClick={load} className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/15 border border-white/25 text-white hover:bg-white/25 transition-colors" title="Refresh"><FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <button onClick={() => router.push('/payroll/processing')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#FF9B44] to-[#FFC107] text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-all">
              <FiPlayCircle className="w-4 h-4" /> Process Payroll
            </button>
          </>
        }
      />

      {/* 2. Stat cards — shared SmartHR StatCard (Task 156-a) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Team Members Paid"
          value={loading ? '…' : String(stats.people)}
          sub={`${MONTHS[month - 1]} ${year} payroll`}
          icon={<FiUsers className="w-5 h-5" />}
          bg="bg-[#3A57C4]/10 text-[#3A57C4]"
          ring="ring-[#3A57C4]/20"
        />
        <StatCard
          label="Gross Payroll"
          value={loading ? '…' : money(stats.gross, currency)}
          sub="earnings before deductions"
          icon={<FiDollarSign className="w-5 h-5" />}
          bg="bg-[#10B981]/10 text-[#10B981]"
          ring="ring-[#10B981]/20"
        />
        <StatCard
          label="Total Deductions"
          value={loading ? '…' : money(stats.ded, currency)}
          sub="tax, PF, LOP & others"
          icon={<FiTrendingDown className="w-5 h-5" />}
          bg="bg-[#FF9B44]/10 text-[#FF9B44]"
          ring="ring-[#FF9B44]/20"
        />
        <StatCard
          label="Net Payout"
          value={loading ? '…' : money(stats.net, currency)}
          sub="paid to bank accounts"
          icon={<FiCreditCard className="w-5 h-5" />}
          bg="bg-[#F43F5E]/10 text-[#F43F5E]"
          ring="ring-[#F43F5E]/20"
        />
      </div>

      {/* Empty state when the tenant has no payslips at all yet */}
      {!loading && !hasAnyData && (
        <div className="thb-card p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 text-violet-500 flex items-center justify-center mx-auto mb-3"><FiDatabase className="w-6 h-6" /></div>
          <h3 className="text-base font-bold text-thb-text-primary">No payroll records yet</h3>
          <p className="text-sm text-thb-text-secondary mt-1 max-w-md mx-auto">Set up salary structures and assign employee salary types, then run your first payroll to see live dashboards here.</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => router.push('/payroll/ctc-templates')} className="px-4 py-2 rounded-lg border border-thb-border text-sm font-medium text-slate-600 hover:bg-slate-50">Salary Structures</button>
            <button onClick={() => router.push('/payroll/salary-settings')} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">Assign Employee Salary Types</button>
          </div>
        </div>
      )}

      {/* 3. Charts — SmartHR Panels (Task 156-a) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Payroll Composition" icon={<FiDollarSign className="w-4 h-4" />} accent="text-[#3A57C4]">
          <p className="text-xs text-slate-500 mb-3">{MONTHS[month - 1]} {year} · earnings vs deductions</p>
          {composition.length > 0 ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={composition} cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {composition.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} formatter={((v: number) => money(v, currency)) as never} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-60 flex items-center justify-center text-sm text-slate-400">No payslips for this period</div>
          )}
        </Panel>

        <Panel title="Payroll Trend — Net Payout" icon={<FiTrendingDown className="w-4 h-4" />} accent="text-[#6C4FD6]">
          <p className="text-xs text-slate-500 mb-3">Last 6 months ending {MONTHS[month - 1]} {year}</p>
          {trend.some(t => t.net > 0) ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} formatter={((v: number) => money(v, currency)) as never} />
                  <Bar dataKey="net" fill="#3A57C4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-60 flex items-center justify-center text-sm text-slate-400">No trend data yet</div>
          )}
        </Panel>
      </div>

      {/* 4. Task 153 — Salary Range Distribution + Processing Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SalaryRangeDistribution rows={periodRows} currency={currency} />
        <ProcessingPipeline rows={periodRows} currency={currency} router={router} month={month} year={year} />
      </div>

      {/* 5. Task 153 — How Can I Help You */}
      <HowCanIHelpYou router={router} isEmployee={false} />

      {/* 6. Quick access */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Payroll Masters', desc: 'Salary types, paycodes, structures', icon: FiDatabase, href: '/payroll/definitions', tone: 'from-blue-500 to-indigo-600' },
          { label: 'Transactions', desc: 'Adhoc inputs, arrears, advances', icon: FiEdit3, href: '/payroll/inputs', tone: 'from-violet-500 to-purple-600' },
          { label: 'Processing', desc: 'Readiness, runs & authorization', icon: FiPlayCircle, href: '/payroll/processing', tone: 'from-emerald-500 to-teal-600' },
          { label: 'Reports', desc: 'Payroll reports & compliance', icon: FiFileText, href: '/payroll/reports', tone: 'from-amber-500 to-orange-600' },
        ].map(t => (
          <button key={t.label} onClick={() => router.push(t.href)} className="thb-card p-4 text-left hover:shadow-md transition-shadow group">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${t.tone} flex items-center justify-center shadow-sm mb-2.5`}>
              <t.icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm font-bold text-thb-text-primary group-hover:text-green-600 transition-colors">{t.label}</p>
            <p className="text-[11px] text-thb-text-muted mt-0.5">{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
