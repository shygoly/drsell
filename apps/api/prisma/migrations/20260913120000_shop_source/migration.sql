-- Shop.source：区分 DTC 独立站（'medusa'）与 Shopify 店铺（'shopify'）。
-- 供 AI 客服 prompt 按来源参数化（中性措辞 + 开放售后工具）与 D9 额度豁免判定。
-- 默认 'shopify'：存量行按 Shopify 对待，行为不变。DTC 店由 ingest 自愈为 'medusa'。
ALTER TABLE "Shop" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'shopify';
