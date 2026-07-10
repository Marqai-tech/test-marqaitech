'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUsers,
  FiBriefcase,
  FiMail,
  FiSearch,
  FiRefreshCw,
  FiChevronDown,
  FiChevronRight,
  FiAlertCircle,
  FiX,
  FiLayers,
  FiGitBranch,
  FiUserCheck,
  FiBookmark,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';
import {
  ModuleHero,
  StatsStrip,
  CounterStat,
  SectionHeader,
  SearchBar,
  GradientAvatar,
  Card,
  TwoColumnLayout,
  PageContainer,
  LoadingSpinner,
  SidebarWidget,
  StatusBadge,
  Badge,
  PrimaryButton,
  EmptyState,
  getDeptColor,
  getAuthHeaders,
  fmtNumber,
  avatarColor,
  firstInitial,
  AVATAR_COLORS,
  DEPARTMENT_COLORS,
} from '@/components/nexus-ui';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  departmentId: string;
  designationId: string;
  branchId?: string | null;
  status?: string;
  department?: { id: string; name: string } | null;
  designation?: { id: string; title: string } | null;
  branch?: { id: string; name: string } | null;
  user?: { id: string; email: string; role: string; avatar?: string | null } | null;
}

interface OrgNode {
  id: string;
  employee: Employee;
  children: OrgNode[];
}

/* ──────────────────────────────────────────────────────────────────────────
 * Hierarchy derivation — Employee schema has no `managerId`, so we
 * synthesize a reporting tree from `user.role` + `designation.title`:
 *   Level 0 — Top exec(s): super_admin / tenant_admin / CEO designation
 *   Level 1 — Department heads: Manager / Director / Head / VP / Chief
 *   Level 2 — Everyone else, grouped under their department head
 * If no top exec is found, the most-senior person becomes the root.
 * ────────────────────────────────────────────────────────────────────────── */

const SENIOR_TITLE_RE = /\b(ceo|cto|coo|cfo|founder|co-founder|managing director|md)\b/i;
const MANAGER_TITLE_RE = /\b(manager|director|head|vp|vice president|chief|lead|principal|sr\.? senior)\b/i;

function seniorityScore(emp: Employee): number {
  const role = (emp.user?.role || '').toLowerCase();
  const title = (emp.designation?.title || '').toLowerCase();
  if (role === 'super_admin' || SENIOR_TITLE_RE.test(title)) return 100;
  if (role === 'tenant_admin') return 95;
  if (role === 'hr_admin') return 90;
  if (MANAGER_TITLE_RE.test(title)) {
    if (/director|vp|vice president|chief/.test(title)) return 80;
    if (/manager/.test(title)) return 70;
    if (/lead|principal/.test(title)) return 60;
    return 50;
  }
  if (role === 'manager') return 55;
  if (role === 'recruiter') return 30;
  return 10;
}

