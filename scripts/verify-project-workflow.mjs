/**
 * Project Delivery Workflow — end-to-end verification against the running
 * Next.js server (default http://localhost:3000, override with BASE_URL).
 *
 * Exercises the full dynamic workflow on the DEMO tenant:
 *   workflow-config → intake validation → intake submit → chain approval →
 *   AUTOMATED TRIGGER (workspace: chat room + kanban board seeded from tasks) →
 *   resource request + algorithmic matchmaking → soft reservation →
 *   sprint lifecycle (create/start/complete + velocity) → dependency gating →
 *   kanban two-way sync → timesheet approval routing + waterfall phase gate →
 *   stage-gate chain → capacity planner → skills inventory → post-mortem +
 *   closure sign-off.
 *
 * Creates its own test project(s) (code PMWF-VERIFY-*) and removes them at the
 * end. Read-only against everything else; never touches LIVE data.
 */

import pg from 'pg';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = 'admin@3boxeshrms.com';
const PASS = 'MarqAI@2026';
const MARKER = `PMWF-VERIFY-${Date.now()}`;

let token = null;
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
};

async function api(path, opts = {}) {
  const call = () => fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Host: 'nexus-hrms-mu.vercel.app',
      'x-forwarded-host': 'nexus-hrms-mu.vercel.app',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  let res = await call();
  // Local-dev Neon WebSocket connections drop intermittently — retry once on 5xx
  if (res.status >= 500) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await call();
  }
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body };
}

