import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { downloadLatestPunches, hrmsEmployeeCode } from '../src/lib/etimeoffice-client.ts';

const require = createRequire(import.meta.url);

test('Next.js preserves the full cursor in the documented env example', () => {
  const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const line = example.split(/\r?\n/).find((entry) => entry.startsWith('ETIMEOFFICE_LAST_RECORD='));
  assert.ok(line);
  const dir = mkdtempSync(join(tmpdir(), 'etimeoffice-env-'));
  const file = join(dir, '.env.local');
  try {
    writeFileSync(file, `${line}\n`);
    const env = { ...process.env };
    delete env.ETIMEOFFICE_LAST_RECORD;
    delete env.__NEXT_PROCESSED_ENV;
    const result = spawnSync(process.execPath, ['-e',
      `require(${JSON.stringify(require.resolve('@next/env'))}).loadEnvConfig(process.argv[1], true); process.stdout.write(process.env.ETIMEOFFICE_LAST_RECORD || '');`,
      dir,
    ], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '102026$383');
  } finally {
    unlinkSync(file);
    rmdirSync(dir);
  }
});

test('mapping preserves device codes and maps 010 to MARQ010', () => {
  assert.equal(hrmsEmployeeCode('010'), 'MARQ010');
  assert.equal(hrmsEmployeeCode('10'), 'MARQ010');
  assert.equal(hrmsEmployeeCode('004'), 'MARQ004');
});

test('mapping supports MarqAI employee-code overrides', () => {
  const previous = process.env.ETIMEOFFICE_EMPLOYEE_MAP;
  process.env.ETIMEOFFICE_EMPLOYEE_MAP = '007:MARQ008,015:MARQ015';
  try {
    assert.equal(hrmsEmployeeCode('007'), 'MARQ008');
    assert.equal(hrmsEmployeeCode('015'), 'MARQ015');
  } finally {
    if (previous === undefined) delete process.env.ETIMEOFFICE_EMPLOYEE_MAP;
    else process.env.ETIMEOFFICE_EMPLOYEE_MAP = previous;
  }
});

test('a cursor truncated by env expansion fails before contacting the vendor', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('must not call fetch'); });
  await assert.rejects(downloadLatestPunches('102026'), /Escape the dollar sign/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('the request sends the exact cursor and employee filter; vendor errors propagate', async (t) => {
  const values = {
    ETIMEOFFICE_BASE_URL: 'https://api.etimeoffice.com/api',
    ETIMEOFFICE_CORPORATE_ID: 'test-corp',
    ETIMEOFFICE_USERNAME: 'test-user',
    ETIMEOFFICE_PASSWORD: 'test-password',
    ETIMEOFFICE_EMP_CODE: '010',
  };
  const old = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let fail = false;
  let responseCursor = '102026$405';
  let punches = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.searchParams.get('LastRecord'), '102026$383');
    assert.equal(url.searchParams.get('Empcode'), '010');
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('test-corp:test-user:test-password:true').toString('base64')}`);
    return Response.json(fail
      ? { Error: true, Msg: 'Please Check LastRecord Value' }
      : { Error: false, Msg: 'Success', PunchData: punches, MaxRecord: responseCursor });
  });
  assert.equal((await downloadLatestPunches('102026$383')).MaxRecord, '102026$405');
  responseCursor = '0';
  assert.equal((await downloadLatestPunches('102026$383')).MaxRecord, '102026$383');
  responseCursor = '';
  assert.equal((await downloadLatestPunches('102026$383')).MaxRecord, '102026$383');
  punches = [{ Empcode: '010', ID: 389, PunchDate: '08/10/2026 11:57:00' }];
  await assert.rejects(downloadLatestPunches('102026$383'), /invalid MaxRecord/);
  fail = true;
  await assert.rejects(downloadLatestPunches('102026$383'), /Please Check LastRecord Value/);
});
