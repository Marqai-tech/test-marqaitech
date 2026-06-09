/**
 * Nexus HRMS — Re-export of the database client
 *
 * This file exists for backward compatibility with existing imports.
 * All new code should import from '@/lib/db' directly.
 *
 * ⚠️  The canonical database client is in '@/lib/db'.
 * ⚠️  Do NOT create a separate PrismaClient instance here.
 */
export { db as prisma, db as default } from '@/lib/db'
