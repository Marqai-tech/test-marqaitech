/**
 * 3Boxes HRMS — Automatic Tenant Database Provisioning
 *
 * Called by /api/trial/register and /api/trial/approve to automatically
 * create a separate, isolated PostgreSQL database for each new tenant
 * inside the SAME Neon project. No manual Neon console steps required.
 *
 * Flow:
 *   1. Connect to platform DB maintenance endpoint (postgres DB)
 *   2. CREATE DATABASE tenant_<slug>  ← new DB in same Neon project
 *   3. Connect to the new database
 *   4. Run schema DDL (CREATE TABLE statements) loaded from
 *      prisma/tenant-schema.sql on the new DB
 *   5. Caller then inserts the tenant's rows + registers the DB via
 *      registerTenantDatabase()
 *
 * No external services are called. No Neon API key required.
 * The platform DB user already has CREATE DATABASE permission.
 *
 * The schema DDL is generated once via:
 *   bunx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > prisma/tenant-schema.sql
 *
 * Re-run that command whenever prisma/schema.prisma changes.
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────

export interface ProvisionResult {
  databaseName: string;
  connectionString: string;
  directConnectionString: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Build a connection string for a new database, reusing the same host/user
 * as the platform DB connection string. Just swaps the database name.
 */
function buildTenantConnectionString(databaseName: string): {
  pooled: string;
  direct: string;
} {
  // Prefer POSTGRES_PRISMA_URL / POSTGRES_URL over DATABASE_URL (which may
  // be overridden to a SQLite path by prisma.config.ts).
  const platformUrl = process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    '';
  if (!platformUrl || !platformUrl.startsWith('postgresql://')) {
    throw new Error('No valid PostgreSQL connection string found in env (POSTGRES_PRISMA_URL / POSTGRES_URL / DATABASE_URL)');
  }

  // Strip channel_binding which causes issues with raw pg driver
  const cleaned = platformUrl
    .replace(/&channel_binding=[^&]*/, '')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');

  const url = new URL(cleaned);
  url.pathname = `/${databaseName}`;

  // Pooled connection (default)
  const pooled = url.toString();

  // Direct connection — replace -pooler. with . for migrations
  let directUrl = pooled;
  if (url.hostname.includes('-pooler.')) {
    const directUrlObj = new URL(pooled);
    directUrlObj.hostname = url.hostname.replace('-pooler.', '.');
    directUrl = directUrlObj.toString();
  }

  return { pooled, direct: directUrl };
}

/**
 * Sanitize a slug into a valid Postgres database name.
 * Postgres identifiers must start with a letter or underscore and contain
 * only letters, digits, underscores. We prefix with `tenant_` to ensure
 * the first char is a letter and avoid collisions with system DBs
 * (postgres, template0, template1, neondb).
 *
 * Also enforces a 40-char limit on the slug portion so the full name
 * stays well under Postgres's 63-char identifier limit.
 */
function sanitizeDbName(slug: string): string {
  const cleaned = slug
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return `tenant_${cleaned || 'unnamed'}`;
}

/**
 * Load the schema DDL from `prisma/tenant-schema.sql`.
 *
 * To regenerate:
 *   bunx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > prisma/tenant-schema.sql
 */
function loadSchemaSql(): string {
  const possiblePaths = [
    path.join(process.cwd(), 'prisma', 'tenant-schema.sql'),
    path.join(__dirname, '..', '..', 'prisma', 'tenant-schema.sql'),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    } catch {
      // try next path
    }
  }

  throw new Error(
    'prisma/tenant-schema.sql not found. Run: bunx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > prisma/tenant-schema.sql'
  );
}

/**
 * Split a SQL script into individual statements, respecting string
 * literals and dollar-quoted blocks (Postgres function bodies).
 *
 * Naive but sufficient for Prisma-generated DDL — comments and complex
 * PL/pgSQL blocks are not common in `prisma migrate diff --script` output.
 */
