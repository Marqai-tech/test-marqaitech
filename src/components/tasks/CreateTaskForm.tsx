'use client';

/**
 * Task 171 — ONE create-task form for EVERY surface, EMBEDDED IN THE PAGE
 * (no popup). The user asked for the create-task form to live inside the
 * page itself instead of a modal overlay — the same single source of truth
 * that Task 131 established, now rendered as an inline panel that expands
 * above the task board / grid it belongs to:
 *
 *   /project-management          — expands under the header action row
 *   /project-management/tasks    — expands above the kanban columns
 *   /projects/[id] delivery board— expands above the board columns
 *   /project-management/clients  — "Raise Issue" expands above the client grid
 *
 *   Project* (hidden when fixedProjectId) · Task Title* · Task Type* ·
 *   Workflow Step (re-testing rule hint) · Priority · Assignee (required
 *   unless re-testing) · Start Date / End Date / Hrs · Description ·
 *   Attachments (screenshots/PDFs/docs ≤3 MB — uploaded right after the
 *   task is created). Task 150 — TASK SOURCE: Internal (default) or
 *   External (client-raised) + Client selector. Task 170 — DELIVERY
 *   BREAKDOWN + SOFTWARE LINK: Module › Sub-module › Sub-section
 *   classification and the software/feature URL.
 *
 * Workflow rule (server-enforced): moving to re-testing sends the task back
 * to the assignee itself; every other step asks for the assignee again.
 */

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiX, FiPaperclip } from 'react-icons/fi';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export const TASK_TYPES = [
  { value: 'customisation', label: 'Customisation' },
  { value: 'rework', label: 'Rework' },
  { value: 'development', label: 'Development' },
  { value: 'bug', label: 'Bug' },
];

export const WORKFLOW_STEPS = [
  { value: 'testing', label: 'Testing' },
  { value: 're_testing', label: 'Re-testing' },
  { value: 'production', label: 'Production' },
  { value: 'delivery', label: 'Delivery' },
];

