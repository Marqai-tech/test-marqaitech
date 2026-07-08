'use client';

import { useState, useMemo, Suspense } from 'react';
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

/* ── Demo Data ── */
const DEMO_PROJECTS = [
  { id: '1', name: 'HRMS Core Platform', client: '3Boxes Internal', status: 'active', progress: 72, startDate: '2025-01-15', endDate: '2025-08-30', teamSize: 8, budget: 450000, manager: 'Rajesh Kumar', priority: 'high' },
  { id: '2', name: 'Mobile App Development', client: 'TechCorp Inc', status: 'active', progress: 45, startDate: '2025-03-01', endDate: '2025-10-15', teamSize: 5, budget: 280000, manager: 'Priya Sharma', priority: 'high' },
  { id: '3', name: 'Data Analytics Dashboard', client: 'AnalyticsPro', status: 'on_hold', progress: 30, startDate: '2025-02-10', endDate: '2025-07-20', teamSize: 4, budget: 180000, manager: 'Vikram Singh', priority: 'medium' },
  { id: '4', name: 'API Integration Layer', client: '3Boxes Internal', status: 'active', progress: 88, startDate: '2024-11-01', endDate: '2025-06-30', teamSize: 3, budget: 120000, manager: 'Anita Desai', priority: 'medium' },
  { id: '5', name: 'E-Commerce Platform', client: 'RetailMax', status: 'completed', progress: 100, startDate: '2024-06-01', endDate: '2025-02-28', teamSize: 10, budget: 650000, manager: 'Rajesh Kumar', priority: 'low' },
  { id: '6', name: 'Cloud Migration', client: 'CloudFirst Ltd', status: 'active', progress: 55, startDate: '2025-04-01', endDate: '2025-12-31', teamSize: 6, budget: 320000, manager: 'Suresh Patel', priority: 'critical' },
  { id: '7', name: 'AI Chatbot Integration', client: 'ServiceBot Inc', status: 'draft', progress: 5, startDate: '2025-07-01', endDate: '2025-11-30', teamSize: 4, budget: 200000, manager: 'Priya Sharma', priority: 'medium' },
  { id: '8', name: 'Legacy System Upgrade', client: 'OldTech Corp', status: 'cancelled', progress: 15, startDate: '2025-01-01', endDate: '2025-06-30', teamSize: 3, budget: 150000, manager: 'Vikram Singh', priority: 'low' },
];

const DEMO_SPRINTS = [
  { id: 's1', name: 'Sprint 12 - Core Features', projectId: '1', projectName: 'HRMS Core Platform', status: 'active', startDate: '2025-06-16', endDate: '2025-06-30', goal: 'Complete user management & reporting modules', totalTasks: 14, completedTasks: 9, velocity: 21 },
  { id: 's2', name: 'Sprint 8 - Mobile UI', projectId: '2', projectName: 'Mobile App Development', status: 'active', startDate: '2025-06-16', endDate: '2025-06-30', goal: 'Build dashboard & notification screens', totalTasks: 10, completedTasks: 6, velocity: 15 },
  { id: 's3', name: 'Sprint 5 - API v2', projectId: '4', projectName: 'API Integration Layer', status: 'active', startDate: '2025-06-16', endDate: '2025-06-30', goal: 'Complete REST endpoints & documentation', totalTasks: 8, completedTasks: 7, velocity: 18 },
  { id: 's4', name: 'Sprint 13 - Planning', projectId: '1', projectName: 'HRMS Core Platform', status: 'planning', startDate: '2025-07-01', endDate: '2025-07-14', goal: 'Sprint planning for attendance module', totalTasks: 12, completedTasks: 0, velocity: 0 },
];

