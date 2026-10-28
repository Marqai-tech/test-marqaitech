// Final live-state verification (READ-ONLY)
import { Pool } from '@neondatabase/serverless';
const pool = new Pool({
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  user: 'neondb_owner', password: 'npg_pxZd8woKe4WB',
  database: 'tenant_marqaitechgroup', ssl: { rejectUnauthorized: false },
});
const q = async (sql, label) => {
  const r = await pool.query(sql);
  console.log(`${label}: ${JSON.stringify(r.rows[0] || {})}`);
};
await q(`SELECT COUNT(*)::int AS offers FROM "Offer"`, 'LIVE Offer rows (expect 0)');
await q(`SELECT COUNT(*)::int AS templates FROM "OfferTemplate"`, 'LIVE OfferTemplate rows (expect 0)');
await q(`SELECT COUNT(*)::int AS postings, COUNT(*) FILTER (WHERE status='open')::int AS open FROM "JobPosting"`, 'LIVE JobPosting (expect 0 open)');
await q(`SELECT COUNT(*)::int AS n FROM "RecruitmentWorkflowConfig"`, 'LIVE RecruitmentWorkflowConfig table (expect 0 rows, table exists)');
await q(`SELECT COUNT(*)::int AS with_tiers FROM "Offer" WHERE "approvalTiers" IS NOT NULL`, 'LIVE Offer.approvalTiers column OK');
await pool.end();
// Live site health
for (const url of ['https://marqaitechgroup.3boxeshrms.com/api/auth/me', 'https://marqaitechgroup.3boxeshrms.com/offers']) {
  const res = await fetch(url, { redirect: 'manual' });
  console.log(`LIVE ${url} -> ${res.status}`);
}
