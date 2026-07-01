'use client';

import { useState, useMemo } from 'react';
import {
  FiLayers,
  FiPlus,
  FiChevronDown,
  FiClock,
  FiCheckCircle,
  FiAlertCircle,
  FiLayout,
  FiCalendar,
  FiPaperclip,
  FiMessageSquare,
  FiX,
  FiSearch,
  FiMoreHorizontal,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/* ──────────── Types ──────────── */
type Priority = 'High' | 'Medium' | 'Low';
type KanbanColumn = 'Backlog' | 'To Do' | 'In Progress' | 'Done';
type Category = 'HR' | 'Payroll' | 'Recruitment' | 'Admin' | 'Compliance' | 'Training' | 'Benefits' | 'Operations' | 'Onboarding' | 'Engagement';

interface KanbanCard {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  column: KanbanColumn;
  assignee: { name: string; initials: string; gradient: string };
  dueDate: string;
  subtasksDone: number;
  subtasksTotal: number;
  attachments: number;
  comments: number;
}

interface NewCardForm {
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  dueDate: string;
  assigneeName: string;
  column: KanbanColumn;
}

/* ──────────── Constants ──────────── */
const BOARDS = ['HR Pipeline', 'Recruitment', 'Onboarding', 'Projects'] as const;

const COLUMNS: { key: KanbanColumn; color: string; headerBg: string; headerText: string }[] = [
  { key: 'Backlog', color: 'border-l-slate-400', headerBg: 'bg-slate-100', headerText: 'text-slate-700' },
  { key: 'To Do', color: 'border-l-blue-500', headerBg: 'bg-blue-50', headerText: 'text-blue-700' },
  { key: 'In Progress', color: 'border-l-amber-500', headerBg: 'bg-amber-50', headerText: 'text-amber-700' },
  { key: 'Done', color: 'border-l-emerald-500', headerBg: 'bg-emerald-50', headerText: 'text-emerald-700' },
];

const PRIORITY_STYLES: Record<Priority, { border: string; dot: string; label: string }> = {
  High: { border: 'border-l-red-500', dot: 'bg-red-500', label: 'text-red-600 bg-red-50' },
  Medium: { border: 'border-l-amber-400', dot: 'bg-amber-400', label: 'text-amber-600 bg-amber-50' },
  Low: { border: 'border-l-emerald-400', dot: 'bg-emerald-400', label: 'text-emerald-600 bg-emerald-50' },
};

const CATEGORY_STYLES: Record<Category, string> = {
  HR: 'bg-violet-100 text-violet-700',
  Payroll: 'bg-emerald-100 text-emerald-700',
  Recruitment: 'bg-blue-100 text-blue-700',
  Admin: 'bg-slate-100 text-slate-600',
  Compliance: 'bg-red-100 text-red-700',
  Training: 'bg-amber-100 text-amber-700',
  Benefits: 'bg-pink-100 text-pink-700',
  Operations: 'bg-cyan-100 text-cyan-700',
  Onboarding: 'bg-teal-100 text-teal-700',
  Engagement: 'bg-orange-100 text-orange-700',
};

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-violet-600',
  'from-lime-500 to-green-600',
];

const ASSIGNEES = [
  { name: 'Priya Sharma', initials: 'PS', gradient: AVATAR_GRADIENTS[0] },
  { name: 'Rahul Mehta', initials: 'RM', gradient: AVATAR_GRADIENTS[1] },
  { name: 'Anita Desai', initials: 'AD', gradient: AVATAR_GRADIENTS[2] },
  { name: 'Vikram Singh', initials: 'VS', gradient: AVATAR_GRADIENTS[3] },
  { name: 'Neha Gupta', initials: 'NG', gradient: AVATAR_GRADIENTS[4] },
  { name: 'Arjun Patel', initials: 'AP', gradient: AVATAR_GRADIENTS[5] },
  { name: 'Kavita Rao', initials: 'KR', gradient: AVATAR_GRADIENTS[6] },
  { name: 'Deepak Kumar', initials: 'DK', gradient: AVATAR_GRADIENTS[7] },
];

