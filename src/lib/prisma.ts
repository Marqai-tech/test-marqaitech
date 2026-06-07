import { PrismaClient } from '@/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Neon Vercel integration sets POSTGRES_PRISMA_URL and POSTGRES_URL
  // Check those first, then fall back to DATABASE_URL
  const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('No database connection string found. Set POSTGRES_PRISMA_URL, POSTGRES_URL, or DATABASE_URL');
  }

  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV !== 'production') {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    return globalForPrisma.prisma;
  }

  // In production (Vercel serverless), create a new client each time
  // to avoid connection pool issues with Neon serverless
  return createPrismaClient();
}

export const prisma = getPrismaClient();

export default prisma;
