/**
 * Local schema-sync runner — runs scripts/schema-sync.js against the local
 * PostgreSQL (pgserver) instead of Neon. Works by monkey-patching the
 * @neondatabase/serverless module cache so `neon()` returns a pg-backed
 * async function with a `.query(text, params)` method.
 *
 * Usage: node scripts/schema-sync-local.js   (DATABASE_URL must point to local pg)
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5433/postgres';

const Module = require('module');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

function makeNeonShim() {
  return function neon(connectionString) {
    const sql = async (strings, ...values) => {
      let text;
      if (typeof strings === 'string') {
        text = strings;
      } else if (Array.isArray(strings) && Array.isArray(strings.raw)) {
        text = strings.raw.reduce(
          (acc, chunk, i) => acc + chunk + (i < values.length ? '$' + (i + 1) : ''),
          '',
        );
      } else {
        throw new Error('neon shim: unsupported invocation');
      }
      const res = await pool.query(text, values);
      return res.rows;
    };
    sql.query = async (text, params) => {
      const res = await pool.query(text, params || []);
      return res.rows;
    };
    sql.transaction = async (fn) => fn(sql);
    return sql;
  };
}

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === '@neondatabase/serverless') {
    return path.join(__dirname, 'neon-shim.js');
  }
  return originalResolve.call(this, request, ...args);
};

async function main() {
  console.log('[schema-sync-local] Running schema-sync.js against local PostgreSQL...');
  await require('./schema-sync.js');
  await pool.end();
  console.log('[schema-sync-local] Done.');
}

main().catch((err) => {
  console.error('[schema-sync-local] FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
