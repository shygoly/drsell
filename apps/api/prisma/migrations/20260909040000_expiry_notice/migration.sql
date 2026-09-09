-- 到期提醒的去重记录
-- openspec/changes/subscription-gating-and-expiry
--
-- 唯一键「店 + 周期 + 档位」是这张表存在的全部理由：进程内记忆挡不住重启和
-- 多实例，重复触发会重复打扰商家。新周期靠 periodEnd 换值自然重新计数。
CREATE TABLE "ExpiryNotice" (
  "id"        TEXT NOT NULL,
  "shopId"    TEXT NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "dayOffset" INTEGER NOT NULL,
  "delivered" BOOLEAN NOT NULL DEFAULT false,
  "error"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpiryNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpiryNotice_shopId_periodEnd_dayOffset_key"
  ON "ExpiryNotice" ("shopId", "periodEnd", "dayOffset");
CREATE INDEX "ExpiryNotice_shopId_periodEnd_idx"
  ON "ExpiryNotice" ("shopId", "periodEnd");

ALTER TABLE "ExpiryNotice" ADD CONSTRAINT "ExpiryNotice_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
