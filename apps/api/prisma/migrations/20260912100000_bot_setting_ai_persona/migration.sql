-- AI Assistant 人设：让每店可配置客服 AI 的人设/语气/语言/自定义指令 + 开关。
-- 此前 /ai-assistant 页是纯前端 mockup，system prompt 由 buildSupportSystemPrompt 全店硬编码。
-- 护栏（店铺域锁定、忽略顾客注入、输出格式）仍由服务端注入且不可被商家覆盖。
-- aiEnabled 默认 true：存量店保持「AI 自动应答」现状；置 false 时不自动应答、转人工。
ALTER TABLE "BotSetting" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BotSetting" ADD COLUMN "aiPersonaName" TEXT;
ALTER TABLE "BotSetting" ADD COLUMN "aiTone" TEXT;
ALTER TABLE "BotSetting" ADD COLUMN "aiLanguage" TEXT;
ALTER TABLE "BotSetting" ADD COLUMN "aiSystemPrompt" TEXT;
