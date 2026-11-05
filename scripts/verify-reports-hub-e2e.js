/* E2E test for register reports + branded exports (demo tenant, read-only) */
const BASE = process.argv[2] || 'https://nexus-hrms-mu.vercel.app';
const TENANT = '3boxes-hrms-demo';
console.log(`Target: ${BASE}`);

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-slug': TENANT },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.token || data.accessToken || data?.data?.token;
}

async function getReport(token, type, extra = '') {
  const res = await fetch(`${BASE}/api/reports?type=${type}${extra}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function exportTest(token, payload) {
  const res = await fetch(`${BASE}/api/reports/export`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const buf = await res.arrayBuffer();
  return { status: res.status, size: buf.byteLength, contentType: res.headers.get('content-type'), disposition: res.headers.get('content-disposition') };
}

(async () => {
  const token = await login('admin@3boxeshrms.com', 'MarqAI@2026');
  console.log('login OK');

  const types = [
    ['muster_roll', '&month=9&year=2026'],
    ['attendance_report', '&month=9&year=2026'],
    ['wfh_report', '&month=9&year=2026'],
    ['gatepass_report', '&month=9&year=2026'],
    ['regularization_report', '&month=9&year=2026'],
    ['permission_report', '&month=9&year=2026'],
    ['compoff_report', '&month=9&year=2026'],
    ['overtime_request_report', '&month=9&year=2026'],
    ['shift_report', ''],
    ['holiday_report', '&year=2026'],
    ['attendance_dept_wise', '&month=9&year=2026'],
    ['attendance_designation_wise', '&month=9&year=2026'],
  ];

  let sampleRows = null;
  for (const [type, extra] of types) {
    const { status, body } = await getReport(token, type, extra);
    const recs = Array.isArray(body.records) ? body.records.length : 0;
    const rows = Array.isArray(body.rows) ? body.rows.length : recs;
    console.log(`${status === 200 ? 'PASS' : 'FAIL'} ${type}: status=${status} records=${rows}`);
    if (status !== 200) console.log('  body:', JSON.stringify(body).slice(0, 200));
    if (type === 'attendance_report' && Array.isArray(body.records) && body.records.length > 0) sampleRows = body.records.slice(0, 5);
  }

  if (!sampleRows) sampleRows = [{ Employee: 'Test User', Department: 'QA', Status: 'present' }];
  const summary = { Month: '9/2026', Records: sampleRows.length };
  const sample = sampleRows.map(r => ({ EmployeeID: r.employeeCode, Name: r.name, Department: r.department, Date: r.date, Status: r.status }));

  const pdf = await exportTest(token, { reportType: 'custom', format: 'pdf', title: 'Muster Roll — September 2026', summary, filename: 'muster_roll_2026_9', data: sample });
  console.log(`PDF export: status=${pdf.status} size=${pdf.size} type=${pdf.contentType} file=${pdf.disposition}`);

  const xls = await exportTest(token, { reportType: 'custom', format: 'excel', title: 'Muster Roll — September 2026', summary, filename: 'muster_roll_2026_9', data: sample });
  console.log(`Excel export: status=${xls.status} size=${xls.size} type=${xls.contentType} file=${xls.disposition}`);

  const csv = await exportTest(token, { reportType: 'custom', format: 'csv', title: 'Muster Roll — September 2026', summary, filename: 'muster_roll_2026_9', data: sample });
  console.log(`CSV export: status=${csv.status} size=${csv.size} type=${csv.contentType} file=${csv.disposition}`);

  const namedOK = [pdf, xls, csv].every(x => x.disposition && x.disposition.includes('muster_roll_2026_9'));
  if (pdf.status !== 200 || xls.status !== 200 || csv.status !== 200) {
    console.log('EXPORT FAILURE DETECTED');
    process.exit(1);
  }
  console.log(namedOK ? 'FILENAME PASSTHROUGH OK (new backend deployed)' : 'filename passthrough NOT live yet');
  console.log('ALL DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