const DEMO_TASKS = [
  { id: 't1', title: 'Implement user authentication flow', project: 'HRMS Core Platform', assignee: 'Amit K.', priority: 'critical', dueDate: '2025-06-25', storyPoints: 8, status: 'in_progress', sprint: 'Sprint 12' },
  { id: 't2', title: 'Design reporting dashboard layout', project: 'HRMS Core Platform', assignee: 'Neha R.', priority: 'high', dueDate: '2025-06-28', storyPoints: 5, status: 'in_progress', sprint: 'Sprint 12' },
  { id: 't3', title: 'Build mobile notification system', project: 'Mobile App Development', assignee: 'Ravi M.', priority: 'high', dueDate: '2025-06-30', storyPoints: 8, status: 'review', sprint: 'Sprint 8' },
  { id: 't4', title: 'API rate limiting middleware', project: 'API Integration Layer', assignee: 'Sanjay P.', priority: 'medium', dueDate: '2025-06-27', storyPoints: 3, status: 'done', sprint: 'Sprint 5' },
  { id: 't5', title: 'Database migration scripts', project: 'Cloud Migration', assignee: 'Kavita S.', priority: 'critical', dueDate: '2025-06-20', storyPoints: 13, status: 'backlog', sprint: 'Backlog' },
  { id: 't6', title: 'Unit tests for payroll module', project: 'HRMS Core Platform', assignee: 'Deepak V.', priority: 'medium', dueDate: '2025-07-02', storyPoints: 5, status: 'todo', sprint: 'Sprint 12' },
  { id: 't7', title: 'Performance optimization sprint', project: 'HRMS Core Platform', assignee: 'Amit K.', priority: 'low', dueDate: '2025-07-05', storyPoints: 3, status: 'todo', sprint: 'Sprint 13' },
  { id: 't8', title: 'Mobile dashboard API integration', project: 'Mobile App Development', assignee: 'Neha R.', priority: 'high', dueDate: '2025-06-29', storyPoints: 8, status: 'in_progress', sprint: 'Sprint 8' },
  { id: 't9', title: 'Cloud infrastructure setup', project: 'Cloud Migration', assignee: 'Suresh P.', priority: 'critical', dueDate: '2025-06-18', storyPoints: 13, status: 'in_progress', sprint: 'Backlog' },
  { id: 't10', title: 'Chatbot NLP model training', project: 'AI Chatbot Integration', assignee: 'Priya S.', priority: 'medium', dueDate: '2025-08-15', storyPoints: 21, status: 'backlog', sprint: 'Backlog' },
  { id: 't11', title: 'E2E testing for leave module', project: 'HRMS Core Platform', assignee: 'Ravi M.', priority: 'high', dueDate: '2025-06-26', storyPoints: 5, status: 'review', sprint: 'Sprint 12' },
  { id: 't12', title: 'OAuth2 provider integration', project: 'API Integration Layer', assignee: 'Amit K.', priority: 'high', dueDate: '2025-06-30', storyPoints: 8, status: 'done', sprint: 'Sprint 5' },
  { id: 't13', title: 'Accessibility audit report', project: 'Mobile App Development', assignee: 'Neha R.', priority: 'medium', dueDate: '2025-07-01', storyPoints: 3, status: 'todo', sprint: 'Sprint 8' },
  { id: 't14', title: 'CI/CD pipeline configuration', project: 'Cloud Migration', assignee: 'Sanjay P.', priority: 'high', dueDate: '2025-07-03', storyPoints: 5, status: 'todo', sprint: 'Backlog' },
  { id: 't15', title: 'Data encryption at rest', project: 'Cloud Migration', assignee: 'Kavita S.', priority: 'critical', dueDate: '2025-06-22', storyPoints: 8, status: 'review', sprint: 'Backlog' },
];

