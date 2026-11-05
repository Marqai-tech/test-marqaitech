#!/usr/bin/env node
/* Task 145 contract check — universal APK re-release (v1.7.1 build 35).
 * Verifies: version chain sync across all 6 files, universal ABI coverage
 * restored in build.gradle.kts (no arm64-only filter), downloads page points
 * at v1.7.1, release notes call out the install fix. */
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join('/home/z/my-project', p), 'utf8');
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('— version chain —');
const pubspec = R('hrms_app/pubspec.yaml');
t('pubspec version: 1.7.1+35', /version:\s*1\.7\.1\+35/.test(pubspec));
const avt = R('src/lib/app-version.ts');
t('app-version.ts versionName 1.7.1', avt.includes("versionName: '1.7.1'"));
t('app-version.ts versionCode 35', avt.includes('versionCode: 35'));
t('app-version.ts apkUrl → v1.7.1.apk', avt.includes('/downloads/3boxes-hrms-mobile-v1.7.1.apk'));
t('app-version.ts notes mention INSTALL FIX', avt.includes('INSTALL FIX'));
t('app-version.ts notes mention OTP', avt.includes('OTP'));
const ai = R('hrms_app/lib/config/app_info.dart');
t('app_info.dart 1.7.1 / 35', ai.includes("versionName = '1.7.1'") && ai.includes('versionCode = 35'));
const consts = R('hrms_app/lib/config/constants.dart');
t('constants.dart appVersion 1.7.1', consts.includes("appVersion = '1.7.1'"));
const test123 = R('hrms_app/test/task123_payroll_integration_test.dart');
t('task123 test expects 1.7.1 (35)', test123.includes("'1.7.1'") && test123.includes('versionCode, 35'));
const idx = R('public/downloads/index.html');
t('downloads page badge v1.7.1 (35)', idx.includes('v1.7.1 (35)'));
t('downloads page links v1.7.1.apk', idx.includes('/downloads/3boxes-hrms-mobile-v1.7.1.apk') && !idx.includes('v1.7.0.apk'));

console.log('— universal ABI fix —');
const gradle = R('hrms_app/android/app/build.gradle.kts');
t('arm64-only abiFilters REMOVED', !gradle.includes('abiFilters += listOf("arm64-v8a")'));
t('ndk abi block gone (universal default)', !gradle.includes('abiFilters'));
t('signing config intact (release key)', gradle.includes('signingConfigs.getByName("release")'));

console.log('— release hygiene —');
t('no stale v1.7.0 apk filename in src', !R('src/lib/app-version.ts').includes('3boxes-hrms-mobile-v1.7.0.apk'));
t('worklog note prepared', fs.existsSync('/home/z/my-project/scripts/task145-build-apk.sh'));

console.log(`\nRESULT: ${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
