// Task 98: validate Vercel token, identify account/teams/projects + git links
// Usage: VERCEL_TOKEN=xxx node scripts/task98-vercel-inspect.mjs
const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) { console.error('MISSING VERCEL_TOKEN env'); process.exit(1); }
const H = { Authorization: `Bearer ${TOKEN}` };
const j = async (u) => {
  const r = await fetch(u, { headers: H });
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};

const user = await j('https://api.vercel.com/v2/user');
const u = user.body?.user ?? user.body;
console.log('== USER ==', user.status);
if (u && typeof u === 'object') {
  console.log(`username=${u.username} uid=${u.uid} email=${u.email} name=${u.name}`);
} else {
  console.log(JSON.stringify(user.body).slice(0, 500));
}

const teams = await j('https://api.vercel.com/v2/teams');
const teamList = teams.body?.teams ?? [];
console.log('== TEAMS ==', teams.status, teamList.map(t => `${t.id} (${t.slug}) ${t.name}`).join(' | ') || '(none)');

const scopes = [{ id: '', label: 'personal' }, ...teamList.map(t => ({ id: t.id, label: t.slug }))];
for (const s of scopes) {
  const q = s.id ? `?limit=100&teamId=${s.id}` : '?limit=100';
  const pr = await j('https://api.vercel.com/v9/projects' + q);
  const list = pr.body?.projects ?? [];
  console.log(`== PROJECTS[${s.label}] ==`, pr.status, list.map(p => p.name).join(', ') || '(none)');
  for (const p of list) {
    if (/nexus|3-?boxes|hrms/i.test(p.name)) {
      const d = await j(`https://api.vercel.com/v9/projects/${p.id}${s.id ? `?teamId=${s.id}` : ''}`);
      const link = d.body?.link || {};
      console.log(`  DETAIL ${p.name}: id=${p.id} linkType=${link.type || 'none'} gitOrg=${link.org || '-'} gitRepo=${link.repo || '-'} latest=${(p.latestDeployments?.[0]?.url) || '-'}`);
    }
  }
}
console.log('DONE');