const CHART_COLORS = ['#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

const projectStatusData = [
  { name: 'Active', value: 4, color: '#10B981' },
  { name: 'On Hold', value: 1, color: '#F59E0B' },
  { name: 'Completed', value: 1, color: '#3B82F6' },
  { name: 'Cancelled', value: 1, color: '#EF4444' },
  { name: 'Draft', value: 1, color: '#94A3B8' },
];

const burndownData = [
  { day: 'Day 1', ideal: 80, actual: 80 },
  { day: 'Day 2', ideal: 73, actual: 78 },
  { day: 'Day 3', ideal: 66, actual: 72 },
  { day: 'Day 4', ideal: 59, actual: 65 },
  { day: 'Day 5', ideal: 52, actual: 58 },
  { day: 'Day 6', ideal: 45, actual: 50 },
  { day: 'Day 7', ideal: 38, actual: 44 },
  { day: 'Day 8', ideal: 31, actual: 38 },
  { day: 'Day 9', ideal: 24, actual: 30 },
  { day: 'Day 10', ideal: 17, actual: 22 },
];

const taskDistData = [
  { name: 'Backlog', count: 3, fill: '#94A3B8' },
  { name: 'To Do', count: 4, fill: '#3B82F6' },
  { name: 'In Progress', count: 5, fill: '#F59E0B' },
  { name: 'Review', count: 3, fill: '#8B5CF6' },
  { name: 'Done', count: 2, fill: '#10B981' },
];

const teamWorkloadData = [
  { name: 'Amit K.', tasks: 3, color: '#8B5CF6' },
  { name: 'Neha R.', tasks: 4, color: '#EC4899' },
  { name: 'Ravi M.', tasks: 2, color: '#3B82F6' },
  { name: 'Sanjay P.', tasks: 2, color: '#10B981' },
  { name: 'Kavita S.', tasks: 2, color: '#F59E0B' },
  { name: 'Deepak V.', tasks: 1, color: '#EF4444' },
  { name: 'Suresh P.', tasks: 1, color: '#6366F1' },
];

const recentActivity = [
  { id: '1', user: 'Amit K.', action: 'moved task', target: 'Implement user authentication flow', from: 'To Do', to: 'In Progress', time: '10 min ago', icon: <FiActivity className="w-3 h-3" /> },
  { id: '2', user: 'Neha R.', action: 'completed', target: 'Design reporting dashboard layout', from: '', to: 'Review', time: '25 min ago', icon: <FiCheckSquare className="w-3 h-3" /> },
  { id: '3', user: 'Sanjay P.', action: 'added comment on', target: 'API rate limiting middleware', from: '', to: '', time: '1 hour ago', icon: <FiActivity className="w-3 h-3" /> },
  { id: '4', user: 'Rajesh Kumar', action: 'created sprint', target: 'Sprint 13 - Planning', from: '', to: '', time: '2 hours ago', icon: <FiLayers className="w-3 h-3" /> },
  { id: '5', user: 'Priya S.', action: 'updated', target: 'AI Chatbot Integration project', from: '', to: '', time: '3 hours ago', icon: <FiEdit2 className="w-3 h-3" /> },
  { id: '6', user: 'Kavita S.', action: 'moved task', target: 'Data encryption at rest', from: 'In Progress', to: 'Review', time: '4 hours ago', icon: <FiActivity className="w-3 h-3" /> },
];

const upcomingDeadlines = [
  { id: '1', title: 'Cloud infrastructure setup', project: 'Cloud Migration', dueDate: '2025-06-18', priority: 'critical', assignee: 'Suresh P.' },
  { id: '2', title: 'Data encryption at rest', project: 'Cloud Migration', dueDate: '2025-06-22', priority: 'critical', assignee: 'Kavita S.' },
  { id: '3', title: 'Database migration scripts', project: 'Cloud Migration', dueDate: '2025-06-20', priority: 'critical', assignee: 'Kavita S.' },
  { id: '4', title: 'Implement user authentication flow', project: 'HRMS Core Platform', dueDate: '2025-06-25', priority: 'critical', assignee: 'Amit K.' },
  { id: '5', title: 'E2E testing for leave module', project: 'HRMS Core Platform', dueDate: '2025-06-26', priority: 'high', assignee: 'Ravi M.' },
];

/* ── Tab Types ── */
type TabId = 'dashboard' | 'projects' | 'sprints' | 'tasks' | 'timeline' | 'reports';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <FiBarChart2 className="w-4 h-4" /> },
  { id: 'projects', label: 'Projects', icon: <FiBriefcase className="w-4 h-4" /> },
  { id: 'sprints', label: 'Sprints', icon: <FiLayers className="w-4 h-4" /> },
  { id: 'tasks', label: 'Tasks', icon: <FiCheckSquare className="w-4 h-4" /> },
  { id: 'timeline', label: 'Timeline', icon: <FiClock className="w-4 h-4" /> },
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
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg mb-4">
        <FiFileText className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-thb-text-primary mb-1">Project Reports</h3>
      <p className="text-sm text-thb-text-secondary text-center max-w-md">
        Project progress reports, resource utilization, and timeline analytics. Coming soon.
      </p>
    </div>
  );
}

function ProjectSettingsPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg mb-4">
        <FiSettings className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-thb-text-primary mb-1">Project Settings</h3>
      <p className="text-sm text-thb-text-secondary text-center max-w-md">
        Configure project templates, default views, and notification preferences. Coming soon.
      </p>
    </div>
  );
}

