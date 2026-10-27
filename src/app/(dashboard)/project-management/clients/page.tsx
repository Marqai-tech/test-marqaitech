'use client';

/**
 * Task 150 — CLIENTS DATABASE for the Project-Management module.
 *
 * SmartHR "clients-grid" pattern (https://smarthr.co.in/demo/html/clients-grid.html):
 *   · 4 stat cards — Total / Active / Inactive clients + open client issues
 *   · toolbar — search, status filter, Add Client
 *   · card grid — avatar, name, status badge, projects, progress, raised issues,
 *     contact footer with Raise Issue / View Issues / Edit / Delete actions
 *
 * The database is LINKED to the PM module: "Raise Issue" opens the shared
 * CreateTaskModal pointed at the client (source = external), so the ticket
 * lands on the project's task board labelled External and assigned to a
 * resource (employee). Data: /api/project-management/clients.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiPlus, FiSearch, FiMoreVertical, FiEdit2, FiTrash2, FiX,
  FiMail, FiPhone, FiUser, FiBriefcase, FiAlertCircle,
  FiCheckCircle, FiUsers, FiExternalLink, FiRefreshCw, FiFolder,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { validateEmail, validatePhone, phoneInputFilter } from '@/lib/validators';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  inactive: 'bg-slate-100 text-slate-600 border-slate-200',
  suspended: 'bg-amber-50 text-amber-700 border-amber-200',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-50 text-red-600',
  high: 'bg-amber-50 text-amber-700',
  medium: 'bg-sky-50 text-sky-700',
  low: 'bg-slate-100 text-slate-500',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done', cancelled: 'Cancelled',
};

interface PmClient {
  id: string; name: string; code?: string | null; industry?: string | null;
  contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null;
  city?: string | null; country?: string | null; status: string;
  projects: Array<{ id: string; name: string; status: string; progress: number }>;
  _count: { projects: number };
  issuesTotal: number; issuesOpen: number;
}

interface ClientIssue {
  id: string; name: string; priority: string; status: string;
  taskType?: string | null; workflowStep?: string | null;
  plannedEnd?: string | null; createdAt: string;
  project: { id: string; name: string };
  assignedToName?: string | null;
}

const emptyForm = {
  name: '', code: '', industry: '', contactName: '', contactEmail: '', contactPhone: '',
  city: '', country: '', status: 'active',
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
}

const AVATAR_TINTS = [
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-sky-100 text-sky-700 border-sky-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
];

export default function PmClientsPage() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<PmClient[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, openIssues: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // add / edit client
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PmClient | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);

  // raise issue via the shared create-task modal (external + client locked)
  const [issueClient, setIssueClient] = useState<PmClient | null>(null);
  const [taskProjects, setTaskProjects] = useState<Array<{ id: string; name: string; status?: string }>>([]);
  const [taskEmployees, setTaskEmployees] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [showIssueModal, setShowIssueModal] = useState(false);

  // issues drawer
  const [issuesFor, setIssuesFor] = useState<PmClient | null>(null);
  const [issues, setIssues] = useState<ClientIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/project-management/clients', { headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Failed to load clients'); return; }
      setClients(j.clients || []);
      if (j.stats) setStats(j.stats);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = clients;
    if (statusFilter) list = list.filter((c) => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        (c.contactName || '').toLowerCase().includes(q) ||
        (c.contactEmail || '').toLowerCase().includes(q));
    }
    return list;
  }, [clients, search, statusFilter]);

  /* ── Add / edit client (uses the tenant client database API) ── */
  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (c: PmClient) => {
    setEditing(c);
    setForm({
      name: c.name || '', code: c.code || '', industry: c.industry || '',
      contactName: c.contactName || '', contactEmail: c.contactEmail || '', contactPhone: c.contactPhone || '',
      city: c.city || '', country: c.country || '', status: c.status || 'active',
    });
    setShowForm(true);
  };

  const saveForm = async () => {
    if (!form.name.trim()) { toast.error('Client name is required'); return; }
    if (form.contactEmail && !validateEmail(form.contactEmail)) { toast.error('Enter a valid contact email'); return; }
    if (form.contactPhone && !validatePhone(form.contactPhone)) { toast.error('Enter a valid contact phone'); return; }
    setBusy(true);
    try {
      const url = editing ? `/api/clients/${editing.id}` : '/api/clients';
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: getAuthHeaders(), body: JSON.stringify(form) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || (editing ? 'Update failed' : 'Create failed')); return; }
      toast.success(editing ? 'Client updated' : 'Client added to the database');
      setShowForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const removeClient = async (c: PmClient) => {
    if (!confirm(`Delete client "${c.name}"? Their projects stay, but are unlinked from this client.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${c.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Delete failed'); return; }
      toast.success('Client deleted');
      await load();
    } finally {
      setBusy(false);
    }
  };

  /* ── Raise Issue: shared create-task modal, locked to this client ── */
  const openRaiseIssue = (c: PmClient) => {
    setIssueClient(c);
    setShowIssueModal(true);
    if (taskEmployees.length === 0) {
      fetch('/api/employees?limit=300', { headers: getAuthHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setTaskEmployees(j?.employees || j?.data || []))
        .catch(() => null);
    }
    if (c.projects.length > 0) {
      setTaskProjects(c.projects.map((p) => ({ id: p.id, name: p.name, status: p.status })));
    } else {
      // client has no linked projects — offer all projects so an issue can still be raised
      fetch('/api/projects?limit=100', { headers: getAuthHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setTaskProjects((j?.projects || j?.data || []).map((p: any) => ({ id: p.id, name: p.name, status: p.status }))))
        .catch(() => null);
    }
  };

  const issueModalReady = !!issueClient && taskProjects.length > 0;

  /* ── View issues drawer ── */
  const openIssues = async (c: PmClient) => {
    setIssuesFor(c);
    setIssuesLoading(true);
    try {
      const res = await fetch(`/api/project-management/clients?clientId=${c.id}`, { headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Failed to load issues'); return; }
      setIssues(j.issues || []);
    } finally {
      setIssuesLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Clients</h1>
          <p className="text-xs text-slate-500 mt-1">The client database behind the project-management module — clients raise issues and tickets against their projects, each assigned to a resource.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><FiRefreshCw /> Refresh</button>
          <button onClick={openAdd} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 font-medium"><FiPlus size={12} /> Add Client</button>
        </div>
      </header>

      {/* Stats — SmartHR clients-grid top cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Clients', value: stats.total, icon: <FiUsers className="w-4 h-4" />, tint: 'bg-teal-50 border-teal-200 text-teal-700' },
          { label: 'Active Clients', value: stats.active, icon: <FiCheckCircle className="w-4 h-4" />, tint: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { label: 'Inactive Clients', value: stats.inactive, icon: <FiAlertCircle className="w-4 h-4" />, tint: 'bg-slate-50 border-slate-200 text-slate-600' },
          { label: 'Open Client Issues', value: stats.openIssues, icon: <FiBriefcase className="w-4 h-4" />, tint: 'bg-violet-50 border-violet-200 text-violet-700' },
        ].map((s) => (
          <div key={s.label} className="thb-card p-4 flex items-center gap-3">
            <span className={`p-2.5 rounded-xl border ${s.tint}`}>{s.icon}</span>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">{s.label}</p>
              <p className="text-xl font-bold text-slate-800 leading-tight">{loading ? '—' : s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="thb-card p-3 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Client Grid</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, contact…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Client grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="thb-card p-4 animate-pulse h-64" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="thb-card p-10 text-center">
          <FiFolder className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-600 font-medium">No clients found</p>
          <p className="text-xs text-slate-400 mt-1">Add clients here — they can then raise issues against their projects, which appear on the task board as External.</p>
          <button onClick={openAdd} className="mt-4 inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700"><FiPlus size={12} /> Add Client</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {filtered.map((c, idx) => {
            const tint = AVATAR_TINTS[idx % AVATAR_TINTS.length];
            const firstProject = c.projects[0];
            return (
              <div key={c.id} className="thb-card thb-card-hover p-4 flex flex-col">
                {/* top row — kebab menu left, avatar centered, status right */}
                <div className="relative flex justify-center mb-3">
                  <div className="absolute left-0 top-0">
                    <details className="relative">
                      <summary className="list-none p-1 rounded-full hover:bg-slate-100 cursor-pointer text-slate-400 hover:text-slate-600"><FiMoreVertical className="w-4 h-4" /></summary>
                      <div className="absolute z-20 mt-1 w-36 bg-white border border-slate-100 rounded-xl shadow-lg py-1.5 text-sm">
                        <button onClick={() => openEdit(c)} className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2"><FiEdit2 className="w-3.5 h-3.5 text-slate-400" /> Edit</button>
                        <button onClick={() => removeClient(c)} className="w-full text-left px-3.5 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-2"><FiTrash2 className="w-3.5 h-3.5" /> Delete</button>
                      </div>
                    </details>
                  </div>
                  <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center text-lg font-bold ${tint}`}>
                    {initials(c.name)}
                  </div>
                  <div className="absolute right-0 top-0">
                    <span className={`thb-badge text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_COLORS[c.status] || STATUS_COLORS.inactive}`}>{c.status}</span>
                  </div>
                </div>

                {/* name + industry */}
                <div className="text-center mb-3">
                  <h3 className="text-sm font-semibold text-slate-800 truncate">{c.name}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{c.industry || c.code || 'Client'}{c.contactName ? ` · ${c.contactName}` : ''}</p>
                </div>

                {/* projects + progress (SmartHR "Project :" row) */}
                <div className="mb-3">
                  <p className="text-[11px] text-slate-500 truncate mb-1">
                    Projects : {c._count?.projects || 0}{firstProject ? <span className="text-slate-700 font-medium"> · {firstProject.name}</span> : <span className="text-slate-400"> none yet</span>}
                  </p>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                    <div className="h-1.5 rounded-full bg-teal-500 transition-all" style={{ width: `${firstProject?.progress || 0}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">{c.issuesOpen} open / {c.issuesTotal} issues</span>
                    <button onClick={() => openIssues(c)} className="text-teal-600 font-medium hover:underline">View issues</button>
                  </div>
                </div>

                {/* footer — contact + actions */}
                <div className="mt-auto border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2.5">
                    {c.contactEmail && <a href={`mailto:${c.contactEmail}`} className="inline-flex items-center gap-1 hover:text-teal-600 truncate max-w-[55%]" title={c.contactEmail}><FiMail className="w-3 h-3 shrink-0" /> <span className="truncate">{c.contactEmail}</span></a>}
                    {c.contactPhone && <a href={`tel:${c.contactPhone}`} onClick={(e) => { e.preventDefault(); navigator.clipboard?.writeText(c.contactPhone || '').then(() => toast.success('Phone copied')); }} className="inline-flex items-center gap-1 hover:text-teal-600" title={c.contactPhone || ''}><FiPhone className="w-3 h-3" /> {c.contactPhone}</a>}
                    {!c.contactEmail && !c.contactPhone && <span className="text-slate-300">No contact info</span>}
                  </div>
                  <button
                    onClick={() => openRaiseIssue(c)}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 font-medium transition-colors"
                  >
                    <FiExternalLink className="w-3.5 h-3.5" /> Raise Issue
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit client modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">{editing ? 'Edit Client' : 'Add Client'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-slate-100"><FiX className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client Name <span className="text-red-500 font-bold">*</span></label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" placeholder="e.g. BrightWave Innovations" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client Code</label>
                  <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" placeholder="e.g. BWI-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Industry</label>
                  <input type="text" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" placeholder="e.g. IT Services" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                  <input type="text" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
                  <input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" placeholder="name@company.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Phone</label>
                  <input type="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: phoneInputFilter(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" placeholder="+91 …" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                  <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                  <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={saveForm} disabled={busy} className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50">{busy ? 'Saving…' : editing ? 'Save Changes' : 'Add Client'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Raise Issue — shared create-task modal locked to this client (external) */}
      {issueClient && (
        <CreateTaskModal
          open={showIssueModal}
          onClose={() => { setShowIssueModal(false); setIssueClient(null); }}
          onCreated={async () => { setIssueClient(null); await load(); }}
          projects={issueModalReady ? taskProjects : []}
          employees={taskEmployees}
          fixedProjectId={issueClient.projects.length === 1 ? issueClient.projects[0].id : undefined}
          fixedClientId={issueClient.id}
          defaultExternal
        />
      )}

      {/* Issues drawer */}
      {issuesFor && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50" onClick={() => setIssuesFor(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">{issuesFor.name} — Raised Issues</h3>
                <p className="text-xs text-slate-400 mt-0.5">{issues.length} issue{issues.length === 1 ? '' : 's'} raised against their projects</p>
              </div>
              <button onClick={() => setIssuesFor(null)} className="p-1 rounded hover:bg-slate-100"><FiX className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-4 space-y-2.5">
              {issuesLoading ? (
                <p className="text-sm text-slate-400 text-center py-8 animate-pulse">Loading issues…</p>
              ) : issues.length === 0 ? (
                <div className="text-center py-10">
                  <FiUser className="w-10 h-10 mx-auto text-slate-200 mb-3" />
                  <p className="text-sm text-slate-500">No issues raised yet</p>
                  <p className="text-xs text-slate-400 mt-1">Use “Raise Issue” on the client card — the ticket lands on the project task board labelled External.</p>
                </div>
              ) : issues.map((t) => (
                <div key={t.id} className="border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">{t.name}</p>
                    <span className={`thb-badge text-[10px] px-2 py-0.5 rounded shrink-0 ${t.status === 'done' ? 'bg-emerald-50 text-emerald-700' : t.status === 'in_progress' ? 'bg-amber-50 text-amber-700' : t.status === 'review' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                      {TASK_STATUS_LABELS[t.status] || t.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-fuchsia-500 mt-1">{t.project?.name || 'Project'}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px]">
                    <span className={`thb-badge px-1.5 py-0.5 rounded ${PRIORITY_COLORS[t.priority] || 'bg-slate-100 text-slate-500'}`}>{t.priority}</span>
                    <span className="thb-badge px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">External</span>
                    <span className="text-slate-400">Assigned to: {t.assignedToName || '—'}</span>
                    {t.plannedEnd && <span className="text-slate-400">Due {new Date(t.plannedEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4">
              <button
                onClick={() => { const c = issuesFor; setIssuesFor(null); openRaiseIssue(c); }}
                className="w-full inline-flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 font-medium"
              >
                <FiPlus className="w-4 h-4" /> Raise New Issue for {issuesFor.name}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
