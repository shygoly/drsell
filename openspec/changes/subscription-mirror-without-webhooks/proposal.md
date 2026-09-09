# 订阅镜像失去数据源后的重建

## Why

本地 `Subscription` 镜像**没有任何自动数据源**，且已经这样运行了四个月。

Shopify 文档（Shopify App Pricing，原 Managed Pricing）原文：

> After April 28, 2026, Shopify App Pricing no longer sends webhooks for
> subscription changes. Use the Partner API and URL redirect parameters instead.

而 `syncFromShopify` 在全仓**只有一个调用方**：`app_subscriptions/update` 的
webhook 处理器。该 webhook 自 2026-04-28 起不再触发，今天已是 2026-09-09。

生产证据完全吻合：

- `chatbotdomaintest` 的 `currentPeriodEnd` 停在 2025-08-25，整整一年未变——
  不是「滞后」，是没有东西在更新它
- `KnowledgeSyncJob` 里仅有的几条 `billing:sync`，**全部**是 2026-09-09 人工
  发自签 webhook 触发的
- `jade-shop-2024` 全新安装后没有任何订阅记录

这不是一个孤立的过期字段。`subscription-gating-and-expiry` 刚刚在这份镜像上
建起了停服闸门、配额档位与到期提醒——**三者都读一份不会更新的数据**。
按现状打开 `SUBSCRIPTION_GATE_ENFORCE`，判定依据是四个月前的快照。

对上架的直接影响：审核员安装后选套餐，我们这边**不会知道**，
商家端会一直显示「没有有效套餐」。

## What Changes

- 重建镜像的数据源：商家选完套餐回跳时立即同步；闸门判定时按陈旧度补同步
- 判定哪个 API 还能读到 App Pricing 的订阅（Admin API vs Partner API）——
  这是设计分叉点，先做实验再决定
- 「已安装但尚未选套餐」需要一个明确的处置，不能直接判为停服
- 商家端给出选套餐的入口（已在 `c3b0736` 落地，此处只做验收）

## Impact

- `apps/api`：`BillingService`、`QuotaService`、Shopify 回跳处理
- `openspec/changes/subscription-gating-and-expiry` 的 3.3（开闸）**依赖本变更完成**
- 可能新增 Partner API 凭据（取决于实验结果）
