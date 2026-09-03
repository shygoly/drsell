# DECISIONS.md — 决策登记册（ID 命名空间唯一权威）

> **本文件是登记册，不是论证书，也不是日志。** 每条只占一行：ID + 一句话 + 结论 + 出处。
> **论证与推导留在出处文档**，不在此复制——复制即制造第二个事实来源。
>
> **机器校验**：`pnpm spec`（已挂进 `pnpm test`）。
> 代码或元语文档里出现的 ID **必须在本册**，否则测试红。
>
> **新增决策**：按对应命名空间递增，写进本册 + 在出处文档补论证，**同一提交**。
> **待定项唯一位置 = 本册的「待定」节**。决出后入册 + 销项，**同一提交**。

---

## 0. 命名空间

| 前缀 | 含义 | 出处（论证在此） | 数量 |
|---|---|---|---|
| `INV-n` | **不变量**：任何实现都不得违反的硬约束 | [`ARCHITECTURE.md`](ARCHITECTURE.md)（子项目 3 创建） | 3 |
| `ADR-n` | **架构决策**：工程层不可逆选择 | [`ARCHITECTURE.md`](ARCHITECTURE.md)（子项目 3 创建） | 13 |
| `B-n` | **边界规矩**：模块/包之间的硬边界 | [`ARCHITECTURE.md`](ARCHITECTURE.md)（子项目 3 创建） | 5 |
| `DS-n` | **UI 反模式**：呈现层禁止事项 | [`DESIGN.md`](DESIGN.md) | 10 |

> `ARCHITECTURE.md` 等出处文档在子项目 3/4 尚不存在。`check-links.mjs` 对其放行并打印 WARN，
> 子项目 3/4 创建对应文件时从白名单移除。

---

## 1. INV — 不变量

| ID | 内容 | 守护层 |
|---|---|---|
| `INV-1` | 所有租户数据必须经 `Shop` 外键可达（`tenantId` 或 `shopId`） | DB 外键约束；**未配** |
| `INV-2` | `adp_reader` 不得持有任何表、视图或序列的权限 | `scripts/verify-adp-isolation.sh` 断言 1–8 |
| `INV-3` | 运营台的每一次写操作都必须留下审计记录（操作者、对象店铺、动作、时间） | `spec/check-ops-audit.mjs` |

---

## 2. ADR — 架构决策

| ID | 内容 | 锁定依据 | 状态 |
|---|---|---|---|
| `ADR-1` | pnpm 8.15.4 + turbo 2.5 workspace，包在 `apps/*` 与 `packages/*` | `pnpm-workspace.yaml` | 已守护 |
| `ADR-2` | api 监听 3001，全局前缀 `api` | `apps/api/src/main.ts` | 未配 |
| `ADR-3` | 开发：web 3000 / storefront 3100；生产：`drsell-storefront` 占 :5010 | `apps/storefront/package.json` + `scripts/deploy-mvp.sh` | 已守护 |
| `ADR-4` | 持久化用 Prisma 6 + PostgreSQL | `apps/api/prisma/schema.prisma` | 已守护 |
| `ADR-5` | api 全局 ValidationPipe：`whitelist` + `forbidNonWhitelisted` | `apps/api/src/main.ts` | 未配 |
| `ADR-6` | 双设计系统并存：web = Polaris 13，storefront = shadcn/Tailwind v4 | `apps/storefront/package.json` | 已守护 |
| `ADR-7` | ADP 智能体经 `adp_reader` 直连 PG，仅可执行 `adp_*` 函数 | `apps/api/prisma/sql/adp-reader.sql` + `scripts/verify-adp-isolation.sh` | 已守护 |
| `ADR-8` | `Shop.accessToken` 落库 AES-256-GCM 加密（`SHOP_ACCESS_TOKEN_KEY`） | `apps/api/src/crypto/shop-token-cipher.ts` | 已守护 |
| `ADR-9` | 客服对话经 wjclaw 本地 OpenClaw Gateway（`--profile drsell` :18790），不再调腾讯 ADP | `packages/openclaw` + `infra/openclaw/drsell/` | 已守护 |
| `ADR-10` | `drsell.szchada.top` 根路径由 `apps/storefront` 服务（pm2 `drsell-storefront` :5010）；`apps/web` 暂停生产部署 | `scripts/deploy-mvp.sh` | 已守护 |
| `ADR-11` | 运营台是独立应用 `apps/ops`，独立 `server_name` `ops.szchada.top`；商家端不得存在 `/admin` 或 `/ops` 路由 | `infra/nginx/ops.szchada.top.conf` + `spec/check-ops-entry.mjs` | 已守护 |
| `ADR-12` | 运营台第三套设计令牌（`apps/ops/app/tokens.css` → `globals.css` shadcn 映射），经 `stitch-to-shadcn-pro` + Tailwind v4 + shadcn/ui 落地；禁止 Polaris | `apps/ops/app/globals.css` + `.stitch/` + `spec/check-design.mjs` | 已守护 |
| `ADR-13` | 本地订阅状态只镜像 Shopify `AppSubscriptionStatus` 的六个取值，不自造状态词 | `apps/api/prisma/schema.prisma` + `spec/check-ops-status.mjs` | 已守护 |

