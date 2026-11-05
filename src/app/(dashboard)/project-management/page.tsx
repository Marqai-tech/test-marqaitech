'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiBriefcase, FiLayers, FiCheckSquare, FiClock, FiUsers, FiFlag,
  FiPlus, FiSearch, FiFilter, FiGrid, FiList, FiChevronDown,
  FiCalendar, FiTrendingUp, FiAlertCircle, FiActivity, FiBarChart2,
  FiArrowRight, FiMoreHorizontal, FiEdit2, FiTrash2, FiX,
  FiPlay, FiPause, FiZap, FiTarget, FiFileText, FiUser,
  FiFolder, FiSettings,
} from 'react-icons/fi';
import ModuleDashboardShell, { DashboardTabConfig } from '@/components/ModuleDashboardShell';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
/* Task 156-c — shared SmartHR widgets so this dashboard matches the
   Employee module dashboard (gradient banner, white pastel-accent cards). */
import { Panel, StatCard } from '@/components/dashboard/smarthr-widgets';
import {
  PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

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
    active: 'thb-badge thb-badge-success',
    on_hold: 'thb-badge thb-badge-warning',
    completed: 'thb-badge thb-badge-info',
    cancelled: 'thb-badge thb-badge-error',
    draft: 'thb-badge bg-slate-100 text-slate-600',
  };
  return map[status] || 'thb-badge thb-badge-info';
}

function formatStatus(status: string) {
  const map: Record<string, string> = {
    active: 'Active', on_hold: 'On Hold', completed: 'Completed',
    cancelled: 'Cancelled', draft: 'Draft',
  };
  return map[status] || status.replace('_', ' ');
}

function getPriorityBadge(priority: string) {
  const map: Record<string, string> = {
    critical: 'thb-badge bg-red-100 text-red-700',
    high: 'thb-badge thb-badge-error',
    medium: 'thb-badge thb-badge-warning',
    low: 'thb-badge thb-badge-success',
  };
  return map[priority] || 'thb-badge thb-badge-info';
}

const CHART_COLORS = ['#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

const STATUS_COLORS: Record<string, string> = {
  active: '#10B981',
  on_hold: '#F59E0B',
  completed: '#3B82F6',
  cancelled: '#EF4444',
  draft: '#94A3B8',
};

const TASK_STATUS_COLORS: Record<string, string> = {
  backlog: '#94A3B8',
  todo: '#3B82F6',
  in_progress: '#F59E0B',
  review: '#8B5CF6',
  done: '#10B981',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

/* ── Task 128: unified task classification + delivery workflow step ── */
const TASK_TYPES: { value: string; label: string }[] = [
  { value: 'customisation', label: 'Customisation' },
  { value: 'rework', label: 'Rework' },
  { value: 'development', label: 'Development' },
  { value: 'bug', label: 'Bug' },
];

const WORKFLOW_STEPS: { value: string; label: string }[] = [
  { value: 'testing', label: 'Testing' },
  { value: 're_testing', label: 'Re-testing' },
  { value: 'production', label: 'Production' },
  { value: 'delivery', label: 'Delivery' },
];

function workflowStepLabel(v?: string | null) {
  if (!v) return null;
  return WORKFLOW_STEPS.find((s) => s.value === v)?.label || v;
}

function taskTypeLabel(v?: string | null) {
  if (!v) return null;
  return TASK_TYPES.find((t) => t.value === v)?.label || v;
}

function workflowStepBadgeClass(v?: string | null) {
  switch (v) {
    case 'testing': return 'thb-badge bg-sky-100 text-sky-700';
    case 're_testing': return 'thb-badge bg-amber-100 text-amber-700';
    case 'production': return 'thb-badge bg-violet-100 text-violet-700';
    case 'delivery': return 'thb-badge bg-emerald-100 text-emerald-700';
    default: return 'thb-badge bg-slate-100 text-slate-500';
  }
}

/* ── Types ── */
interface ApiProject {
  id: string;
  name: string;
  code?: string;
  projectType: string;
  status: string;
  progress: number;
  startDate: string;
  endDate?: string;
  budgetAmount: number;
  estimatedHours: number;
  actualHours: number;
  client?: { id: string; name: string; code?: string };
  department?: { id: string; name: string; code?: string };
  company?: { id: string; name: string };
  _count?: { tasks: number; allocations: number; milestones: number };
  tasks?: { id: string; name: string; status: string; priority: string }[];
  allocations?: {
    id: string; role?: string; allocationPct: number; status: string;
    employee: { id: string; firstName: string; lastName: string; employeeId?: string };
  }[];
}

interface ApiTask {
  id: string;
  projectId?: string;
  name: string;
  status: string;
  priority: string;
  estimatedHours: number;
  actualHours: number;
  assignedToId?: string;
  plannedStart?: string;
  plannedEnd?: string;
  description?: string | null;
  taskType?: string | null;
  workflowStep?: string | null;
  source?: string | null;
  client?: { id: string; name: string } | null;
  _count?: { attachments?: number };
  project?: { id: string; name: string };
  projectTask?: { isBillable: boolean };
}

/* ── Empty State Component ── */
function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="h-[200px] flex flex-col items-center justify-center text-slate-400">
      <FiBarChart2 className="w-8 h-8 mb-2 text-slate-300" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

/* ── Tab Types ── (Task 150: sprints + timeline tabs removed with the feature) */
type TabId = 'dashboard' | 'projects' | 'tasks' | 'reports';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <FiBarChart2 className="w-4 h-4" /> },
  { id: 'projects', label: 'Projects', icon: <FiBriefcase className="w-4 h-4" /> },
  { id: 'tasks', label: 'Task Board', icon: <FiCheckSquare className="w-4 h-4" /> },
  { id: 'reports', label: 'Reports', icon: <FiTrendingUp className="w-4 h-4" /> },
];

