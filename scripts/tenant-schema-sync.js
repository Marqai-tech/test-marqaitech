/**
 * TENANT SCHEMA SYNC (build-time, runs after scripts/schema-sync.js)
 *
 * ROOT CAUSE this fixes:
 *   Each tenant has its own dedicated Postgres DB (TenantDatabase registry).
 *   schema-sync.js only syncs the PLATFORM database, so whenever
 *   prisma/schema.prisma gains a new column/table, every tenant DB drifts
 *   and tenant-side Prisma queries start failing with
 *   "The column (not available) does not exist in the current database" (P2022).
 *   Real example: Interview.panelAttendance missing → candidate portal
 *   dashboard (jobApplication.findMany with include.interviews) crashed on login.
 *
 * WHAT IT DOES:
 *   1. Connects to the platform DB (same env resolution as schema-sync.js).
 *   2. Reads every active TenantDatabase connection string.
 *   3. For each tenant DB, applies an ADDITIVE, idempotent, SCHEMA-DRIVEN sync:
 *        - CREATE TABLE IF NOT EXISTS for missing models (all columns + PK)
 *        - ALTER TABLE ADD COLUMN for missing columns (correct PG type,
 *          defaults, safe NOT NULL backfill for non-empty tables)
 *        - CREATE INDEX IF NOT EXISTS for @@index / @@unique / @unique
 *      It never drops, renames or retypes anything — cannot cause data loss.
 *   4. Skips tenants whose schema hash already matches (SchemaSyncState).
 *
 * SAFETY:
 *   - All statements are IF NOT EXISTS / ADD COLUMN guarded → re-runnable.
 *   - Any failure is logged but NEVER blocks the Vercel build (exit 0).
 *   - No credentials in this file — everything comes from env/registry.
 *
 * Local usage:
 *   DATABASE_URL="postgres://..." node scripts/tenant-schema-sync.js
 *   TENANT_SYNC_FORCE=1 node scripts/tenant-schema-sync.js   (ignore hash skip)
 */

const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Prisma schema parsing
// ─────────────────────────────────────────────────────────────────────────────

const SCALARS = {
  String: 'TEXT',
  Int: 'INTEGER',
  BigInt: 'BIGINT',
  Float: 'DOUBLE PRECISION',
  Decimal: 'DOUBLE PRECISION', // consistent with gen-missing-tables.py
  Boolean: 'BOOLEAN',
  DateTime: 'TIMESTAMP(3)',
  Json: 'JSONB',
  Bytes: 'BYTEA',
};