---

## 3. B — 边界规矩

| ID | 内容 | 状态 |
|---|---|---|
| `B-1` | `packages/*` 不得 import `apps/*` | `spec/check-boundaries.mjs` |
| `B-2` | `apps/storefront` 不得引入 `@shopify/polaris` | `spec/check-boundaries.mjs`（剥离注释后匹配） |
| `B-3` | `apps/web` 不得引入 tailwind / shadcn / radix | `spec/check-boundaries.mjs` |
| `B-4` | `apps/ops` 不得 import `apps/web` / `apps/storefront` | `spec/check-boundaries.mjs` |
| `B-5` | `apps/storefront` / `apps/web` 不得 import `apps/ops` | `spec/check-boundaries.mjs` |

---

## 4. DS — UI 反模式

| ID | 内容 | 状态 |
|---|---|---|
| `DS-1` | 业务/布局组件禁止硬编码尺寸（`-[Npx]` 任意值） | `scripts/check-stitch-gate.sh` |
| `DS-2` | 业务/布局组件禁止硬编码十六进制颜色 | `scripts/check-stitch-gate.sh` |
| `DS-3` | 禁止 Material Symbols 图标字体残留（应为 lucide-react） | `scripts/check-stitch-gate.sh` |
| `DS-4` | 禁止 Tailwind CDN 引用 | `scripts/check-stitch-gate.sh` |
| `DS-5` | `apps/storefront/src/app/globals.css` 须含 `--primary` / `--ring` / `--border` 令牌 | `scripts/check-stitch-gate.sh` |
| `DS-6` | 业务组件语义令牌引用次数 ≥ 10 | `scripts/check-stitch-gate.sh` |
| `DS-7` | `apps/ops` 源码禁止 hex 字面量，颜色只能来自 `tokens.css` | `spec/check-design.mjs` |
| `DS-8` | ops 令牌的 hex 值集合与 storefront 令牌的 hex 值集合交集必须为空 | `spec/check-design.mjs` |
| `DS-9` | `tokens.css` 须在 `:root`、`@media (prefers-color-scheme: dark)`、`:root[data-theme="dark"]` 三处定义**同一套**令牌名 | `spec/check-design.mjs` |
| `DS-10` | `apps/ops` 不得引入 `@shopify/polaris`（shadcn / tailwind 允许，见 ADR-12） | `spec/check-boundaries.mjs` |

---

## 6. 决策 ↔ 实现的已知偏离

> `性质` 列不可省略——*已改主意* 意味着代码是对的、登记册待更新；
> *未实现* 意味着登记册是对的、代码待补。**两者的修复方向完全相反。**

| ID | 在册结论 | 代码现状 | 性质 |
|---|---|---|---|
| `INV-1` | 租户数据经 `Shop` 外键可达 | `MailSubscriber` / `KnowledgeSyncJob` / `ChatStatDaily` 用 `shopDomain: String` 软关联，无外键；`MailSubscriber.shopDomain` 且可空 | 部分实现 |
| `DS-2` | UI 源码禁止 hex 字面量 | 守护面仅覆盖 `apps/storefront/src/components/{business,layout}`；`apps/web` 与 `apps/web/extensions/chatbot` 未纳入 | 部分实现 |

---

## 7. 待定（**唯一位置**）

> 每条必须写明「决出前禁止做什么」——**倾向本身会诱导预埋**，故倾向列一律为 `—`。

| # | 事项 | 倾向 | 决出前禁止 |
|---|---|---|---|
| `TBD-2` | `apps/web/extensions/chatbot` 的令牌唯一源 | — | 禁止扩大 hex 散点，现值为棘轮上限 |
| `TBD-3` | `apps/web` Shopify 嵌入后台恢复路径（子域或 `/shopify`） | — | 禁止改 Partner `application_url` 而不同步 nginx 与 OAuth 回调 |
| `TBD-4` | 运营台的角色模型（支持 / 财务 / 只读的权限切分） | — | 决出前禁止在 `apps/ops` 里写任何 role 分支，一律按 superadmin 全权 |
| `TBD-5` | 子项目 2 视觉回归的确定性来源（原方案依赖的 `FALLBACK_*` 种子数据已删除） | — | 禁止为了回归测试把种子数据加回 `apps/storefront/src/lib/api.ts` |

---

## 附录：格式契约（校验器解析规则）

1. §1–§4、§6、§7 表格首列是 ID，须用**反引号**包裹（使 grep 可区分 ID 与普通文本）。
2. 代码与元语文档中出现的 ID（**词边界**匹配）必须在册 —— 硬失败。
3. `INV-n.m` 按父编号 `INV-n` 查册。
4. 在册但全仓零引用 → **WARN，不红**。
5. 相对路径链接目标必须存在（`check-links.mjs` 白名单除外）。
6. **§1–§4 任一登记表解析为 0 行 = 格式契约破坏 = 红；§6/§7 少于 2 行 = 红。**
7. §0 声明的出处文档一旦存在，必须为该命名空间**每个在册 ID** 提供可定位论证锚点
   （形如 `### \`DS-3\``）。缺任一 = 红。出处文档仍在 `check-links.mjs` 白名单内时跳过。
