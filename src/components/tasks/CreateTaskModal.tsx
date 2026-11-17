'use client';

/**
 * Task 131 — ONE create-task form for EVERY surface.
 *
 * The project-management dashboard, the cross-project Tasks page and the
 * per-project delivery board previously had THREE different create forms
 * (different fields, different designs). This component is now the single
 * source of truth — the same fields, the same order, the same look — and it
 * matches the mobile create sheet 1:1:
 *
 *   Project* (hidden when fixedProjectId) · Task Title* · Task Type* ·
 *   Workflow Step (re-testing rule hint) · Priority · Assignee (required
 *   unless re-testing) · Start Date / End Date / Hrs · Description ·
 *   Attachments (screenshots/PDFs/docs ≤3 MB — uploaded right after the
 *   task is created, exactly like the mobile create sheet).
 *   Task 150 — TASK SOURCE: Internal (raised by the team, default) or
 *   External (raised by a CLIENT as an issue/ticket) + a Client selector
 *   for external tasks; external tasks are labelled on the task board.
 *
 * Workflow rule (server-enforced): moving to re-testing sends the task back
 * to the assignee itself; every other step asks for the assignee again.
 */

import { useEffect, useState } from 'react';
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

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
  projects: Array<{ id: string; name: string; status?: string }>;
  employees: Array<{ id: string; firstName: string; lastName: string }>;
  /** When creating inside a known project the selector is hidden. */
  fixedProjectId?: string;
  /** Task 150 — pre-select this client (e.g. "Raise Issue" from the Clients grid). */
  fixedClientId?: string;
  /** Task 150 — open with the External (client-raised) source pre-selected. */
  defaultExternal?: boolean;
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

export default function CreateTaskModal({ open, onClose, onCreated, projects, employees, fixedProjectId, fixedClientId, defaultExternal }: CreateTaskModalProps) {
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

  // Lazily load the client database the first time External is picked
  // (or when the modal opens already pointed at a client).
  useEffect(() => {
    if (!open) return;
    if (source !== 'external' && !fixedClientId) return;
    if (clients.length > 0) return;
    fetch('/api/clients?limit=200', { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setClients(j?.clients || j?.data || []))
      .catch(() => null);
  }, [open, source, fixedClientId, clients.length]);

  if (!open) return null;

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
      onClose();
      if (onCreated) await onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { reset(); onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">Create New Task</h3>
          <button onClick={() => { reset(); onClose(); }} className="p-1 rounded hover:bg-slate-100"><FiX className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-4">
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
          <div className="grid grid-cols-2 gap-4">
            <div>
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
          </div>
          <div>
            <label className={labelCls}>Task Title <span className="text-red-500 font-bold">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Enter task title" />
          </div>
          <div className="grid grid-cols-2 gap-4">
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
          </div>
          <div className="grid grid-cols-2 gap-4">
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
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Hrs</label>
              <input type="number" min={0} value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} className={inputCls} placeholder="0" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="Task description..." />
          </div>
          <div>
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
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100">
          <button onClick={() => { reset(); onClose(); }} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50">
            {busy ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
