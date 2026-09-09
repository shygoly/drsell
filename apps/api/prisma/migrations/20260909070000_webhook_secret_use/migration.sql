-- 记录 webhook 验签命中的密钥代，按 topic 分。
-- 删 SHOPIFY_API_SECRET_PREVIOUS 的判据此前只有一行会滚掉的 pm2 日志。
CREATE TABLE "WebhookSecretUse" (
    "id" TEXT NOT NULL,
    "generation" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WebhookSecretUse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebhookSecretUse_generation_topic_key"
    ON "WebhookSecretUse"("generation", "topic");