function parsePrismaSchema(schemaPath) {
  const src = fs.readFileSync(schemaPath, 'utf8');

  // Collect enum names first (enum-typed fields map to TEXT)
  const enumNames = new Set();
  const enumRe = /^enum\s+(\w+)\s*\{[\s\S]*?^\}/gm;
  let em;
  while ((em = enumRe.exec(src))) enumNames.add(em[1]);

  const models = [];
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = modelRe.exec(src))) {
    const modelName = m[1];
    const body = m[2];
    if (/@@ignore/.test(body)) continue;

    let tableName = modelName;
    const mapM = body.match(/@@map\("([^"]+)"\)/);
    if (mapM) tableName = mapM[1];

    const columns = [];
    const indexes = [];
    const uniques = [];
    let pkColumn = null;

    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('///')) continue;
      const stripped = line.replace(/\/\/.*$/, '').trim();
      if (!stripped) continue;

      if (stripped.startsWith('@@')) {
        let am;
        if ((am = stripped.match(/@@index\(\[([^\]]+)\]\)/))) {
          const fields = am[1].split(',').map(f => f.trim().split(/\s+/)[0].replace(/^\[|\]$/g, '')).filter(Boolean);
          if (fields.length) indexes.push(fields);
        } else if ((am = stripped.match(/@@unique\(\[([^\]]+)\]\)/))) {
          const fields = am[1].split(',').map(f => f.trim().split(/\s+/)[0].replace(/^\[|\]$/g, '')).filter(Boolean);
          if (fields.length) uniques.push(fields);
        }
        continue;
      }

      const fm = stripped.match(/^(\w+)\s+([\w\[\]]+)/);
      if (!fm) continue;
      const fieldName = fm[1];
      let ftype = fm[2];
      const isList = ftype.endsWith('[]');
      const nullable = stripped.includes('?') && !isList;
      ftype = ftype.replace(/\[\]$/, '').replace(/\?$/, '');

      const isScalar = SCALARS[ftype] !== undefined;
      const isEnum = enumNames.has(ftype);
      if (!isScalar && !isEnum) continue; // relation field — skip
      if (isList) continue; // scalar list → PG arrays, out of additive scope here

      let colName = fieldName;
      const cmap = stripped.match(/@map\("([^"]+)"\)/);
      if (cmap) colName = cmap[1];

      const isPk = /@id/.test(stripped);

      // Default value → SQL fragment
      let defSql = null;
      let dm;
      if ((dm = stripped.match(/@default\(([^)]+)\)/))) {
        const dv = dm[1].trim();
        if (/^(cuid|uuid|nanoId)\(\)/.test(dv)) defSql = null; // app-side
        else if (/^autoincrement\(\)/.test(dv)) defSql = null; // handled via serial PK
        else if (/^(now|dbgenerated\("now\(\)"\))/.test(dv)) defSql = 'CURRENT_TIMESTAMP';
        else if (dv === 'true' || dv === 'false') defSql = dv;
        else if (/^["'].*["']$/.test(dv)) defSql = `'${dv.slice(1, -1).replace(/'/g, "''")}'`;
        else if (/^-?\d+(\.\d+)?$/.test(dv)) defSql = dv;
        else if (isEnum) defSql = `'${dv.replace(/'/g, "''")}'`; // enum default w/o quotes
        else defSql = null;
      }

      // Native type overrides @db.VarChar(n), @db.Text, @db.Timestamptz...
      let pgType = isEnum ? 'TEXT' : SCALARS[ftype];
      const nat = stripped.match(/@db\.(\w+)\(?(\d*)\)?/);
      if (nat) {
        const t = nat[1].toLowerCase();
        const n = nat[2];
        if (t === 'varchar') pgType = n ? `VARCHAR(${n})` : 'VARCHAR(256)';
        else if (t === 'char') pgType = n ? `CHAR(${n})` : 'CHAR(1)';
        else if (t === 'text') pgType = 'TEXT';
        else if (t === 'timestamptz') pgType = 'TIMESTAMPTZ(3)';
        else if (t === 'decimal' || t === 'money') pgType = 'DECIMAL(65,30)';
        else if (t === 'doubleprecision') pgType = 'DOUBLE PRECISION';
        else if (t === 'real') pgType = 'REAL';
        else if (t === 'smallint') pgType = 'SMALLINT';
        else if (t === 'integer') pgType = 'INTEGER';
        else if (t === 'bigint') pgType = 'BIGINT';
        else if (t === 'boolean') pgType = 'BOOLEAN';
        else if (t === 'jsonb') pgType = 'JSONB';
        else if (t === 'uuid') pgType = 'UUID';
        else if (t === 'bytea') pgType = 'BYTEA';
        else if (t === 'date') pgType = 'DATE';
        else if (t === 'time') pgType = 'TIME';
      }

      const required = !nullable && !isList;
      if (isPk) pkColumn = colName;
      if (/@unique/.test(stripped)) uniques.push([colName]);

      columns.push({ colName, pgType, required, defSql, isPk });
    }

    models.push({ modelName, tableName, columns, indexes, uniques, pkColumn });
  }
  return models;
}

function buildColumnSql(col, hasRows) {
  let sql = `"${col.colName}" ${col.pgType}`;
  if (col.required) {
    if (col.defSql) sql += ` NOT NULL DEFAULT ${col.defSql}`;
    else if (hasRows) sql += ` NOT NULL DEFAULT ${backfillDefault(col.pgType)}`;
    else sql += ' NOT NULL';
  } else if (col.defSql) {
    sql += ` DEFAULT ${col.defSql}`;
  }
  return sql;
}

