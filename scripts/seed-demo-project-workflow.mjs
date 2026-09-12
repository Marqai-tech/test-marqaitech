/**
 * Seed demo tenant DB (tenant_3boxes-hrms-demo) with Project Delivery Workflow
 * sample data — real rows that exercise every part of the dynamic workflow:
 *
 *  - Agile project (intake approved, workspace chat room + kanban board seeded
 *    from tasks with two-way projectTaskId links, sprints [completed/active/planned],
 *    story-pointed tasks with a finish-to-start dependency, timesheets, encrypted
 *    cost rates)
 *  - Waterfall project (intake SUBMITTED with pending approval chain, sequential
 *    phases with sequence + budget caps, phase-gated tasks)
 *  - Closed project (post-mortem reviews, sign-off) demonstrating closure +
 *    performance feedback integration
 *  - Employee timezone / weekly-hours alignment + ProjectActivity feed rows
 *
 * Idempotent: skips when the marker project already exists.
 * DEMO DATABASE ONLY — never touches tenant_marqaitechgroup.
 */

import pg from 'pg';

const HOST = 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech';
const USER = 'neondb_owner';
const PASS = 'npg_pxZd8woKe4WB';
const DB = 'tenant_3boxes-hrms-demo';
const MARKER = 'PMWF-DEMO-1';

