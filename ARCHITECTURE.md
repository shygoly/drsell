# ARCHITECTURE.md — 工程架构与不可逆决策论证

> 本文件是 `INV-n` / `ADR-n` / `B-n` 的**出处文档**（论证锚点）。
> 登记册见 [`DECISIONS.md`](DECISIONS.md)；UI 反模式见 [`DESIGN.md`](DESIGN.md)。
> 机器校验：`pnpm spec`（`spec/check-links.mjs` 校验锚点，`spec/check-boundaries.mjs` 校验边界）。

## 0. 全景

```
Shopify 店铺 → storefront (Remix 风格 Next, :3100) → api (NestJS, :3001) → PostgreSQL
商家内嵌后台 → web (Polaris, :3000) ──────────────┘
运营台       → ops (Next, :5013) ─────────────────→ api /ops/*（superadmin 审计全写）
```

- `apps/storefront`：商家端店铺前台 + AIChat 商家后台（Stitch 商户浅色主题）。
- `apps/web`：Shopify OAuth / webhook / App Bridge 内嵌路径。
- `apps/ops`：drsell Ops SuperAdmin Portal（Stitch 超管深色主题）。
- `apps/api`：统一 API 层，租户数据以 `Shop` 为根（`INV-1`），运营写操作全审计（`INV-3`）。
- `packages/*`：共享库，不得反向依赖 `apps/*`（`B-1`）。

## 1. INV — 不变量论证

### `INV-1`

所有租户数据必须经 `Shop` 外键可达（`tenantId` 或 `shopId`）。
**为什么**：多租户隔离是账单、审计、数据清除的前提；软关联会让 `DELETE shop` 或
结算聚合漏行。**守护**：DB 外键约束 + `spec/check-ratchet.mjs` 软关联模型计数棘轮。
**已知偏离**：`MailSubscriber` / `KnowledgeSyncJob` / `ChatStatDaily` 仍用
`shopDomain: String` 软关联，计入 `spec/.unguarded-baseline.json` 欠账棘轮，只降不升。

### `INV-2`

`adp_reader` 不得持有任何表、视图或序列的权限。
**为什么**：ADP 智能体直连 PG，能力边界必须靠数据库角色锁死；应用层判断可被绕过。
**守护**：`apps/api/prisma/sql/adp-reader.sql` 授权脚本 + `scripts/verify-adp-isolation.sh` 断言 1–8。

### `INV-3`

运营台的每一次写操作都必须留下审计记录（操作者、对象店铺、动作、时间）。
**为什么**：运营台能改真实商家的订阅、计费与解冻窗口；无审计即无追责。
**守护**：`spec/check-ops-audit.mjs` 扫描 ops controller 的写 handler 是否标注 `@Audit`；
`apps/api/src/ops/` 审计日志写入 `AuditLog` 表。

## 2. ADR — 架构决策论证

### `ADR-1`

pnpm 8.15.4 + turbo 2.5 workspace，包在 `apps/*` 与 `packages/*`。
**为什么**：四端共享同一 PostgreSQL 与 Prisma 生成物，单仓能保证 schema 与 API client 同步。
**守护**：`pnpm-workspace.yaml` + `turbo.json`。

### `ADR-2`

api 监听 3001，全局前缀 `api`。
**为什么**：开发态与 nginx 生产态路径一致，避免 CORS / cookie 路径双轨。
**守护**：`apps/api/src/main.ts`（当前未配自动校验）。

### `ADR-3`

开发：web 3000 / storefront 3100；生产：`drsell-storefront` 占 :5010。
**为什么**：三个 Next 实例同机部署，端口即服务边界，pm2 名称与 nginx 反代一一对应。
**守护**：`apps/storefront/package.json` + `scripts/deploy-mvp.sh`。

### `ADR-4`

持久化用 Prisma 6 + PostgreSQL。
**为什么**：Node 服务用 Prisma 的迁移与类型安全；PG 支持行级安全与 `adp_reader` 角色隔离。
**守护**：`apps/api/prisma/schema.prisma`。

### `ADR-5`

api 全局 ValidationPipe：`whitelist` + `forbidNonWhitelisted`。
**为什么**：未知字段直接 400，避免手写 DTO 漏校验。
**守护**：`apps/api/src/main.ts`（当前未配自动校验）。

### `ADR-6`

