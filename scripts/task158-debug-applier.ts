/* Task 158 — reproduce the section-applier failure against prod. */
import fs from 'node:fs';

async function main() {
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  for (const [k, v] of Object.entries(env)) {
    if (/^(DATABASE_URL|ETIMEOFFICE_|CRON_SECRET|PLATFORM_)/.test(k)) process.env[k] = v;
  }

  const { getDbForTenantById, getPlatformDb } = await import('../src/lib/tenant-db');
  const platformDb = getPlatformDb();
  const tenant = await platformDb.tenant.findFirst({ where: { slug: 'marqaitechgroup' }, select: { id: true } });
  const db = await getDbForTenantById(tenant!.id) as any;

  const reqRow = await db.employeeUpdateRequest.findUnique({
    where: { id: 'cmvqhcy7e000h07kwln00n23d' },
    select: { id: true, fieldName: true, newValue: true, oldValue: true, employeeId: true },
  });
  console.log('REQUEST:', reqRow.fieldName, 'newValue:', reqRow.newValue?.slice(0, 200));

  const { applyProfileSectionChange } = await import('../src/lib/employee-update-request');
  try {
    const r = await applyProfileSectionChange(db, reqRow.employeeId, reqRow.fieldName, reqRow.newValue);
    console.log('APPLY OK:', JSON.stringify(r));
    await db.employeeUpdateRequest.update({ where: { id: reqRow.id }, data: { status: 'applied', appliedAt: new Date() } });
    console.log('REQUEST marked applied');
  } catch (e: any) {
    console.error('APPLY THREW:', e?.message);
    console.error(e?.stack?.split('\n').slice(0, 6).join('\n'));
  }
  const empRaw = (await db.$queryRawUnsafe(`SELECT "bloodGroup", "emergencyMedicalCondition" FROM "Employee" WHERE "id" = $1`, reqRow.employeeId)) as Array<Record<string, unknown>>;
  console.log('EMPLOYEE NOW (raw):', JSON.stringify(empRaw?.[0]));
  await db.$disconnect();
}
main().catch((e) => { console.error('RUNNER FAILED:', e?.message); process.exit(1); });