function backfillDefault(pgType) {
  if (pgType.startsWith('TIMESTAMP')) return 'CURRENT_TIMESTAMP';
  if (pgType === 'BOOLEAN') return 'false';
  if (pgType === 'INTEGER' || pgType === 'BIGINT' || pgType === 'SMALLINT' || pgType === 'REAL' || pgType.startsWith('DOUBLE') || pgType.startsWith('DECIMAL')) return '0';
  if (pgType === 'JSONB') return "'{}'::jsonb";
  return "''";
}

function indexName(model, fields, unique) {
  return `${model.tableName}_${fields.join('_')}_${unique ? 'key' : 'idx'}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-database additive sync
// ─────────────────────────────────────────────────────────────────────────────

async function syncOneDatabase(label, connectionString, models, log) {
  const sql = neon(connectionString);
  const masked = String(connectionString).replace(/\/\/([^:]+):[^@]+@/, '//***:***@');
  log(`  connecting: ${masked.substring(0, 75)}`);

  const existing = await sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`;
  const dbTables = new Map();
  for (const r of existing) {
    if (!dbTables.has(r.table_name)) dbTables.set(r.table_name, new Set());
    dbTables.get(r.table_name).add(r.column_name);
  }
  const dbIndexes = new Set(
    (await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`).map(r => r.indexname),
  );

  let created = 0, added = 0, idxAdded = 0, extraAdded = 0;

  for (const model of models) {
    if (!dbTables.has(model.tableName)) {
      // CREATE TABLE with all columns
      const colDefs = [];
      for (const col of model.columns) {
        let d = `"${col.colName}" ${col.pgType}`;
        if (col.isPk) {
          d += (col.pgType === 'INTEGER' && !col.defSql) ? ' SERIAL' : (col.pgType === 'BIGINT' && !col.defSql) ? ' BIGSERIAL' : '';
          d += ' PRIMARY KEY';
        } else if (col.required) {
          d += col.defSql ? ` NOT NULL DEFAULT ${col.defSql}` : ' NOT NULL';
        } else if (col.defSql) d += ` DEFAULT ${col.defSql}`;
        colDefs.push(d);
      }
      if (!colDefs.some(c => c.includes('PRIMARY KEY')) && model.pkColumn) {
        colDefs.push(`PRIMARY KEY("${model.pkColumn}")`);
      }
      try {
        await sql.query(`CREATE TABLE IF NOT EXISTS "${model.tableName}" (\n  ${colDefs.join(',\n  ')}\n)`);
        created++;
        dbTables.set(model.tableName, new Set(model.columns.map(c => c.colName)));
      } catch (e) {
        log(`  WARN create ${model.tableName}: ${e.message}`.substring(0, 160));
      }
      continue;
    }

    const cols = dbTables.get(model.tableName);
    const missingCols = model.columns.filter(c => !cols.has(c.colName));
    // Only pay for a COUNT query when we actually need to backfill a NOT NULL column
    const hasRows = missingCols.some(c => c.required && !c.defSql)
      ? (await sql.query(`SELECT COUNT(*)::int AS c FROM "${model.tableName}"`))[0].c > 0
      : false;

    for (const col of missingCols) {
      try {
        await sql.query(`ALTER TABLE "${model.tableName}" ADD COLUMN IF NOT EXISTS ${buildColumnSql(col, hasRows)}`);
        // backfilled NOT NULL columns must not keep their backfill default
        if (col.required && !col.defSql && hasRows) {
          await sql.query(`ALTER TABLE "${model.tableName}" ALTER COLUMN "${col.colName}" DROP DEFAULT`);
        }
        cols.add(col.colName);
        added++;
        log(`  + ${model.tableName}.${col.colName} ${col.pgType}`);
      } catch (e) {
        log(`  WARN ${model.tableName}.${col.colName}: ${e.message}`.substring(0, 160));
      }
    }

    for (const fields of [...model.indexes, ...model.uniques]) {
      const unique = model.uniques.includes(fields);
      const name = indexName(model, fields, unique);
      if (dbIndexes.has(name)) continue;
      const colList = fields.map(f => `"${f}"`).join(', ');
      try {
        await sql.query(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS "${name}" ON "${model.tableName}" (${colList})`);
        idxAdded++;
      } catch (e) {
        log(`  WARN index ${name}: ${e.message}`.substring(0, 160));
      }
    }
  }

  // ─── Manual, not-Prisma-expressible statements (idempotent) ───
  // Business rule: a candidate may only have ONE active BGV case at a time.
  // Enforced by a partial unique index so even a concurrent/transactional
  // INSERT cannot create duplicates.
  for (const stmt of EXTRA_STATEMENTS) {
    try {
      await sql.query(stmt);
      extraAdded++;
    } catch (e) {
      log(`  WARN extra statement: ${e.message}`.substring(0, 160));
    }
  }

  log(`  ✓ ${label}: tables created ${created}, columns added ${added}, indexes added ${idxAdded}${extraAdded ? `, extra ${extraAdded}` : ''}`);
  return { created, added, idxAdded };
}

