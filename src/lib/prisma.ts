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

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
