const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require');
(async () => {
  const pre = {
    certs: (await sql.query(`SELECT count(*)::int AS n FROM "Certificate" WHERE "title" LIKE 'E2E Course%'`))[0].n,
    signoffs: (await sql.query(`SELECT count(*)::int AS n FROM "PolicySignOff" WHERE "title" LIKE 'E2E Policy%'`))[0].n,
    requests: (await sql.query(`SELECT count(*)::int AS n FROM "TrainingRequest" WHERE "reason" = 'E2E test'`))[0].n,
    gaps: (await sql.query(`SELECT count(*)::int AS n FROM "SkillGap" WHERE "skill" = 'E2E Skill'`))[0].n,
    notifications: (await sql.query(`SELECT count(*)::int AS n FROM "Notification" WHERE "message" LIKE '%E2E%'`))[0].n,
  };
  console.log('pre-cleanup:', JSON.stringify(pre));
  await sql.query(`DELETE FROM "Notification" WHERE "message" LIKE '%E2E%' OR "message" LIKE '%E2E Course%'`);
  await sql.query(`DELETE FROM "NotificationDelivery" WHERE "eventKey" LIKE 'learning.%' AND "createdAt" > NOW() - INTERVAL '1 hour'`);
  await sql.query(`DELETE FROM "Certificate" WHERE "title" LIKE 'E2E Course%'`);
  await sql.query(`DELETE FROM "PolicySignOffAck" WHERE "signOffId" IN (SELECT "id" FROM "PolicySignOff" WHERE "title" LIKE 'E2E Policy%')`);
  await sql.query(`DELETE FROM "PolicySignOff" WHERE "title" LIKE 'E2E Policy%'`);
  await sql.query(`DELETE FROM "TrainingRequest" WHERE "reason" = 'E2E test'`);
  await sql.query(`DELETE FROM "SkillGap" WHERE "skill" = 'E2E Skill'`);
  await sql.query(`DELETE FROM "CourseEnrollment" WHERE "courseId" NOT IN (SELECT "id" FROM "Course")`);
  await sql.query(`DELETE FROM "CourseAssignment" WHERE "courseId" IS NULL AND "pathId" IS NULL`);
  const post = {
    certs: (await sql.query(`SELECT count(*)::int AS n FROM "Certificate" WHERE "title" LIKE 'E2E Course%'`))[0].n,
    signoffs: (await sql.query(`SELECT count(*)::int AS n FROM "PolicySignOff" WHERE "title" LIKE 'E2E Policy%'`))[0].n,
  };
  console.log('post-cleanup:', JSON.stringify(post));
  console.log('E2E artifacts removed (demo DB only)');
})();
