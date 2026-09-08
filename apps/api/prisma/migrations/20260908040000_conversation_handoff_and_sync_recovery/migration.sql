-- 人工接管 / 会话上下文 / 同步任务恢复
-- openspec/changes/fix-handoff-context-and-sync-recovery

-- ── 会话状态词表 ────────────────────────────────────────────────────────────
-- 'human' 从未被任何后端代码写入过，理论上存量只有 'ai' / 'pending'。
-- 但迁移不能建立在「理论上」之上：先把词表外的取值归一到 'ai'，
-- 否则 USING 转换会在一行脏数据上炸掉整次部署。
CREATE TYPE "ChatThreadStatus" AS ENUM ('ai', 'pending', 'human', 'closed');

UPDATE "ChatThread"
   SET "status" = 'ai'
 WHERE "status" NOT IN ('ai', 'pending', 'human', 'closed');

ALTER TABLE "ChatThread"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ChatThreadStatus" USING "status"::"ChatThreadStatus",
  ALTER COLUMN "status" SET DEFAULT 'ai';

ALTER TABLE "ChatThread" ADD COLUMN "handedOverAt" TIMESTAMP(3);
ALTER TABLE "ChatThread" ADD COLUMN "closedAt"     TIMESTAMP(3);

CREATE INDEX "ChatThread_shopDomain_handedOverAt_idx"
  ON "ChatThread" ("shopDomain", "handedOverAt");

-- ── 消息作者词表 ────────────────────────────────────────────────────────────
-- agent = 商家人工回复。存量只有 'user' / 'assistant'；同样先归一再转换。
CREATE TYPE "ChatMessageRole" AS ENUM ('user', 'assistant', 'agent');

UPDATE "ChatMessage"
   SET "role" = 'assistant'
 WHERE "role" NOT IN ('user', 'assistant', 'agent');

ALTER TABLE "ChatMessage"
  ALTER COLUMN "role" TYPE "ChatMessageRole" USING "role"::"ChatMessageRole";

-- ── 会话数口径 ──────────────────────────────────────────────────────────────
-- 不回填：历史数据里 handedOverAt 根本不存在（'human' 从未写入），
-- 回填出来的分流率必然是 100%，是假数据，比缺口更糟。从变更日起算。
ALTER TABLE "ChatStatDaily" ADD COLUMN "threadCount"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChatStatDaily" ADD COLUMN "humanThreadCount" INTEGER NOT NULL DEFAULT 0;

-- ── 同步任务心跳 ────────────────────────────────────────────────────────────
-- 存量的 running 任务没有心跳，会被启动清理判定为孤儿——这正是我们要的：
-- 它们本来就是进程重启留下的、永久堵住并发守卫的尸体。
ALTER TABLE "KnowledgeSyncJob" ADD COLUMN "heartbeatAt" TIMESTAMP(3);

CREATE INDEX "KnowledgeSyncJob_status_heartbeatAt_idx"
  ON "KnowledgeSyncJob" ("status", "heartbeatAt");