// Additive, idempotent statements that cannot be expressed in the Prisma
// schema language (partial indexes etc.). Applied to every tenant DB.
const EXTRA_STATEMENTS = [
  // One active BGV case per candidate (terminal statuses excluded).
  `CREATE UNIQUE INDEX IF NOT EXISTS "BgvRequest_active_candidateEmail_key"
     ON "BgvRequest" ("candidateEmail")
     WHERE "status" NOT IN ('approved_by_hr','rejected_by_hr','cancelled')`,

  // ─── BRD 6.2 Employee-creation approval workflow (tenant DBs) ───
  `CREATE TABLE IF NOT EXISTS "EmployeeCreationRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "preboardingCandidateId" TEXT NOT NULL,
    "preboardingId" TEXT,
    "candidateName" TEXT NOT NULL,
    "candidateEmail" TEXT NOT NULL,
    "employment" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payrollRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "payrollReviewedById" TEXT,
    "payrollReviewedAt" TIMESTAMP(3),
    "authorizedById" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "employeeRowId" TEXT,
    "provisionalEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeCreationRequest_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "EmployeeCreationRequest_preboardingCandidateId_idx" ON "EmployeeCreationRequest"("preboardingCandidateId")`,
  `CREATE INDEX IF NOT EXISTS "EmployeeCreationRequest_status_idx" ON "EmployeeCreationRequest"("status")`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "preboardingCandidateId" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "linkedApplicationId" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "linkedOfferId" TEXT`,
  `ALTER TABLE "PreboardingCandidate" ADD COLUMN IF NOT EXISTS "jobApplicationId" TEXT`,

  // ─── BRD 5.3 Preboarding Initiation (tenant DBs) ───
  `CREATE TABLE IF NOT EXISTS "PreboardingInitiation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "offerId" TEXT NOT NULL,
    "applicationId" TEXT,
    "candidateName" TEXT NOT NULL,
    "candidateEmail" TEXT NOT NULL,
    "jobTitle" TEXT,
    "hrDetails" JSONB,
    "checklist" JSONB,
    "communication" JSONB,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "invitedById" TEXT,
    "invitedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "preboardingCandidateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PreboardingInitiation_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "PreboardingInitiation_offerId_idx" ON "PreboardingInitiation"("offerId")`,
  `CREATE INDEX IF NOT EXISTS "PreboardingInitiation_status_idx" ON "PreboardingInitiation"("status")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PreboardingInitiation_active_offer_key"
     ON "PreboardingInitiation"("offerId") WHERE "status" IN ('draft','invited')`,
  `ALTER TABLE "OnboardingDocument" ADD COLUMN IF NOT EXISTS "required" BOOLEAN DEFAULT true`,
  `ALTER TABLE "PreboardingCandidate" ADD COLUMN IF NOT EXISTS "companyId" TEXT`,
  `ALTER TABLE "PreboardingCandidate" ADD COLUMN IF NOT EXISTS "branchId" TEXT`,

  // ─── BRD 5.8 document hardening (tenant DBs) ───
  `ALTER TABLE "OnboardingDocument" ADD COLUMN IF NOT EXISTS "documentNumber" TEXT`,
  `ALTER TABLE "OnboardingDocument" ADD COLUMN IF NOT EXISTS "issueDate" TIMESTAMP(3)`,
  `ALTER TABLE "OnboardingDocument" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3)`,
  `ALTER TABLE "OnboardingDocument" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "OnboardingDocument" ADD COLUMN IF NOT EXISTS "fileHash" TEXT`,
  `CREATE TABLE IF NOT EXISTS "OnboardingDocumentVersion" (
    "id" TEXT NOT NULL,
    "onboardingDocumentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileName" TEXT,
    "fileData" TEXT,
    "fileMimeType" TEXT,
    "fileSize" INTEGER,
    "fileHash" TEXT,
    "status" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnboardingDocumentVersion_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "OnboardingDocumentVersion_doc_idx" ON "OnboardingDocumentVersion"("onboardingDocumentId")`,
];

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const platformUrl =
    process.env.TENANT_SYNC_PLATFORM_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;

  if (!platformUrl) {
    console.warn('[tenant-sync] No platform DATABASE_URL — skipping tenant schema sync.');
    return;
  }

  const models = parsePrismaSchema(path.join(__dirname, '..', 'prisma', 'schema.prisma'));
  console.log(`[tenant-sync] Parsed ${models.length} models from schema.prisma`);

  const sourceHash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma')))
    .update(fs.readFileSync(__filename))
    .digest('hex');

  const platform = neon(platformUrl);

  let tenants = [];
  try {
    tenants = await platform`
      SELECT td."databaseName", td."connectionString"
      FROM "TenantDatabase" td
      WHERE td."isActive" = true
      ORDER BY td."databaseName"`;
  } catch (e) {
    console.warn('[tenant-sync] Could not read TenantDatabase registry (non-fatal):', e.message);
    return;
  }
  console.log(`[tenant-sync] Active tenant databases: ${tenants.map(t => t.databaseName).join(', ') || '(none)'}`);

  let savedMarkers = new Map();
  try {
    const rows = await platform`SELECT id, "sourceHash" FROM "SchemaSyncState"`;
    savedMarkers = new Map(rows.map(r => [r.id, r.sourceHash]));
  } catch {
    await platform.query(`CREATE TABLE IF NOT EXISTS "SchemaSyncState" (
      "id" TEXT PRIMARY KEY,
      "sourceHash" TEXT NOT NULL,
      "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).catch(() => {});
  }

  const force = process.env.TENANT_SYNC_FORCE === '1';

  for (const t of tenants) {
    const marker = `tenant:${t.databaseName}`;
    if (!force && savedMarkers.get(marker) === sourceHash) {
      console.log(`[tenant-sync] ${t.databaseName}: schema up to date — skipping.`);
      continue;
    }
    try {
      await syncOneDatabase(t.databaseName, t.connectionString, models, msg => console.log(`[tenant-sync] ${msg}`));
      await platform.query(
        `INSERT INTO "SchemaSyncState" ("id", "sourceHash", "syncedAt")
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT ("id") DO UPDATE SET "sourceHash" = $2, "syncedAt" = CURRENT_TIMESTAMP`,
        [marker, sourceHash],
      );
    } catch (e) {
      console.warn(`[tenant-sync] ${t.databaseName} FAILED (non-fatal): ${e.message}`);
    }
  }

  console.log('[tenant-sync] Done.');
}

main()
  .catch(err => console.warn('[tenant-sync] FATAL (non-blocking):', err && err.message ? err.message : err))
  .finally(() => process.exit(0));
