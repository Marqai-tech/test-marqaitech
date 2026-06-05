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
  // Try DATABASE_URL first, then fall back to POSTGRES_URL (Neon Vercel integration)
  const urls = [process.env.DATABASE_URL, process.env.POSTGRES_URL];
  for (const url of urls) {
    if (url && (url.startsWith('postgresql://') || url.startsWith('postgres://'))) {
      // Remove channel_binding param which can cause auth issues with some Neon configurations
      return url.replace(/channel_binding=[^&]*&?/g, '').replace(/\?$/g, '');
    }
  }
  throw new Error(
    'DATABASE_URL / POSTGRES_URL is not set or is not a valid PostgreSQL connection string. ' +
    'Please set it in Vercel environment variables to your Neon database URL.'
  );
}

const connectionString = resolveDatabaseUrl();

// Cache both the adapter and PrismaClient in the global scope
// to prevent creating new connections on every request in serverless (Vercel)
const adapter = globalForPrisma.adapter ?? new PrismaNeon({ connectionString });
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