/* ── Placeholder Tabs ── */

const projectTabs: DashboardTabConfig[] = [
  { label: 'Overview', key: 'overview', icon: <FiGrid className="w-4 h-4" /> },
  { label: 'Reports', key: 'reports', icon: <FiFileText className="w-4 h-4" />, isNew: true },
  { label: 'Settings', key: 'settings', icon: <FiSettings className="w-4 h-4" />, isNew: true },
];

function ProjectReportsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3A57C4] to-[#6C4FD6] flex items-center justify-center shadow-lg mb-4">
        <FiFileText className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-thb-text-primary mb-1">Reports & Analytics</h3>
      <p className="text-sm text-thb-text-secondary text-center max-w-md mb-4">
        Project progress reports, resource utilization, and timeline analytics
      </p>
      <a href="/project-management/reports" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3A57C4] hover:bg-[#2C43A3] text-white rounded-lg text-sm font-medium transition-colors">
        <FiBarChart2 className="w-4 h-4" /> Go to Reports
      </a>
    </div>
  );
}

function ProjectSettingsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-lg mb-4">
        <FiSettings className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-thb-text-primary mb-1">Settings & Configuration</h3>
      <p className="text-sm text-thb-text-secondary text-center max-w-md mb-4">
        Configure project templates, default views, and notification preferences
      </p>
      <a href="/project-management/settings" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3A57C4] hover:bg-[#2C43A3] text-white rounded-lg text-sm font-medium transition-colors">
        <FiSettings className="w-4 h-4" /> Go to Settings
      </a>
    </div>
  );
}

function ProjectManagementPageContent() {
  return (
    <ModuleDashboardShell
      moduleKey="project"
      moduleLabel="Project Management"
      title="PM Dashboard"
      trail={['Projects', 'Dashboard']}
      moduleIcon={<FiFolder className="w-5 h-5 text-white" />}
      gradientColor="from-fuchsia-500 to-pink-600"
      tabs={projectTabs}
      overviewContent={<ProjectManagementContent />}
      children={{
        reports: <ProjectReportsPlaceholder />,
        settings: <ProjectSettingsPlaceholder />,
      }}
    />
  );
}

