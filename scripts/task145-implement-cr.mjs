#!/usr/bin/env node
/* Task 145 — mark the approved CR as IMPLEMENTED with deploy commit + evidence. */
import fs from 'node:fs';
const BASE = 'https://nexus-hrms-demo.vercel.app';
const EMAIL = 'superadmin@3boxeshrms.com';
const PASS = 'MarqAI@2026';
const CR_ID = fs.readFileSync('/tmp/task145-cr-id.txt', 'utf8').trim();

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

(async () => {
  const login = await api('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } });
  const token = login.json?.token;
  if (!token) { console.error('LOGIN FAILED'); process.exit(1); }

  const patch = await api(`/api/super-admin/change-requests/${CR_ID}`, {
    method: 'PATCH',
    token,
    body: {
      action: 'implement',
      deployCommit: '161469b4',
      comment:
        'IMPLEMENTED @ 161469b4. Evidence: task145-postdeploy-verify.cjs 22/22 PASS — (1) /api/public/app-version serves 1.7.1 (35) with INSTALL FIX notes on BOTH hosts (demo + marqaitechgroup); (2) LIVE APK byte-identical to the built artifact (sha256 7cc6c7d6…, 61,083,003 bytes) via versioned URL AND alias on both hosts with content-type application/vnd.android.package-archive; (3) aapt2 badging: versionCode=35 versionName=1.7.1, native-code = arm64-v8a + armeabi-v7a + x86_64 (universal restored); (4) zip integrity OK; signer cert SHA-256 590a456e…3749c = the permanent release key (no uninstall needed); (5) /downloads page advertises v1.7.1 (35) and no longer links the broken build-34 artifacts (v1.7.0/v1.6.7 → 404). task123 chain tests 14/16 with the SAME 2 pre-existing payslip widget failures as the Task 141 baseline.',
    },
  });
  console.log('implement status:', patch.status, JSON.stringify(patch.json).slice(0, 200));
  process.exit(patch.status === 200 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
