// Shim: exposes a neon()-compatible API backed by node-postgres.
const { Pool } = require('pg');

const pool = new Pool({
  connectionString:
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/postgres',
  max: 5,
});

function neon(connectionString) {
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
}

module.exports = { neon };
