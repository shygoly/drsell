-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ai',
    "channel" TEXT NOT NULL DEFAULT 'web',
    "topic" TEXT,
    "lastMessage" TEXT,
    "unread" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatThread_shopDomain_updatedAt_idx" ON "ChatThread"("shopDomain", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_shopDomain_visitorId_key" ON "ChatThread"("shopDomain", "visitorId");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
