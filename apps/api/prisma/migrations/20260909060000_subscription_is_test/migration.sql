-- Shopify AppSubscription.test 的镜像。测试扣款不续期，currentPeriodEnd 冻结
-- 而 status 保持 ACTIVE；不记录这个事实，可服务判定会把开发店（含 Shopify
-- 审核员用的店）判成周期已过。默认 false：存量行按真实订阅对待，下一次
-- syncFromShopify 会写入权威值。
ALTER TABLE "Subscription" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