interface CreateTaskFormProps {
  projects: Array<{ id: string; name: string; status?: string }>;
  employees: Array<{ id: string; firstName: string; lastName: string }>;
  /** When creating inside a known project the selector is hidden. */
  fixedProjectId?: string;
  /** Task 150 — pre-select this client (e.g. "Raise Issue" from the Clients grid). */
  fixedClientId?: string;
  /** Client display name for the embedded header (Raise Issue flow). */
  clientName?: string;
  /** Task 150 — render with the External (client-raised) source pre-selected. */
  defaultExternal?: boolean;
  /** Called after a task was created successfully (parent reloads + collapses). */
  onCreated?: () => void | Promise<void>;
  /** Collapse the embedded form (X / Cancel). */
  onClose?: () => void;
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

export default function CreateTaskForm({ projects, employees, fixedProjectId, fixedClientId, clientName, defaultExternal, onCreated, onClose }: CreateTaskFormProps) {
  const [projectId, setProjectId] = useState(fixedProjectId || '');
  const [name, setName] = useState('');
  const [taskType, setTaskType] = useState('development');
  const [workflowStep, setWorkflowStep] = useState('testing');
  const [priority, setPriority] = useState('medium');
  const [assignedToId, setAssignedToId] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  // Task 150 — task origin: internal (team) vs external (client-raised issue)
  const [source, setSource] = useState(defaultExternal ? 'external' : 'internal');
  const [clientId, setClientId] = useState(fixedClientId || '');
  const [clients, setClients] = useState<Array<{ id: string; name: string; code?: string | null }>>([]);
  // Task 170 — delivery breakdown + software link (free-text classification,
  // stored trimmed by the API; empty strings are simply not sent)
  const [module, setModule] = useState('');
  const [subModule, setSubModule] = useState('');
  const [subSection, setSubSection] = useState('');
  const [softwareLink, setSoftwareLink] = useState('');

  const rootRef = useRef<HTMLDivElement | null>(null);

  // Task 171 — the form lives IN the page: bring it into view when it mounts
  // (the opener button can sit far above/below the panel position).
  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Lazily load the client database the first time External is picked
  // (or when the form mounts already pointed at a client).
  useEffect(() => {
    if (source !== 'external' && !fixedClientId) return;
    if (clients.length > 0) return;
    fetch('/api/clients?limit=200', { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setClients(j?.clients || j?.data || []))
      .catch(() => null);
  }, [source, fixedClientId, clients.length]);

  const effectiveProject = fixedProjectId || projectId;

  const reset = () => {
    setName('');
    setTaskType('development');
    setWorkflowStep('testing');
    setPriority('medium');
    setAssignedToId('');
    setPlannedStart('');
    setPlannedEnd('');
    setEstimatedHours('');
    setDescription('');
    setFiles([]);
    setSource(defaultExternal ? 'external' : 'internal');
    setClientId(fixedClientId || '');
    setModule('');
    setSubModule('');
    setSubSection('');
    setSoftwareLink('');
  };

  const dismiss = () => {
    reset();
    if (onClose) onClose();
  };

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const picked: File[] = [];
    let skipped = 0;
    for (const f of Array.from(list)) {
      if (f.size <= 3 * 1024 * 1024) picked.push(f);
      else skipped++;
    }
    if (skipped > 0) toast.error(`${skipped} file${skipped === 1 ? '' : 's'} skipped — over the 3 MB limit`);
    setFiles((prev) => [...prev, ...picked]);
  };

  const readFileDataUrl = (f: File) =>
    new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(f);
    });

  const submit = async () => {
    if (!effectiveProject) { toast.error('Select the project for this task'); return; }
    if (!name.trim()) { toast.error('Task title is required'); return; }
    if (source === 'external' && !clientId) {
      toast.error('Select the client who raised this issue');
      return;
    }
    if (workflowStep !== 're_testing' && !assignedToId) {
      toast.error('Select the assignee for this workflow step (re-testing goes back to the assignee)');
      return;
    }
    // Task 170 — same URL rule the API enforces (^https?://\S+$)
    const trimmedLink = softwareLink.trim();
    if (trimmedLink && !/^https?:\/\/\S+$/i.test(trimmedLink)) {
      toast.error('Software link must be a valid http(s) URL');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${effectiveProject}/tasks`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          name: name.trim(),
          priority,
          taskType,
          workflowStep,
          ...(assignedToId ? { assignedToId } : {}),
          ...(plannedStart ? { plannedStart } : {}),
          ...(plannedEnd ? { plannedEnd } : {}),
          ...(estimatedHours ? { estimatedHours: Number(estimatedHours) } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          source,
          ...(source === 'external' ? { clientId } : {}),
          // Task 170 — delivery breakdown + software link (optional fields,
          // sent only when filled so the stored value stays NULL when empty)
          ...(module.trim() ? { module: module.trim() } : {}),
          ...(subModule.trim() ? { subModule: subModule.trim() } : {}),
          ...(subSection.trim() ? { subSection: subSection.trim() } : {}),
          ...(trimmedLink ? { softwareLink: trimmedLink } : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Create failed'); return; }
      const taskId = j?.task?.id || j?.data?.id || j?.id;

      // Task 131 — attachments picked BEFORE the task existed are uploaded now
      let uploaded = 0;
      if (taskId && files.length > 0) {
        for (const f of files) {
          try {
            const dataUrl = await readFileDataUrl(f);
            if (!dataUrl) continue;
            const up = await fetch(`/api/projects/${effectiveProject}/attachments`, {
              method: 'POST', headers: getAuthHeaders(),
              body: JSON.stringify({ fileName: f.name, mimeType: f.type || 'application/octet-stream', size: f.size, dataUrl, taskId, category: 'task' }),
            });
            if (up.ok) uploaded++;
          } catch { /* keep going — the task itself exists */ }
        }
      }

      // Task 135 — the API now fans out bell + email to assignee, project
      // manager and tenant admins; the response carries `taskAlert` diagnostics.
      const alert = j?.taskAlert as { recipients?: number; notifications?: number; emails?: number; errors?: string[] } | undefined;
      const delivered = (alert?.notifications || 0) + (alert?.emails || 0);
      const baseMsg = uploaded > 0
        ? `Task created — ${uploaded} attachment${uploaded === 1 ? '' : 's'} uploaded`
        : 'Task created';
      const alertMsg = delivered > 0
        ? ` — assignee & manager notified (${delivered} alert${delivered === 1 ? '' : 's'})`
        : alert && (alert.errors?.length || 0) > 0
          ? ' — alerts could not be delivered'
          : ' — assignee notified';
      const toastFn = delivered > 0 || !alert ? toast.success : toast.error;
      toastFn(`${baseMsg}${alertMsg}`);
      reset();
      if (onCreated) await onCreated();
      // Parent decides whether the panel stays open; default is to collapse it.
      if (onClose) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} id="create-task-form" className="scroll-mt-28 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Embedded header — replaces the old popup chrome */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
        <div>
          <h3 className="text-base font-semibold text-slate-800">{fixedClientId ? `Raise Issue${clientName ? ` — ${clientName}` : ''}` : 'Create New Task'}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">The form lives right here in the page — the task lands on the project board the moment you create it.</p>
        </div>
        {onClose && (
          <button onClick={dismiss} title="Close form" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5 text-slate-400" /></button>
        )}
      </div>

      <div className="p-4 md:p-5 grid md:grid-cols-2 gap-x-5 gap-y-4">
        {!fixedProjectId && (
          <div>
            <label className={labelCls}>Project <span className="text-red-500 font-bold">*</span></label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
              <option value="">Select project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status && p.status !== 'active' ? ` (${p.status})` : ''}</option>)}
            </select>
          </div>
        )}
        {/* Task 150 — who raised this task: the team (internal) or a client (external issue) */}
        <div className={fixedProjectId ? 'md:col-span-2' : ''}>
          <label className={labelCls}>Task Source <span className="text-red-500 font-bold">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setSource('internal'); if (!fixedClientId) setClientId(''); }}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                source === 'internal'
                  ? 'bg-teal-50 border-teal-500 text-teal-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              Internal
            </button>
            <button
              type="button"
              onClick={() => setSource('external')}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                source === 'external'
                  ? 'bg-violet-50 border-violet-500 text-violet-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              External
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {source === 'external' ? 'Raised by a client — labelled External on the task board.' : 'Raised by our own team.'}
          </p>
        </div>
        <div>
          <label className={labelCls}>
            Client {source === 'external' && <span className="text-red-500 font-bold">*</span>}
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={source !== 'external' || !!fixedClientId}
            className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
          >
            <option value="">{source === 'external' ? 'Select client' : '—'}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</option>)}
          </select>
          {fixedClientId && <p className="text-[11px] text-slate-400 mt-1">Client pre-selected from the Clients page.</p>}
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Task Title <span className="text-red-500 font-bold">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Enter task title" />
        </div>
        <div>
          <label className={labelCls}>Task Type <span className="text-red-500 font-bold">*</span></label>
          <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className={inputCls}>
            {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Workflow Step</label>
          <select value={workflowStep} onChange={(e) => setWorkflowStep(e.target.value)} className={inputCls}>
            {WORKFLOW_STEPS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">Re-testing sends the task back to the assignee; every other step asks for the assignee again.</p>
        </div>
        <div>
          <label className={labelCls}>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>
            Assignee {workflowStep !== 're_testing' && <span className="text-red-500 font-bold">*</span>}
          </label>
          <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={inputCls}>
            <option value="">{workflowStep === 're_testing' ? 'Optional for re-testing' : 'Select assignee'}</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Schedule & Effort</label>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <input type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} className={inputCls} title="Start date" />
            </div>
            <div>
              <input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} className={inputCls} title="End date" />
            </div>
            <div>
              <input type="number" min={0} value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} className={inputCls} placeholder="Hrs" title="Estimated hours" />
            </div>
          </div>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Description</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="Task description..." />
        </div>
        {/* Task 170 — delivery breakdown + software link (same fields the
            edit modals show; optional, free-text classification) */}
        <div className="md:col-span-2">
          <label className={labelCls}>Delivery Breakdown</label>
          <div className="grid grid-cols-3 gap-4">
            <input type="text" value={module} onChange={(e) => setModule(e.target.value)} className={inputCls} placeholder="Module" title="Functional module this task belongs to (e.g. Attendance)" />
            <input type="text" value={subModule} onChange={(e) => setSubModule(e.target.value)} className={inputCls} placeholder="Sub-module" title="Sub-module within the module (e.g. Regularization)" />
            <input type="text" value={subSection} onChange={(e) => setSubSection(e.target.value)} className={inputCls} placeholder="Sub-section" title="Finer sub-section within the sub-module (e.g. Half-day rules)" />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Module › sub-module › sub-section this deliverable belongs to — shown on the task board.</p>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Software Link</label>
          <input type="url" value={softwareLink} onChange={(e) => setSoftwareLink(e.target.value)} className={inputCls} placeholder="https://…" title="URL of the related software / feature" />
          <p className="text-[11px] text-slate-400 mt-1">Optional link to the related software or feature — clickable on the task card.</p>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Attachments</label>
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-teal-100 transition-colors">
            <FiPaperclip className="w-3.5 h-3.5" /> Attach files
            <input type="file" multiple className="hidden" onChange={(e) => { pickFiles(e.target.files); e.currentTarget.value = ''; }} />
          </label>
          <p className="text-[11px] text-slate-400 mt-1">Screenshots, PDFs, docs — up to 3 MB each, uploaded when the task is created.</p>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="text-[10px] text-slate-400">{f.size >= 1024 ? `${Math.round(f.size / 1024)} KB` : `${f.size} B`}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, k) => k !== i))} className="text-slate-300 hover:text-slate-600">✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60">
        <button onClick={dismiss} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-white transition-colors">Cancel</button>
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50">
          {busy ? 'Creating…' : 'Create Task'}
        </button>
      </div>
    </div>
  );
}
