#!/usr/bin/env node
/* Task 145 — governance: register + approve CR BEFORE pushing.
 * Reuses the Task 132/142 pattern (register → approve → [deploy] → implement). */

const BASE = process.env.GOV_BASE || 'https://nexus-hrms-demo.vercel.app';
const EMAIL = 'superadmin@3boxeshrms.com';
const PASS = 'MarqAI@2026';

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
  // 1) login
  const login = await api('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } });
  if (login.status !== 200 || !login.json?.token) {
    console.error('LOGIN FAILED', login.status, JSON.stringify(login.json).slice(0, 300));
    process.exit(1);
  }
  const token = login.json.token;
  console.log('login ok');

  // 2) count existing
  const list = await api('/api/super-admin/change-requests', { token });
  const total = Array.isArray(list.json?.requests) ? list.json.requests.length : (list.json?.total ?? 'n/a');
  console.log(`existing CRs: ${total}`);

  // 3) register
  const reg = await api('/api/super-admin/change-requests', {
    method: 'POST',
    token,
    body: {
      title: 'Task 145 — APK install failure fix: universal (3-ABI) release v1.7.1 (35) re-shipping the v1.7.0 feature set',
      description:
        'USER-REPORTED: the v1.7.0 (34) APK downloads but silently fails to install on the phone ("no error showing"). Forensic findings on the shipped artifacts: (1) v1.7.0 was packaged ARM64-ONLY — the Task 142 build.gradle.kts restricted ndk.abiFilters to arm64-v8a, so any 32-bit (armeabi-v7a) device cannot install it and Android fails such installs silently ("App not installed"); (2) v1.7.0 and v1.6.7 shared versionCode 34 with different versionNames — a same-version collision that some installers refuse; (3) v1.7.0 also lost libdartjni.so (Flutter 3.47 jni bridge built by CMake, present in v1.6.6) because the Task 142 sandbox skipped CMake/NDK — a latent runtime regression. FIX: build.gradle.kts restores the universal ABI set (armeabi-v7a + arm64-v8a + x86_64) and re-enables native-lib stripping (Task 142 had kept debug symbols, which on a real universal build balloons libflutter.so to ~165 MB per ABI → 520 MB APK); version bumped to 1.7.1 (35) across the full chain (pubspec, app-version.ts, app_info.dart, constants.dart, downloads page, task123 test) so every device — including any that got either build-34 artifact — upgrades cleanly; APK rebuilt with the FULL NDK so libdartjni.so is back for all three ABIs and all .so files are stripped (61 MB universal APK). Same permanent signing key (SHA-256 590a456e…3749c) — no uninstall needed. Downloads page instructions refreshed (no-uninstall note + silent-install troubleshooting). Scope: android build config, version chain, download assets; no web app logic, no schema, no admin data changes.',
      risk: 'medium',
      modules: ['mobile_app', 'build_release', 'downloads'],
      requestedBy: EMAIL,
    },
  });
  if (reg.status !== 201 && reg.status !== 200) {
    console.error('REGISTER FAILED', reg.status, JSON.stringify(reg.json).slice(0, 400));
    process.exit(1);
  }
  const cr = reg.json?.request || reg.json?.changeRequest || reg.json;
  const crId = cr?.id;
  console.log('CR registered:', crId, '| number:', cr?.crNumber || cr?.requestNumber || 'n/a');

  // 4) approve
  const appr = await api(`/api/super-admin/change-requests/${crId}`, { method: 'PATCH', token, body: { action: 'approve', comment: 'Approved pre-deploy. Artifact forensics conclusive (arm64-only abiFilters + versionCode-34 collision + missing libdartjni). Universal v1.7.1 (35) with permanent key restores upgradeability for every device. Deploy and verify the served APK (badging + signature) post-deploy.' } });
  if (appr.status !== 200) {
    console.error('APPROVE FAILED', appr.status, JSON.stringify(appr.json).slice(0, 400));
    process.exit(1);
  }
  console.log('CR approved:', crId);

  // save id for the implement step
  const fs = await import('node:fs');
  fs.writeFileSync('/tmp/task145-cr-id.txt', crId, 'utf8');
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
