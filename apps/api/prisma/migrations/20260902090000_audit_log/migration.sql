-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "shopDomain" TEXT,
    "targetId" TEXT,
    "payload" JSONB,
    "result" TEXT NOT NULL DEFAULT 'ok',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "frozenAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "unfreezeBy" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_shopDomain_createdAt_idx" ON "AuditLog"("shopDomain", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
