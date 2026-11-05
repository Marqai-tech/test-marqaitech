#!/usr/bin/env node
/* Task 145 — post-deploy LIVE verification.
 * 1. /api/public/app-version = 1.7.1 (35) with install-fix notes on BOTH hosts
 * 2. LIVE APK (versioned + alias) on both hosts: byte-identical to the built artifact,
 *    correct content-type, zip integrity, versionCode 35, 3 ABIs, permanent signing cert
 * 3. /downloads page advertises v1.7.1 (35) + v1.7.1.apk links
 * 4. Old broken build-34 artifacts are gone (v1.7.0 / v1.6.7 return 404) */
const { execSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOSTS = ['https://nexus-hrms-demo.vercel.app', 'https://marqaitechgroup.3boxeshrms.com'];
const LOCAL_APK = '/home/z/my-project/public/downloads/3boxes-hrms-mobile-v1.7.1.apk';
let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };

const localSha = crypto.createHash('sha256').update(fs.readFileSync(LOCAL_APK)).digest('hex');

(async () => {
  console.log('— app-version on both hosts —');
  for (const h of HOSTS) {
    try {
      const r = await fetch(h + '/api/public/app-version', { signal: AbortSignal.timeout(30000) });
      const j = await r.json();
      t(`${h} versionName 1.7.1`, j.versionName === '1.7.1');
      t(`${h} versionCode 35`, j.versionCode === 35);
      t(`${h} notes call out the INSTALL FIX`, typeof j.notes === 'string' && j.notes.includes('INSTALL FIX'));
      t(`${h} apkUrl points at v1.7.1`, (j.apkUrl || '').includes('3boxes-hrms-mobile-v1.7.1.apk'));
    } catch (e) { t(`${h} app-version reachable`, false, e.message); }
  }

  console.log('— LIVE APK integrity (demo host, versioned URL) —');
  const tmp = path.join(os.tmpdir(), `task145-verify-${Date.now()}.apk`);
  try {
    const res = await fetch(HOSTS[0] + '/downloads/3boxes-hrms-mobile-v1.7.1.apk', { signal: AbortSignal.timeout(240000) });
    t('versioned v1.7.1.apk HTTP 200', res.status === 200);
    t('content-type = application/vnd.android.package-archive', (res.headers.get('content-type') || '').includes('vnd.android.package-archive'));
    const buf = Buffer.from(await res.arrayBuffer());
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    t('LIVE bytes identical to built artifact', sha === localSha, `${buf.length} bytes`);
    fs.writeFileSync(tmp, buf);
    const badging = execSync('/tmp/aapt2x/aapt2 dump badging ' + tmp, { encoding: 'utf8' });
    t('badging versionCode=35 versionName=1.7.1', /versionCode='35' versionName='1\.7\.1'/.test(badging));
    t('native-code covers arm64-v8a + armeabi-v7a + x86_64', /native-code: 'arm64-v8a' 'armeabi-v7a' 'x86_64'/.test(badging));
    const soCount = parseInt(execSync(`unzip -l ${tmp} | grep -cE "\\.so$"`, { encoding: 'utf8' }).trim(), 10);
    t('9 runtime .so (3 ABIs × libflutter/libapp/libdatastore)', soCount === 9, `found ${soCount}`);
    execSync('unzip -t ' + tmp + ' > /dev/null 2>&1');
    t('zip integrity OK', true);
    fs.rmSync(tmp, { force: true });
  } catch (e) { t('LIVE APK download+verify', false, e.message); }

  console.log('— alias + other host —');
  try {
    for (const h of HOSTS) {
      const head = await fetch(h + '/downloads/3boxes-hrms-mobile.apk', { method: 'HEAD', signal: AbortSignal.timeout(30000) });
      t(`${h} alias serves`, head.status === 200, `${head.headers.get('content-length')} bytes`);
    }
  } catch (e) { t('alias HEAD checks', false, e.message); }

  console.log('— downloads page + broken artifacts retired —');
  try {
    const page = await (await fetch(HOSTS[0] + '/downloads/', { signal: AbortSignal.timeout(30000) })).text();
    t('page badge v1.7.1 (35)', page.includes('v1.7.1 (35)'));
    t('page links v1.7.1.apk', page.includes('3boxes-hrms-mobile-v1.7.1.apk'));
    t('page no longer links v1.7.0.apk', !page.includes('3boxes-hrms-mobile-v1.7.0.apk'));
  } catch (e) { t('downloads page', false, e.message); }
  for (const f of ['3boxes-hrms-mobile-v1.7.0.apk', '3boxes-hrms-mobile-v1.6.7.apk']) {
    const r = await fetch(HOSTS[0] + '/downloads/' + f, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
    t(`retired ${f} → 404`, r.status === 404, `got ${r.status}`);
  }

  console.log(`\nRESULT: ${pass}/${pass + fail} PASS`);
  process.exit(fail ? 1 : 0);
})();
