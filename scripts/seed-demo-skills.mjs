/**
 * Seed EmployeeSkill inventory + timezone/weekly-hours into the DEMO tenant DB
 * (tenant_3boxes-hrms-demo) so the skill inventory, matchmaking and capacity
 * planner have realistic live profile data. Idempotent. DEMO ONLY.
 */
import pg from 'pg';

const conn = new pg.Client({
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  user: 'neondb_owner', password: 'npg_pxZd8woKe4WB',
  database: 'tenant_3boxes-hrms-demo', ssl: { rejectUnauthorized: false },
});
await conn.connect();

const SKILLS = [
  { skill: 'React', level: 'expert', years: 5 }, { skill: 'TypeScript', level: 'advanced', years: 4 },
  { skill: 'Node.js', level: 'advanced', years: 4 }, { skill: 'PostgreSQL', level: 'advanced', years: 5 },
  { skill: 'React Native', level: 'intermediate', years: 2 }, { skill: 'Java', level: 'advanced', years: 6 },
  { skill: 'Spring Boot', level: 'intermediate', years: 3 }, { skill: 'Python', level: 'expert', years: 6 },
  { skill: 'Django', level: 'intermediate', years: 2 }, { skill: 'AWS', level: 'advanced', years: 4 },
  { skill: 'Docker', level: 'advanced', years: 3 }, { skill: 'Kubernetes', level: 'intermediate', years: 2 },
  { skill: 'Figma', level: 'advanced', years: 3 }, { skill: 'UI/UX Design', level: 'advanced', years: 4 },
  { skill: 'Manual Testing', level: 'advanced', years: 3 }, { skill: 'Selenium', level: 'intermediate', years: 2 },
  { skill: 'Project Management', level: 'expert', years: 7 }, { skill: 'Agile/Scrum', level: 'expert', years: 6 },
  { skill: 'SQL', level: 'advanced', years: 5 }, { skill: 'Data Analysis', level: 'intermediate', years: 3 },
];
const TZ = ['Asia/Kolkata', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Kolkata'];

const employees = (await conn.query(
  `SELECT id, "firstName" FROM "Employee" WHERE status = 'active' ORDER BY "createdAt" LIMIT 20`
)).rows;

let inserted = 0;
for (const [i, e] of employees.entries()) {
  // 3-5 skills per employee, deterministic-ish spread
  const count = 3 + (i % 3);
  for (let k = 0; k < count; k++) {
    const s = SKILLS[(i * 3 + k) % SKILLS.length];
    const dup = await conn.query(
      `SELECT 1 FROM "EmployeeSkill" WHERE "employeeId" = $1 AND LOWER(skill) = LOWER($2) LIMIT 1`,
      [e.id, s.skill]
    );
    if (dup.rowCount === 0) {
      await conn.query(
        `INSERT INTO "EmployeeSkill" (id, "employeeId", skill, level, "yearsOfExp", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now(), now())`,
        [e.id, s.skill, s.level, s.years - (k % 2)]
      );
      inserted++;
    }
  }
  // timezone + weekly hours (only set when null — additive profile alignment)
  await conn.query(
    `UPDATE "Employee" SET timezone = COALESCE(timezone, $2), "defaultWeeklyHours" = COALESCE("defaultWeeklyHours", 40) WHERE id = $1`,
    [e.id, TZ[i % TZ.length]]
  );
}
console.log(`[seed-skills] inserted ${inserted} skill rows across ${employees.length} employees`);
const total = await conn.query(`SELECT COUNT(*)::int AS c FROM "EmployeeSkill"`);
console.log(`[seed-skills] total skill rows now: ${total.rows[0].c}`);
await conn.end();
