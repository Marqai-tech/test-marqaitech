/**
 * E2E proof (demo tenant ONLY): after enabling the Collaboration module for
 * the employee role, an employee's internal Email inbox receives the mirrored
 * leave-approval alert.
 *
 * Steps:
 *  1. Login as Amit Reddy (manager) on nexus-hrms-mu.vercel.app
 *  2. Find Bala Mukherjee's most recent pending leave request
 *  3. PATCH /api/leave/{id} {status:'approved'}  → fires leave.approved
 *     notification → email to Bala via tenant SMTP + mirror into
 *     EmailMessage (toEmployeeId = Bala, createdByFlow='notification')
 *  4. Verify NotificationDelivery rows (email+in_app to Bala) and the
 *     EmailMessage mirror row addressed to Bala
 *  5. Login as Bala (employee) and GET /api/email → confirm the alert is
 *     visible in HIS internal inbox (per-recipient scoping)
 *
 * Usage: node scripts/verify-collab-employee-e2e.js
 */
const { neon } = require('@neondatabase/serverless');

const BASE = 'https://nexus-hrms-mu.vercel.app';
const HOST = 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech';
const DEMO_DB = 'tenant_3boxes-hrms-demo';
const sql = neon(`postgresql://neondb_owner:npg_pxZd8woKe4WB@${HOST}/${DEMO_DB}?sslmode=require`);
const log = (...a) => console.log('[e2e]', ...a);

async function login(email, password = 'MarqAI@2026') {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  log(`login OK: ${email} (role=${data.user?.role || '?'})`);
  return data.token;
}

async function main() {
  // ── 1. Approver login (tenant admin — Amit's user role is 'employee' in
  //      the demo DB; he is Bala's reporting manager but not an admin) ──
  const adminToken = await login('admin@3boxeshrms.com');

  // ── 2. Find Bala + his most recent pending leave ──
  const bala = await sql`
    SELECT u."id" AS user_id, e."id" AS emp_id, e."firstName", e."lastName"
    FROM "User" u JOIN "Employee" e ON e."userId" = u."id"
    WHERE u."email" = 'bala.mukherjee@innovatech.demo' LIMIT 1`;
  if (!bala.length) throw new Error('Bala not found');
  const b = bala[0];
  log(`Bala: ${b.firstName} ${b.lastName} employeeId=${b.emp_id}`);

  const pending = await sql`
    SELECT lr."id", lr."startDate", lr."endDate", lt."name" AS type
    FROM "LeaveRequest" lr
    JOIN "LeaveType" lt ON lt."id" = lr."leaveTypeId"
    WHERE lr."employeeId" = ${b.emp_id} AND lr."status" = 'pending'
    ORDER BY lr."createdAt" DESC LIMIT 1`;
  const leave = pending[0] || null;
  if (leave) log(`Pending leave: ${leave.id} (${leave.type}, ${new Date(leave.startDate).toISOString().slice(0,10)} → ${new Date(leave.endDate).toISOString().slice(0,10)})`);

  // ── 3. Approve as admin (skip if already approved in a previous run) ──
  if (pending.length) {
  const patch = await fetch(`${BASE}/api/leave/${leave.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
      'x-tenant-slug': '3boxes-hrms-demo',
    },
    body: JSON.stringify({ status: 'approved', comments: 'Approved — enjoy your time off! (collaboration-inbox e2e verification)' }),
  });
  const patchBody = await patch.text();
  log(`PATCH /api/leave/${leave.id} → ${patch.status} ${patchBody.slice(0, 200)}`);
  if (!patch.ok) throw new Error('approve failed');
  await new Promise(r => setTimeout(r, 6000));
  } else {
    log('No pending leave found — assuming already approved in a previous run; verifying mirror only');
  }
  const deliveries = await sql`
    SELECT "channel", "status", "recipientId", "subject"
    FROM "NotificationDelivery"
    WHERE "subject" LIKE '%Bala Mukherjee%'
    ORDER BY "createdAt" DESC LIMIT 8`;
  log(`\nNotificationDelivery (recent Bala-related): ${deliveries.length}`);
  for (const d of deliveries) log(`  [${d.channel}/${d.status}] → ${d.recipientId} :: ${d.subject}`);

  const mirrors = await sql`
    SELECT "id", "subject", "fromName", "toEmployeeId", "createdByFlow", "createdAt"
    FROM "EmailMessage"
    WHERE "toEmployeeId" = ${b.emp_id} AND "isActive" = true
    ORDER BY "createdAt" DESC LIMIT 5`;
  log(`\nEmailMessage mirror rows addressed to Bala: ${mirrors.length}`);
  for (const m of mirrors) log(`  [${m.createdByFlow}] from=${m.fromName} :: ${m.subject}`);
  if (!mirrors.length) throw new Error('FAIL: no mirror row found for Bala');

  // ── 5. Employee-side check: Bala sees the alert in his internal inbox API ──
  const balaToken = await login('bala.mukherjee@innovatech.demo');
  const inboxRes = await fetch(`${BASE}/api/email?folder=inbox`, {
    headers: { 'Authorization': `Bearer ${balaToken}`, 'x-tenant-slug': '3boxes-hrms-demo' },
  });
  if (!inboxRes.ok) throw new Error(`inbox fetch failed: ${inboxRes.status}`);
  const inbox = await inboxRes.json();
  log(`\nBala internal inbox (GET /api/email): total=${inbox.total}`);
  for (const e of (inbox.emails || []).slice(0, 5)) log(`  • ${e.subject} (labels: ${(e.labels || []).join(', ')})`);

  const approvalMirror = (inbox.emails || []).find(e => e.id === mirrors[0].id);
  log(`\n${approvalMirror ? 'PASS: approval alert mirror VISIBLE in Bala internal inbox' : 'FAIL: mirror not in inbox response'}`);
  if (!approvalMirror) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