双设计系统并存：web = Polaris 13，storefront = shadcn/Tailwind v4。
**为什么**：web 是 Shopify App Bridge 内嵌，必须用 Polaris；storefront 是营销页 + AIChat
后台，要 Stitch 商户浅色主题，Polaris 表达不了。两套面靠域名与包边界分开（`B-2`/`B-3`）。
**守护**：`apps/storefront/package.json` + `spec/check-boundaries.mjs`。

### `ADR-7`

ADP 智能体经 `adp_reader` 直连 PG，仅可执行 `adp_*` 函数。
**为什么**：ADP 需要自然语言查数；给它表权限等于把租户库交给模型。函数白名单是唯一稳定边界。
**守护**：`apps/api/prisma/sql/adp-reader.sql` + `scripts/verify-adp-isolation.sh`。

### `ADR-8`

`Shop.accessToken` 落库 AES-256-GCM 加密（`SHOP_ACCESS_TOKEN_KEY`）。
**为什么**：token 一旦拖库可冒充商家；加密后数据库泄漏不直接等于凭据泄漏。
**守护**：`apps/api/src/crypto/shop-token-cipher.ts`。

### `ADR-9`

客服对话经 wjclaw 本地 OpenClaw Gateway（`--profile drsell` :18790），不再调腾讯 ADP。
**为什么**：客服回复延迟与数据合规；本地网关可审计、可回放、不依赖外部云。
**守护**：`packages/openclaw` + `infra/openclaw/drsell/`。

### `ADR-10`

`drsell.szchada.top` 根路径由 `apps/storefront` 服务（pm2 `drsell-storefront` :5010）；`apps/web` 暂停生产部署。
**为什么**：商家端主要流量在 storefront 营销页；web 只保留 OAuth/webhook 内嵌职责，避免双入口。
**守护**：`scripts/deploy-mvp.sh`。

### `ADR-11`

运营台是独立应用 `apps/ops`，独立 `server_name` `ops.szchada.top`；商家端不得存在 `/admin` 或 `/ops` 路由。
**为什么**：运营面与商家面 cookie/token/CSP 完全不同；同域会互相污染登录态与审计边界。
**守护**：`infra/nginx/ops.szchada.top.conf` + `spec/check-ops-entry.mjs`。

### `ADR-12`

运营台第三套设计令牌（`apps/ops/app/tokens.css` → `globals.css` shadcn 映射），经
`stitch-to-shadcn-pro` + Tailwind v4 + shadcn/ui 落地；禁止 Polaris。
**为什么**：运营台要还原 Stitch 超管深色稿；Polaris 的 Shopify 绿会破坏「运营/商家两面不可认错」。
**守护**：`apps/ops/app/globals.css` + `.stitch/` + `spec/check-design.mjs` + `DS-10`。

### `ADR-13`

本地订阅状态只镜像 Shopify `AppSubscriptionStatus` 的六个取值，不自造状态词。
**为什么**：自造状态词（如 `PAID`）会与 Shopify webhook 事实漂移，账单对不上。
**守护**：`apps/api/prisma/schema.prisma` + `spec/check-ops-status.mjs`。

### `ADR-14`

套餐只有两档，定义在 `@drsell/shared` 的 `PLANS`：basic $15/1500 次 AI 回答、
pro $30/5000 次。计费与配额都从这里读，listing 文案必须与之一致。
**为什么**：此前价格散在 `BILLING_PLAN_PRICE` 等环境变量里，生产按回落值实收
$9.90，而 listing 打算写两档——**在 Shopify 上宣传做不到的计费方式是驳回项**。
把价格与额度收进一个常量，是让「表单写的」和「实际收的」不可能分叉的唯一办法。
计数单位是一次**成功的** AI 回答；闸门在调模型之前，超额不产生上游成本。

两档在 Partner 后台以 Shopify **托管计费（App Pricing）** 方案存在，
plan name 与 internal handle 刻意对齐 `PLANS`（`Basic`/`basic`、`Pro`/`pro`）。
托管计费下商家是在 **Shopify 自己的界面**选套餐的，不经过 `createCharge`——
所以 `app_subscriptions/update` webhook 是我们唯一能知道他选了哪一档的途径。
不接这个 webhook，付 $30 的 Pro 商家会被 `QuotaService` 当成 basic 只给 1500 次额度：
收了钱不给货，且全程无报错。套餐名对不上时**不动 `planCode`**，宁可保持原样，
也不把付费商家悄悄降级。
**守护**：`packages/shared/src/index.ts` + `spec/check-pricing.mjs`
+ `apps/api/src/subscription/billing.service.spec.ts`。

### `ADR-15`

