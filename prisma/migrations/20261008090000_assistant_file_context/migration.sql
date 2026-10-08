-- AlterTable
ALTER TABLE "FileAsset"
ADD COLUMN "extractedText" TEXT NOT NULL DEFAULT '',
ADD COLUMN "extractionStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "extractionError" TEXT NOT NULL DEFAULT '',
ADD COLUMN "parserVersion" TEXT NOT NULL DEFAULT '',
ADD COLUMN "extractedAt" TIMESTAMP(3),
ADD COLUMN "reusable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AssistantMessage" ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]';