function ProjectManagementPageContent() {
  return (
    <ModuleDashboardShell
      moduleKey="project"
      moduleLabel="Project Management"
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
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [projectViewMode, setProjectViewMode] = useState<'grid' | 'list'>('grid');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [projectFilter, setProjectFilter] = useState('all');
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);

  const stats = useMemo(() => ({
    totalProjects: DEMO_PROJECTS.length,
    activeSprints: DEMO_SPRINTS.filter(s => s.status === 'active').length,
    tasksThisWeek: 23,
    overdueTasks: DEMO_TASKS.filter(t => new Date(t.dueDate) < new Date() && t.status !== 'done').length,
    teamUtilization: 78,
    completedMilestones: 12,
  }), []);

  const filteredProjects = useMemo(() => {
    let projects = DEMO_PROJECTS;
    if (projectFilter !== 'all') projects = projects.filter(p => p.status === projectFilter);
    if (searchQuery) projects = projects.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.client.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return projects;
  }, [projectFilter, searchQuery]);

  const kanbanColumns = useMemo(() => [
    { key: 'backlog', label: 'Backlog', color: 'bg-slate-100', borderColor: 'border-t-slate-400', tasks: DEMO_TASKS.filter(t => t.status === 'backlog') },
    { key: 'todo', label: 'To Do', color: 'bg-blue-50', borderColor: 'border-t-blue-500', tasks: DEMO_TASKS.filter(t => t.status === 'todo') },
    { key: 'in_progress', label: 'In Progress', color: 'bg-amber-50', borderColor: 'border-t-amber-500', tasks: DEMO_TASKS.filter(t => t.status === 'in_progress') },
    { key: 'review', label: 'Review', color: 'bg-purple-50', borderColor: 'border-t-purple-500', tasks: DEMO_TASKS.filter(t => t.status === 'review') },
    { key: 'done', label: 'Done', color: 'bg-emerald-50', borderColor: 'border-t-emerald-500', tasks: DEMO_TASKS.filter(t => t.status === 'done') },
  ], []);

  const overdueTasksList = useMemo(() =>
    DEMO_TASKS.filter(t => new Date(t.dueDate) < new Date() && t.status !== 'done'),
    []);

  /* ── Dashboard Tab ── */
  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Project Status Pie */}
        <div className="thb-card p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Project Status</h3>
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
        </div>

        {/* Sprint Burndown */}
        <div className="thb-card p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Sprint Burndown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={burndownData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend iconType="line" wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="ideal" stroke="#94A3B8" fill="#F1F5F9" strokeWidth={2} strokeDasharray="5 5" name="Ideal" />
              <Area type="monotone" dataKey="actual" stroke="#8B5CF6" fill="#F5F3FF" strokeWidth={2} name="Actual" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Task Distribution */}
        <div className="thb-card p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Task Distribution</h3>
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
        </div>

        {/* Team Workload */}
        <div className="thb-card p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Team Workload</h3>
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
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Overdue Tasks */}
        <div className="thb-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <FiAlertCircle className="w-4 h-4 text-red-500" /> Overdue Tasks
            </h3>
            <span className="thb-badge thb-badge-error">{overdueTasksList.length}</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {overdueTasksList.map(t => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                  <p className="text-xs text-slate-500">{t.project} &middot; {t.assignee}</p>
                </div>
                <span className="text-xs text-red-600 font-medium ml-2">{formatDate(t.dueDate)}</span>
              </div>
            ))}
            {overdueTasksList.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No overdue tasks</p>}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="thb-card p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <FiActivity className="w-4 h-4 text-purple-500" /> Recent Activity
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recentActivity.map(a => (
              <div key={a.id} className="flex gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                  {a.user.split(' ').map(w => w[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700">
                    <span className="font-semibold">{a.user}</span> {a.action}{' '}
                    <span className="font-medium text-slate-900">{a.target}</span>
                    {a.from && a.to && <span className="text-slate-400"> ({a.from} → {a.to})</span>}
                  </p>
                  <p className="text-xs text-slate-400">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="thb-card p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <FiCalendar className="w-4 h-4 text-amber-500" /> Upcoming Deadlines
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {upcomingDeadlines.map(d => (
              <div key={d.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{d.title}</p>
                  <p className="text-xs text-slate-500">{d.project} &middot; {d.assignee}</p>
                </div>
                <div className="flex flex-col items-end ml-2">
                  <span className={getPriorityBadge(d.priority)}>{d.priority}</span>
                  <span className="text-xs text-slate-400 mt-1">{formatDate(d.dueDate)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="thb-card p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setShowCreateProject(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors">
            <FiPlus className="w-4 h-4" /> New Project
          </button>
          <button onClick={() => setShowCreateSprint(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
            <FiLayers className="w-4 h-4" /> New Sprint
          </button>
          <button onClick={() => setShowCreateTask(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors">
            <FiCheckSquare className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>
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
            <input type="text" placeholder="Search projects..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" />
          </div>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setProjectViewMode('grid')} className={`p-2 rounded-lg border ${projectViewMode === 'grid' ? 'bg-purple-50 border-purple-200 text-purple-600' : 'border-slate-200 text-slate-400 hover:text-slate-600'}`}>
            <FiGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setProjectViewMode('list')} className={`p-2 rounded-lg border ${projectViewMode === 'list' ? 'bg-purple-50 border-purple-200 text-purple-600' : 'border-slate-200 text-slate-400 hover:text-slate-600'}`}>
            <FiList className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreateProject(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors">
            <FiPlus className="w-4 h-4" /> New Project
          </button>
        </div>
      </div>

      {/* Grid View */}
      {projectViewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map(p => (
            <div key={p.id} className="thb-card thb-card-hover p-4 cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-800 truncate">{p.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{p.client}</p>
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
                <div className="flex items-center gap-1"><FiUsers className="w-3 h-3" />{p.teamSize} members</div>
                <div className="flex items-center gap-1"><FiUser className="w-3 h-3" />{p.manager}</div>
                <div className="flex items-center gap-1"><span className="font-medium text-slate-700">${(p.budget / 1000).toFixed(0)}k</span> budget</div>
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
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Manager</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Team</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Budget</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Dates</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map(p => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.client}</td>
                    <td className="px-4 py-3"><span className={getStatusBadge(p.status)}>{formatStatus(p.status)}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full" style={{ width: `${p.progress}%`, background: p.progress >= 80 ? '#10B981' : p.progress >= 50 ? '#F59E0B' : '#3B82F6' }} />
                        </div>
                        <span className="text-xs text-slate-500">{p.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.manager}</td>
                    <td className="px-4 py-3 text-slate-600">{p.teamSize}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">${(p.budget / 1000).toFixed(0)}k</td>
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

  /* ── Sprints Tab ── */
  const renderSprints = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">Sprint Management</h3>
        <button onClick={() => setShowCreateSprint(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
          <FiPlus className="w-4 h-4" /> New Sprint
        </button>
      </div>

      {/* Active Sprints */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <FiPlay className="w-4 h-4 text-emerald-500" /> Active Sprints
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DEMO_SPRINTS.filter(s => s.status === 'active').map(s => {
            const pct = s.totalTasks > 0 ? Math.round((s.completedTasks / s.totalTasks) * 100) : 0;
            return (
              <div key={s.id} className="thb-card thb-card-hover p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h5 className="text-sm font-semibold text-slate-800">{s.name}</h5>
                    <p className="text-xs text-slate-500 mt-0.5">{s.projectName}</p>
                  </div>
                  <span className="thb-badge thb-badge-success">Active</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">Goal: {s.goal}</p>
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>{s.completedTasks}/{s.totalTasks} tasks</span>
                    <span className="font-medium">{pct}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1"><FiCalendar className="w-3 h-3" />{formatDate(s.startDate)} — {formatDate(s.endDate)}</span>
                  <span className="flex items-center gap-1"><FiZap className="w-3 h-3 text-amber-500" />Velocity: {s.velocity}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Planning Sprints */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <FiPause className="w-4 h-4 text-amber-500" /> Planning
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DEMO_SPRINTS.filter(s => s.status === 'planning').map(s => (
            <div key={s.id} className="thb-card p-4 border-dashed border-2">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h5 className="text-sm font-semibold text-slate-800">{s.name}</h5>
                  <p className="text-xs text-slate-500 mt-0.5">{s.projectName}</p>
                </div>
                <span className="thb-badge thb-badge-warning">Planning</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">Goal: {s.goal}</p>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1"><FiCalendar className="w-3 h-3" />{formatDate(s.startDate)} — {formatDate(s.endDate)}</span>
                <span>{s.totalTasks} tasks planned</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sprint Velocity Chart */}
      <div className="thb-card p-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">Sprint Velocity Trend</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={[
            { sprint: 'S8', velocity: 18 },
            { sprint: 'S9', velocity: 22 },
            { sprint: 'S10', velocity: 19 },
            { sprint: 'S11', velocity: 24 },
            { sprint: 'S12', velocity: 21 },
            { sprint: 'S5', velocity: 18 },
          ]}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="velocity" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Story Points" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  /* ── Tasks Tab (Kanban) ── */
  const renderTasks = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={myTasksOnly} onChange={e => setMyTasksOnly(e.target.checked)} className="rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
            My Tasks Only
          </label>
        </div>
        <button onClick={() => setShowCreateTask(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors">
          <FiPlus className="w-4 h-4" /> New Task
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
        {kanbanColumns.map(col => (
          <div key={col.key} className="flex-shrink-0 w-72"
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = 'rgba(139,92,246,0.05)'; }}
            onDragLeave={e => { e.currentTarget.style.background = ''; }}
            onDrop={e => {
              e.currentTarget.style.background = '';
              if (draggedTask) {
                toast.success(`Task moved to ${col.label}`);
                setDraggedTask(null);
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
                    <p className="text-sm font-medium text-slate-800 flex-1">{t.title}</p>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={getPriorityBadge(t.priority)}>{t.priority}</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1"><FiTarget className="w-3 h-3" />{t.storyPoints} SP</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1"><FiUser className="w-3 h-3" />{t.assignee}</span>
                    <span className={`flex items-center gap-1 ${new Date(t.dueDate) < new Date() && t.status !== 'done' ? 'text-red-500 font-medium' : ''}`}>
                      <FiClock className="w-3 h-3" />{formatDate(t.dueDate)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 truncate">{t.project}</p>
                </div>
              ))}
              {col.tasks.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">No tasks</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ── Timeline Tab ── */
  const renderTimeline = () => {
    const timelineProjects = DEMO_PROJECTS.filter(p => p.status !== 'cancelled');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const projectColors: Record<string, string> = {
      '1': '#8B5CF6', '2': '#EC4899', '3': '#F59E0B', '4': '#3B82F6', '5': '#10B981', '6': '#EF4444', '7': '#6366F1',
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Project Timeline</h3>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <FiCalendar className="w-4 h-4" /> 2025
          </div>
        </div>

        <div className="thb-card overflow-hidden">
          <div className="overflow-x-auto">
            {/* Month Headers */}
            <div className="flex border-b border-slate-100 bg-slate-50">
              <div className="w-48 flex-shrink-0 px-4 py-2 text-xs font-semibold text-slate-600">Project</div>
              {months.map((m, i) => (
                <div key={i} className="w-20 flex-shrink-0 px-2 py-2 text-xs text-center font-medium text-slate-500 border-l border-slate-100">{m}</div>
              ))}
            </div>

            {/* Project Rows */}
            {timelineProjects.map(p => {
              const startMonth = new Date(p.startDate).getMonth();
              const endMonth = new Date(p.endDate).getMonth();
              const startYear = new Date(p.startDate).getFullYear();
              const endYear = new Date(p.endDate).getFullYear();
              const adjustedStart = startYear === 2025 ? startMonth : 0;
              const adjustedEnd = endYear === 2025 ? endMonth : 11;
              const color = projectColors[p.id] || '#8B5CF6';
              const pctComplete = p.progress / 100;

              return (
                <div key={p.id} className="flex items-center border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <div className="w-48 flex-shrink-0 px-4 py-3">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.client}</p>
                  </div>
                  <div className="flex-1 flex relative h-10">
                    {months.map((m, i) => (
                      <div key={i} className="w-20 flex-shrink-0 border-l border-slate-100 h-full" />
                    ))}
                    {/* Bar */}
                    <div className="absolute top-1.5 h-7 rounded-md" style={{
                      left: `${(adjustedStart / 12) * 100}%`,
                      width: `${((adjustedEnd - adjustedStart + 1) / 12) * 100}%`,
                      background: color,
                      opacity: 0.2,
                    }} />
                    <div className="absolute top-1.5 h-7 rounded-md" style={{
                      left: `${(adjustedStart / 12) * 100}%`,
                      width: `${((adjustedEnd - adjustedStart + 1) / 12) * 100 * pctComplete}%`,
                      background: color,
                      borderRadius: '6px',
                    }}>
                      <span className="text-xs text-white font-medium px-2 leading-7 whitespace-nowrap">{p.progress}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Milestones */}
        <div className="thb-card p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <FiFlag className="w-4 h-4 text-purple-500" /> Key Milestones
          </h4>
          <div className="space-y-2">
            {[
              { date: '2025-06-30', label: 'API v2 Release', project: 'API Integration Layer', status: 'on_track' },
              { date: '2025-08-30', label: 'HRMS Core v1.0', project: 'HRMS Core Platform', status: 'at_risk' },
              { date: '2025-10-15', label: 'Mobile App Beta', project: 'Mobile App Development', status: 'on_track' },
              { date: '2025-12-31', label: 'Cloud Migration Complete', project: 'Cloud Migration', status: 'at_risk' },
            ].map((m, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${m.status === 'on_track' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{m.label}</p>
                    <p className="text-xs text-slate-500">{m.project}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500">{formatDate(m.date)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  /* ── Reports Tab ── */
  const renderReports = () => {
    const velocityData = [
      { sprint: 'Sprint 7', planned: 25, completed: 20 },
      { sprint: 'Sprint 8', planned: 28, completed: 22 },
      { sprint: 'Sprint 9', planned: 22, completed: 19 },
      { sprint: 'Sprint 10', planned: 30, completed: 24 },
      { sprint: 'Sprint 11', planned: 26, completed: 24 },
      { sprint: 'Sprint 12', planned: 28, completed: 21 },
    ];

    const timeData = [
      { project: 'HRMS Core', hours: 640, budget: 800 },
      { project: 'Mobile App', hours: 380, budget: 500 },
      { project: 'Data Analytics', hours: 220, budget: 300 },
      { project: 'API Layer', hours: 280, budget: 300 },
      { project: 'Cloud Migration', hours: 420, budget: 600 },
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Project Reports</h3>
          <button onClick={() => toast.success('Report exported successfully!')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <FiFileText className="w-4 h-4" /> Export Report
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Velocity Chart */}
          <div className="thb-card p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Sprint Velocity</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={velocityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="sprint" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="planned" fill="#C4B5FD" radius={[4, 4, 0, 0]} name="Planned" />
                <Bar dataKey="completed" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Burndown Chart */}
          <div className="thb-card p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Sprint Burndown (Current)</h4>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={burndownData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="ideal" stroke="#94A3B8" fill="#F1F5F9" strokeWidth={2} strokeDasharray="5 5" name="Ideal" />
                <Area type="monotone" dataKey="actual" stroke="#EC4899" fill="#FDF2F8" strokeWidth={2} name="Actual" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Budget vs Hours */}
          <div className="thb-card p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Budget vs Hours (in hundreds)</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={timeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="project" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="hours" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Hours Logged" />
                <Bar dataKey="budget" fill="#BFDBFE" radius={[4, 4, 0, 0]} name="Budget Hours" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Resource Utilization */}
          <div className="thb-card p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Resource Utilization</h4>
            <div className="space-y-3">
              {teamWorkloadData.map((m, i) => {
                const util = Math.min(100, Math.round((m.tasks / 5) * 100));
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">{m.name}</span>
                      <span className={`${util > 80 ? 'text-red-600' : util > 60 ? 'text-amber-600' : 'text-emerald-600'} font-medium`}>{util}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className="h-2 rounded-full transition-all" style={{ width: `${util}%`, background: util > 80 ? '#EF4444' : util > 60 ? '#F59E0B' : '#10B981' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="thb-card p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">124</p>
            <p className="text-xs text-slate-500 mt-1">Total Story Points</p>
          </div>
          <div className="thb-card p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">1,940</p>
            <p className="text-xs text-slate-500 mt-1">Hours Logged</p>
          </div>
          <div className="thb-card p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">78%</p>
            <p className="text-xs text-slate-500 mt-1">Utilization Rate</p>
          </div>
          <div className="thb-card p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">$2.35M</p>
            <p className="text-xs text-slate-500 mt-1">Total Budget</p>
          </div>
        </div>
      </div>
    );
  };

  /* ── Create Project Modal ── */
  const renderCreateProjectModal = () => showCreateProject && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateProject(false)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">Create New Project</h3>
          <button onClick={() => setShowCreateProject(false)} className="p-1 rounded hover:bg-slate-100"><FiX className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project Name *</label>
            <input type="text" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" placeholder="Enter project name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client</label>
              <input type="text" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" placeholder="Client name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Manager</label>
              <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                <option>Select manager</option>
                <option>Rajesh Kumar</option>
                <option>Priya Sharma</option>
                <option>Vikram Singh</option>
                <option>Anita Desai</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input type="date" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
              <input type="date" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Budget ($)</label>
              <input type="number" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" placeholder="Project description..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Team Members</label>
            <input type="text" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" placeholder="Search and add team members..." />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100">
          <button onClick={() => setShowCreateProject(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={() => { setShowCreateProject(false); toast.success('Project created successfully!'); }} className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors">Create Project</button>
        </div>
      </div>
    </div>
  );

  /* ── Create Sprint Modal ── */
  const renderCreateSprintModal = () => showCreateSprint && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateSprint(false)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">Create New Sprint</h3>
          <button onClick={() => setShowCreateSprint(false)} className="p-1 rounded hover:bg-slate-100"><FiX className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sprint Name *</label>
            <input type="text" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" placeholder="e.g., Sprint 14 - Feature X" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project *</label>
            <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
              <option>Select project</option>
              {DEMO_PROJECTS.filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input type="date" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
              <input type="date" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sprint Goal</label>
            <textarea rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" placeholder="What should this sprint achieve?" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100">
          <button onClick={() => setShowCreateSprint(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={() => { setShowCreateSprint(false); toast.success('Sprint created successfully!'); }} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors">Create Sprint</button>
        </div>
      </div>
    </div>
  );

  /* ── Create Task Modal ── */
  const renderCreateTaskModal = () => showCreateTask && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateTask(false)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">Create New Task</h3>
          <button onClick={() => setShowCreateTask(false)} className="p-1 rounded hover:bg-slate-100"><FiX className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Task Title *</label>
            <input type="text" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" placeholder="Enter task title" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" placeholder="Task description..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
              <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                <option>Select project</option>
                {DEMO_PROJECTS.filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sprint</label>
              <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                <option>Select sprint</option>
                {DEMO_SPRINTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assignee</label>
              <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                <option>Select assignee</option>
                <option>Amit K.</option>
                <option>Neha R.</option>
                <option>Ravi M.</option>
                <option>Sanjay P.</option>
                <option>Kavita S.</option>
                <option>Deepak V.</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
              <input type="date" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Story Points</label>
              <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="5">5</option>
                <option value="8">8</option>
                <option value="13">13</option>
                <option value="21">21</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Labels</label>
            <input type="text" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500" placeholder="bug, feature, enhancement (comma-separated)" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100">
          <button onClick={() => setShowCreateTask(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={() => { setShowCreateTask(false); toast.success('Task created successfully!'); }} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors">Create Task</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--thb-background)]">
      {/* Hero Gradient */}
      <div className="bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <FiBriefcase className="w-7 h-7 text-white/90" />
            <h1 className="text-2xl font-bold text-white">Project Management</h1>
          </div>
          <p className="text-white/70 text-sm">Manage projects, sprints, tasks, and track team performance</p>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
            {[
              { label: 'Total Projects', value: stats.totalProjects, icon: <FiBriefcase className="w-4 h-4" />, color: 'bg-white/15' },
              { label: 'Active Sprints', value: stats.activeSprints, icon: <FiLayers className="w-4 h-4" />, color: 'bg-white/15' },
              { label: 'Tasks This Week', value: stats.tasksThisWeek, icon: <FiCheckSquare className="w-4 h-4" />, color: 'bg-white/15' },
              { label: 'Overdue Tasks', value: stats.overdueTasks, icon: <FiAlertCircle className="w-4 h-4" />, color: 'bg-red-500/30' },
              { label: 'Team Utilization', value: `${stats.teamUtilization}%`, icon: <FiUsers className="w-4 h-4" />, color: 'bg-white/15' },
              { label: 'Milestones Done', value: stats.completedMilestones, icon: <FiFlag className="w-4 h-4" />, color: 'bg-white/15' },
            ].map((s, i) => (
              <div key={i} className={`${s.color} backdrop-blur-sm rounded-xl px-3 py-2 text-white`}>
                <div className="flex items-center gap-2 text-white/70 text-xs mb-0.5">{s.icon}{s.label}</div>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            ))}
          </div>
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
                    ? 'border-purple-600 text-purple-600'
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
        {activeTab === 'sprints' && renderSprints()}
        {activeTab === 'tasks' && renderTasks()}
        {activeTab === 'timeline' && renderTimeline()}
        {activeTab === 'reports' && renderReports()}
      </div>

      {/* Modals */}
      {renderCreateProjectModal()}
      {renderCreateSprintModal()}
      {renderCreateTaskModal()}
    </div>
  );
}