模型走「主 + 备」：primary `deepseek-v4/deepseek-v4-pro`，
fallbacks `zhipu/glm-4.5-flash`。OpenClaw 把 402/余额不足归为 `billing` 失败并
自动切到备用模型。
**为什么**：单一 provider 的 key 一旦欠费，**全部商家的客服对话同时失败**，
而这属于我们向商家收了钱的核心功能。备用链路让欠费从「立即全线中断」降级为
「变慢、变笨，但仍在回答」。选 `glm-4.5-flash` 是因为已验证它支持本链路依赖的
tool calling（`adp_search_products` 等），换别的模型前必须重新验证这一点——
不支持 tool calling 的模型会一本正经地编造商品，比报错更糟。
primary **不要改**：它正在服务生产对话（见 `AGENTS.md` 陷阱 1）。
**守护**：`infra/openclaw/drsell/openclaw.json.example` + `setup-wjclaw.sh`
（服务器重建即复现该配置）。

### `ADR-16`

会话状态是数据库枚举 `ChatThreadStatus`（`ai` / `pending` / `human` / `closed`），
所有迁移经 `ConversationService` 这一个写入口。
**为什么**：裸 `String` 让 `'human'` 变成一个前端自说自话、后端从不写入的幽灵取值——
商家点「接管」只改了 React state，刷新即失效；而仪表盘的分流率据此计算，于是恒为
100%，30 天图表的人工序列恒为零。同期配额耗尽的会话已经对顾客承诺
"the store team will follow up"，却没有任何兑现路径。词表放在应用层守不住：
一次漏改就又长出第二个真相。放在数据库，写错即 5xx。
**守护**：Prisma enum → PostgreSQL enum 类型约束；
`apps/api/src/adp/adp.service.spec.ts` 断言四种状态各自的分支，
其中 `human` 分支必须零上游调用、零配额消耗。

### `ADR-17`

会话上下文的所有权在本地库：每次推理由 `ChatMessage` 组装完整 `messages` 数组，
system prompt 以独立 `system` 角色发出；网关侧会话键仅用于日志关联与限流。
**为什么**：原实现每次只发单条消息，多轮记忆存在 OpenClaw 的 `x-openclaw-session-key`
里，`ChatMessage` 只是事后写的日志。网关重启 / profile 变更 / token 轮换都会让记忆
消失，而历史无法从本地库重建。这也是 `ADR-15` 的前提——备用模型是**自动**切换的，
记忆若在网关侧，切换时的上下文语义是不明确的。同时 system prompt 原先拼在用户消息
前缀里，顾客可以把它当普通文本对待；移到 system 角色后，店铺域由服务端注入，
正文里伪造 `[shop=...]` 无效。
**注意**：这条只降低 prompt injection 的难度，不消除它。真正的边界仍是
`adp_reader` 的零表权限（`INV-2`）——即使模型被说服，它也只能调那三个只读函数。
**守护**：`packages/openclaw` 的接口只收 `messages` + `systemPrompt`，
不泄漏网关专有语义；`adp.service.spec.ts` 断言网关记忆缺失时仍能从本地库重建上下文。

## 3. B — 边界规矩论证

### `B-1`

`packages/*` 不得 import `apps/*`。
**为什么**：共享库反向依赖应用会导致循环与不可独立发布。
**守护**：`spec/check-boundaries.mjs`。

### `B-2`

`apps/storefront` 不得引入 `@shopify/polaris`。
**为什么**：storefront 是 shadcn/Tailwind v4 体系（`ADR-6`），引入 Polaris 会带进第二套
样式与商家绿令牌，撞 `DS-8`。
**守护**：`spec/check-boundaries.mjs`（剥离注释后匹配）。

### `B-3`

`apps/web` 不得引入 tailwind / shadcn / radix。
**为什么**：web 是 Polaris 体系，混入 Tailwind 会让 OAuth/webhook 内嵌页长出不守令牌的样式。
**守护**：`spec/check-boundaries.mjs`。

### `B-4`

`apps/ops` 不得 import `apps/web` / `apps/storefront`。
**为什么**：运营台是独立部署（`ADR-11`），import 商家端组件等于把其样式与依赖拖进超管面。
**守护**：`spec/check-boundaries.mjs`。

### `B-5`

`apps/storefront` / `apps/web` 不得 import `apps/ops`。
**为什么**：运营台组件含审计与超管逻辑，商家端绝不能引用。
**守护**：`spec/check-boundaries.mjs`。
