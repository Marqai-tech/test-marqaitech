-- ADDITIVE-ONLY schema sync for tenant_3boxes-hrms-demo
-- generated from prisma migrate diff vs schema.prisma

ALTER TABLE "Policy" ADD COLUMN     "fileMimeType" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "fileUrl" TEXT;