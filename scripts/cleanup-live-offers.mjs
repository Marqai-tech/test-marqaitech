// SURGICAL cleanup of dummy recruitment rows in tenant_marqaitechgroup (LIVE).
// User explicitly requested removal of dummy data from live /offers page.
// Deletes ONLY rows matching the known seed signature (scripts/seed-remaining-tables.py):
//   - Offer: candidateName 'Candidate N', email candidate_N@email.com (8 rows, created 2026-07-22T02:59:20.836Z)
//   - OfferTemplate: Standard/Senior/Intern/Contractor (4 seed rows)
// Guards: re-verify signature before delete; check no PreboardingCandidate references.
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  database: 'tenant_marqaitechgroup',
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  await client.query('BEGIN');

  // ── Verify dummy offers signature ──
  const offers = await client.query(`
    SELECT id, "candidateName", "candidateEmail" FROM "Offer"
    WHERE "candidateEmail" ~ '^candidate_[0-9]+@email\\.com$' AND "candidateName" ~ '^Candidate [0-9]+$'`);
  console.log(`Dummy offers matching signature: ${offers.rowCount}`);
  if (offers.rowCount === 0) { console.log('Nothing to delete.'); await client.query('ROLLBACK'); process.exit(0); }

  // ── Reference checks ──
  const ids = offers.rows.map(r => r.id);
  const preb = await client.query(`SELECT COUNT(*)::int AS n FROM "PreboardingCandidate" WHERE "offerId" = ANY($1)`, [ids]);
  console.log(`PreboardingCandidates referencing these offers: ${preb.rows[0].n} (expect 0)`);
  if (preb.rows[0].n > 0) { console.log('ABORT: references exist'); await client.query('ROLLBACK'); process.exit(1); }

  // ── Delete offers (exact rows) ──
  const delOffers = await client.query(`DELETE FROM "Offer" WHERE id = ANY($1)`, [ids]);
  console.log(`Deleted offers: ${delOffers.rowCount}`);

  // ── Delete the 4 seed offer templates (only if no remaining offers reference them) ──
  const tplNames = ['Standard Offer Letter', 'Senior Offer Letter', 'Intern Offer Letter', 'Contractor Offer'];
  const tpls = await client.query(`SELECT id, name FROM "OfferTemplate" WHERE name = ANY($1)`, [tplNames]);
  console.log(`Seed templates found: ${tpls.rowCount}`);
  const tplIds = tpls.rows.map(r => r.id);
  if (tplIds.length) {
    const refs = await client.query(`SELECT COUNT(*)::int AS n FROM "Offer" WHERE "templateId" = ANY($1)`, [tplIds]);
    console.log(`Remaining offers referencing seed templates: ${refs.rows[0].n}`);
    if (refs.rows[0].n === 0) {
      const delTpl = await client.query(`DELETE FROM "OfferTemplate" WHERE id = ANY($1)`, [tplIds]);
      console.log(`Deleted templates: ${delTpl.rowCount}`);
    }
  }

  await client.query('COMMIT');
  console.log('COMMITTED ✓');
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('FAILED, rolled back:', e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