function splitSqlStatements(sql: string): string[] {
  // Strip line comments (-- ...) and block comments (/* ... */)
  const cleaned = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dollarTag: string | null = null;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    // Dollar-quote detection ($tag$ ... $tag$)
    if (!inSingleQuote && !inDoubleQuote && ch === '$') {
      const match = cleaned.slice(i).match(/^\$[A-Za-z_]*\$/);
      if (match) {
        const tag = match[0];
        if (dollarTag === null) {
          dollarTag = tag;
          current += tag;
          i += tag.length - 1;
          continue;
        } else if (dollarTag === tag) {
          dollarTag = null;
          current += tag;
          i += tag.length - 1;
          continue;
        }
      }
    }

    if (dollarTag === null) {
      if (ch === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
      } else if (ch === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
      } else if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
        const stmt = current.trim();
        if (stmt) statements.push(stmt);
        current = '';
        continue;
      }
    }

    current += ch;
  }

  const last = current.trim();
  if (last) statements.push(last);
  return statements;
}

// ─── Main: provisionTenantDatabase ────────────────────────────────────

/**
 * Create a new isolated PostgreSQL database for a tenant.
 *
 * 1. Connects to the platform DB maintenance endpoint (postgres DB).
 * 2. CREATE DATABASE tenant_<sanitized-slug>.
 * 3. Connects to the new DB.
 * 4. Runs the schema DDL from prisma/tenant-schema.sql.
 * 5. Returns the connection strings for the caller to register.
 *
 * Idempotent: if the database already exists, skips creation and just
 * applies the schema (CREATE TABLE IF NOT EXISTS is safe).
 *
 * @param params.slug - tenant slug (e.g., "acme-corp")
 * @returns connection strings + database name
 */
export async function provisionTenantDatabase(
  params: { slug: string }
): Promise<ProvisionResult> {
  const { slug } = params;
  if (!slug) throw new Error('provisionTenantDatabase: slug is required');

  const databaseName = sanitizeDbName(slug);
  const { pooled: connectionString, direct: directConnectionString } =
    buildTenantConnectionString(databaseName);

  console.log(`[TenantDBProvision] Provisioning database "${databaseName}" for tenant slug "${slug}"`);

  // ─── Step 1: Connect to platform DB maintenance endpoint ─────────
  // NOTE: process.env.DATABASE_URL may be overridden to a SQLite path by
  // prisma.config.ts or other config. Prefer POSTGRES_PRISMA_URL / POSTGRES_URL
  // (which are always the Neon connection string) over DATABASE_URL.
  const platformUrl = process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    '';
  if (!platformUrl || !platformUrl.startsWith('postgresql://')) {
    throw new Error(`provisionTenantDatabase: no valid PostgreSQL connection string found. POSTGRES_PRISMA_URL=${process.env.POSTGRES_PRISMA_URL ? 'set' : 'unset'}, POSTGRES_URL=${process.env.POSTGRES_URL ? 'set' : 'unset'}, DATABASE_URL=${process.env.DATABASE_URL?.substring(0, 30) || 'unset'}`);
  }

  // pg's `createdb` requires connecting to the SERVER, not a specific
  // database. Connect to the `postgres` maintenance DB to run CREATE DATABASE.
  const cleanedPlatformUrl = platformUrl
    .replace(/&channel_binding=[^&]*/, '')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');
  const maintenanceUrlObj = new URL(cleanedPlatformUrl);
  maintenanceUrlObj.pathname = '/postgres';
  const maintenanceUrl = maintenanceUrlObj.toString();

  const isLocal = maintenanceUrl.includes('localhost') || maintenanceUrl.includes('127.0.0.1');
  const adminPool = new Pool({
    connectionString: maintenanceUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    max: 1,
  });

  try {
    // ─── Step 2: CREATE DATABASE (idempotent) ─────────────────────
    // Postgres doesn't support CREATE DATABASE IF NOT EXISTS, so we
    // check pg_database first.
    const existing = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName],
    );

    if (existing.rows.length > 0) {
      console.log(`[TenantDBProvision] Database "${databaseName}" already exists — skipping CREATE`);
    } else {
      // CREATE DATABASE cannot run inside a transaction block, and
      // cannot use parameter placeholders. Sanitize the name defensively.
      if (!/^tenant_[a-z0-9_]+$/.test(databaseName)) {
        throw new Error(`Invalid database name: ${databaseName}`);
      }
      console.log(`[TenantDBProvision] Creating database "${databaseName}"...`);
      await adminPool.query(`CREATE DATABASE "${databaseName}"`);
      console.log(`[TenantDBProvision] Database "${databaseName}" created.`);
    }
  } catch (error: any) {
    // If the error is "database already exists", treat as success.
    if (error?.code === '42P04' || /already exists/i.test(error?.message || '')) {
      console.log(`[TenantDBProvision] Database "${databaseName}" already exists (caught in error) — continuing`);
    } else {
      console.error(`[TenantDBProvision] Failed to create database "${databaseName}":`, error?.message || error);
      throw error;
    }
  } finally {
    await adminPool.end();
  }

  // ─── Step 3 + 4: Connect to new DB + push schema ────────────────
  console.log(`[TenantDBProvision] Pushing schema to "${databaseName}"...`);

  const tenantPool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    max: 1,
  });

  try {
    const schemaSql = loadSchemaSql();
    const statements = splitSqlStatements(schemaSql);
    console.log(`[TenantDBProvision] Executing ${statements.length} DDL statements on "${databaseName}"...`);

    // Execute each statement individually. Many Prisma-generated
    // statements (CREATE TABLE, CREATE INDEX, ADD CONSTRAINT) cannot
    // be batched into a single query() call.
    let executed = 0;
    let failed = 0;
    const failures: string[] = [];
    for (const stmt of statements) {
      try {
        await tenantPool.query(stmt);
        executed++;
      } catch (err: any) {
        // Ignore "already exists" errors (idempotent re-runs)
        const code = err?.code;
        const msg = err?.message || '';
        if (code === '42P07' || code === '42710' || /already exists/i.test(msg) || /duplicate key/i.test(msg)) {
          executed++;
        } else {
          failed++;
          if (failures.length < 5) {
            failures.push(`${code}: ${msg.slice(0, 200)}`);
          }
        }
      }
    }
    console.log(`[TenantDBProvision] Schema push complete: ${executed} succeeded, ${failed} failed (non-fatal)`);
    if (failures.length > 0) {
      console.log(`[TenantDBProvision] First few failures:`);
      failures.forEach(f => console.log(`  - ${f}`));
    }
  } finally {
    await tenantPool.end();
  }

  console.log(`[TenantDBProvision] ✅ Provisioned "${databaseName}" for slug "${slug}"`);

  return {
    databaseName,
    connectionString,
    directConnectionString,
  };
}

