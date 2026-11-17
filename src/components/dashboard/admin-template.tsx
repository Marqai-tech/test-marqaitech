'use client';

/**
 * Task 147 — ADMIN DASHBOARD TEMPLATE BOARD.
 * Exact widget pattern of the SmartHR admin dashboard template
 * (smarthr.co.in/demo/html/index.html), fed with real 3Boxes data:
 *
 *   Row 1: stat tile grid (8)          | Employees By Department (donut)
 *   Row 2: Employee Status | Attendance Overview | Clock-In/Out
 *   Row 3: Jobs Applicants | Employees | Todo
 *   Row 4: Sales Overview (7) | Invoices (5)
 *   Row 5: Projects (8) | Tasks Statistics (4)
 *   Row 6: Schedules | Recent Activities | Birthdays
 *
 * Every role dashboard on /home renders through this board so the
 * admin pattern is pixel-identical no matter the role.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  FiCalendar, FiClock, FiInfo, FiCheckCircle, FiCheck, FiUsers,
  FiFileText, FiBriefcase, FiActivity, FiLogIn, FiLogOut,
} from 'react-icons/fi';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';
import { PageBreadcrumbs, DateChip, CollapseToggle, MiniStatTile, Panel, EmptyState, statusBadge, SkeletonBlock } from './smarthr-widgets';

const PALETTE = ['#3A57C4', '#6C4FD6', '#FF9B44', '#009EFB', '#10B981', '#FFC107', '#EC4899', '#14B8A6'];

export interface AdminStatTile {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  bg: string;
  ring: string;
  href?: string;
}

export interface AdminTemplateData {
  todayChip: string;
  stats: AdminStatTile[];
  deptDist: { name: string; count: number }[];
  employeeStatus: { label: string; count: number; color: string }[];
  attendanceTrend: { day: string; hours: number }[];
  clock: { checkIn?: string | null; checkOut?: string | null; totalHours?: string; production?: string } | null;
  applicants: { id: string; name: string; role: string; sub: string; avatar?: string | null }[];
  employees: { id: string; name: string; sub: string; avatar?: string | null }[];
  todos: { id: string; label: string; sub?: string; done: boolean }[];
  sales: { month: string; amount: number }[];
  invoices: { id: string; label: string; sub: string; status: string }[];
  projects: { id: string; name: string; client?: string; progress: number; meta?: string }[];
  taskStats: { label: string; value: number; total: number; color: string }[];
  schedules: { id: string; title: string; time: string; sub: string; tone?: string }[];
  activities: { id: string; title: string; sub: string; time: string }[];
  loading?: boolean;
  birthdays?: React.ReactNode;
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>;
}

export default function AdminTemplateBoard({ data }: { data: AdminTemplateData }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const d = data;
  const loading = Boolean(d.loading);
  const totalStatus = d.employeeStatus.reduce((s, x) => s + x.count, 0) || 1;

  return (
    <div>
      <PageBreadcrumbs
        title="Dashboard"
        trail={['Dashboard']}
        right={
          <>
            <DateChip value={d.todayChip} />
            <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
          </>
        }
      />

      {collapsed ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 py-10 text-center text-sm text-slate-400">
          Content collapsed — press the chevron button to expand the dashboard.
        </div>
      ) : (
        <div className="space-y-6">
          {/* ══ ROW 1: stat tile grid (8) | Employees By Department ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-8">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 h-full content-start">
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-[118px] rounded-2xl" />)
                  : d.stats.slice(0, 8).map((s) => <MiniStatTile key={s.label} {...s} />)}
              </div>
            </div>
            <div className="xl:col-span-4">
              <Panel title="Employees By Department" icon={<FiUsers className="w-4 h-4" />} href="/employees" accent="text-[#3A57C4]">
                {loading ? (
                  <div className="h-56"><SkeletonBlock className="h-full w-full" /></div>
                ) : d.deptDist.length === 0 ? (
                  <EmptyState icon={<FiInfo className="w-8 h-8 mb-2" />} message="No department data" />
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-44 h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={d.deptDist} dataKey="count" nameKey="name" innerRadius={50} outerRadius={72} paddingAngle={2}>
                            {d.deptDist.map((_, i) => (
                              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full space-y-1.5 max-h-36 overflow-y-auto">
                      {d.deptDist.map((dep, i) => (
                        <div key={dep.name} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <span className="font-medium text-slate-600 truncate">{dep.name}</span>
                          </span>
                          <span className="font-bold text-slate-900">{dep.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {/* ══ ROW 2: Employee Status | Attendance Overview | Clock-In/Out ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Panel title="Employee Status" icon={<FiUsers className="w-4 h-4" />} href="/employees" accent="text-[#6C4FD6]">
              {loading ? (
                <ListSkeleton />
              ) : d.employeeStatus.length === 0 ? (
                <EmptyState icon={<FiInfo className="w-8 h-8 mb-2" />} message="No workforce status data" />
              ) : (
                <div className="space-y-3.5">
                  {d.employeeStatus.map((s) => (
                    <div key={s.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-600">{s.label}</span>
                        <span className="text-xs font-bold text-slate-900">
                          {s.count} <span className="text-slate-400 font-medium">({Math.round((s.count / totalStatus) * 100)}%)</span>
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.round((s.count / totalStatus) * 100))}%`, background: s.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Attendance Overview" icon={<FiActivity className="w-4 h-4" />} href="/attendance" accent="text-[#009EFB]">
              {loading ? (
                <div className="h-48"><SkeletonBlock className="h-full w-full" /></div>
              ) : d.attendanceTrend.length === 0 ? (
                <EmptyState icon={<FiInfo className="w-8 h-8 mb-2" />} message="No attendance data yet" />
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.attendanceTrend} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [`${v}`, 'Present']} contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                      <Bar dataKey="hours" radius={[6, 6, 0, 0]} barSize={20}>
                        {d.attendanceTrend.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel title="Clock-In/Out" icon={<FiClock className="w-4 h-4" />} href="/attendance" accent="text-[#FF9B44]">
              {loading ? (
                <ListSkeleton rows={3} />
              ) : !d.clock ? (
                <EmptyState icon={<FiClock className="w-8 h-8 mb-2" />} message="No punch activity today" />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600/70">Clock In</p>
                      <p className="text-sm font-bold text-emerald-700 mt-0.5 flex items-center gap-1.5">
                        <FiLogIn className="w-3.5 h-3.5" /> {d.clock.checkIn || '--:--'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600/70">Clock Out</p>
                      <p className="text-sm font-bold text-rose-700 mt-0.5 flex items-center gap-1.5">
                        <FiLogOut className="w-3.5 h-3.5" /> {d.clock.checkOut || '--:--'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total Hours</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">{d.clock.totalHours || '—'}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Productive</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">{d.clock.production || '—'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push('/attendance')}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#3A57C4] to-[#4C51D6] text-white text-sm font-semibold shadow-lg shadow-[#3A57C4]/25 hover:shadow-[#3A57C4]/45 transition-all"
                  >
                    <FiClock className="w-4 h-4" /> Open Attendance
                  </button>
                </div>
              )}
            </Panel>
          </div>

          {/* ══ ROW 3: Jobs Applicants | Employees | Todo ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Panel title="Jobs Applicants" icon={<FiBriefcase className="w-4 h-4" />} href="/recruitment" accent="text-[#FF9B44]">
              {loading ? (
                <ListSkeleton />
              ) : d.applicants.length === 0 ? (
                <EmptyState icon={<FiBriefcase className="w-8 h-8 mb-2" />} message="No applicants in the pipeline" />
              ) : (
                <div className="space-y-3">
                  {d.applicants.slice(0, 4).map((a) => (
                    <div key={a.id} className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF9B44] to-[#FFC107] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {a.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.avatar} alt={a.name} className="w-full h-full object-cover" />
                        ) : (
                          a.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{a.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{a.role}</p>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FF9B44]/10 text-[#FF9B44] whitespace-nowrap">{a.sub}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Employees" icon={<FiUsers className="w-4 h-4" />} href="/employees" accent="text-[#3A57C4]">
              {loading ? (
                <ListSkeleton />
              ) : d.employees.length === 0 ? (
                <EmptyState icon={<FiUsers className="w-8 h-8 mb-2" />} message="No employees yet" />
              ) : (
                <div className="space-y-3">
                  {d.employees.slice(0, 4).map((e) => (
                    <div key={e.id} className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3A57C4] to-[#6C4FD6] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {e.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.avatar} alt={e.name} className="w-full h-full object-cover" />
                        ) : (
                          e.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{e.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{e.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Todo" icon={<FiCheckCircle className="w-4 h-4" />} accent="text-[#10B981]">
              {loading ? (
                <ListSkeleton />
              ) : d.todos.length === 0 ? (
                <EmptyState icon={<FiCheckCircle className="w-8 h-8 mb-2" />} message="All caught up!" />
              ) : (
                <div className="space-y-2.5">
                  {d.todos.slice(0, 5).map((t) => (
                    <div key={t.id} className="flex items-start gap-2.5">
                      <span className={`mt-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 ${t.done ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300'}`}>
                        {t.done && <FiCheck className="w-3 h-3" />}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${t.done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>{t.label}</p>
                        {t.sub && <p className="text-[11px] text-slate-400 truncate">{t.sub}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* ══ ROW 4: Sales Overview (7) | Invoices (5) ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-7">
              <Panel title="Sales Overview" icon={<FiActivity className="w-4 h-4" />} href="/reports" accent="text-[#3A57C4]">
                {loading ? (
                  <div className="h-56"><SkeletonBlock className="h-full w-full" /></div>
                ) : d.sales.length === 0 ? (
                  <EmptyState icon={<FiInfo className="w-8 h-8 mb-2" />} message="No revenue data for this scope yet" />
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={d.sales} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                        <defs>
                          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3A57C4" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#6C4FD6" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} />
                        <Tooltip formatter={(v) => [Number(v).toLocaleString(), 'Amount']} contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                        <Area type="monotone" dataKey="amount" stroke="#3A57C4" strokeWidth={2.5} fill="url(#salesGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>
            </div>

            <div className="xl:col-span-5">
              <Panel title="Invoices" icon={<FiFileText className="w-4 h-4" />} href="/invoices" accent="text-[#10B981]">
                {loading ? (
                  <ListSkeleton />
                ) : d.invoices.length === 0 ? (
                  <EmptyState icon={<FiFileText className="w-8 h-8 mb-2" />} message="No invoices or payslips yet" />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {d.invoices.slice(0, 5).map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{inv.label}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{inv.sub}</p>
                        </div>
                        {statusBadge(inv.status)}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {/* ══ ROW 5: Projects (8) | Tasks Statistics (4) ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-8">
              <Panel title="Projects" icon={<FiBriefcase className="w-4 h-4" />} href="/projects" accent="text-[#6C4FD6]">
                {loading ? (
                  <ListSkeleton rows={4} />
                ) : d.projects.length === 0 ? (
                  <EmptyState icon={<FiBriefcase className="w-8 h-8 mb-2" />} message="No projects yet" />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {d.projects.slice(0, 4).map((p) => (
                      <div key={p.id} className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                          <span className="text-xs font-bold text-[#3A57C4]">{p.progress}%</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{p.client || p.meta || 'Internal'}</p>
                        <div className="mt-2.5 h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-[#6C4FD6] to-[#3A57C4]" style={{ width: `${Math.min(100, Math.max(4, p.progress))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="xl:col-span-4">
              <Panel title="Tasks Statistics" icon={<FiCheckCircle className="w-4 h-4" />} href="/tasks" accent="text-[#FF9B44]">
                {loading ? (
                  <ListSkeleton rows={4} />
                ) : d.taskStats.length === 0 ? (
                  <EmptyState icon={<FiCheckCircle className="w-8 h-8 mb-2" />} message="No task data yet" />
                ) : (
                  <div className="space-y-3.5">
                    {d.taskStats.map((t) => {
                      const pct = t.total > 0 ? Math.round((t.value / t.total) * 100) : 0;
                      return (
                        <div key={t.label}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-slate-600">{t.label}</span>
                            <span className="text-xs font-bold text-slate-900">{t.value}/{t.total}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: t.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {/* ══ ROW 6: Schedules | Recent Activities | Birthdays ══ */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Panel title="Schedules" icon={<FiCalendar className="w-4 h-4" />} href="/calendar" accent="text-[#6C4FD6]">
              {loading ? (
                <ListSkeleton />
              ) : d.schedules.length === 0 ? (
                <EmptyState icon={<FiCalendar className="w-8 h-8 mb-2" />} message="Nothing scheduled" />
              ) : (
                <div className="space-y-3">
                  {d.schedules.slice(0, 5).map((s) => (
                    <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/60 border border-slate-100">
                      <span className={`w-9 h-9 rounded-lg ${s.tone || 'bg-[#6C4FD6]/10 text-[#6C4FD6]'} flex items-center justify-center flex-shrink-0`}>
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

            <Panel title="Recent Activities" icon={<FiActivity className="w-4 h-4" />} accent="text-rose-500">
              {loading ? (
                <ListSkeleton />
              ) : d.activities.length === 0 ? (
                <EmptyState icon={<FiInfo className="w-8 h-8 mb-2" />} message="No recent activity" />
              ) : (
                <div className="divide-y divide-slate-100">
                  {d.activities.slice(0, 5).map((a) => (
                    <div key={a.id} className="py-2.5">
                      <p className="text-sm font-semibold text-slate-900 truncate">{a.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{a.sub}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{a.time}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <div>{d.birthdays || <Panel title="Birthdays" icon={<FiCalendar className="w-4 h-4" />} accent="text-pink-500"><EmptyState icon={<FiInfo className="w-8 h-8 mb-2" />} message="No birthdays today" /></Panel>}</div>
          </div>
        </div>
      )}
    </div>
  );
}