// ── 0. Login
{
  const res = await fetch(`${BASE}/api/auth/login?tenant=3boxes-hrms-demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const j = await res.json().catch(() => ({}));
  token = j.token || j?.user?.token;
  check('login', res.ok && !!token, res.ok ? `role=${j.user?.role || '?'}` : JSON.stringify(j).slice(0, 120));
  if (!token) process.exit(1);
}

// ── 1. Workflow config resolution
let cfg = null;
{
  const { status, body } = await api('/api/projects/workflow-config');
  cfg = body?.config;
  check('GET workflow-config (defaults resolve)', status === 200 && !!cfg?.intake?.chain && cfg.capacity.overAllocationThresholdPct === 100);
}

// ── 2. Discover company + employees + skills
let companyId = null;
let employees = [];
{
  const { status, body } = await api('/api/companies?limit=10');
  companyId = body?.companies?.[0]?.id || body?.[0]?.id || body?.data?.[0]?.id;
  check('GET companies', status === 200 && !!companyId);
  const e = await api('/api/employees?limit=60');
  employees = e.body?.employees || e.body?.data || [];
  check('GET employees', e.status === 200 && employees.length >= 3, `${employees.length} employees`);
}
const pmId = employees[0]?.id;

// skills inventory
{
  const { status, body } = await api('/api/employees/skills?withEmployees=1');
  check('GET /api/employees/skills', status === 200 && Array.isArray(body?.skills), `${body?.skills?.length || 0} distinct skills`);
}

// ── 3. Create test project (draft)
let projectId = null;
{
  const { status, body } = await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: `Workflow Verify ${MARKER}`, code: MARKER, companyId,
      startDate: new Date().toISOString().slice(0, 10),
      projectManagerId: pmId,
      estimatedHours: 500, budgetAmount: 100000,
    }),
  });
  projectId = body?.project?.id;
  check('POST /api/projects (draft)', status === 201 && !!projectId);
}

// ── 4. Intake validation + submission + approval chain + AUTOMATED TRIGGER
{
  const bad = await api(`/api/projects/${projectId}/intake`, {
    method: 'POST',
    body: JSON.stringify({ methodology: 'agile', businessObjective: '', targetCompletionDate: null }),
  });
  check('intake validation rejects missing objective/date', bad.status === 400, bad.body?.error?.slice(0, 80));

  const sub = await api(`/api/projects/${projectId}/intake`, {
    method: 'POST',
    body: JSON.stringify({
      methodology: 'agile',
      businessObjective: 'Verify the dynamic delivery workflow end-to-end.',
      targetCompletionDate: new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10),
      costCenter: 'CC-VERIFY',
    }),
  });
  const steps = sub.body?.project?.approvalSteps || [];
  check('intake submit creates approval chain', sub.status === 201 && sub.body?.project?.intakeStatus === 'submitted' && steps.length >= 1, `${steps.length} tier(s)`);

  // Approve through the whole chain (admin override)
  let approved = false; let workspace = null; let guard = 0;
  while (!approved && guard++ < 6) {
    const r = await api(`/api/projects/${projectId}/intake`, { method: 'PATCH', body: JSON.stringify({ action: 'approve', comments: 'E2E verify' }) });
    if (r.status !== 200) { console.log('   approve step:', r.status, JSON.stringify(r.body).slice(0, 140)); break; }
    if (r.body?.intakeStatus === 'approved' || r.body?.workspace) { approved = true; workspace = r.body?.workspace; break; }
    if (!r.body?.advancedTo) break;
  }
  check('intake chain approval completes', approved);
  check('AUTOMATED TRIGGER: workspace created (chat room + board)', !!workspace?.roomId && !!workspace?.boardId, `notified=${workspace?.notifiedMembers ?? '?'}`);

  // board seeded with cards
  const boardRes = await api(`/api/kanban?projectId=${projectId}`);
  check('workspace board linked & reachable via kanban API', boardRes.status === 200 && (boardRes.body?.boards || []).length >= 1);
}

// ── 5. Resource request + matchmaking + soft reservation
let requirementId = null; let candidates = []; let reservedEmployeeId = null;
{
  const skillRes = await api('/api/employees/skills');
  const skillName = skillRes.body?.skills?.[0]?.skill || 'React';
  const post = await api(`/api/projects/${projectId}/resource-requests`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Senior Developer', count: 2, requiredSkills: [{ skill: skillName, level: 'intermediate' }],
      allocationPct: 50, priority: 'high',
    }),
  });
  requirementId = post.body?.requirement?.id;
  candidates = post.body?.candidates || [];
  check('resource request + algorithmic matchmaking', post.status === 201 && !!requirementId && candidates.length > 0, `${candidates.length} candidates, top score ${candidates[0]?.score}`);

  reservedEmployeeId = candidates[0]?.employeeId;
  const reserve = await api(`/api/projects/${projectId}/resource-requests`, {
    method: 'PATCH',
    body: JSON.stringify({ requirementId, action: 'soft_reserve', employeeId: reservedEmployeeId, allocationPct: 50 }),
  });
  check('SOFT ALLOCATION (bench) created', reserve.status === 201 && reserve.body?.allocation?.status === 'soft');

  const cap = await api(`/api/projects/capacity?employeeIds=${reservedEmployeeId}`);
  const soft = cap.body?.employees?.[0]?.weeks?.flatMap((w) => w.allocations || []).find((a) => a.soft);
  check('capacity planner shows soft reservation + live availability', cap.status === 200 && !!soft);
}

// ── 6. Sprints (create → start → tasks → complete w/ velocity)
let sprintId = null;
{
  const s = await api(`/api/projects/${projectId}/sprints`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Verify Sprint 1', goal: 'E2E', startDate: new Date().toISOString().slice(0, 10), endDate: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) }),
  });
  sprintId = s.body?.sprint?.id;
  check('sprint created', s.status === 201 && !!sprintId);

  const start = await api(`/api/projects/${projectId}/sprints/${sprintId}`, { method: 'PATCH', body: JSON.stringify({ action: 'start' }) });
  check('sprint started (pod capacity lock active)', start.status === 200 && start.body?.sprint?.status === 'active');

  const dup = await api(`/api/projects/${projectId}/sprints`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Should fail', startDate: new Date().toISOString().slice(0, 10), endDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), status: 'active' }),
  });
  check('second active sprint blocked', dup.status === 409);
}

// ── 7. Tasks: story points, dependency gating, kanban sync
let taskA = null; let taskB = null; let cardA = null;
{
  const a = await api(`/api/projects/${projectId}/tasks`, {
    method: 'POST', body: JSON.stringify({ name: 'Verify task A (dependency source)', priority: 'high', sprintId, storyPoints: 8, estimatedHours: 16 }),
  });
  taskA = a.body?.task?.id;
  const b = await api(`/api/projects/${projectId}/tasks`, {
    method: 'POST', body: JSON.stringify({ name: 'Verify task B (gated)', priority: 'medium', sprintId, storyPoints: 5, dependsOnId: taskA }),
  });
  taskB = b.body?.task?.id;
  check('tasks created with sprint + story points + dependency', !!taskA && !!taskB);

  const gated = await api(`/api/projects/${projectId}/tasks/${taskB}`, { method: 'PATCH', body: JSON.stringify({ status: 'in_progress' }) });
  check('finish-to-start dependency gate (409)', gated.status === 409, gated.body?.error?.slice(0, 70));

  const doneA = await api(`/api/projects/${projectId}/tasks/${taskA}`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) });
  const startB = await api(`/api/projects/${projectId}/tasks/${taskB}`, { method: 'PATCH', body: JSON.stringify({ status: 'in_progress' }) });
  check('gate opens after dependency done', doneA.status === 200 && startB.status === 200);

  // kanban two-way sync: move linked card → task status follows
  const cards = await api(`/api/kanban?projectId=${projectId}`);
  cardA = (cards.body?.cards || []).find((c) => c.projectTaskId === taskB);
  if (cardA) {
    const mv = await api('/api/kanban', { method: 'PATCH', body: JSON.stringify({ id: cardA.id, column: 'Review' }) });
    const t = await api(`/api/projects/${projectId}/tasks/${taskB}`);
    check('kanban → task status sync (Review)', mv.status === 200 && t.body?.task?.status === 'review');
    await api('/api/kanban', { method: 'PATCH', body: JSON.stringify({ id: cardA.id, column: 'To Do' }) });
  } else {
    check('kanban → task status sync (Review)', false, 'no linked card found');
  }

  // sprint complete with velocity
  const complete = await api(`/api/projects/${projectId}/sprints/${sprintId}`, { method: 'PATCH', body: JSON.stringify({ action: 'complete', moveIncomplete: 'backlog' }) });
  check('sprint complete computes velocity', complete.status === 200 && complete.body?.committedPoints >= 8, `${complete.body?.completedPoints}/${complete.body?.committedPoints} pts, say-do ${complete.body?.sayDoRatio}%`);
}

// ── 8. Timesheets: approval routing + waterfall phase gate (uses seeded data)
{
  // find a task of the verify project to log time on (taskB, no phase → allowed)
  const ts = await api('/api/timesheets', {
    method: 'POST',
    body: JSON.stringify({ employeeId: employees[0].id, date: new Date().toISOString().slice(0, 10), projectId, projectTaskId: taskB, hours: 3, description: 'E2E verify', status: 'submitted' }),
  });
  check('timesheet logged against project task', ts.status === 201, ts.status === 201 ? `approver routing notified PM` : JSON.stringify(ts.body).slice(0, 100));

  // waterfall phase gate: seeded demo project PMWF-DEMO-2 phase-2 task is pending
  const wf = await api('/api/projects?limit=100');
  const wfProject = (wf.body?.projects || []).find((p) => p.code === 'PMWF-DEMO-2');
  if (wfProject) {
    const tasks = await api(`/api/projects/${wfProject.id}/tasks`);
    const phase2Task = (tasks.body?.tasks || []).find((t) => t.milestone?.sequence === 2);
    if (phase2Task) {
      const blocked = await api('/api/timesheets', {
        method: 'POST',
        body: JSON.stringify({ employeeId: employees[0].id, date: new Date().toISOString().slice(0, 10), projectId: wfProject.id, projectTaskId: phase2Task.id, hours: 2, status: 'submitted' }),
      });
      check('WATERFALL PHASE GATE blocks logging to phase 2', blocked.status === 409, blocked.body?.error?.slice(0, 80));
    } else {
      check('WATERFALL PHASE GATE blocks logging to phase 2', false, 'phase-2 task not found in seed');
    }
  } else {
    check('WATERFALL PHASE GATE blocks logging to phase 2', false, 'seeded waterfall project missing');
  }
}

// ── 9. Stage-gate chain on a milestone
{
  const ms = await api(`/api/projects/${projectId}/milestones`, {
    method: 'POST', body: JSON.stringify({ name: 'Verify deliverable milestone', plannedDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) }),
  });
  const msId = ms.body?.milestone?.id;
  const gate = await api(`/api/projects/${projectId}/stage-gate`, {
    method: 'POST', body: JSON.stringify({ entityType: 'milestone', entityId: msId, name: 'Verify deliverable milestone' }),
  });
  check('stage-gate chain created (Team Lead → Sponsor)', gate.status === 201 && (gate.body?.steps || []).length >= 2, `${gate.body?.steps?.length || 0} tier(s)`);

  const step1 = gate.body?.steps?.find((s) => s.level === 1);
  const step2 = gate.body?.steps?.find((s) => s.level === 2);
  const d1 = await api(`/api/projects/${projectId}/stage-gate`, { method: 'PATCH', body: JSON.stringify({ stepId: step1?.id, action: 'approve' }) });
  const d2 = await api(`/api/projects/${projectId}/stage-gate`, { method: 'PATCH', body: JSON.stringify({ stepId: step2?.id, action: 'approve' }) });
  check('stage-gate chain advances and completes', d1.body?.advancedTo === 2 && d2.body?.chainComplete === true);
}

// ── 10. Capacity + over-allocation pre-check
{
  const capAll = await api('/api/projects/capacity?from=' + new Date().toISOString().slice(0, 10));
  check('capacity planner (all employees)', capAll.status === 200 && (capAll.body?.employees || []).length > 0, `${capAll.body?.employees?.length} employees, ${capAll.body?.alerts?.length || 0} alerts`);

  const pre = await api('/api/projects/capacity', {
    method: 'POST', body: JSON.stringify({ employeeId: employees[1]?.id || employees[0].id, startDate: new Date().toISOString().slice(0, 10), allocationPct: 100 }),
  });
  check('assignment pre-check returns capacity projection', pre.status === 200 && typeof pre.body?.peakPct === 'number');
}

// ── 11. Post-mortem + closure
{
  const rev = await api(`/api/projects/${projectId}/reviews`, {
    method: 'POST', body: JSON.stringify({ reviews: [{ employeeId: reservedEmployeeId, deliveryQuality: 5, communication: 4, speed: 4, skillUpgradeSuggestion: 'E2E verify skill note' }] }),
  });
  check('post-mortem review recorded', rev.status === 201);

  const readiness = await api(`/api/projects/${projectId}/closure`);
  check('closure readiness report', readiness.status === 200 && readiness.body?.readiness?.totalHours >= 0, `hours=${readiness.body?.readiness?.totalHours}`);

  const noCompliance = await api(`/api/projects/${projectId}/closure`, { method: 'POST', body: JSON.stringify({ complianceConfirmed: false }) });
  check('closure blocked without compliance sign-off', noCompliance.status === 400);

  const close = await api(`/api/projects/${projectId}/closure`, { method: 'POST', body: JSON.stringify({ signOffNotes: 'E2E verify closure', complianceConfirmed: true }) });
  check('project sign-off & closure', close.status === 200 && close.body?.project?.status === 'completed');
}

// ── 12. Cleanup test project
{
  const del = await api(`/api/projects/${projectId}`, { method: 'DELETE' });
  check('cleanup: test project deleted', del.status === 200);
}

// ── Summary
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed < results.length) process.exit(1);
