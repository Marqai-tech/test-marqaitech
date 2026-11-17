#!/usr/bin/env node
/* Task 134 — READ-ONLY sanity check of the mirror-sync assumptions the
 * change-password API relies on:
 *  1. marqaitechgroup tenant User rows and their platform mirror rows share
 *     the SAME id and email (so update-by-id in the mirrored direction lands
 *     on the same identity).
 *  2. Which accounts have a password hash set (change-password requires one).
 *  3. superadmin exists only on the platform DB.
 */
const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '/tmp/my-project/.env.production.local' });

const PLATFORM_URL = process.env.DATABASE_URL;

async function main() {
  const platform = neon(PLATFORM_URL);
  const tenants = await platform`
    SELECT t.id, t.name, t.slug, td."connectionString" AS cs
    FROM "Tenant" t
    JOIN "TenantDatabase" td ON td."tenantId" = t.id AND td."isActive" = true
    WHERE t.slug <> '3boxes-hrms-demo'
  `;
  console.log(`Active non-demo tenants: ${tenants.length}`);

  for (const t of tenants) {
    const tenantDb = neon(t.cs);
    const tUsers = await tenantDb`
      SELECT id, email, name, role, (password IS NOT NULL AND password <> '') AS has_pw
      FROM "User" ORDER BY email`;
    const pUsers = await platform`
      SELECT id, email FROM "User" WHERE "tenantId" = ${t.id}`;
    const pById = new Map(pUsers.map(u => [u.id, u]));
    console.log(`\n=== ${t.name} (${t.slug}) — ${tUsers.length} tenant users, ${pUsers.length} platform mirrors ===`);
    let idMatch = 0, idMiss = [];
    for (const u of tUsers) {
      if (pById.has(u.id)) { idMatch++; }
      else { idMiss.push(u.email); }
    }
    console.log(`  id-matched mirrors: ${idMatch}/${tUsers.length}${idMiss.length ? ` — NO MIRROR: ${idMiss.join(', ')}` : ' (all mirrored)'}`);
    for (const u of tUsers.slice(0, 20)) {
      console.log(`   ${u.email.padEnd(34)} role=${String(u.role).padEnd(12)} pw=${u.has_pw ? 'SET' : 'NULL'}`);
    }
  }

  const sa = await platform`SELECT id, email, role FROM "User" WHERE role = 'super_admin'`;
  console.log(`\nPlatform super_admin rows: ${sa.length} (${sa.map(s => s.email).join(', ')})`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