/* ──────────── Sample Data ──────────── */
const INITIAL_CARDS: KanbanCard[] = [
  // ─── Backlog (6 cards) ───
  { id: 'b1', title: 'Update employee handbook', description: 'Revise the employee handbook with new policies on remote work, dress code, and expense claims', priority: 'Medium', category: 'HR', column: 'Backlog', assignee: ASSIGNEES[0], dueDate: '2026-04-15', subtasksDone: 1, subtasksTotal: 4, attachments: 2, comments: 3 },
  { id: 'b2', title: 'Design new onboarding flow', description: 'Create an improved onboarding experience with digital checklists and automated welcome emails', priority: 'Low', category: 'Onboarding', column: 'Backlog', assignee: ASSIGNEES[4], dueDate: '2026-04-20', subtasksDone: 0, subtasksTotal: 5, attachments: 1, comments: 1 },
  { id: 'b3', title: 'Research HR analytics tools', description: 'Evaluate third-party analytics platforms for workforce insights and predictive attrition modeling', priority: 'Low', category: 'Operations', column: 'Backlog', assignee: ASSIGNEES[6], dueDate: '2026-05-01', subtasksDone: 0, subtasksTotal: 3, attachments: 0, comments: 0 },
  { id: 'b4', title: 'Draft flexible work policy', description: 'Prepare a comprehensive flexible working hours and hybrid work policy document for leadership review', priority: 'Medium', category: 'HR', column: 'Backlog', assignee: ASSIGNEES[2], dueDate: '2026-04-10', subtasksDone: 1, subtasksTotal: 3, attachments: 1, comments: 2 },
  { id: 'b5', title: 'Plan leadership training cohort', description: 'Identify high-potential employees and design a 6-month leadership development program', priority: 'Low', category: 'Training', column: 'Backlog', assignee: ASSIGNEES[5], dueDate: '2026-05-15', subtasksDone: 0, subtasksTotal: 4, attachments: 0, comments: 1 },
  { id: 'b6', title: 'Set up employee self-service portal', description: 'Configure the self-service portal for leave requests, payslip downloads, and policy access', priority: 'Medium', category: 'Operations', column: 'Backlog', assignee: ASSIGNEES[7], dueDate: '2026-04-25', subtasksDone: 1, subtasksTotal: 6, attachments: 3, comments: 4 },

  // ─── To Do (7 cards) ───
  { id: 't1', title: 'Process June payroll', description: 'Run payroll processing for all employees including statutory deductions and reimbursements', priority: 'High', category: 'Payroll', column: 'To Do', assignee: ASSIGNEES[1], dueDate: '2026-03-01', subtasksDone: 0, subtasksTotal: 5, attachments: 1, comments: 2 },
  { id: 't2', title: 'Schedule team building event', description: 'Organize a quarterly team building event including venue booking and activity planning', priority: 'Low', category: 'Engagement', column: 'To Do', assignee: ASSIGNEES[4], dueDate: '2026-03-20', subtasksDone: 0, subtasksTotal: 4, attachments: 0, comments: 1 },
  { id: 't3', title: 'Review leave policy amendments', description: 'Analyze proposed changes to the leave policy including carry-forward rules and sandwich leave', priority: 'Medium', category: 'HR', column: 'To Do', assignee: ASSIGNEES[0], dueDate: '2026-03-10', subtasksDone: 0, subtasksTotal: 3, attachments: 2, comments: 3 },
  { id: 't4', title: 'Prepare Q2 appraisal forms', description: 'Create and distribute quarterly performance appraisal forms for all departments', priority: 'High', category: 'HR', column: 'To Do', assignee: ASSIGNEES[3], dueDate: '2026-03-15', subtasksDone: 0, subtasksTotal: 4, attachments: 1, comments: 0 },
  { id: 't5', title: 'Audit vendor compliance certificates', description: 'Verify all active vendor compliance and insurance certificates are up to date and filed', priority: 'Medium', category: 'Compliance', column: 'To Do', assignee: ASSIGNEES[7], dueDate: '2026-03-12', subtasksDone: 0, subtasksTotal: 3, attachments: 4, comments: 1 },
  { id: 't6', title: 'Create diversity & inclusion report', description: 'Compile annual D&I metrics and prepare the report for the board meeting', priority: 'Medium', category: 'HR', column: 'To Do', assignee: ASSIGNEES[6], dueDate: '2026-03-18', subtasksDone: 0, subtasksTotal: 5, attachments: 2, comments: 2 },
  { id: 't7', title: 'Organize wellness workshop', description: 'Plan and coordinate a mental health and wellness workshop for all employees', priority: 'Low', category: 'Benefits', column: 'To Do', assignee: ASSIGNEES[2], dueDate: '2026-03-25', subtasksDone: 0, subtasksTotal: 3, attachments: 0, comments: 0 },

  // ─── In Progress (8 cards) ───
  { id: 'i1', title: 'Recruitment for Senior Developer', description: 'Manage end-to-end recruitment for the Senior Full-Stack Developer position across all portals', priority: 'High', category: 'Recruitment', column: 'In Progress', assignee: ASSIGNEES[6], dueDate: '2026-03-05', subtasksDone: 3, subtasksTotal: 6, attachments: 5, comments: 8 },
  { id: 'i2', title: 'Q2 Performance Reviews', description: 'Coordinate and track quarterly performance review cycle across all departments and teams', priority: 'High', category: 'HR', column: 'In Progress', assignee: ASSIGNEES[0], dueDate: '2026-03-08', subtasksDone: 2, subtasksTotal: 5, attachments: 3, comments: 6 },
  { id: 'i3', title: 'Renew group health insurance', description: 'Coordinate with the insurance provider for policy renewal and updated employee coverage', priority: 'High', category: 'Benefits', column: 'In Progress', assignee: ASSIGNEES[2], dueDate: '2026-02-20', subtasksDone: 2, subtasksTotal: 4, attachments: 6, comments: 4 },
  { id: 'i4', title: 'File TDS returns for Q4', description: 'Complete and file quarterly TDS returns with the Income Tax department before the due date', priority: 'High', category: 'Compliance', column: 'In Progress', assignee: ASSIGNEES[1], dueDate: '2026-02-25', subtasksDone: 3, subtasksTotal: 4, attachments: 2, comments: 3 },
  { id: 'i5', title: 'Organize new hire orientation', description: 'Plan and execute the orientation program for employees joining in the March batch', priority: 'Medium', category: 'Onboarding', column: 'In Progress', assignee: ASSIGNEES[4], dueDate: '2026-03-08', subtasksDone: 3, subtasksTotal: 7, attachments: 4, comments: 5 },
  { id: 'i6', title: 'Review vendor contracts', description: 'Audit and review all active vendor contracts for renewal or renegotiation terms', priority: 'Medium', category: 'Admin', column: 'In Progress', assignee: ASSIGNEES[3], dueDate: '2026-03-05', subtasksDone: 4, subtasksTotal: 8, attachments: 7, comments: 3 },
  { id: 'i7', title: 'Update PF contribution rates', description: 'Update the provident fund contribution rates in the payroll system as per new government norms', priority: 'High', category: 'Payroll', column: 'In Progress', assignee: ASSIGNEES[1], dueDate: '2026-02-22', subtasksDone: 1, subtasksTotal: 3, attachments: 1, comments: 2 },
  { id: 'i8', title: 'Employee engagement survey analysis', description: 'Analyze results from the Q1 employee engagement survey and prepare action items', priority: 'Medium', category: 'Engagement', column: 'In Progress', assignee: ASSIGNEES[5], dueDate: '2026-03-06', subtasksDone: 2, subtasksTotal: 4, attachments: 2, comments: 5 },

  // ─── Done (7 cards) ───
  { id: 'd1', title: 'March payroll processed', description: 'Successfully completed payroll processing for all employees for the month of March', priority: 'High', category: 'Payroll', column: 'Done', assignee: ASSIGNEES[1], dueDate: '2026-03-01', subtasksDone: 5, subtasksTotal: 5, attachments: 3, comments: 4 },
  { id: 'd2', title: 'Annual health checkup organized', description: 'Coordinated annual health checkup for all employees across 3 locations', priority: 'Medium', category: 'Benefits', column: 'Done', assignee: ASSIGNEES[2], dueDate: '2026-02-28', subtasksDone: 4, subtasksTotal: 4, attachments: 2, comments: 6 },
  { id: 'd3', title: 'Conduct exit interview for Mark', description: 'Completed exit interview with Mark Johnson and processed knowledge transfer documentation', priority: 'Low', category: 'HR', column: 'Done', assignee: ASSIGNEES[0], dueDate: '2026-02-24', subtasksDone: 3, subtasksTotal: 3, attachments: 1, comments: 2 },
  { id: 'd4', title: 'Publish job posting for Senior Developer', description: 'Created and published the Senior Full-Stack Developer job description on all portals', priority: 'Medium', category: 'Recruitment', column: 'Done', assignee: ASSIGNEES[6], dueDate: '2026-02-26', subtasksDone: 2, subtasksTotal: 2, attachments: 1, comments: 3 },
  { id: 'd5', title: 'Submit gratuity liability report', description: 'Prepared and submitted the annual gratuity liability report to the finance department', priority: 'High', category: 'Compliance', column: 'Done', assignee: ASSIGNEES[1], dueDate: '2026-02-18', subtasksDone: 3, subtasksTotal: 3, attachments: 4, comments: 1 },
  { id: 'd6', title: 'Complete fire safety drill', description: 'Organized and completed the annual fire safety drill across all office locations', priority: 'Medium', category: 'Operations', column: 'Done', assignee: ASSIGNEES[5], dueDate: '2026-02-20', subtasksDone: 4, subtasksTotal: 4, attachments: 2, comments: 5 },
  { id: 'd7', title: 'Onboard February joiners', description: 'Successfully completed onboarding process for 8 new employees who joined in February', priority: 'Medium', category: 'Onboarding', column: 'Done', assignee: ASSIGNEES[4], dueDate: '2026-02-15', subtasksDone: 6, subtasksTotal: 6, attachments: 3, comments: 7 },
];

