-- AI 解决次数：与 ChatStatDaily.count（对话数）同表按日聚合，供运营台计费周期用量
ALTER TABLE "ChatStatDaily" ADD COLUMN "aiResolvedCount" INTEGER NOT NULL DEFAULT 0;
