-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "fileMimeType" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "fileUrl" TEXT;

-- DropTable
DROP TABLE "Rejoin";

-- DropTable
DROP TABLE "Resignation";

-- DropTable
DROP TABLE "Termination";

-- DropTable
DROP TABLE "Transfer";