/* ──────────── Helpers ──────────── */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(dateStr: string, column: KanbanColumn): boolean {
  if (column === 'Done') return false;
  return new Date(dateStr) < new Date();
}

function getSubtaskProgress(done: number, total: number): { percent: number; color: string } {
  const percent = total > 0 ? (done / total) * 100 : 0;
  let color = 'bg-amber-400';
  if (percent === 100) color = 'bg-emerald-500';
  else if (percent >= 60) color = 'bg-blue-500';
  return { percent, color };
}

/* ──────────── Component ──────────── */
export default function KanbanBoardPage() {
  const [cards, setCards] = useState<KanbanCard[]>(INITIAL_CARDS);
  const [selectedBoard, setSelectedBoard] = useState<string>(BOARDS[0]);
  const [showBoardDropdown, setShowBoardDropdown] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addColumn, setAddColumn] = useState<KanbanColumn>('To Do');
  const [searchQuery, setSearchQuery] = useState('');
  const [newCard, setNewCard] = useState<NewCardForm>({
    title: '',
    description: '',
    priority: 'Medium',
    category: 'HR',
    dueDate: '',
    assigneeName: ASSIGNEES[0].name,
    column: 'To Do',
  });

  /* ── Derived Stats ── */
  const stats = useMemo(() => {
    const total = cards.length;
    const inProgress = cards.filter(c => c.column === 'In Progress').length;
    const completed = cards.filter(c => c.column === 'Done').length;
    const overdue = cards.filter(c => isOverdue(c.dueDate, c.column)).length;
    return { total, inProgress, completed, overdue };
  }, [cards]);

  /* ── Filtered Cards by Column ── */
  const getColumnCards = (column: KanbanColumn) => {
    let filtered = cards.filter(c => c.column === column);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.assignee.name.toLowerCase().includes(q)
      );
    }
    return filtered;
  };

  /* ── Add Card Handler ── */
  const handleAddCard = () => {
    if (!newCard.title.trim()) {
      toast.error('Card title is required');
      return;
    }
    const assignee = ASSIGNEES.find(a => a.name === newCard.assigneeName) || ASSIGNEES[0];
    const card: KanbanCard = {
      id: `card-${Date.now()}`,
      title: newCard.title.trim(),
      description: newCard.description.trim(),
      priority: newCard.priority,
      category: newCard.category,
      column: addColumn,
      assignee,
      dueDate: newCard.dueDate || new Date().toISOString().split('T')[0],
      subtasksDone: 0,
      subtasksTotal: 0,
      attachments: 0,
      comments: 0,
    };
    setCards(prev => [...prev, card]);
    setShowAddModal(false);
    setNewCard({ title: '', description: '', priority: 'Medium', category: 'HR', dueDate: '', assigneeName: ASSIGNEES[0].name, column: 'To Do' });
    toast.success('Card added successfully');
  };

  /* ── Open Add Modal for specific column ── */
  const openAddModal = (column: KanbanColumn) => {
    setAddColumn(column);
    setNewCard(prev => ({ ...prev, column }));
    setShowAddModal(true);
  };

  return (
    <div className="thb-kanban-page space-y-6">
      {/* ═══════ Header ═══════ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
            <FiLayers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Kanban Board</h1>
            <p className="text-sm text-thb-text-secondary">Visualize and manage your HR workflow</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
            <input
              type="text"
              placeholder="Search cards..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="thb-input pl-9 pr-3 py-2 text-sm rounded-lg border border-thb-border bg-white text-thb-text-primary placeholder:text-thb-text-muted focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 w-48"
            />
          </div>

          {/* Board Selector */}
          <div className="relative">
            <button
              onClick={() => setShowBoardDropdown(!showBoardDropdown)}
              className="thb-btn flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-thb-border bg-white text-thb-text-primary hover:bg-slate-50 transition-colors"
            >
              <FiLayout className="w-4 h-4 text-thb-text-secondary" />
              {selectedBoard}
              <FiChevronDown className="w-4 h-4 text-thb-text-muted" />
            </button>
            {showBoardDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-thb-border rounded-xl shadow-lg z-20 py-1 animate-in fade-in slide-in-from-top-1">
                {BOARDS.map(board => (
                  <button
                    key={board}
                    onClick={() => { setSelectedBoard(board); setShowBoardDropdown(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      selectedBoard === board
                        ? 'bg-violet-50 text-violet-700 font-medium'
                        : 'text-thb-text-primary hover:bg-slate-50'
                    }`}
                  >
                    {board}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add Card Button */}
          <button
            onClick={() => openAddModal('To Do')}
            className="thb-btn inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 shadow-sm transition-all"
          >
            <FiPlus className="w-4 h-4" />
            Add Card
          </button>
        </div>
      </div>

      {/* ═══════ Stats Row ═══════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Cards', value: stats.total, icon: FiLayout, color: 'from-slate-500 to-slate-600', bg: 'bg-slate-50' },
          { label: 'In Progress', value: stats.inProgress, icon: FiClock, color: 'from-amber-500 to-orange-500', bg: 'bg-amber-50' },
          { label: 'Completed', value: stats.completed, icon: FiCheckCircle, color: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-50' },
          { label: 'Overdue', value: stats.overdue, icon: FiAlertCircle, color: 'from-red-500 to-rose-500', bg: 'bg-red-50' },
        ].map(stat => (
          <div key={stat.label} className={`${stat.bg} rounded-xl p-4 border border-thb-border`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-thb-text-secondary uppercase tracking-wider">{stat.label}</span>
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center text-white`}>
                <stat.icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-thb-text-primary">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ═══════ Kanban Columns ═══════ */}
      <div className="flex gap-5 overflow-x-auto pb-4 -mx-1 px-1" style={{ minHeight: 'calc(100vh - 320px)' }}>
        {COLUMNS.map(col => {
          const columnCards = getColumnCards(col.key);
          return (
            <div
              key={col.key}
              className="thb-kanban-column flex-shrink-0 w-[320px] sm:w-[340px] flex flex-col"
            >
              {/* Column Header */}
              <div className={`${col.headerBg} rounded-t-xl px-4 py-3 flex items-center justify-between`}>
                <div className="flex items-center gap-2.5">
                  <h3 className={`font-semibold text-sm ${col.headerText}`}>{col.key}</h3>
                  <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-[11px] font-bold ${
                    col.key === 'Backlog' ? 'bg-slate-200 text-slate-600' :
                    col.key === 'To Do' ? 'bg-blue-100 text-blue-600' :
                    col.key === 'In Progress' ? 'bg-amber-100 text-amber-600' :
                    'bg-emerald-100 text-emerald-600'
                  }`}>
                    {columnCards.length}
                  </span>
                </div>
                <button
                  onClick={() => openAddModal(col.key)}
                  className="p-1.5 rounded-lg hover:bg-white/60 transition-colors"
                  title={`Add card to ${col.key}`}
                >
                  <FiPlus className={`w-4 h-4 ${col.headerText}`} />
                </button>
              </div>

              {/* Column Cards */}
              <div className="flex-1 bg-slate-50/80 border border-t-0 border-thb-border rounded-b-xl p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-400px)]">
                {columnCards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-thb-text-muted">
                    <FiLayout className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-xs">No cards yet</p>
                  </div>
                ) : (
                  columnCards.map(card => {
                    const priorityStyle = PRIORITY_STYLES[card.priority];
                    const subtaskProgress = getSubtaskProgress(card.subtasksDone, card.subtasksTotal);
                    const overdue = isOverdue(card.dueDate, card.column);

                    return (
                      <div
                        key={card.id}
                        className={`thb-kanban-card bg-white rounded-lg border border-thb-border border-l-[3px] ${priorityStyle.border} p-3.5 cursor-grab hover:shadow-md hover:shadow-slate-200/80 hover:-translate-y-0.5 active:cursor-grabbing active:shadow-lg transition-all duration-200 group`}
                      >
                        {/* Card Top: Priority + More */}
                        <div className="flex items-start justify-between mb-2">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${priorityStyle.label}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${priorityStyle.dot}`} />
                            {card.priority}
                          </span>
                          <button className="p-1 rounded-md text-thb-text-muted hover:text-thb-text-secondary hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all">
                            <FiMoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Card Title */}
                        <h4 className="text-sm font-semibold text-thb-text-primary mb-1 leading-snug">
                          {card.title}
                        </h4>

                        {/* Description */}
                        <p className="text-xs text-thb-text-secondary line-clamp-2 mb-2.5 leading-relaxed">
                          {card.description}
                        </p>

                        {/* Category Tag */}
                        <div className="mb-3">
                          <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_STYLES[card.category]}`}>
                            {card.category}
                          </span>
                        </div>

                        {/* Subtask Progress */}
                        {card.subtasksTotal > 0 && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-medium text-thb-text-muted">Subtasks</span>
                              <span className="text-[10px] font-semibold text-thb-text-secondary">{card.subtasksDone}/{card.subtasksTotal}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${subtaskProgress.color}`}
                                style={{ width: `${subtaskProgress.percent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Card Footer */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          {/* Assignee */}
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${card.assignee.gradient} flex items-center justify-center text-white text-[9px] font-bold shadow-sm`}>
                              {card.assignee.initials}
                            </div>
                            <span className="text-[10px] font-medium text-thb-text-secondary max-w-[80px] truncate">
                              {card.assignee.name.split(' ')[0]}
                            </span>
                          </div>

                          {/* Meta Icons */}
                          <div className="flex items-center gap-2.5">
                            {/* Due Date */}
                            <div className={`flex items-center gap-1 text-[10px] font-medium ${overdue ? 'text-red-500' : 'text-thb-text-muted'}`}>
                              <FiCalendar className="w-3 h-3" />
                              {formatDate(card.dueDate)}
                            </div>

                            {/* Attachments */}
                            {card.attachments > 0 && (
                              <div className="flex items-center gap-0.5 text-[10px] text-thb-text-muted">
                                <FiPaperclip className="w-3 h-3" />
                                {card.attachments}
                              </div>
                            )}

                            {/* Comments */}
                            {card.comments > 0 && (
                              <div className="flex items-center gap-0.5 text-[10px] text-thb-text-muted">
                                <FiMessageSquare className="w-3 h-3" />
                                {card.comments}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══════ Add Card Modal ═══════ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-thb-border animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-thb-border">
              <div>
                <h2 className="text-lg font-bold text-thb-text-primary">Add New Card</h2>
                <p className="text-xs text-thb-text-secondary mt-0.5">Adding to <span className="font-semibold">{addColumn}</span> column</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-thb-text-secondary uppercase tracking-wider mb-1.5">Title *</label>
                <input
                  type="text"
                  value={newCard.title}
                  onChange={e => setNewCard(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter card title..."
                  className="thb-input w-full px-3 py-2.5 text-sm rounded-lg border border-thb-border bg-white text-thb-text-primary placeholder:text-thb-text-muted focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-thb-text-secondary uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  value={newCard.description}
                  onChange={e => setNewCard(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe this card..."
                  rows={3}
                  className="thb-input w-full px-3 py-2.5 text-sm rounded-lg border border-thb-border bg-white text-thb-text-primary placeholder:text-thb-text-muted focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 resize-none"
                />
              </div>

              {/* Priority + Category Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary uppercase tracking-wider mb-1.5">Priority</label>
                  <select
                    value={newCard.priority}
                    onChange={e => setNewCard(prev => ({ ...prev, priority: e.target.value as Priority }))}
                    className="thb-select w-full px-3 py-2.5 text-sm rounded-lg border border-thb-border bg-white text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 appearance-none cursor-pointer"
                  >
                    <option value="High">🔴 High</option>
                    <option value="Medium">🟡 Medium</option>
                    <option value="Low">🟢 Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary uppercase tracking-wider mb-1.5">Category</label>
                  <select
                    value={newCard.category}
                    onChange={e => setNewCard(prev => ({ ...prev, category: e.target.value as Category }))}
                    className="thb-select w-full px-3 py-2.5 text-sm rounded-lg border border-thb-border bg-white text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 appearance-none cursor-pointer"
                  >
                    {(['HR', 'Payroll', 'Recruitment', 'Admin', 'Compliance', 'Training', 'Benefits', 'Operations', 'Onboarding', 'Engagement'] as Category[]).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Due Date + Assignee Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary uppercase tracking-wider mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={newCard.dueDate}
                    onChange={e => setNewCard(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="thb-input w-full px-3 py-2.5 text-sm rounded-lg border border-thb-border bg-white text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary uppercase tracking-wider mb-1.5">Assignee</label>
                  <select
                    value={newCard.assigneeName}
                    onChange={e => setNewCard(prev => ({ ...prev, assigneeName: e.target.value }))}
                    className="thb-select w-full px-3 py-2.5 text-sm rounded-lg border border-thb-border bg-white text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 appearance-none cursor-pointer"
                  >
                    {ASSIGNEES.map(a => (
                      <option key={a.name} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Column Selection */}
              <div>
                <label className="block text-xs font-semibold text-thb-text-secondary uppercase tracking-wider mb-1.5">Column</label>
                <div className="grid grid-cols-4 gap-2">
                  {COLUMNS.map(col => (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => setAddColumn(col.key)}
                      className={`thb-col-btn px-3 py-2 text-xs font-semibold rounded-lg border-2 transition-all ${
                        addColumn === col.key
                          ? `${col.headerBg} ${col.headerText} border-current`
                          : 'border-thb-border text-thb-text-secondary hover:border-thb-text-muted bg-white'
                      }`}
                    >
                      {col.key}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-thb-border bg-slate-50/50 rounded-b-2xl">
              <button
                onClick={() => setShowAddModal(false)}
                className="thb-btn px-4 py-2 text-sm font-medium rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCard}
                className="thb-btn px-5 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 shadow-sm transition-all"
              >
                Add Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
