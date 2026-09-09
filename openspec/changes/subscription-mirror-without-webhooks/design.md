# Design

## Context

镜像的唯一写入路径是 `syncFromShopify`，它唯一的调用方是一个已停发的 webhook。
现状不是「同步慢」或「偶尔漏」，是**一次都不会发生**。

现有 `syncFromShopify` 走 Admin API：

```graphql
{ currentAppInstallation { activeSubscriptions { id name status test currentPeriodEnd } } }
```

它今天确实读得到 `chatbotdomaintest` 的订阅——但那是 2025-07 创建的**遗留测试订阅**
（文档：4-28 之前开发店选套餐会创建测试订阅）。**能读到旧的，不等于能读到新的。**

## Goals / Non-Goals

**Goals**

- 镜像在商家做出改变后的可接受时间内反映事实
- 判定路径永不因为同步而阻塞顾客对话
- 「刚安装、还没选套餐」不被当成「订阅失效」

**Non-Goals**

- 不重建计费本身。商家仍在 Shopify 界面选套餐（App Pricing），
  我们只负责知情
- 不追求秒级一致。有 2 天宽限窗口（`ADR-18`）兜底，分钟级足够

## 先决实验

### E1：Admin API 还能不能读到 App Pricing 的订阅？

**这是设计分叉点，必须先做。** 文档明确说 App Pricing 的订阅状态来自 Partner API，
「与 Billing API 不同，后者从 GraphQL Admin API 取」——这暗示
`currentAppInstallation.activeSubscriptions` 可能看不到新体系下的订阅。

做法：在 `jade-shop-2024`（全新安装、无历史订阅）选一个套餐，然后对该店跑一次
`syncFromShopify`，看返回什么。

- **读得到** → D3 走 Admin API，零新凭据，改动最小
- **读不到** → D3 必须走 Partner API，需要新建 Partner API client 与令牌

在 E1 出结果之前不要写 D3 的实现代码——两条路的取数层完全不同。

## Decisions

### D1：商家选完套餐回跳时立即同步

App Pricing 在商家选定套餐后会重定向到我们配置的 redirection URL，并附带
`plan_handle`（外部链接还会附 `shop`）。这是**唯一一个「刚发生变化」的确定信号**，
必须用上：审核员选完套餐立刻回到应用，此时若还显示「没有有效套餐」，审核当场失败。

处理端收到回跳即同步，不依赖参数里的值——`plan_handle` 只作为「有变化」的触发信号，
权威值仍从 API 回查。**理由与原 webhook 处理一致：载荷里没有 `currentPeriodEnd`，
而配额周期要靠它。**

### D2：闸门判定时按陈旧度补同步，但**不阻塞**

回跳只覆盖「商家主动操作」。取消、冻结、周期自然结束都不产生回跳
（文档：这些情况要查 Partner API）。而这些恰恰是闸门要拦的情形。

做法：`assertSubscriptionServiceable` 读镜像时，若镜像超过 `MIRROR_STALE_AFTER`
未更新，**异步**触发一次同步，然后**用当前镜像作判定**。

为什么不同步等待：这条路径在顾客对话里。一次 Admin API 往返（含可能的令牌换发）
挂在顾客发消息与 AI 回复之间，是拿顾客体验换一点新鲜度。而 2 天宽限窗口本就
容得下分钟级滞后——第一条消息用旧镜像判定，之后就是新的。

同一店铺的并发触发要去重，否则一个活跃店铺会把 Admin API 打满。

### D3：取哪个 API —— 由 E1 决定

- Admin API（现有 `syncFromShopify`）：零新凭据，改动最小
- Partner API `activeSubscription(appId:, shopId:)`：文档指定的替代方案，
  返回合同实况（含 pending updates），但需要 org 级的 Partner API client 与令牌，
  且有独立的限流

**倾向 Admin API**（若 E1 通过）：少一份要保管的凭据（`AGENTS.md` 陷阱 6），
且 `syncFromShopify` 已经过生产验证。Partner API 留作 E1 不通过时的方案。

### D4：不建外部 cron

与 `subscription-gating-and-expiry` 的 D4 同一理由：外部 crontab 会在
`deploy-mvp.sh` 管不到的地方多一处配置。D1 + D2 已经覆盖「有人操作」与
「有顾客访问」两种情形；没有顾客访问的店，其判定结果也没人在等。

### D5：「已安装但尚未选套餐」不等于「订阅失效」

托管计费下，安装与选套餐是两个独立动作，中间必然存在一段没有订阅的时间。
当前 `evaluateServiceability` 对这段判 `no-subscription` → 不可服务。
开闸后，**每一个新装的店（包括审核员的）都会在选套餐之前处于停服状态**。

给安装后一段明确的宽限期，期间按试用处理。这与「试用期额度按 basic 档给」
（该 change 的 0.2）是同一条产品语义的延伸。

## Risks / Trade-offs

**R1 — E1 不通过则工作量翻倍（中）**
Partner API 需要新凭据、新客户端、新的错误处理与限流。
缓解：先做 E1，不在结果出来前写取数层。

**R2 — 判定用的仍是旧镜像（低）**
D2 异步刷新意味着「本次判定用旧值」。宽限窗口容得下，
且误判方向是**继续服务**而非误停——与 `ADR-18` 的取向一致。

**R3 — Admin API 调用量（低）**
按陈旧度触发 + 同店去重，活跃店铺每 `MIRROR_STALE_AFTER` 最多一次。

**R4 — 本变更未完成前不得开闸（高）**
`subscription-gating-and-expiry` 的 3.3 依据的是一份四个月未更新的镜像。
在数据源重建之前打开 `SUBSCRIPTION_GATE_ENFORCE`，等于按四个月前的快照停服。