export default function ProjectManagementPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-fuchsia-500 border-t-transparent rounded-full" /></div>}>
      <ProjectManagementPageContent />
    </Suspense>
  );
}

/* ── Main Component ── */
function ProjectManagementContent() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [projectViewMode, setProjectViewMode] = useState<'grid' | 'list'>('grid');
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [projectFilter, setProjectFilter] = useState('all');
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);

  // Task 128 — real unified Create-Task form (same fields as the mobile app
  // and every other section of this module). Task 131 — the form itself lives
  // in the shared CreateTaskModal component (identical on all 3 pages).
  const [taskEmployees, setTaskEmployees] = useState<any[]>([]);

  const openCreateTask = () => {
    setShowCreateTask(true);
    if (taskEmployees.length === 0) {
      fetch('/api/employees?limit=300', { headers: getAuthHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setTaskEmployees(j?.employees || j?.data || []))
        .catch(() => null);
    }
  };

  // API data state
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [allTasks, setAllTasks] = useState<ApiTask[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const [projRes, taskRes, clientRes] = await Promise.all([
        fetch('/api/projects?limit=50', { headers: getAuthHeaders() }),
        fetch('/api/project-reports', { headers: getAuthHeaders() }),
        // Task 150 — Clients are part of the PM module now
        fetch('/api/project-management/clients', { headers: getAuthHeaders() }),
      ]);

      if (projRes.ok) {
        const projData = await projRes.json();
        setProjects(projData.projects || []);
      }

      if (clientRes.ok) {
        const clientData = await clientRes.json();
        setClientCount((clientData.clients || []).length);
      }

      if (taskRes.ok) {
        const reportData = await taskRes.json();
        // Fetch all tasks across projects
        if (reportData.budgetVsActual) {
          // We have report data; also try to get individual tasks
        }
      }

      // Fetch tasks for all projects (batch)
      if (projects.length > 0) {
        // We'll rely on the tasks included in project data
      }
    } catch {
      // Silently handle - empty state will show
    } finally {
      setLoading(false);
    }
  }

  // Refetch when projects load to get tasks
  useEffect(() => {
    if (projects.length > 0 && allTasks.length === 0) {
      fetchAllTasks();
    }
  }, [projects]);

  async function fetchAllTasks() {
    try {
      // Fetch tasks from a few projects to populate kanban
      const taskPromises = projects.slice(0, 10).map(p =>
        fetch(`/api/projects/${p.id}/tasks?limit=50`, { headers: getAuthHeaders() })
          .then(res => res.ok ? res.json() : { tasks: [] })
          .catch(() => ({ tasks: [] }))
      );
      const results = await Promise.all(taskPromises);
      const tasks: ApiTask[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i] as { tasks: ApiTask[] };
        for (const t of (result.tasks || [])) {
          tasks.push({ ...t, project: { id: projects[i].id, name: projects[i].name } });
        }
      }
      setAllTasks(tasks);
    } catch {
      // Silently handle
    }
  }

  // Also load on initial fetch complete
  useEffect(() => {
    if (!loading && projects.length > 0 && allTasks.length === 0) {
      fetchAllTasks();
    }
  }, [loading]);

  // Computed data
  const filteredProjects = useMemo(() => {
    let filtered = projects;
    if (projectFilter !== 'all') filtered = filtered.filter(p => p.status === projectFilter);
    if (searchQuery) filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.client?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
    return filtered;
  }, [projects, projectFilter, searchQuery]);

  const projectStatusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of projects) {
      counts[p.status] = (counts[p.status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, value]) => ({
      name: formatStatus(status),
      value,
      color: STATUS_COLORS[status] || '#94A3B8',
    }));
  }, [projects]);

  const taskDistData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of allTasks) {
      const status = t.status || 'todo';
      counts[status] = (counts[status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({
      name: TASK_STATUS_LABELS[status] || status,
      count,
      fill: TASK_STATUS_COLORS[status] || '#94A3B8',
    }));
  }, [allTasks]);

  const teamWorkloadData = useMemo(() => {
    // Compute workload from project allocations
    const workload: Record<string, { tasks: number; color: string }> = {};
    let colorIdx = 0;
    for (const p of projects) {
      for (const alloc of (p.allocations || [])) {
        const name = `${alloc.employee.firstName} ${alloc.employee.lastName}`;
        if (!workload[name]) {
          workload[name] = { tasks: 0, color: CHART_COLORS[colorIdx % CHART_COLORS.length] };
          colorIdx++;
        }
        workload[name].tasks += 1;
      }
    }
    return Object.entries(workload).map(([name, data]) => ({
      name,
      tasks: data.tasks,
      color: data.color,
    }));
  }, [projects]);

  const overdueTasksList = useMemo(() => {
    return allTasks.filter(t => {
      if (!t.plannedEnd || t.status === 'done' || t.status === 'cancelled') return false;
      return new Date(t.plannedEnd) < new Date();
    });
  }, [allTasks]);

  const kanbanColumns = useMemo(() => [
    { key: 'backlog', label: 'Backlog', color: 'bg-slate-100', borderColor: 'border-t-slate-400', tasks: allTasks.filter(t => t.status === 'backlog') },
    { key: 'todo', label: 'To Do', color: 'bg-green-50', borderColor: 'border-t-green-500', tasks: allTasks.filter(t => t.status === 'todo') },
    { key: 'in_progress', label: 'In Progress', color: 'bg-amber-50', borderColor: 'border-t-amber-500', tasks: allTasks.filter(t => t.status === 'in_progress') },
    { key: 'review', label: 'Review', color: 'bg-teal-50', borderColor: 'border-t-teal-500', tasks: allTasks.filter(t => t.status === 'review') },
    { key: 'done', label: 'Done', color: 'bg-emerald-50', borderColor: 'border-t-emerald-500', tasks: allTasks.filter(t => t.status === 'done') },
  ], [allTasks]);

  const stats = useMemo(() => ({
    totalProjects: projects.length,
    totalClients: clientCount,
    tasksThisWeek: allTasks.length,
    overdueTasks: overdueTasksList.length,
    teamUtilization: projects.length > 0 ? Math.round(projects.reduce((a, p) => a + (p.progress || 0), 0) / projects.length) : 0,
    externalIssues: allTasks.filter(t => (t.source || 'internal') === 'external').length,
  }), [projects, allTasks, overdueTasksList, clientCount]);

  /* ── Dashboard Tab ── */
  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Project Status Pie */}
        <Panel title="Project Status" icon={<FiBarChart2 className="w-4 h-4" />} accent="text-[#3A57C4]">
          {loading ? (
            <div className="h-[200px] animate-pulse bg-slate-100 rounded" />
          ) : projectStatusData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={projectStatusData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                    {projectStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2">
                {projectStatusData.map((d, i) => (
                  <span key={i} className="flex items-center gap-1 text-xs text-slate-600">
                    <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />{d.name} ({d.value})
                  </span>
                ))}
              </div>
            </>
          ) : (
            <EmptyChartState message="No project data" />
          )}
        </Panel>

        {/* Sprint Burndown — requires sprint data not available via API */}
        <Panel title="Sprint Burndown" icon={<FiTarget className="w-4 h-4" />} accent="text-[#6C4FD6]">
          {projects.length > 0 ? (
            <EmptyChartState message="Sprint data not available" />
          ) : (
            <EmptyChartState message="No sprint data" />
          )}
        </Panel>

        {/* Task Distribution */}
        <Panel title="Task Distribution" icon={<FiCheckSquare className="w-4 h-4" />} accent="text-[#009EFB]">
          {loading ? (
            <div className="h-[200px] animate-pulse bg-slate-100 rounded" />
          ) : taskDistData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={taskDistData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {taskDistData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState message="No task data" />
          )}
        </Panel>

        {/* Team Workload */}
        <Panel title="Team Workload" icon={<FiUsers className="w-4 h-4" />} accent="text-[#10B981]">
          {loading ? (
            <div className="h-[200px] animate-pulse bg-slate-100 rounded" />
          ) : teamWorkloadData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={teamWorkloadData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={60} />
                <Tooltip />
                <Bar dataKey="tasks" radius={[0, 4, 4, 0]}>
                  {teamWorkloadData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState message="No allocation data" />
          )}
        </Panel>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Overdue Tasks */}
        <Panel title="Overdue Tasks" icon={<FiAlertCircle className="w-4 h-4" />} accent="text-[#FFC107]" action={<span className="thb-badge thb-badge-error">{overdueTasksList.length}</span>}>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {overdueTasksList.map(t => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.project?.name || '—'}</p>
                </div>
                <span className="text-xs text-red-600 font-medium ml-2">{formatDate(t.plannedEnd)}</span>
              </div>
            ))}
            {overdueTasksList.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No overdue tasks</p>}
          </div>
        </Panel>

        {/* Upcoming Deadlines */}
        <Panel title="Upcoming Deadlines" icon={<FiCalendar className="w-4 h-4" />} accent="text-[#FF9B44]">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {allTasks
              .filter(t => t.plannedEnd && t.status !== 'done' && t.status !== 'cancelled' && new Date(t.plannedEnd) >= new Date())
              .sort((a, b) => new Date(a.plannedEnd!).getTime() - new Date(b.plannedEnd!).getTime())
              .slice(0, 5)
              .map(t => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.project?.name || '—'}</p>
                  </div>
                  <div className="flex flex-col items-end ml-2">
                    <span className={getPriorityBadge(t.priority)}>{t.priority}</span>
                    <span className="text-xs text-slate-400 mt-1">{formatDate(t.plannedEnd)}</span>
                  </div>
                </div>
              ))}
            {allTasks.filter(t => t.plannedEnd && t.status !== 'done' && t.status !== 'cancelled' && new Date(t.plannedEnd) >= new Date()).length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">No upcoming deadlines</p>
            )}
          </div>
        </Panel>
      </div>

      {/* Quick Actions — Task 150: New Sprint removed with sprints; Clients added */}
      <Panel title="Quick Actions" icon={<FiZap className="w-4 h-4" />} accent="text-[#6C4FD6]">
        <div className="flex flex-wrap gap-3">
          <button onClick={() => router.push('/projects')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3A57C4] text-white text-sm font-medium hover:bg-[#2C43A3] transition-colors">
            <FiPlus className="w-4 h-4" /> New Project
          </button>
          <button onClick={openCreateTask} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors">
            <FiCheckSquare className="w-4 h-4" /> New Task
          </button>
          <button onClick={() => router.push('/project-management/clients')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors">
            <FiUsers className="w-4 h-4" /> Clients
          </button>
        </div>
      </Panel>
    </div>
  );

  /* ── Projects Tab ── */
  const renderProjects = () => (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 items-center flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-md">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search projects..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20 focus:border-[#3A57C4]" />
          </div>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setProjectViewMode('grid')} className={`p-2 rounded-lg border ${projectViewMode === 'grid' ? 'bg-[#3A57C4]/10 border-[#3A57C4]/20 text-[#3A57C4]' : 'border-slate-200 text-slate-400 hover:text-slate-600'}`}>
            <FiGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setProjectViewMode('list')} className={`p-2 rounded-lg border ${projectViewMode === 'list' ? 'bg-[#3A57C4]/10 border-[#3A57C4]/20 text-[#3A57C4]' : 'border-slate-200 text-slate-400 hover:text-slate-600'}`}>
            <FiList className="w-4 h-4" />
          </button>
          <button onClick={() => router.push('/projects')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#3A57C4] text-white text-sm font-medium hover:bg-[#2C43A3] transition-colors">
            <FiPlus className="w-4 h-4" /> New Project
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="thb-card p-4 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/2 mb-4" />
              <div className="h-2 bg-slate-100 rounded mb-4" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-3 bg-slate-100 rounded" />
                <div className="h-3 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : projectViewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map(p => (
            <div key={p.id} className="thb-card thb-card-hover p-4 cursor-pointer group" onClick={() => router.push(`/projects/${p.id}`)} title="Open project workspace">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-800 truncate group-hover:text-[#3A57C4] transition-colors">{p.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{p.client?.name || p.company?.name || '—'}</p>
                </div>
                <span className={getStatusBadge(p.status)}>{formatStatus(p.status)}</span>
              </div>
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Progress</span>
                  <span className="font-medium">{p.progress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${p.progress}%`, background: p.progress >= 80 ? '#10B981' : p.progress >= 50 ? '#F59E0B' : '#3B82F6' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-1"><FiCalendar className="w-3 h-3" />{formatDate(p.startDate)}</div>
                <div className="flex items-center gap-1"><FiUsers className="w-3 h-3" />{p._count?.allocations || 0} members</div>
                <div className="flex items-center gap-1"><FiFileText className="w-3 h-3" />{p._count?.tasks || 0} tasks</div>
                <div className="flex items-center gap-1"><span className="font-medium text-slate-700">${((p.budgetAmount || 0) / 1000).toFixed(0)}k</span> budget</div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-end">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[#3A57C4] opacity-0 group-hover:opacity-100 transition-opacity">Open workspace <FiArrowRight className="w-3 h-3" /></span>
              </div>
            </div>
          ))}
          {filteredProjects.length === 0 && <p className="text-sm text-slate-400 text-center py-8 col-span-full">No projects found</p>}
        </div>
      ) : (
        /* List View */
        <div className="thb-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Project</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Client</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Progress</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Team</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Budget</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Dates</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map(p => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)} title="Open project workspace">
                    <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.client?.name || '—'}</td>
                    <td className="px-4 py-3"><span className={getStatusBadge(p.status)}>{formatStatus(p.status)}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full" style={{ width: `${p.progress}%`, background: p.progress >= 80 ? '#10B981' : p.progress >= 50 ? '#F59E0B' : '#3B82F6' }} />
                        </div>
                        <span className="text-xs text-slate-500">{p.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p._count?.allocations || 0}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">${((p.budgetAmount || 0) / 1000).toFixed(0)}k</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(p.startDate)} — {formatDate(p.endDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredProjects.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No projects found</p>}
        </div>
      )}
    </div>
  );

  /* ── Sprints Tab — REMOVED (Task 150: sprints hidden, may be re-plugged later) ── */

  /* ── Tasks Tab (Kanban) ── */
  const renderTasks = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={myTasksOnly} onChange={e => setMyTasksOnly(e.target.checked)} className="rounded border-slate-300 text-[#3A57C4] focus:ring-[#3A57C4]" />
            My Tasks Only
          </label>
        </div>
        <button onClick={openCreateTask} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors">
          <FiPlus className="w-4 h-4" /> New Task
        </button>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex-shrink-0 w-72">
              <div className="animate-pulse h-8 bg-slate-100 rounded-t-lg mb-2" />
              <div className="animate-pulse h-64 bg-slate-50 rounded-b-lg" />
            </div>
          ))}
        </div>
      ) : allTasks.length > 0 ? (
        /* Kanban Board */
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
          {kanbanColumns.map(col => (
            <div key={col.key} className="flex-shrink-0 w-72"
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = 'rgba(139,92,246,0.05)'; }}
              onDragLeave={e => { e.currentTarget.style.background = ''; }}
              onDrop={async e => {
                e.currentTarget.style.background = '';
                if (draggedTask) {
                  const taskId = draggedTask; setDraggedTask(null);
                  const task = allTasks.find(t => t.id === taskId);
                  if (!task) return;
                  // Persist the status change (dependency gate errors surface here)
                  try {
                    const res = await fetch(`/api/projects/${task.projectId}/tasks/${task.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', ...(typeof window !== 'undefined' && localStorage.getItem('tb_token') ? { Authorization: `Bearer ${localStorage.getItem('tb_token')}` } : {}) },
                      body: JSON.stringify({ status: col.key }),
                    });
                    const j = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      toast.error(j.error || 'Move blocked by workflow rules');
                    } else {
                      toast.success(`Task moved to ${col.label} — synced to collaboration board`);
                      setAllTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: col.key } : t));
                    }
                  } catch {
                    toast.error('Failed to update task status');
                  }
                }
              }}
            >
              <div className={`${col.color} ${col.borderColor} border-t-2 rounded-t-lg px-3 py-2 flex items-center justify-between`}>
                <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                <span className="w-5 h-5 rounded-full bg-white text-xs font-medium text-slate-600 flex items-center justify-center shadow-sm">{col.tasks.length}</span>
              </div>
              <div className="bg-slate-50/50 rounded-b-lg p-2 space-y-2 min-h-[320px]">
                {col.tasks.map(t => (
                  <div key={t.id} draggable
                    onDragStart={() => setDraggedTask(t.id)}
                    className="thb-card p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-medium text-slate-800 flex-1">{t.name}</p>
                      {(t._count?.attachments ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-slate-400 shrink-0 ml-1" title={`${t._count?.attachments} attachment(s)`}>📎 {t._count?.attachments}</span>
                      )}
                    </div>
                    {t.description && <p className="text-[11px] text-slate-500 line-clamp-2 mb-1.5" title={t.description}>{t.description}</p>}
                    {(t.source === 'external' || t.client) && (
                      <p className="text-[11px] text-violet-600 font-medium mb-1.5 truncate">
                        <span className="thb-badge bg-violet-100 text-violet-700 mr-1">External</span>
                        {t.client?.name || 'Client'}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={getPriorityBadge(t.priority)}>{t.priority}</span>
                      {t.taskType && <span className="thb-badge bg-fuchsia-100 text-fuchsia-700">{taskTypeLabel(t.taskType)}</span>}
                      {t.workflowStep && <span className={workflowStepBadgeClass(t.workflowStep)}>{workflowStepLabel(t.workflowStep)}</span>}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <FiClock className="w-3 h-3" />{t.plannedStart ? formatDate(t.plannedStart) : '—'} → {formatDate(t.plannedEnd)}
                      </span>
                      <span>{t.estimatedHours ? `${t.estimatedHours}h` : ''}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 truncate">{t.project?.name || '—'}</p>
                  </div>
                ))}
                {col.tasks.length === 0 && (
                  <div className="text-center py-8 text-xs text-slate-400">No tasks</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="thb-card p-8 text-center">
          <FiCheckSquare className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <h4 className="text-sm font-semibold text-slate-700 mb-1">No Tasks</h4>
          <p className="text-xs text-slate-500">Create tasks to see them on the Kanban board.</p>
        </div>
      )}
    </div>
  );

  /* ── Timeline Tab — REMOVED (Task 150: timeline hidden, may be re-plugged later) ── */

  /* ── Reports Tab ── */
  const renderReports = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-800">Project Reports</h3>
        <a href="/project-management/reports" className="inline-flex items-center gap-2 px-4 py-2 bg-[#3A57C4] hover:bg-[#2C43A3] text-white rounded-lg text-sm font-medium transition-colors">
          <FiBarChart2 className="w-4 h-4" /> Full Reports Page
        </a>
      </div>

      {projects.length === 0 ? (
        <div className="thb-card p-8 text-center">
          <FiTrendingUp className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <h4 className="text-sm font-semibold text-slate-700 mb-1">No Report Data</h4>
          <p className="text-xs text-slate-500">Project report data will appear here once projects are created.</p>
        </div>
      ) : (
        <>
          {/* Summary Cards — shared SmartHR StatCards (Task 156-c) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Tasks" value={allTasks.length} sub="Across all projects" icon={<FiCheckSquare className="w-5 h-5" />} bg="bg-[#009EFB]/10 text-[#009EFB]" ring="ring-[#009EFB]/20" />
            <StatCard label="Completed Tasks" value={allTasks.filter(t => t.status === 'done').length} sub="Status = done" icon={<FiTarget className="w-5 h-5" />} bg="bg-[#10B981]/10 text-[#10B981]" ring="ring-[#10B981]/20" />
            <StatCard label="Avg Progress" value={`${stats.teamUtilization}%`} sub="Mean project progress" icon={<FiActivity className="w-5 h-5" />} bg="bg-[#FF9B44]/15 text-[#FF9B44]" ring="ring-[#FF9B44]/20" />
            <StatCard label="Total Budget" value={`$${((projects.reduce((a, p) => a + (p.budgetAmount || 0), 0)) / 1000000).toFixed(2)}M`} sub="Sum of project budgets" icon={<FiBriefcase className="w-5 h-5" />} bg="bg-[#6C4FD6]/10 text-[#6C4FD6]" ring="ring-[#6C4FD6]/20" />
          </div>

          {projectStatusData.length > 0 && (
            <Panel title="Project Status Distribution" icon={<FiBarChart2 className="w-4 h-4" />} accent="text-[#3A57C4]">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={projectStatusData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {projectStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Panel>
          )}
        </>
      )}
    </div>
  );

  /* ── Create Task Modal — Task 131: the SHARED form (src/components/tasks/
     CreateTaskModal.tsx). Identical fields + design on all three surfaces
     (PM dashboard, Tasks page, delivery board) and 1:1 with the mobile
     create sheet — including attachments at creation. */
  const renderCreateTaskModal = () => (
    <CreateTaskModal
      open={showCreateTask}
      onClose={() => setShowCreateTask(false)}
      onCreated={async () => { await Promise.all([fetchData(), fetchAllTasks()]); }}
      projects={projects}
      employees={taskEmployees}
    />
  );

  return (
    <div className="min-h-screen bg-[var(--thb-background)]">
      {/* Header — shared StatCards + action row (Task 156: the shell now
          renders the SmartHR gradient banner, so the old in-content
          PageBreadcrumbs block was removed; the New Task CTA moved into the
          action row below, still shown above the tab bar). */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        {/* Task 156 — header actions (moved from the old in-content banner; the shell now renders the SmartHR banner) */}
        <div className="flex items-center justify-end gap-2 flex-wrap -mt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={openCreateTask} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#FF9B44] to-[#FFC107] text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-all">
              <FiPlus className="w-4 h-4" /> New Task
            </button>
          </div>
        </div>

        {/* Stats Row — Task 150 naming kept (Clients + External Issues replace Sprints + Milestones) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          <StatCard label="Total Projects" value={stats.totalProjects} sub="All statuses tracked" icon={<FiBriefcase className="w-5 h-5" />} bg="bg-[#3A57C4]/10 text-[#3A57C4]" ring="ring-[#3A57C4]/20" />
          <StatCard label="Clients" value={stats.totalClients} sub="Active client accounts" icon={<FiUsers className="w-5 h-5" />} bg="bg-[#6C4FD6]/10 text-[#6C4FD6]" ring="ring-[#6C4FD6]/20" />
          <StatCard label="Total Tasks" value={stats.tasksThisWeek} sub="Across all projects" icon={<FiCheckSquare className="w-5 h-5" />} bg="bg-[#009EFB]/10 text-[#009EFB]" ring="ring-[#009EFB]/20" />
          <StatCard label="Overdue Tasks" value={stats.overdueTasks} sub="Past planned end date" icon={<FiAlertCircle className="w-5 h-5" />} bg="bg-[#F43F5E]/10 text-[#F43F5E]" ring="ring-[#F43F5E]/20" />
          <StatCard label="External Issues" value={stats.externalIssues} sub="Sourced from clients" icon={<FiFlag className="w-5 h-5" />} bg="bg-[#FF9B44]/15 text-[#FF9B44]" ring="ring-[#FF9B44]/20" />
          <StatCard label="Avg Progress" value={`${stats.teamUtilization}%`} sub="Mean across projects" icon={<FiActivity className="w-5 h-5" />} bg="bg-[#10B981]/10 text-[#10B981]" ring="ring-[#10B981]/20" />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-[#3A57C4] text-[#3A57C4]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'projects' && renderProjects()}
        {activeTab === 'tasks' && renderTasks()}
        {activeTab === 'reports' && renderReports()}
      </div>

      {/* Modals */}
      {renderCreateTaskModal()}
    </div>
  );
}
