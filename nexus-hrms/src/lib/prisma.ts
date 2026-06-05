import { PrismaClient } from '@/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  adapter: PrismaNeon | undefined;
};

// Resolve DATABASE_URL: prefer a valid PostgreSQL URL from env.
// The system shell may set DATABASE_URL to a SQLite path (e.g. from a
// parent monorepo workspace).  If the value is not a valid PostgreSQL
// connection string we fall back to the URL defined in .env.local.
function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url && (url.startsWith('postgresql://') || url.startsWith('postgres://'))) {
    // Remove channel_binding param which can cause auth issues with some Neon configurations
    return url.replace(/channel_binding=[^&]*&?/g, '').replace(/\?$/g, '');
  }
  // Not a PostgreSQL URL — likely a stale SQLite path from a parent workspace.
  // Next.js will have already loaded .env / .env.local into process.env, but
  // those values are overridden by the shell-level DATABASE_URL.  Since we
  // can't read .env.local directly in this context, throw a helpful error.
  throw new Error(
    'DATABASE_URL is not set or is not a valid PostgreSQL connection string. ' +
    'Current value: ' + (url || '(empty)') + '. ' +
    'Please set it in .env.local to your Neon database URL, or run with: env -u DATABASE_URL next dev'
  );
}

const connectionString = resolveDatabaseUrl();

// Cache both the adapter and PrismaClient in the global scope
// to prevent creating new connections on every request in serverless (Vercel)
const adapter = globalForPrisma.adapter ?? new PrismaNeon({ connectionString, pool: { max: 5 } });
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.adapter = adapter;
} else {
  // In production (serverless), also cache to survive cold-start reuse
  globalForPrisma.prisma = prisma;
  globalForPrisma.adapter = adapter;
}

export default prisma;