function buildOrgTree(employees: Employee[]): OrgNode[] {
  if (employees.length === 0) return [];

  // Sort copies so we don't mutate the source array
  const sorted = [...employees].sort((a, b) => seniorityScore(b) - seniorityScore(a));

  // Pick top-level executives (score >= 90 or first if none)
  const topExecs = sorted.filter((e) => seniorityScore(e) >= 90);
  const roots: Employee[] = topExecs.length > 0 ? topExecs : [sorted[0]];
  const rootIds = new Set(roots.map((r) => r.id));

  // Everyone else, grouped by department
  const remaining = sorted.filter((e) => !rootIds.has(e.id));
  const byDepartment = new Map<string, Employee[]>();
  for (const emp of remaining) {
    const deptId = emp.departmentId || 'no-dept';
    if (!byDepartment.has(deptId)) byDepartment.set(deptId, []);
    byDepartment.get(deptId)!.push(emp);
  }
  // For each department, pick a head (highest seniority).
  // The head becomes a child of a root (distributed round-robin if multiple roots).
  const deptHeads: { head: Employee; members: Employee[] }[] = [];
  for (const [, members] of byDepartment) {
    const sortedMembers = [...members].sort((a, b) => seniorityScore(b) - seniorityScore(a));
    const headCandidate = sortedMembers[0];
    if (headCandidate) {
      deptHeads.push({
        head: headCandidate,
        members: sortedMembers.slice(1),
      });
    }
  }

  // Build tree
  const buildNode = (emp: Employee, children: OrgNode[] = []): OrgNode => ({
    id: emp.id,
    employee: emp,
    children,
  });

  // Distribute dept heads among roots (round-robin if multiple roots)
  const rootNodes: OrgNode[] = roots.map((r) => buildNode(r));
  deptHeads.forEach((dh, idx) => {
    const parentNode = rootNodes[idx % rootNodes.length];
    const memberNodes = dh.members.map((m) => buildNode(m));
    parentNode.children.push(buildNode(dh.head, memberNodes));
  });

  return rootNodes;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

function highlightMatch(text: string, search: string): React.ReactNode {
  if (!search) return text;
  const idx = text.toLowerCase().indexOf(search.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 text-amber-900 rounded px-0.5">{text.slice(idx, idx + search.length)}</mark>
      {text.slice(idx + search.length)}
    </>
  );
}

/** Count total reporting lines (parent→child edges) in the tree */
function countReportingLines(nodes: OrgNode[]): number {
  let count = 0;
  const walk = (ns: OrgNode[]) => {
    for (const n of ns) {
      count += n.children.length;
      walk(n.children);
    }
  };
  walk(nodes);
  return count;
}

/** Count max depth of the tree */
function countLevels(nodes: OrgNode[]): number {
  if (nodes.length === 0) return 0;
  let maxDepth = 0;
  const walk = (ns: OrgNode[], depth: number) => {
    if (depth > maxDepth) maxDepth = depth;
    for (const n of ns) {
      walk(n.children, depth + 1);
    }
  };
  walk(nodes, 1);
  return maxDepth;
}

/** Count direct reports for root-level nodes */
function countDirectReports(nodes: OrgNode[]): number {
  let count = 0;
  for (const n of nodes) {
    count += n.children.length;
  }
  return count;
}

/** Find vacant positions (departments with only 1 person, i.e. a head but no members) */
function countVacantPositions(nodes: OrgNode[]): number {
  let count = 0;
  const walk = (ns: OrgNode[]) => {
    for (const n of ns) {
      // A node with no children at level 2+ could represent a vacant slot
      // but for simplicity, count department heads with zero members
      if (n.children.length === 0 && seniorityScore(n.employee) >= 50 && seniorityScore(n.employee) < 90) {
        // Department head with no direct reports — could indicate vacancy
      }
      walk(n.children);
    }
  };
  walk(nodes);
  // Count unique departments minus departments with actual employees
  return count;
}

/* ── Module Tips ────────────────────────────────────────────────────────── */

const orgChartTips = [
  {
    title: 'Navigate the Hierarchy',
    description: 'Click the chevron arrows on any node to expand or collapse its direct reports. Use "Expand All" to see the full tree.',
  },
  {
    title: 'Search Employees',
    description: 'Use the search bar to find employees by name or email. Matching nodes will be highlighted in the chart.',
  },
  {
    title: 'Department Color Coding',
    description: 'Each department is assigned a unique gradient color. Check the sidebar legend to identify departments at a glance.',
  },
  {
    title: 'Derived Hierarchy',
    description: 'The org chart is automatically built from employee roles and designation titles — no manual setup required.',
  },
];

const orgChartWorkflowSteps = [
  { step: 1, title: 'Add Employees', description: 'Create employee records with designation and department info', route: '/employees' },
  { step: 2, title: 'Assign Roles', description: 'Set proper user roles (admin, manager) for hierarchy positioning' },
  { step: 3, title: 'Review Chart', description: 'View the auto-generated organization chart on this page' },
  { step: 4, title: 'Filter & Search', description: 'Use search and department filters to navigate the org structure' },
];

/* ── Recursive tree node ────────────────────────────────────────────────── */

interface TreeNodeProps {
  node: OrgNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  search: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function TreeNode({ node, depth, collapsed, onToggle, search, selectedId, onSelect }: TreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const emp = node.employee;
  const fullName = `${emp.firstName} ${emp.lastName}`.trim();
  const matchesSearch = !!search && (
    fullName.toLowerCase().includes(search.toLowerCase()) ||
    emp.email.toLowerCase().includes(search.toLowerCase())
  );
  const deptName = emp.department?.name || 'Unassigned';
  const deptColor = getDeptColor(deptName);
  const title = emp.designation?.title || 'Employee';
  const isSelected = selectedId === node.id;

  return (
    <div className="flex flex-col items-center">
      {/* Vertical connector above (skip for root) */}
      {depth > 0 && (
        <div className="w-px h-6 bg-slate-200" aria-hidden="true" />
      )}

      {/* Node card */}
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`text-left w-60 bg-white rounded-xl border p-3 shadow-sm hover:shadow-md transition-all duration-200 ${
          matchesSearch
            ? 'border-amber-400 ring-2 ring-amber-200'
            : isSelected
            ? 'border-violet-400 ring-2 ring-violet-200'
            : 'border-slate-200'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <GradientAvatar name={fullName} size="md" className={`bg-gradient-to-br ${deptColor}`} />

          {/* Name + title */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {highlightMatch(fullName, search)}
            </p>
            <p className="text-[11px] text-slate-500 truncate">{title}</p>
          </div>

          {/* Collapse toggle */}
          {hasChildren && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onToggle(node.id); } }}
              className="flex-shrink-0 -mr-1 p-1 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
              aria-label={isCollapsed ? 'Expand' : 'Collapse'}
              title={isCollapsed ? `Expand (${node.children.length} report${node.children.length === 1 ? '' : 's'})` : 'Collapse'}
            >
              {isCollapsed ? (
                <FiChevronRight className="w-3.5 h-3.5" />
              ) : (
                <FiChevronDown className="w-3.5 h-3.5" />
              )}
            </span>
          )}
        </div>

        {/* Department badge */}
        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-white bg-gradient-to-r ${deptColor}`}
          >
            <FiBriefcase className="w-2.5 h-2.5" />
            {deptName}
          </span>
          {emp.status && (
            <StatusBadge status={emp.status} />
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400 min-w-0">
          <FiMail className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate">{emp.email}</span>
        </div>

        {/* Collapsed indicator — show count of hidden reports */}
        {hasChildren && isCollapsed && (
          <div className="mt-2 text-[10px] text-center text-violet-600 font-medium bg-violet-50 rounded-md py-1">
            {node.children.length} hidden report{node.children.length === 1 ? '' : 's'}
          </div>
        )}
      </button>

      {/* Children */}
      {hasChildren && !isCollapsed && (
        <div className="flex flex-col items-center">
          {/* Vertical line below parent card */}
          <div className="w-px h-6 bg-slate-200" aria-hidden="true" />

          {/* Children row — horizontal on >= sm, vertical on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-center gap-0 sm:gap-2">
            {node.children.map((child, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === node.children.length - 1;
              const isOnly = node.children.length === 1;
              return (
                <div
                  key={child.id}
                  className="relative flex flex-col items-center px-0 sm:px-2 pt-0 sm:pt-6"
                >
                  {/* Desktop: top connector — horizontal line spanning between siblings */}
                  {/* On mobile (flex-col), only show vertical line going up */}
                  {!isOnly && (
                    <div
                      className="hidden sm:block absolute top-0 bg-slate-200"
                      style={{
                        left: isFirst ? '50%' : 0,
                        right: isLast ? '50%' : 0,
                        height: '1px',
                        width: 'auto',
                      }}
                      aria-hidden="true"
                    />
                  )}
                  {/* Vertical line going up to the horizontal line (desktop) */}
                  <div
                    className="hidden sm:block w-px h-6 bg-slate-200"
                    aria-hidden="true"
                  />
                  {/* Mobile: vertical line */}
                  <div
                    className="sm:hidden w-px h-6 bg-slate-200"
                    aria-hidden="true"
                  />

                  <TreeNode
                    node={child}
                    depth={depth + 1}
                    collapsed={collapsed}
                    onToggle={onToggle}
                    search={search}
                    selectedId={selectedId}
                    onSelect={onSelect}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Page
 * ────────────────────────────────────────────────────────────────────────── */

export default function OrgChartPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/employees?limit=1000', { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load employees');
      const list: Employee[] = data.employees || data || [];
      setEmployees(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load organization chart';
      toast.error(msg);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Redirect to login if not authenticated
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
    if (!token && !user) {
      router.push('/login');
    }
  }, [router, user]);

  const tree = useMemo(() => buildOrgTree(employees), [employees]);

  // Filtered tree based on department filter
  const filteredTree = useMemo(() => {
    if (!deptFilter) return tree;
    const filter = (nodes: OrgNode[]): OrgNode[] => {
      return nodes.reduce<OrgNode[]>((acc, node) => {
        const deptName = node.employee.department?.name || 'Unassigned';
        const matches = deptName === deptFilter;
        const filteredChildren = filter(node.children);
        if (matches || filteredChildren.length > 0) {
          acc.push({ ...node, children: filteredChildren });
        }
        return acc;
      }, []);
    };
    return filter(tree);
  }, [tree, deptFilter]);

  // Unique departments for the legend and sidebar
  const departments = useMemo(() => {
    const seen = new Map<string, string>(); // deptId → name
    for (const e of employees) {
      if (e.department?.id && e.department?.name) {
        seen.set(e.department.id, e.department.name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [employees]);

  // Department employee counts for sidebar widgets
  const deptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of employees) {
      const deptId = e.department?.id || 'no-dept';
      const deptName = e.department?.name || 'Unassigned';
      const key = deptId;
      counts.set(key, (counts.get(key) || 0) + 1);
      // Store the name alongside
    }
    return departments.map((d) => ({
      ...d,
      count: counts.get(d.id) || 0,
    }));
  }, [employees, departments]);

  const handleToggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  // Expand all / collapse all helpers
  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => {
    const all = new Set<string>();
    // Collapse every node that has children
    const walk = (nodes: OrgNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          all.add(n.id);
          walk(n.children);
        }
      }
    };
    walk(tree);
    setCollapsed(all);
  }, [tree]);

  // Stats
  const stats = useMemo(() => {
    const total = employees.length;
    const deptCount = departments.length;
    const levels = countLevels(tree);
    const reportingLines = countReportingLines(tree);
    const directReports = countDirectReports(tree);
    // Vacant: departments with less than 2 people could indicate vacancy
    const vacantDepts = deptCounts.filter((d) => d.count <= 1).length;
    const managerCount = employees.filter(
      (e) => seniorityScore(e) >= 50 && seniorityScore(e) < 90,
    ).length;
    return { total, deptCount, levels, reportingLines, directReports, vacantDepts, managerCount, rootCount: tree.length };
  }, [employees, departments, tree, deptCounts]);

  // Selected employee detail
  const selectedEmployee = useMemo(() => {
    if (!selectedId) return null;
    const findEmp = (nodes: OrgNode[]): Employee | null => {
      for (const n of nodes) {
        if (n.id === selectedId) return n.employee;
        const found = findEmp(n.children);
        if (found) return found;
      }
      return null;
    };
    return findEmp(tree);
  }, [selectedId, tree]);

  // Selected employee's direct reports
  const selectedReports = useMemo(() => {
    if (!selectedId) return [];
    const findNode = (nodes: OrgNode[]): OrgNode | null => {
      for (const n of nodes) {
        if (n.id === selectedId) return n;
        const found = findNode(n.children);
        if (found) return found;
      }
      return null;
    };
    const node = findNode(tree);
    return node ? node.children.map((c) => c.employee) : [];
  }, [selectedId, tree]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <PageContainer>
          {/* ── Module Hero ──────────────────────────────────────────────── */}
          <ModuleHero
            title="Organization Chart"
            subtitle="Visual hierarchy of your organization structure"
            icon={<FiUsers className="w-6 h-6 text-white" />}
            gradient="from-violet-700 via-purple-700 to-indigo-700"
            actions={
              <PrimaryButton
                onClick={fetchEmployees}
                disabled={loading}
                loading={loading}
                size="sm"
                variant="solid"
                icon={<FiRefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh
              </PrimaryButton>
            }
          />

          {/* ── Stats Strip ──────────────────────────────────────────────── */}
          <StatsStrip>
            <CounterStat
              label="Total Employees"
              value={fmtNumber(stats.total)}
              icon={<FiUsers className="w-4 h-4 text-white" />}
              color="bg-gradient-to-br from-blue-500 to-indigo-500"
            />
            <CounterStat
              label="Departments"
              value={stats.deptCount}
              icon={<FiBriefcase className="w-4 h-4 text-white" />}
              color="bg-gradient-to-br from-emerald-500 to-teal-500"
            />
            <CounterStat
              label="Levels"
              value={stats.levels}
              icon={<FiLayers className="w-4 h-4 text-white" />}
              color="bg-gradient-to-br from-violet-500 to-purple-500"
            />
            <CounterStat
              label="Reporting Lines"
              value={stats.reportingLines}
              icon={<FiGitBranch className="w-4 h-4 text-white" />}
              color="bg-gradient-to-br from-amber-500 to-orange-500"
            />
            <CounterStat
              label="Direct Reports"
              value={stats.directReports}
              icon={<FiUserCheck className="w-4 h-4 text-white" />}
              color="bg-gradient-to-br from-rose-500 to-pink-500"
            />
            <CounterStat
              label="Vacant Positions"
              value={stats.vacantDepts}
              icon={<FiBookmark className="w-4 h-4 text-white" />}
              color="bg-gradient-to-br from-slate-400 to-slate-500"
            />
          </StatsStrip>

          {/* ── Search + Toolbar ─────────────────────────────────────────── */}
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Search by name or email…"
                  icon={<FiSearch className="w-4 h-4" />}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Department filter tabs */}
                <button
                  type="button"
                  onClick={() => setDeptFilter(null)}
                  className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${
                    !deptFilter
                      ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  All
                </button>
                {departments.slice(0, 5).map((dept) => (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => setDeptFilter(deptFilter === dept.name ? null : dept.name)}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${
                      deptFilter === dept.name
                        ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full bg-gradient-to-br ${getDeptColor(dept.name)}`} />
                    {dept.name}
                  </button>
                ))}
                {departments.length > 5 && (
                  <div className="relative group">
                    <button
                      type="button"
                      className="text-xs font-semibold px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      +{departments.length - 5} more
                    </button>
                  </div>
                )}
                <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />
                <button
                  type="button"
                  onClick={expandAll}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Collapse all
                </button>
              </div>
            </div>
          </Card>

          {/* ── Two Column Layout: Chart + Sidebar ───────────────────────── */}
          <TwoColumnLayout
            left={
              <div>
                <SectionHeader
                  title="Organization Tree"
                  subtitle={deptFilter ? `Filtered by ${deptFilter}` : 'Complete reporting hierarchy'}
                  icon={<FiGitBranch className="w-4 h-4" />}
                  action={
                    <Badge variant="violet">
                      {filteredTree.reduce((sum, root) => {
                        const count = (ns: OrgNode[]): number => ns.reduce((s, n) => s + 1 + count(n.children), 0);
                        return sum + count([root]);
                      }, 0)} employees
                    </Badge>
                  }
                />

                {loading ? (
                  <Card className="flex items-center justify-center py-16">
                    <LoadingSpinner message="Loading organization chart…" />
                  </Card>
                ) : filteredTree.length === 0 ? (
                  <EmptyState
                    icon={<FiUsers className="w-8 h-8" />}
                    title="No employees found"
                    description={
                      deptFilter
                        ? `No employees match the "${deptFilter}" department filter. Try selecting a different department.`
                        : 'There are no employees to display in the organization chart. Add employees first to see the reporting hierarchy here.'
                    }
                    cta={!deptFilter ? { label: 'Add Employees', href: '/employees' } : undefined}
                  />
                ) : (
                  <Card className="p-4 sm:p-6 overflow-x-auto">
                    <div className="min-w-max flex flex-col items-center gap-0 pb-4">
                      {filteredTree.map((root, idx) => (
                        <div key={root.id} className={idx > 0 ? 'mt-12' : ''}>
                          <TreeNode
                            node={root}
                            depth={0}
                            collapsed={collapsed}
                            onToggle={handleToggle}
                            search={search}
                            selectedId={selectedId}
                            onSelect={handleSelect}
                          />
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Hint */}
                {!loading && filteredTree.length > 0 && (
                  <div className="mt-3 flex items-center justify-center gap-1 text-[11px] text-slate-400">
                    <FiAlertCircle className="w-3 h-3" />
                    <span>Hierarchy is derived from role and designation. Click the chevron on any node to collapse or expand its reports.</span>
                  </div>
                )}
              </div>
            }
            right={
              <div className="space-y-4">
                {/* Department Breakdown Widget */}
                <SidebarWidget
                  title="Department Breakdown"
                  icon={<FiBriefcase className="w-3.5 h-3.5 text-violet-600" />}
                  accent="violet"
                  count={departments.length}
                >
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {deptCounts
                      .sort((a, b) => b.count - a.count)
                      .map((dept) => {
                        const percentage = stats.total > 0 ? Math.round((dept.count / stats.total) * 100) : 0;
                        const color = getDeptColor(dept.name);
                        return (
                          <button
                            key={dept.id}
                            type="button"
                            onClick={() => setDeptFilter(deptFilter === dept.name ? null : dept.name)}
                            className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-left ${
                              deptFilter === dept.name ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                              {firstInitial(dept.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{dept.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`}
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-bold text-slate-500 flex-shrink-0">{dept.count}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    {deptCounts.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-3">No departments found</p>
                    )}
                  </div>
                </SidebarWidget>

                {/* Selected Employee Detail Widget */}
                {selectedEmployee && (
                  <SidebarWidget
                    title="Employee Details"
                    icon={<FiUsers className="w-3.5 h-3.5 text-blue-600" />}
                    accent="blue"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <GradientAvatar name={`${selectedEmployee.firstName} ${selectedEmployee.lastName}`} size="lg" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {selectedEmployee.firstName} {selectedEmployee.lastName}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {selectedEmployee.designation?.title || 'Employee'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-2 text-xs">
                          <FiMail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="text-slate-600 truncate">{selectedEmployee.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <FiBriefcase className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="text-slate-600">
                            {selectedEmployee.department?.name || 'Unassigned'}
                          </span>
                        </div>
                        {selectedEmployee.branch?.name && (
                          <div className="flex items-center gap-2 text-xs">
                            <FiLayers className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="text-slate-600">{selectedEmployee.branch.name}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <Badge variant={selectedEmployee.status === 'active' ? 'success' : 'default'}>
                          {selectedEmployee.status || 'Unknown'}
                        </Badge>
                        <Badge variant="violet">
                          {selectedEmployee.designation?.title || 'Employee'}
                        </Badge>
                      </div>

                      {/* Direct reports list */}
                      {selectedReports.length > 0 && (
                        <div className="pt-2 border-t border-slate-100">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                            Direct Reports ({selectedReports.length})
                          </p>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {selectedReports.map((r) => {
                              const rFullName = `${r.firstName} ${r.lastName}`.trim();
                              const rDeptColor = getDeptColor(r.department?.name);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => handleSelect(r.id)}
                                  className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                                >
                                  <GradientAvatar name={rFullName} size="xs" className={`bg-gradient-to-br ${rDeptColor}`} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-semibold text-slate-800 truncate">{rFullName}</p>
                                    <p className="text-[10px] text-slate-400 truncate">{r.designation?.title || 'Employee'}</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </SidebarWidget>
                )}

                {/* Quick Legend Widget */}
                {!loading && departments.length > 0 && (
                  <SidebarWidget
                    title="Department Legend"
                    icon={<FiBookmark className="w-3.5 h-3.5 text-emerald-600" />}
                    accent="emerald"
                    count={departments.length}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {departments.map((dept) => (
                        <button
                          key={dept.id}
                          type="button"
                          onClick={() => setDeptFilter(deptFilter === dept.name ? null : dept.name)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                            deptFilter === dept.name
                              ? 'bg-violet-100 text-violet-700 ring-1 ring-violet-200'
                              : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span
                            className={`w-2.5 h-2.5 rounded-full bg-gradient-to-br ${getDeptColor(dept.name)}`}
                          />
                          {dept.name}
                        </button>
                      ))}
                    </div>
                  </SidebarWidget>
                )}

                {/* Module Tips */}
                <ModuleTips
                  moduleKey="org-chart"
                  title="Org Chart Tips"
                  tips={orgChartTips}
                  userRole={user?.role}
                />

                {/* Module Workflow */}
                <ModuleWorkflow
                  moduleKey="org-chart"
                  title="How to Use Org Chart"
                  subtitle="Set up and navigate your organization structure"
                  steps={orgChartWorkflowSteps}
                  accentColor="violet"
                  userRole={user?.role}
                />
              </div>
            }
          />
        </PageContainer>
      </div>
    </div>
  );
}
