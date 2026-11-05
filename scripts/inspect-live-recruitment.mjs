// READ-ONLY inspection of tenant_marqaitechgroup (LIVE) recruitment tables
// NEVER writes. Reports what dummy data exists so we can plan surgical deletion.
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  database: 'tenant_marqaitechgroup',
  ssl: { rejectUnauthorized: false },
});

const q = async (sql, label) => {
  try {
    const r = await pool.query(sql);
    console.log(`\n=== ${label} (${r.rowCount} rows) ===`);
    console.log(JSON.stringify(r.rows, null, 1).slice(0, 4000));
    return r.rows;
  } catch (e) {
    console.log(`\n=== ${label} ERROR: ${e.message} ===`);
    return [];
  }
};

await q(`SELECT id, title, position, status, "postedDate", "createdAt" FROM "JobPosting" ORDER BY "createdAt"`, 'JobPosting');
await q(`SELECT id, "jobPostingId", "candidateName", "candidateEmail", status, "appliedDate", "createdAt" FROM "JobApplication" ORDER BY "createdAt" LIMIT 60`, 'JobApplication');
await q(`SELECT id, "candidateName", "candidateEmail", position, status, "createdAt" FROM "Offer" ORDER BY "createdAt"`, 'Offer');
await q(`SELECT id, name FROM "OfferTemplate"`, 'OfferTemplate');
await q(`SELECT COUNT(*)::int AS n FROM "Interview"`, 'Interview count');
await q(`SELECT COUNT(*)::int AS n FROM "Candidate"`, 'Candidate count');
await q(`SELECT id, "firstName", "lastName", email, status FROM "Candidate" LIMIT 40`, 'Candidate rows');
await q(`SELECT COUNT(*)::int AS n FROM "PreboardingCandidate"`, 'PreboardingCandidate count');

await pool.end();
