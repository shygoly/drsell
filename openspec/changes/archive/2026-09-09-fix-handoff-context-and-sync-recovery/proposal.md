## Why

三个在代码核查中确认的缺陷，都属于「已经对外承诺、但结构上兑现不了」，不是架构优化。

**F1 — 人工接管是假的，而顾客已经被承诺了人工。**
商家收件箱的接管 / 解决 / 发送三个动作全是纯 React 本地 state，一个请求都不发
（`apps/storefront/src/app/inbox/inbox-client.tsx:110`、`:117`、`:125`）；
后端 `StorefrontDashboardController` 六个路由**全是 `@Get`**，没有任何写路径。
`ChatThread.status` 的 `'human'` 取值在整个后端**没有一处写入**。
与此同时，配额耗尽时会话被转成 `'pending'` 并对顾客说
"the store team will follow up"（`apps/api/src/adp/adp.service.ts:93`、`:10`）——
商家侧没有回复能力，这是一句结构上无法兑现的承诺。

连带三处指标失真：`getStats().aiResolution` 按 `status === 'ai'` 的会话占比计算，
由于 `'human'` 永远写不进去，该值恒定接近 100%；
30 天图表的 human 序列恒为零，且它按**会话数**计，同图的 ai 序列按**消息数**计
（`aiResolvedCount` 每条消息 +1），两个序列单位不同；
`avgFirstResponseSec: 12` 是硬编码常量。

**F2 — 会话上下文不在自己库里。**
`OpenClawClient.chatStream` 每次只发**单条** message，多轮记忆靠
`x-openclaw-session-key` 存在 OpenClaw 侧；`ChatMessage` 表是模型回完之后才写的日志
（`apps/api/src/adp/adp.service.ts:123`），不是上下文来源。
OpenClaw 会话一丢（重启、profile 变更、token 轮换），历史无法从本地库重建。
同时 system prompt 是**拼在用户消息前缀**里的一段硬编码英文，不是 system role。

**F3 — 同步任务能把自己永久锁死。**
`runSyncJob` 是 `void` 出去的进程内异步（`apps/api/src/shopify/shopify.service.ts:318`）。
进程在同步中途重启，job 永远停在 `'running'`，而 `:308` 的
`if (running) continue` 守卫会让该店该类目的同步**再也不启动**——
商品目录静默停止更新，agent 继续用旧数据回答，无任何告警。

**为什么是现在**：F1 直接影响顾客承诺，F3 是静默数据陈旧。
F2 单独看不紧急，但接管落地后商家消息必须进入模型上下文，
不先把上下文收回本地库，F1 修完仍然是半截。

## What Changes

- `ChatThread.status` 从裸 `String` 收成受控词表 `ai | pending | human | closed`，
  并新增商家侧写路径：接管、回复、关闭。
- `ChatMessage.role` 新增 `agent`（商家人工消息），与 `user` / `assistant` 区分。
- `proxyChatSse` 开头加应答闸门：`human` 状态下 AI 不得应答（今天没有这道闸门，
  人接管了 AI 照样抢答）。
- 顾客侧新增消息拉取端点 + widget 轮询——**商家回复目前没有任何送达通道**。
- 多轮上下文改为从 `ChatMessage` 组装后整体发给网关；system prompt 改用 system role。
- 会话指标重算：ai / human 两个序列统一按**会话数**、统一时间窗；
  `aiResolution` 更名为反映真实定义的 deflection rate；移除硬编码的
  `avgFirstResponseSec`，改为真实计算或不返回。
- `KnowledgeSyncJob` 增加心跳与启动时超时清理，解开 F3 的永久死锁。

**不在本次范围**：Agent 写工具（退款 / 取消 / 改地址）、Control Space、
Intent 分类、RAG / Embedding、Commerce Connector 抽象、任务队列基础设施。

## Capabilities

### New Capabilities
- `conversation-handoff`: 会话在 AI 与人工之间的归属与迁移——状态词表、商家写路径、AI 应答闸门、商家回复的送达
- `conversation-context`: 会话上下文的所有权——多轮消息由本地库组装、system prompt 的承载方式、推理后端可替换性
- `conversation-metrics`: 会话指标的定义与单位一致性——分流率、图表序列、响应时长
- `sync-job-recovery`: 目录同步任务的失败恢复——心跳、超时判定、启动清理

### Modified Capabilities
<!-- openspec/specs/ 为空，本变更是该仓库首个 OpenSpec change，无既有 capability 被修改 -->

## Impact

**数据库（Prisma / 迁移）**
- `ChatThread`：`status` 收成枚举；新增 `closedAt`、`handedOverAt`
- `ChatMessage`：`role` 增加 `agent` 取值
- `KnowledgeSyncJob`：新增 `heartbeatAt`
- `ChatStatDaily`：`aiResolvedCount` 语义变更（消息数 → 会话数），需数据回填决策

**API（`apps/api`）**
- `storefront-dashboard.controller.ts`：新增 3 条写路由（接管 / 回复 / 关闭），
  首次出现非 `@Get` handler
- `storefront-dashboard.service.ts`：`getStats` / `getChart` 重算
- `adp.service.ts`：应答闸门、上下文组装、计数口径
- `shopify.service.ts`：`runSyncJob` 心跳 + 启动清理
- `public-storefront.controller.ts`：新增顾客侧消息拉取端点

**包（`packages/openclaw`）**
- `chatStream` 签名从单条 `message` 改为 `messages` 数组 + `systemPrompt`；
  `x-openclaw-session-key` 是否保留需在 design 中决策

**扩展（`apps/web/extensions/chatbot`）**
- widget 增加轮询。**硬约束**：`assets/drsell-chat.js` 现为 9308 字节，
  `spec/check-widget-asset.mjs` 阈值 10000 字节，**余量 692 字节**，
  且该检查器同时断言产物与 `widget-src/` 一致。
  产物必须提交（`shopify app deploy` 从工作区打包，不跑本仓构建）。

**前端（`apps/storefront`）**
- `inbox-client.tsx` 三个 handler 接真实 API；`lib/types.ts` 状态类型同步

**治理**
- 首次引入 `openspec/`。本仓 `AGENTS.md` 是 agent 指引唯一事实来源，
  故 `openspec init` 以 `--tools none` 执行，未向 `CLAUDE.md` / `AGENTS.md` 注入托管块；
  是否在 `AGENTS.md` 增加一行指针留待本变更 review 时决定。
- 新增非 `@Get` handler 会触及 `INV-3` 的审计约定边界——
  但 `spec/check-ops-audit.mjs` 只扫 ops 控制器，商家侧写操作是否需要审计需在 design 中决策。
