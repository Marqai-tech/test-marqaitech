// Task 110 — close the duplicate CRs created by the stale script runs and
// implement the real Task 110 CR after deploy.
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const CR_IDS = process.argv[2] ? [process.argv[2]] : ['cmvevilg9000008kweiu9y9y2', 'cmvevj9l4000208jvsfh8wsr4'];
const NOTES = process.argv[3] || 'Closed as duplicate — created in error by the stale Task 109 governance script during the Task 110 session-recovery (environment rollback). The real Task 110 change request is cmvevk4gh000508jvc4wo5gu0.';

async function main() {
  const login = await fetch(DEMO + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
  });
  const L = await login.json();
  if (!L.token) throw new Error('super-admin login failed');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${L.token}` };

  for (const id of CR_IDS) {
    const r = await fetch(`${DEMO}/api/super-admin/change-requests/${id}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ action: 'implement', implementationNotes: NOTES }),
    });
    const body = await r.json().catch(() => ({}));
    console.log('CLOSE', id, r.status, JSON.stringify(body).slice(0, 120));
  }
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
