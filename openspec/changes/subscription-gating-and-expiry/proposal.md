## Why

**订阅状态从来不参与服务判定。** 服务链路上唯一的闸门是回答次数：

```ts
async assertWithinQuota(shopDomain) {
  const usage = await this.usage(shopDomain);
  if (usage.exhausted) throw new QuotaExceededError(usage);   // 只看次数
  return usage;
}
```

对 `apps/api/src/{quota,adp,public-storefront}` 搜 `frozenAt` / `FROZEN` /
`CANCELLED` / `EXPIRED` / `status === 'ACTIVE'`——**零命中**。
`frozenAt` / `unfreezeBy` 只出现在 `ops/`，那是运营台的展示与管理，不参与判定。

取套餐时也不筛状态：

```ts
private async planCodeFor(shopId) {
  const sub = await findFirst({ where: { shopId } });   // 无 status 条件
  return planOf(sub?.planCode).code;                     // 取不到 → 默认档
}
```

**生产实况**（`chatbotdomaintest`，2026-09-09 核查）：

```
planCode = basic   status = ACTIVE   currentPeriodEnd = 2025-08-25
```

周期结束日停在**一年多以前**，应用仍在正常服务。这不是判定出错——是这条判定
压根没写。更糟的是 `QuotaService.periodStart` 里那段「按整周期推进到包含现在的
那一期」：它为修另一个 bug（陈旧 `currentPeriodEnd` 会把额度永久钉死）而加，
副作用是**让过期订阅每 30 天自动续一次免费额度**。

同时 `sendDunning` 只往 `KnowledgeSyncJob` 写一条 `queued`，附注
"email dispatch pending — job queued for outbound worker"——**那个 worker 不存在**，
催缴邮件从未发出过。

## What Changes

- 服务链路新增订阅状态闸门，位置在配额检查**之前**（与 `human` 接管闸门同一处）。
- 计费周期把**试用期排除在外**：周期从试用结束起算，试用期内不消耗周期。
- 到期后给 **2 天宽限**，宽限内照常服务；宽限结束才停。
- 到期前 **连续三天**（D-3 / D-2 / D-1）提醒商家。
- 付款恢复即**解冻**，无需人工干预。
- `planCodeFor` 按状态筛选，不再拿一条作废订阅的档位当额度依据。
- `periodStart` 不再为已失效的订阅无限推进周期。

**不在本次范围**：套餐价格与档位定义（`ADR-14` 已定）、Shopify 托管计费的
下单流程（商家在 Shopify 界面选，不走本服务）、多店计费分摊（`isBillingShop`
已有逻辑）、运营台的手工解冻（`ops` 已有）。

## Capabilities

### New Capabilities
- `subscription-gating`: 订阅状态决定是否提供 AI 服务——哪些状态放行、哪些拦下、顾客与商家各看到什么
- `subscription-billing-period`: 计费周期的计算——试用期排除、宽限窗口、失效订阅不再自动续期
- `expiry-notification`: 到期前的连续提醒——触发时机、去重、送达

### Modified Capabilities
<!-- 本变更不修改已归档 capability 的既有需求 -->

## Impact

**数据库**
- `Subscription`：可能需要 `gracePeriodEnd`（或由 `currentPeriodEnd + 2d` 派生）
- 提醒去重需要记录「某店某周期已提醒到第几天」，否则重启或重复执行会重复发

**API（`apps/api`）**
- `quota.service.ts`：`assertWithinQuota` 加状态闸门；`planCodeFor` 筛状态；
  `periodStart` 改写（试用排除 + 不再无限推进）
- `adp.service.ts`：被拦下时的顾客话术与会话状态（复用额度耗尽那条路径）
- 新增提醒的触发与发送

**依赖与前置**
- **`app_subscriptions/update` webhook 必须可靠**——它是「付款解冻」唯一的知情
  渠道（`ADR-14`）。该 webhook 2026-09-09 前因密钥错误全线 401，现依赖
  `SHOPIFY_API_SECRET_PREVIOUS` 才能通过，属未收尾状态。
- **仓库没有任何调度器**（无 `@nestjs/schedule`、无 cron），而「连续三天提醒」
  需要按天触发。见 design 的 D4。
- **`sendDunning` 不真发邮件**——排进 `KnowledgeSyncJob` 等一个不存在的 worker。
  提醒要真送达，得先解决出站通道。

**治理**
- 「订阅失效即停服」是产品语义的不可逆选择（判错会误停付费商家），
  结论应入 `DECISIONS.md`，本 change 只描述行为。
