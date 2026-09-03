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
