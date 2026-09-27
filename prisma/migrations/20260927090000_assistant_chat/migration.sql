-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "round" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Preparation" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "planHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "receipt" JSONB,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ready';

-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '新的对话',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'complete',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "responseTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantConversation_userId_updatedAt_idx" ON "AssistantConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_userId_conversationId_createdAt_idx" ON "AssistantMessage"("userId", "conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantMessage_userId_clientId_key" ON "AssistantMessage"("userId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantUsage_requestId_key" ON "AssistantUsage"("requestId");

-- CreateIndex
CREATE INDEX "AssistantUsage_userId_createdAt_idx" ON "AssistantUsage"("userId", "createdAt");

