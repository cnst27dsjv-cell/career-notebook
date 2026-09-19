ALTER TABLE "FileAsset"
ADD COLUMN "applicationId" TEXT,
ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'resume',
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "FileAsset_userId_applicationId_purpose_hash_key"
ON "FileAsset"("userId", "applicationId", "purpose", "hash");

CREATE INDEX "FileAsset_userId_applicationId_purpose_idx"
ON "FileAsset"("userId", "applicationId", "purpose");