/**
 * Drop a tenant database (used for cleanup if provisioning fails halfway,
 * or when a tenant is permanently deleted).
 *
 * WARNING: This permanently deletes all tenant data. Use with caution.
 */
export async function dropTenantDatabase(params: { slug: string }): Promise<void> {
  const { slug } = params;
  if (!slug) throw new Error('dropTenantDatabase: slug is required');

  const databaseName = sanitizeDbName(slug);
  const platformUrl = process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    '';
  if (!platformUrl || !platformUrl.startsWith('postgresql://')) {
    throw new Error('dropTenantDatabase: no valid PostgreSQL connection string found');
  }

  const cleanedPlatformUrl = platformUrl
    .replace(/&channel_binding=[^&]*/, '')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');
  const maintenanceUrlObj = new URL(cleanedPlatformUrl);
  maintenanceUrlObj.pathname = '/postgres';
  const maintenanceUrl = maintenanceUrlObj.toString();

  const isLocal = maintenanceUrl.includes('localhost') || maintenanceUrl.includes('127.0.0.1');
  const adminPool = new Pool({
    connectionString: maintenanceUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    max: 1,
  });

  try {
    // Terminate any active connections to the DB before dropping
    try {
      await adminPool.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [databaseName]);
    } catch {
      // Non-fatal — terminate may fail if no connections exist
    }

    if (!/^tenant_[a-z0-9_]+$/.test(databaseName)) {
      throw new Error(`Invalid database name: ${databaseName}`);
    }
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    console.log(`[TenantDBProvision] Dropped database "${databaseName}"`);
  } finally {
    await adminPool.end();
  }
}
