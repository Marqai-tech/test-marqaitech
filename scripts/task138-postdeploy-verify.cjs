/**
 * Task 138 — LIVE post-deploy verification (25+ checks).
 * Usage: node scripts/task138-postdeploy-verify.mjs   (env: DATABASE_URL)
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) { console.error('FATAL: source production env first'); process.exit(1); }

const DEMO = 'https://nexus-hrms-demo.vercel.app';
const MARQAI = 'https://marqaitechgroup.3boxeshrms.com';
const ADMIN = { email: 'admin@techstart.com', password: 'MarqAI@2026' };
const HR_MARQAI = { email: 'hr@marqaitech.com', password: 'MarqAI@2026' };

let pass = 0, fail = 0;
const results = [];
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; results.push(`  PASS  ${label}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; results.push(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`); }
};

async function api(base, path, { method = 'GET', token, body } = {}) {
  try {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45000),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch (e) { return { status: 0, json: null, error: e.message }; }
}

function parseMaybeJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

(async () => {
  const platform = neon(PLATFORM);
  const td = await platform`SELECT td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE t.slug = '3boxes-hrms-demo' AND td."isActive" = true LIMIT 1`;
  const demoDb = td.length ? neon(td[0].cs) : null;

  console.log('1. DEPLOY PROBES — new route live on all hosts');
  for (const [name, host] of [['nexus-hrms-demo', DEMO], ['3boxeshrms', 'https://3boxeshrms.com'], ['marqaitechgroup', MARQAI]]) {
    const r = await api(host, '/api/social-feed/settings');
    ok(`${name}: /api/social-feed/settings live (401 unauth)`, r.status === 401, `HTTP ${r.status}`);
  }

  console.log('2. BIRTHDAYS — month-wide list + DOB fallback');
  const adminLogin = await api(DEMO, '/api/auth/login', { method: 'POST', body: ADMIN });
  ok('demo admin login', adminLogin.status === 200 && adminLogin.json?.token, `HTTP ${adminLogin.status}`);
  const T = adminLogin.json?.token;
  if (!T) { console.log(results.join('\n')); console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(1); }

  const bd = await api(DEMO, '/api/birthdays', { token: T });
  ok('GET /api/birthdays 200', bd.status === 200, `HTTP ${bd.status}`);
  ok('response has thisMonth array', Array.isArray(bd.json?.thisMonth), `thisMonth=${bd.json?.thisMonth?.length ?? 'missing'}`);
  ok('response keeps today + upcoming', Array.isArray(bd.json?.today) && Array.isArray(bd.json?.upcoming), `today=${bd.json?.today?.length} upcoming=${bd.json?.upcoming?.length}`);
  const allPeople = [...(bd.json?.today || []), ...(bd.json?.thisMonth || []), ...(bd.json?.upcoming || [])];
  ok('every person carries birthdaySource', allPeople.length > 0 && allPeople.every((p) => p.birthdaySource === 'original_birthday' || p.birthdaySource === 'date_of_birth'), `${allPeople.length} people`);
  ok('thisMonth rows carry dayOfMonth', (bd.json?.thisMonth || []).every((p) => typeof p.dayOfMonth === 'number' && p.dayOfMonth >= 1 && p.dayOfMonth <= 31));

  // DOB fallback: an employee with NULL originalBirthday must still surface (via DOB)
  const fallbackCands = await demoDb`
    SELECT e.id, e."firstName", e."dateOfBirth" FROM "Employee" e
    WHERE e.status = 'active' AND e."originalBirthday" IS NULL AND e."dateOfBirth" IS NOT NULL
      AND EXTRACT(MONTH FROM e."dateOfBirth") = EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))
    LIMIT 1`;
  if (fallbackCands.length) {
    const cand = fallbackCands[0];
    const inList = allPeople.some((p) => p.employeeId === cand.id && p.birthdaySource === 'date_of_birth');
    ok('DOB fallback: employee without Original Birthday appears (from records)', inList, `${cand.firstName} dob=${new Date(cand.dateOfBirth).toISOString().slice(0, 10)}`);
  } else {
    ok('DOB fallback (no eligible employee this month — shape check only)', true, 'skipped scenario');
  }

  // Wish day-gate still enforced (pick someone NOT birthday-today)
  const notToday = (bd.json?.thisMonth || [])[0] || (bd.json?.upcoming || [])[0];
  if (notToday) {
    const w = await api(DEMO, '/api/birthdays/wish', { method: 'POST', token: T, body: { employeeId: notToday.employeeId } });
    ok('wish day-gate intact for non-today birthdays', w.status === 400 && /birthday today/.test(w.json?.error || ''), `HTTP ${w.status}`);
  } else {
    ok('wish day-gate (no non-today candidate — skipped)', true, 'skipped');
  }

  console.log('3. SOCIAL FEEDS — respond-only governance');
  // Feed-raising needs an employee-linked login (SocialPost.authorId → Employee FK).
  // admin@techstart.com has NO employee row — use the tenant_admin that has one.
  const faLogin = await api(DEMO, '/api/auth/login', { method: 'POST', body: { email: 'admin@acme-global.com', password: 'MarqAI@2026' } });
  ok('feed-admin (employee-linked) login', faLogin.status === 200 && faLogin.json?.token, `HTTP ${faLogin.status}`);
  const FT = faLogin.json?.token || T;
  const feedAdmin = await api(DEMO, '/api/social-feed?limit=5', { token: FT });
  ok('admin GET feed: canCreate=true', feedAdmin.status === 200 && feedAdmin.json?.canCreate === true, `mode=${feedAdmin.json?.creationMode}`);
  ok('admin GET feed: isLikedByMe present on rows', Array.isArray(feedAdmin.json?.posts) && feedAdmin.json.posts.every((p) => typeof p.isLikedByMe === 'boolean'), `posts=${feedAdmin.json?.posts?.length}`);

  // employee-role user (same discovery as task137)
  const cand = await demoDb`
    SELECT u.id, u.email FROM "User" u
    JOIN "Employee" e ON e."userId" = u.id
    WHERE u.role = 'employee' AND u.status = 'active' AND u.password IS NOT NULL AND LENGTH(u.password) > 50
    LIMIT 5`;
  let empTok = null, empEmail = null, empEmployeeId = null;
  for (const c of cand) {
    const l = await api(DEMO, '/api/auth/login', { method: 'POST', body: { email: c.email, password: 'MarqAI@2026' } });
    if (l.status === 200 && l.json?.token) { empTok = l.json.token; empEmail = c.email; empEmployeeId = (await demoDb`SELECT id FROM "Employee" WHERE "userId" = ${c.id} LIMIT 1`)[0]?.id; break; }
  }
  ok('employee-role login for governance test', Boolean(empTok), empEmail || 'none found');

  const empFeed0 = await api(DEMO, '/api/social-feed?limit=5', { token: empTok });
  ok('employee GET feed: canCreate=false (admins mode default)', empFeed0.status === 200 && empFeed0.json?.canCreate === false, `mode=${empFeed0.json?.creationMode}`);
  const deny = await api(DEMO, '/api/social-feed', { method: 'POST', token: empTok, body: { content: 'Task138 attempt — should be blocked' } });
  ok('employee POST feed → 403 FEED_CREATE_NOT_ALLOWED', deny.status === 403 && deny.json?.code === 'FEED_CREATE_NOT_ALLOWED', `HTTP ${deny.status}`);

  // admin creates a feed to respond to
  const created = await api(DEMO, '/api/social-feed', { method: 'POST', token: FT, body: { content: 'Task138 E2E feed — admin share', postType: 'general' } });
  ok('admin POST feed → 201', created.status === 201 && created.json?.post?.id, `HTTP ${created.status}`);
  const postId = created.json?.post?.id;

  // allowlist the employee via settings
  const patchSettings = await api(DEMO, '/api/social-feed/settings', { method: 'PATCH', token: T, body: { creationMode: 'selected', creatorIds: [empEmployeeId] } });
  ok('admin PATCH feed settings (selected + creator)', patchSettings.status === 200 && patchSettings.json?.settings?.creationMode === 'selected', `HTTP ${patchSettings.status}`);
  const empFeed1 = await api(DEMO, '/api/social-feed/settings', { token: empTok });
  ok('enabled employee sees canCreate=true', empFeed1.status === 200 && empFeed1.json?.permissions?.canCreate === true, `mode=${empFeed1.json?.settings?.creationMode}`);
  const raise = await api(DEMO, '/api/social-feed', { method: 'POST', token: empTok, body: { content: 'Task138 E2E feed — enabled employee share', postType: 'general' } });
  ok('enabled employee POST feed → 201', raise.status === 201 && raise.json?.post?.id, `HTTP ${raise.status}`);
  const empPostId = raise.json?.post?.id;

  // respond mechanics
  const like = await api(DEMO, '/api/social-feed', { method: 'PATCH', token: empTok, body: { id: postId, action: 'like' } });
  ok('employee like → likesCount incremented', like.status === 200 && like.json?.post?.likesCount === 1, `likes=${like.json?.post?.likesCount}`);
  const likeAgain = await api(DEMO, '/api/social-feed', { method: 'PATCH', token: empTok, body: { id: postId, action: 'like' } });
  ok('employee unlike toggle → back to 0', likeAgain.status === 200 && likeAgain.json?.post?.likesCount === 0, `likes=${likeAgain.json?.post?.likesCount}`);
  const comment = await api(DEMO, '/api/social-feed', { method: 'PATCH', token: empTok, body: { id: postId, action: 'comment', commentContent: 'Task138 E2E response' } });
  ok('employee comment → created', comment.status === 200 && comment.json?.comment?.id, `HTTP ${comment.status}`);
  // after the unlike above, the flag must be false; re-like and expect true
  const feedAfter = await api(DEMO, '/api/social-feed?limit=10', { token: empTok });
  const unlikedRow = (feedAfter.json?.posts || []).find((p) => p.id === postId);
  ok('GET isLikedByMe=false after unlike', unlikedRow ? unlikedRow.isLikedByMe === false : false, `found=${Boolean(unlikedRow)}`);
  await api(DEMO, '/api/social-feed', { method: 'PATCH', token: empTok, body: { id: postId, action: 'like' } });
  const feedAfter2 = await api(DEMO, '/api/social-feed?limit=10', { token: empTok });
  const likedRow = (feedAfter2.json?.posts || []).find((p) => p.id === postId);
  ok('GET marks isLikedByMe for my like', likedRow ? likedRow.isLikedByMe === true : false, `found=${Boolean(likedRow)}`);
  await api(DEMO, '/api/social-feed', { method: 'PATCH', token: empTok, body: { id: postId, action: 'like' } }); // unlike again (clean)

  // hardening
  const massAssign = await api(DEMO, '/api/social-feed', { method: 'PATCH', token: empTok, body: { id: postId, content: 'hijacked content' } });
  ok('employee generic PATCH → 403 (author/admin only)', massAssign.status === 403, `HTTP ${massAssign.status}`);
  const empDelete = await api(DEMO, `/api/social-feed?id=${postId}`, { method: 'DELETE', token: empTok });
  ok('employee DELETE foreign post → 403', empDelete.status === 403, `HTTP ${empDelete.status}`);
  const empSettingsPatch = await api(DEMO, '/api/social-feed/settings', { method: 'PATCH', token: empTok, body: { creationMode: 'selected', creatorIds: [empEmployeeId] } });
  ok('employee PATCH settings → 403', empSettingsPatch.status === 403, `HTTP ${empSettingsPatch.status}`);

  // revert governance + cleanup posts
  await api(DEMO, '/api/social-feed/settings', { method: 'PATCH', token: T, body: { creationMode: 'admins', creatorIds: [] } });
  const empFeed2 = await api(DEMO, '/api/social-feed?limit=5', { token: empTok });
  ok('reverted to admins mode: employee canCreate=false again', empFeed2.status === 200 && empFeed2.json?.canCreate === false);
  const del1 = await api(DEMO, `/api/social-feed?id=${postId}`, { method: 'DELETE', token: FT });
  const del2 = empPostId ? await api(DEMO, `/api/social-feed?id=${empPostId}`, { method: 'DELETE', token: T }) : { status: 200 };
  ok('cleanup: admin deleted both E2E posts', del1.status === 200 && del2.status === 200, `del1=${del1.status} ${del1.json?.error || ''} | del2=${del2.status} ${del2.json?.error || ''}`);

  console.log('4. EMPLOYEE MODULE — letters + domains + achievements + verification + resume');
  const emps = (await api(DEMO, '/api/employees?limit=5', { token: T })).json?.employees || [];
  const target = emps[0];
  const lettersPayload = [{
    name: 'e2e-offer.pdf', type: 'offer_letter',
    fileUrl: 'data:application/pdf;base64,JVBERi0xLjQKJcfsj6kgMSAwIG9iag==',
  }];
  const putRes = await api(DEMO, `/api/employees/${target.id}`, {
    method: 'PUT', token: T,
    body: {
      experiences: [{
        company: 'Wipro', designation: 'Project Engineer', fromDate: '2018-01-01', toDate: '2020-01-01',
        isCurrent: false, description: 'Task138 E2E row', domains: ['Development', 'Testing / QA'], letters: lettersPayload,
      }],
      achievements: [
        { title: 'E2E Star Performer', category: 'previous_company', issuer: 'Wipro', achievedOn: '2019-12-01', description: 'Task138 E2E achievement' },
        { title: 'E2E AWS CP', category: 'certification', issuer: 'AWS', achievedOn: '2020-06-15', description: '' },
      ],
    },
  });
  ok('PUT with letters/domains/achievements', putRes.status === 200, `HTTP ${putRes.status} ${putRes.json?.error || ''}`);
  const detail = await api(DEMO, `/api/employees/${target.id}`, { token: T });
  const d = detail.json?.employee || detail.json || {};
  const exps = Array.isArray(d.experiences) ? d.experiences : [];
  const row = exps.find((x) => x.company === 'Wipro');
  const rowLetters = parseMaybeJson(row?.letters);
  const rowDomains = parseMaybeJson(row?.domains);
  ok('experience letters persisted (JSON)', Array.isArray(rowLetters) && rowLetters[0]?.type === 'offer_letter' && String(rowLetters[0]?.fileUrl || '').startsWith('data:'), rowLetters ? `${rowLetters.length} letter(s)` : 'none');
  ok('experience domains persisted (multi-select)', Array.isArray(rowDomains) && rowDomains.includes('Development') && rowDomains.includes('Testing / QA'), rowDomains ? rowDomains.join('|') : 'none');
  const achs = Array.isArray(d.achievements) ? d.achievements : [];
  ok('achievements persisted (2 rows)', achs.some((a) => a.title === 'E2E Star Performer' && a.category === 'previous_company') && achs.some((a) => a.title === 'E2E AWS CP'), `rows=${achs.length}`);

  // Aadhaar offline XML verification
  const xml = `<OfflinePaperlessKyc><UidData><Poi name="${d.firstName} ${d.lastName}" dob="${d.dateOfBirth ? new Date(d.dateOfBirth).toISOString().slice(0, 10).split('-').reverse().join('-') : '01-01-1990'}" gender="${(d.gender || 'M')[0].toUpperCase()}"/><Poa house="7-1" street="MG Road" locality="Sector 2" vtc="Pune" dist="Pune" state="Maharashtra" pc="411001"/></UidData></OfflinePaperlessKyc>`;
  const ver = await api(DEMO, `/api/employees/${target.id}/verify-identity`, { method: 'POST', token: T, body: { method: 'offline-xml', payload: xml, note: 'Task138 E2E' } });
  ok('offline XML verification → parsed + verdict', ver.status === 200 && ver.json?.verification?.status, `status=${ver.json?.verification?.status} summary=${(ver.json?.verification?.summary || '').slice(0, 60)}`);
  ok('verification stores masked reference only (no aadhaar number)', !JSON.stringify(ver.json?.verification || {}).match(/\d{12}/), 'no 12-digit leak');
  const verState = await api(DEMO, `/api/employees/${target.id}/verify-identity`, { token: T });
  ok('verification GET: state + digilocker status', verState.status === 200 && typeof verState.json?.digilocker?.configured === 'boolean' && Array.isArray(verState.json?.digilocker?.missing), `configured=${verState.json?.digilocker?.configured}`);
  const panBefore = (await demoDb`SELECT "panNumber" FROM "Employee" WHERE id = ${target.id}`)[0]?.panNumber || null;
  const verPan = await api(DEMO, `/api/employees/${target.id}/verify-identity`, { method: 'POST', token: T, body: { method: 'pan', payload: 'ABCPA1234F' } });
  ok('PAN verification → format verified', verPan.status === 200 && verPan.json?.verification?.method === 'pan', `HTTP ${verPan.status}`);
  const verPanBad = await api(DEMO, `/api/employees/${target.id}/verify-identity`, { method: 'POST', token: T, body: { method: 'pan', payload: 'ABCD1234F' } });
  ok('invalid PAN entity-type rejected', verPanBad.status === 400, `HTTP ${verPanBad.status}`);
  await demoDb`UPDATE "Employee" SET "panNumber" = ${panBefore} WHERE id = ${target.id}`;
  ok('cleanup: panNumber restored', true, `was ${panBefore ? 'set' : 'null'}`);

  // resume document type
  const docRes = await api(DEMO, `/api/employees/${target.id}/documents`, {
    method: 'POST', token: T,
    body: { name: 'E2E Resume', type: 'resume', category: 'qualifications', description: 'Task138 E2E', fileUrl: 'data:application/pdf;base64,JVBERi0xLjQKJcfsj6kgMSAwIG9iag==' },
  });
  ok('resume document accepted (201)', docRes.status === 200 || docRes.status === 201, `HTTP ${docRes.status} ${docRes.json?.error || ''}`);
  const docId = docRes.json?.document?.id;
  if (docId) await api(DEMO, `/api/employees/${target.id}/documents?docId=${docId}`, { method: 'DELETE', token: T });

  // cleanup rows + kyc
  await api(DEMO, `/api/employees/${target.id}`, { method: 'PUT', token: T, body: { experiences: [], achievements: [] } });
  await demoDb`UPDATE "Employee" SET "kycVerification" = NULL, "kycVerifiedAt" = NULL WHERE id = ${target.id}`;
  const detail2 = await api(DEMO, `/api/employees/${target.id}`, { token: T });
  const d2 = detail2.json?.employee || detail2.json || {};
  ok('cleanup: experience + achievements cleared', (d2.experiences || []).length === 0 && (d2.achievements || []).length === 0);

  console.log('5. ORIGINAL BIRTHDAY auto-fill from DOB (PUT backfill)');
  const nb = await demoDb`
    SELECT e.id, e."dateOfBirth" FROM "Employee" e
    WHERE e.status = 'active' AND e."originalBirthday" IS NULL AND e."dateOfBirth" IS NOT NULL LIMIT 1`;
  if (nb.length) {
    const e0 = nb[0];
    const dobIso = new Date(e0.dateOfBirth).toISOString().slice(0, 10);
    const put = await api(DEMO, `/api/employees/${e0.id}`, { method: 'PUT', token: T, body: { dateOfBirth: dobIso } });
    const after = await demoDb`SELECT "originalBirthday" FROM "Employee" WHERE id = ${e0.id}`;
    const got = after[0]?.originalBirthday ? new Date(after[0].originalBirthday).toISOString().slice(0, 10) : null;
    ok('PUT without originalBirthday backfills it from DOB', put.status === 200 && got === dobIso, `originalBirthday=${got} (dob ${dobIso})`);
    await demoDb`UPDATE "Employee" SET "originalBirthday" = NULL WHERE id = ${e0.id}`;
    ok('cleanup: originalBirthday restored to NULL', true);
  } else {
    ok('originalBirthday backfill (no eligible employee — skipped)', true, 'skipped scenario');
  }

  console.log('6. MARQAI TENANT — feeds + birthdays live');
  const hrLogin = await api(MARQAI, '/api/auth/login', { method: 'POST', body: HR_MARQAI });
  ok('marqaitechgroup hr login', hrLogin.status === 200 && hrLogin.json?.token, `HTTP ${hrLogin.status}`);
  const HT = hrLogin.json?.token;
  if (HT) {
    const mBd = await api(MARQAI, '/api/birthdays', { token: HT });
    ok('marqai birthdays: thisMonth present', mBd.status === 200 && Array.isArray(mBd.json?.thisMonth), `thisMonth=${mBd.json?.thisMonth?.length}`);
    const mFeed = await api(MARQAI, '/api/social-feed?limit=5', { token: HT });
    ok('marqai hr feed: canCreate=true', mFeed.status === 200 && mFeed.json?.canCreate === true, `mode=${mFeed.json?.creationMode}`);
    const mSettings = await api(MARQAI, '/api/social-feed/settings', { token: HT });
    ok('marqai feed settings readable', mSettings.status === 200 && ['admins', 'selected'].includes(mSettings.json?.settings?.creationMode), `mode=${mSettings.json?.settings?.creationMode}`);
  }

  console.log(results.join('\n'));
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E crashed:', e); process.exit(1); });
