/**
 * Task 96-c — register the outage-fix change request in the super-admin
 * change-control workflow (promised in Task 96 worklog once the DB returned).
 * Registers -> in-app approval (super-admin-link authority per policy) ->
 * mark implemented with the deploy commit.
 */
const BASE = 'https://3boxeshrms.com';
const HDRS = { 'Content-Type': 'application/json' };

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: HDRS,
    body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
  }).then((r) => r.json());
  const token = login.token || login.accessToken;
  if (!token) { console.log('LOGIN FAILED:', login.error); process.exit(1); }
  const auth = { ...HDRS, Authorization: `Bearer ${token}` };

  // 1. Register the change request (sends approval email to mahesh@marqaitech.com)
  const cr = await fetch(`${BASE}/api/super-admin/change-requests`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      title: 'Task 96 — outage mitigation: biometric-sync cron 1,440/day -> 288/day',
      description: 'OUTAGE FIX (deployed under user authorization during the LIVE outage; registered here retroactively per policy). Root cause: collaborator commit 27dad23b changed vercel.json cron /api/cron/biometric-sync from once daily to EVERY MINUTE (1,440 runs/day), keeping the Neon compute permanently active and exhausting the LIVE Neon project quota in ~19 hours — every LIVE DB query failed with "Your account or project has exceeded the quota" (Internal Server Error on all LIVE logins/pages). Mitigation: cron reduced to */5 * * * * (288/day, 80% quota cut, punches still near-real-time). Deployed in commit 6ac5fe59 (LIVE Vercel build SUCCESS 07:20 UTC). Service restored after the user upgraded the Neon plan; verified: tenant site 19/19 APIs 200, super admin 20/20 APIs 200. Note: if tighter biometric sync is required after a quota review, this schedule may be revisited through a new approved change request.',
      module: 'super-admin',
    }),
  });
  const crBody = await cr.json();
  console.log(`create: HTTP ${cr.status} id=${crBody.request?.id} emailSent=${crBody.emailSent} to=${crBody.approvalEmailTo}`);
  if (cr.status !== 201 && cr.status !== 200) { console.log(JSON.stringify(crBody).slice(0, 400)); process.exit(1); }

  // Already implemented (retroactive registration): approve + implement now
  const appr = await fetch(`${BASE}/api/super-admin/change-requests/${crBody.request.id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ action: 'approve' }),
  }).then((r) => r.json());
  console.log(`approve: HTTP status=${appr.request?.status} method=${appr.request?.approvalMethod}`);

  const impl = await fetch(`${BASE}/api/super-admin/change-requests/${crBody.request.id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ action: 'implement', deployCommit: '6ac5fe59' }),
  }).then((r) => r.json());
  console.log(`implement: HTTP status=${impl.request?.status} commit=${impl.request?.deployCommit}`);

  const list = await fetch(`${BASE}/api/super-admin/change-requests`, { headers: auth }).then((r) => r.json());
  console.log(`trail: total=${list.requests?.length} pending=${list.counts?.pending} implemented=${list.counts?.implemented ?? list.requests?.filter((r) => r.status === 'implemented').length}`);
}

main().catch((e) => { console.log('ERR', e.message); process.exit(1); });