// Must match src/lib/encryption.ts fallback key derivation (no PM_ENCRYPTION_KEY set)
import crypto from 'crypto';
function encKey() {
  return crypto.createHash('sha256').update(`3boxes-pm-field-encryption-v1`, 'utf8').digest();
}
function encryptField(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const e = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${e.toString('base64url')}`;
}

const conn = new pg.Client({ host: HOST, user: USER, password: PASS, database: DB, ssl: { rejectUnauthorized: false } });
await conn.connect();

// Debug wrapper: surface the failing SQL text on errors
const origQuery = conn.query.bind(conn);
conn.query = async (sql, params) => {
  try {
    return await origQuery(sql, params);
  } catch (e) {
    console.error('[seed] SQL FAILED:', String(sql).slice(0, 220).replace(/\s+/g, ' '));
    console.error('[seed] params:', JSON.stringify(params)?.slice(0, 200));
    throw e;
  }
};

const q = async (sql, params = []) => (await conn.query(sql, params)).rows;
const now = () => new Date().toISOString();

// ── 0. Idempotency
const existing = await q(`SELECT id FROM "Project" WHERE code = $1`, [MARKER]);
if (existing.length > 0) {
  console.log('[seed] Demo project workflow data already present — skipping.');
  process.exit(0);
}

// ── 1. Discover context
const company = (await q(`SELECT id, name FROM "Company" ORDER BY "createdAt" LIMIT 1`))[0];
const employees = await q(`
  SELECT e.id, e."firstName", e."lastName", e."userId", e."companyId", d.title AS designation, dept.name AS deptName
  FROM "Employee" e
  LEFT JOIN "Designation" d ON d.id = e."designationId"
  LEFT JOIN "Department" dept ON dept.id = e."departmentId"
  WHERE e."status" = 'active'
  ORDER BY e."createdAt"
  LIMIT 30
`);
if (!company || employees.length < 5) {
  console.error('[seed] Need a company + >=5 active employees in the demo tenant');
  process.exit(1);
}
const emp = (i) => employees[i % employees.length];
const name = (e) => `${e.firstName} ${e.lastName}`;
const pm = emp(0);          // project manager
const sponsor = emp(1);     // executive sponsor
const devs = employees.slice(2);

console.log(`[seed] company=${company.name}, pm=${name(pm)}, sponsor=${name(sponsor)}, team pool=${devs.length}`);

const insert = async (sql, params) => {
  const r = await conn.query(sql, params);
  return r.rows[0]?.id;
};

// ══ 2. AGILE PROJECT ══════════════════════════════════════════════
const agileId = await insert(
  `INSERT INTO "Project" (id, name, code, "companyId", "projectManagerId", "deliveryManagerId", "departmentId",
     "projectType", "billingType", currency, "budgetAmount", "estimatedHours", "startDate", "endDate", status, description, progress,
     methodology, "businessObjective", "executiveSponsor", "targetCompletionDate", "intakeStatus", "submittedAt", "approvedAt", "approvedBy",
     "costCenter", "travelBudgetRequired", "sprintDuration", "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, 'Mobile Banking App Revamp', $1, $2, $3, $4, (SELECT "departmentId" FROM "Employee" WHERE id=$3),
     'client', 'time_and_material', 'INR', 4800000, 2400, now() - interval '35 days', now() + interval '120 days', 'active',
     'Rebuild the retail mobile banking experience for 2M customers.', 34,
     'agile', 'Lift mobile NPS by 20 points and cut payment drop-offs by 15%.', $5, now() + interval '120 days',
     'approved', now() - interval '34 days', now() - interval '33 days', 'demo-seed',
     'CC-DIGI-2026', true, 14, $6, $6) RETURNING id`,
  [MARKER, company.id, pm.id, emp(2).id, sponsor.id, now()]
);

// workspace chat room
const roomId = await insert(
  `INSERT INTO "ChatRoom" (id, name, "roomType", "companyId", "projectId", "createdBy", description, "isActive", "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, 'Mobile Banking App Revamp — Workspace', 'project', $1, $2, $3,
   'Central workspace for project "Mobile Banking App Revamp". Status updates, documentation and delivery discussion.', true, $4, $4) RETURNING id`,
  [company.id, agileId, pm.id, now()]
);
for (const e of employees.slice(0, 6)) {
  if (!e.userId) continue;
  await conn.query(
    `INSERT INTO "ChatRoomMember" (id, "roomId", "userId", role, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, 'member', $3, $3) ON CONFLICT DO NOTHING`,
    [roomId, e.userId, now()]
  );
}

// kanban delivery board linked to project
const boardId = await insert(
  `INSERT INTO "KanbanBoard" (id, name, description, "companyId", "createdById", columns, "isActive", "projectId", "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, 'Mobile Banking App Revamp — Delivery Board',
   'Auto-created delivery board for project "Mobile Banking App Revamp" (Agile/Scrum).', $1, $2,
   'Backlog,To Do,In Progress,Review,Done', true, $3, $4, $4) RETURNING id`,
  [company.id, pm.id, agileId, now()]
);

// sprints: completed, active, planned
const s1 = await insert(
  `INSERT INTO "Sprint" (id, "projectId", name, goal, "sprintNumber", "startDate", "endDate", status, "committedPoints", "completedPoints", "closedAt", "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, $1, 'Sprint 1 — Foundations', 'Auth + base UI kit', 1, now() - interval '35 days', now() - interval '21 days', 'completed', 34, 30, now() - interval '21 days', $2, $2) RETURNING id`,
  [agileId, now()]
);
const s2 = await insert(
  `INSERT INTO "Sprint" (id, "projectId", name, goal, "sprintNumber", "startDate", "endDate", status, "committedPoints", "completedPoints", "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, $1, 'Sprint 2 — Payments', 'UPI flow + card tokenization', 2, now() - interval '20 days', now() + interval '1 day', 'active', 38, 0, $2, $2) RETURNING id`,
  [agileId, now()]
);
const s3 = await insert(
  `INSERT INTO "Sprint" (id, "projectId", name, goal, "sprintNumber", "startDate", "endDate", status, "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, $1, 'Sprint 3 — Statements', 'e-statements + analytics', 3, now() + interval '2 days', now() + interval '16 days', 'planned', $2, $2) RETURNING id`,
  [agileId, now()]
);

// tasks with story points, sprint, dependency; statuses spread across board
const taskDefs = [
  { n: 'Biometric login (FaceID/fingerprint)', s: s1, pts: 8, st: 'done', a: 0 },
  { n: 'Session token rotation service', s: s1, pts: 5, st: 'done', a: 1 },
  { n: 'UPI payment flow', s: s2, pts: 13, st: 'in_progress', a: 0 },
  { n: 'Card tokenization + vault', s: s2, pts: 8, st: 'in_progress', a: 1 },
  { n: 'Payment receipt animations', s: s2, pts: 3, st: 'review', a: 2 },
  { n: 'Fraud rule engine integration', s: s2, pts: 8, st: 'todo', a: 3, dep: 1 },
  { n: 'e-Statement PDF generator', s: s3, pts: 5, st: 'todo', a: 2 },
  { n: 'Spending insights dashboard', s: null, pts: 8, st: 'todo', a: null },
];
const taskIds = [];
for (const [i, t] of taskDefs.entries()) {
  const dependsOnId = t.dep !== undefined ? taskIds[t.dep] : null;
  const id = await insert(
    `INSERT INTO "ProjectTask" (id, "projectId", name, "assignedToId", "sprintId", "storyPoints", "dependsOnId",
       "plannedStart", "plannedEnd", "estimatedHours", priority, status, "isBillable", description, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, now() - interval '20 days', now() + interval '${i * 3 + 5} days', $7, $8, $9, true, $10, $11, $11) RETURNING id`,
    [agileId, t.n, t.a !== null ? devs[t.a % devs.length].id : null, t.s, t.pts, dependsOnId, t.pts * 2, t.st === 'done' ? 'medium' : 'high', t.st, `User story for ${t.n}`, now()]
  );
  taskIds.push(id);

  // kanban card linked for two-way sync
  const col = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' }[t.st] || 'Backlog';
  await conn.query(
    `INSERT INTO "KanbanCard" (id, "boardId", title, description, "column", priority, category, "assignedToId", "order", "isActive", "projectTaskId", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, NULL, $3, $4, 'General', $5, $6, true, $7, $8, $8)`,
    [boardId, t.n, col, t.st === 'done' ? 'Medium' : 'High', t.a !== null ? devs[t.a % devs.length].id : null, i, id, now()]
  );

  // timesheets for the dev
  if (t.a !== null && t.st !== 'todo') {
    for (let d = 2; d <= 4; d++) {
      await conn.query(
        `INSERT INTO "Timesheet" (id, "employeeId", date, "projectId", "projectTaskId", project, task, hours, description, status, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, now() - interval '${d} days', $2, $3, 'Mobile Banking App Revamp', $4, $5, 'Sprint work', 'approved', $6, $6)`,
        [devs[t.a % devs.length].id, agileId, id, t.n, 4 + (d % 3) * 1.5, now()]
      );
    }
  }
}

// allocations + encrypted cost rates
const allocDefs = [
  { e: pm, role: 'Project Manager / Scrum Master', pct: 60 },
  { e: devs[0], role: 'Senior Developer', pct: 100 },
  { e: devs[1], role: 'Senior Developer', pct: 80 },
  { e: devs[2], role: 'UI Engineer', pct: 50 },
  { e: devs[3], role: 'QA Engineer', pct: 40 },
];
for (const a of allocDefs) {
  await conn.query(
    `INSERT INTO "ProjectAllocation" (id, "projectId", "employeeId", role, "allocationPct", "startDate", "endDate",
       "billingStatus", "billingRate", "internalCostRate", "timesheetApprover", status, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now() - interval '35 days', now() + interval '120 days',
       'billable', 1800, 950, $5, 'active', $6, $6)`,
    [agileId, a.e.id, a.role, a.pct, pm.id, now()]
  );
  await conn.query(`UPDATE "Employee" SET timezone = CASE WHEN $2::int % 2 = 0 THEN 'Asia/Kolkata' ELSE 'Asia/Dubai' END, "defaultWeeklyHours" = 40 WHERE id = $1`, [a.e.id, allocDefs.indexOf(a)]);
  await conn.query(
    `INSERT INTO "EmployeeCostRate" (id, "employeeId", "hourlyCostRateEnc", "hourlyBillableRateEnc", "weeklyHours", currency, "effectiveFrom", "isActive", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, 40, 'INR', now() - interval '90 days', true, $4, $4)`,
    [a.e.id, encryptField(700 + allocDefs.indexOf(a) * 90), encryptField(1800), now()]
  );
}
// RBAC members
for (const a of allocDefs) {
  await conn.query(
    `INSERT INTO "ProjectMember" (id, "projectId", "employeeId", "userId", role, "assignedBy", "assignedAt", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $6, $6) ON CONFLICT DO NOTHING`,
    [agileId, a.e.id, a.e.userId, a.e.id === pm.id ? 'manager' : 'member', pm.id, now()]
  );
}

// role requirement with cached matchmaking
await conn.query(
  `INSERT INTO "ProjectRoleRequirement" (id, "projectId", title, count, "requiredSkills", "estimatedHours", "allocationPct",
     "startDate", "endDate", priority, status, "matchedEmployees", notes, "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, $1, 'React Native Developer', 2, $2, 320, 100,
     now() + interval '2 days', now() + interval '90 days', 'high', 'open', $3,
   'Needed for statements module pairing', $4, $4)`,
  [
    agileId,
    JSON.stringify([{ skill: 'React Native', level: 'advanced', minYears: 3 }, { skill: 'TypeScript', level: 'advanced' }]),
    JSON.stringify([]),
    now(),
  ]
);

// intake approval trail (all approved)
await conn.query(
  `INSERT INTO "ProjectApprovalStep" (id, "projectId", "gateType", "entityType", "entityId", level, name, "approverType", "approverValue", status, "decidedBy", "decidedAt", comments, "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, $1, 'intake', 'project', $1, 1, 'Project Manager Review', 'reporting_manager', $2, 'approved', 'demo-seed', now() - interval '33 days', 'Solid business case.', $3, $3),
          (gen_random_uuid()::text, $1, 'intake', 'project', $1, 2, 'Executive / Admin Approval', 'project_sponsor', $4, 'approved', 'demo-seed', now() - interval '33 days', 'Approved — aligns with Q3 digital goals.', $3, $3)`,
  [agileId, pm.id, now(), sponsor.id]
);

// activity rows
const acts = [
  ['workspace', 'Project approved — centralized workspace created (chat room + delivery board). Team members notified.'],
  ['allocation', 'Resource request raised: 2 × "React Native Developer" — matched from live employee profiles.'],
  ['task_update', 'Sprint 2 "Payments" STARTED — 38 story points committed.'],
  ['timesheet', '6h logged against "UPI payment flow".'],
  ['capacity', 'Sprint velocity recalculated: no team leave conflicts detected for the upcoming cycle.'],
];
for (const [type, message] of acts) {
  await conn.query(
    `INSERT INTO "ProjectActivity" (id, "projectId", "employeeId", type, message, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $5)`,
    [agileId, pm.id, type, message, now()]
  );
}

console.log('[seed] Agile project seeded:', agileId);

// ══ 3. WATERFALL PROJECT (intake SUBMITTED — pending approval) ════
const wfId = await insert(
  `INSERT INTO "Project" (id, name, code, "companyId", "projectManagerId", "departmentId",
     "projectType", "billingType", currency, "budgetAmount", "estimatedHours", "startDate", "endDate", status, description, progress,
     methodology, "businessObjective", "executiveSponsor", "targetCompletionDate", "intakeStatus", "submittedAt",
     "costCenter", "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, 'Insurance Core Migration', $1, $2, $3, (SELECT "departmentId" FROM "Employee" WHERE id=$3),
     'internal', 'fixed', 'INR', 12500000, 5200, now() + interval '10 days', now() + interval '300 days', 'draft',
     'Migrate policy administration from legacy mainframe to the new core.', 0,
     'waterfall', 'Retire the legacy mainframe before the 2027 license expiry and cut ops cost 30%.', $4, now() + interval '300 days',
     'submitted', now() - interval '2 days',
     'CC-OPS-2026', $5, $5) RETURNING id`,
  ['PMWF-DEMO-2', company.id, pm.id, sponsor.id, now()]
);

// intake approval chain: tier 1 pending (PM), tier 2 pending (sponsor)
await conn.query(
  `INSERT INTO "ProjectApprovalStep" (id, "projectId", "gateType", "entityType", "entityId", level, name, "approverType", "approverValue", status, "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, $1, 'intake', 'project', $1, 1, 'Project Manager Review', 'reporting_manager', $2, 'pending', $3, $3),
          (gen_random_uuid()::text, $1, 'intake', 'project', $1, 2, 'Executive / Admin Approval', 'project_sponsor', $4, 'pending', $3, $3)`,
  [wfId, pm.id, now(), sponsor.id]
);

// sequential phases with budget caps
const phases = [
  { n: 'Requirements', seq: 1, days: 30, cap: 1500000, st: 'approved' },
  { n: 'Design', seq: 2, days: 60, cap: 2500000, st: 'pending' },
  { n: 'Development', seq: 3, days: 150, cap: 6000000, st: 'pending' },
  { n: 'Testing & Cutover', seq: 4, days: 60, cap: 2500000, st: 'pending' },
];
const phaseIds = [];
for (const p of phases) {
  const id = await insert(
    `INSERT INTO "ProjectMilestone" (id, "projectId", name, "plannedDate", "sequence", "isPhase", "budgetCap", "approvalStatus", "completionPct", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, now() + interval '${p.days} days', $3, true, $4, $5, 0, $6, $6) RETURNING id`,
    [wfId, p.n, p.seq, p.cap, p.st, now()]
  );
  phaseIds.push(id);
}
// phase 1 approved + actualDate
await conn.query(`UPDATE "ProjectMilestone" SET "approvalStatus"='approved', "actualDate" = now() - interval '1 day' WHERE id = $1`, [phaseIds[0]]);

// phase tasks — phase 2 gated behind phase 1 approval status
await conn.query(
  `INSERT INTO "ProjectTask" (id, "projectId", "milestoneId", name, "plannedStart", "plannedEnd", "estimatedHours", priority, status, "isBillable", "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, $1, $2, 'Sign-off requirements specification', now() - interval '10 days', now() - interval '1 day', 120, 'high', 'done', false, $3, $3)`,
  [wfId, phaseIds[0], now()]
);
await conn.query(
  `INSERT INTO "ProjectTask" (id, "projectId", "milestoneId", name, "plannedStart", "plannedEnd", "estimatedHours", priority, status, "isBillable", "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, $1, $2, 'Target architecture blueprint', now() + interval '1 day', now() + interval '40 days', 200, 'critical', 'todo', false, $3, $3)`,
  [wfId, phaseIds[1], now()]
);

// allocations
for (const a of [{ e: pm, role: 'Project Manager', pct: 40 }, { e: devs[1], role: 'Solution Architect', pct: 50 }]) {
  await conn.query(
    `INSERT INTO "ProjectAllocation" (id, "projectId", "employeeId", role, "allocationPct", "startDate", "endDate", "billingStatus", "internalCostRate", "timesheetApprover", status, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now() - interval '5 days', now() + interval '300 days', 'non_billable', 1100, $5, 'active', $6, $6)`,
    [wfId, a.e.id, a.role, a.pct, pm.id, now()]
  );
}

await conn.query(
  `INSERT INTO "ProjectActivity" (id, "projectId", "employeeId", type, message, "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, $1, $2, 'approval', 'Project intake submitted for approval (methodology: Waterfall).', $3, $3)`,
  [wfId, pm.id, now()]
);
console.log('[seed] Waterfall project seeded:', wfId);

// ══ 4. CLOSED PROJECT with post-mortem reviews ════════════════════
const clId = await insert(
  `INSERT INTO "Project" (id, name, code, "companyId", "projectManagerId",
     "projectType", "billingType", currency, "budgetAmount", "estimatedHours", "startDate", "endDate", status, description, progress,
     methodology, "businessObjective", "intakeStatus", "approvedAt", "costCenter",
     "closedAt", "signOffBy", "signOffNotes", "createdAt", "updatedAt")
   VALUES (gen_random_uuid()::text, 'HR Portal Rollout', $1, $2, $3,
     'internal', 'non_billable', 'INR', 900000, 800, now() - interval '150 days', now() - interval '30 days', 'completed',
     'Company-wide self-service HR portal rollout.', 100,
     'agile', 'Reduce HR query turnaround by 60% via self-service.', 'approved', now() - interval '149 days', 'CC-HR-2026',
     now() - interval '30 days', 'demo-seed', 'All deliverables archived; policy sign-off recorded; client acceptance from internal stakeholders.',
     $4, $4) RETURNING id`,
  ['PMWF-DEMO-3', company.id, pm.id, now()]
);
for (const e of [devs[0], devs[2]]) {
  await conn.query(
    `INSERT INTO "ProjectAllocation" (id, "projectId", "employeeId", role, "allocationPct", "startDate", "endDate", "billingStatus", status, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, 'Developer', 80, now() - interval '150 days', now() - interval '30 days', 'non_billable', 'ended', $3, $3)`,
    [clId, e.id, now()]
  );
  await conn.query(
    `INSERT INTO "ProjectReview" (id, "projectId", "employeeId", "reviewerEmployeeId", "reviewType", "deliveryQuality", communication, speed, overall, comments, "skillUpgradeSuggestion", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, 'post_mortem', 5, 4, 4, 4, $4, $5, $6, $6)`,
    [clId, e.id, pm.id,
      e.id === devs[0].id ? 'Outstanding delivery quality; mentored juniors effectively.' : 'Strong communication with stakeholders; improved speed across the project.',
      e.id === devs[0].id ? 'Delivered project using Next.js 14 — suggest adding to master profile skills.' : null,
      now()]
  );
}
console.log('[seed] Closed project seeded:', clId);

// sanity counts
const counts = await q(`
  SELECT
    (SELECT COUNT(*) FROM "Project" WHERE code LIKE 'PMWF-DEMO%') AS projects,
    (SELECT COUNT(*) FROM "Sprint" WHERE "projectId" = $1) AS sprints,
    (SELECT COUNT(*) FROM "ProjectTask" WHERE "projectId" = $1) AS tasks,
    (SELECT COUNT(*) FROM "KanbanCard" WHERE "boardId" = $2) AS cards,
    (SELECT COUNT(*) FROM "EmployeeCostRate") AS costRates,
    (SELECT COUNT(*) FROM "ProjectApprovalStep" WHERE "projectId" IN ($1, $3)) AS steps,
    (SELECT COUNT(*) FROM "ProjectReview") AS reviews
`, [agileId, boardId, wfId]);
console.log('[seed] Counts:', counts[0]);
console.log('[seed] DONE.');
await conn.end();
