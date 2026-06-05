import { PrismaClient } from '@/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  adapter: PrismaNeon | undefined;
};

// Cache both the adapter and PrismaClient in the global scope
// to prevent creating new connections on every request in serverless (Vercel)
const adapter = globalForPrisma.adapter ?? new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
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
