-- AI 回答用量计数：按店铺 + 计费周期累计，用于套餐配额与超额拦截。
-- 用 shopId 外键而非 shopDomain 字符串——soft_tenant_models 棘轮不允许新增软租户键。
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "answers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiUsage_shopId_periodStart_key" ON "AiUsage"("shopId", "periodStart");
CREATE INDEX "AiUsage_shopId_periodStart_idx" ON "AiUsage"("shopId", "periodStart");

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
