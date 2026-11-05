// Task 110 — capture REAL payloads from LIVE tenant into Dart test fixtures.
import { writeFileSync, mkdirSync } from 'fs';
const LIVE = 'https://marqaitechgroup.3boxeshrms.com';
const OUT = '/home/z/my-project/hrms_app/test/fixtures';
mkdirSync(OUT, { recursive: true });

const login = await fetch(LIVE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }) });
const L = await login.json();
const tok = L.token;
console.log('login', login.status, L.user?.name);
const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

const targets = [
  ['login.json', '/api/auth/login', 'POST', { email: 'hr@gmail.com', password: 'MarqAI@2026' }],
  ['me.json', '/api/auth/me', 'GET', null],
  ['employees.json', '/api/employees?page=1&limit=20', 'GET', null],
  ['employee_detail.json', '/api/employees/cmtl5fbju000004juglc5grf9', 'GET', null],
  ['leaves.json', '/api/leaves?page=1', 'GET', null],
  ['attendance.json', '/api/attendance', 'GET', null],
  ['attendance_summary.json', '/api/attendance/my-summary', 'GET', null],
  ['payroll.json', '/api/payroll?page=1&limit=20', 'GET', null],
  ['notifications.json', '/api/notifications', 'GET', null],
  ['companies.json', '/api/companies', 'GET', null],
];

for (const [file, path, method, body] of targets) {
  const opt = { headers: H, method };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch(LIVE + path, opt);
  const t = await r.text();
  writeFileSync(`${OUT}/${file}`, t);
  console.log(String(r.status).padStart(3), file.padEnd(26), (t.length / 1024).toFixed(1) + 'KB');
}
console.log('DONE');
