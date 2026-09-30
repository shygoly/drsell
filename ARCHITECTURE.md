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

### `INV-4`

`b2b-reg-roadmap` 的合规路线图，只有 `status=verified` 且带非空 `source_url` 的监管
字段才可作为权威输出；未核实或无出处的一律渲染为「待核实」，绝不断言。
**为什么**：家用器械跨境是法律动作，编造一个注册路径/文件清单/周期比缺数据糟得多
——它会诱导真实的选品与建站决策。本仓对器械资质的既有铁律（`b2b-research`：只收
verified、逐条带出处）在这里升格为不变量：**没有校验器能拦住「言之凿凿的幻觉」，
只能靠「无出处即不可输出」这条硬约束**。
**守护**：`.claude/skills/b2b-reg-roadmap/validate.mjs`（待建）——扫描被输出的每个监管
字段是否 verified + 非空 source_url + as_of 在新鲜窗口内；引用了某国但该国包未
verified 时，断言引擎确实降级为「待核实」。

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

客服对话经 `apps/api` 进程内 Pi SDK（`packages/openclaw` 的 `PiSupportClient`），
不再经 OpenClaw Gateway，也不再调腾讯 ADP。
**为什么**：OpenClaw 网关以 root 跑、共享 workspace、另有 gateway token 一面；
Pi 本来就是网关内部的 agent 循环，拆掉中间层后工具白名单可以在 `createAgentSession`
里硬编码，延迟与闸门仍在 api。回滚窗口保留 HTTP `OpenClawClient`（`CHAT_AGENT=openclaw`）。
**守护**：`packages/openclaw/src/pi-client.ts` + `packages/openclaw/src/tool-allowlist.ts`。

### `ADR-19`

Pi `tools` **白名单** = 本次允许的 `adp_*`（Shopify 三个，Medusa 两个商品工具）。
编码工具（`bash`/`read`/`write`/`edit`/`exec`）与 `adp_get_after_sales` 不得出现在
`createAgentSession({ tools })` 里；`noTools: "builtin"` 与白名单同时设。
**为什么**：OpenClaw 的 `tools.deny` 是黑名单，新内置工具默认可用——2026-09-13
生产网关实测 `write`/`exec` 真的能执行。Pi 的 `tools` 数组是 allowlist，custom tools
与它一起传入，不再踩 OpenClaw `tools.allow` 在 MCP 注册前解析导致 fail closed 的时序坑。
**禁止**再引入 OpenClaw `tools.allow` 式 MCP 配置。真正的数据边界仍是 `INV-2`
（`adp_reader` 零表权限）。
**守护**：`packages/openclaw/src/tool-allowlist.ts`（静态断言）+ custom tools 单测。

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
我们必须有独立途径知道他选了哪一档。知道不了，付 $30 的 Pro 商家会被
`QuotaService` 当成 basic 只给 1500 次额度：收了钱不给货，且全程无报错。
套餐名对不上时**不动 `planCode`**，宁可保持原样，也不把付费商家悄悄降级。

**2026-09-09 更正**：本条原文写「`app_subscriptions/update` webhook 是我们唯一能
知道他选了哪一档的途径」——**该 webhook 已不存在**。Shopify 文档：
「After April 28, 2026, Shopify App Pricing no longer sends webhooks for
subscription changes.」而它曾是 `syncFromShopify` 的唯一调用方，于是镜像四个月
没有任何数据源：生产上 `chatbotdomaintest` 的 `currentPeriodEnd` 因此停在
2025-08-25 整整一年。

现在的途径有两条，都不依赖 webhook（见
`openspec/changes/subscription-mirror-without-webhooks`）：商家选完套餐回跳时
立即回查；闸门判定发现镜像陈旧时异步补查。取数仍走 Admin API 的
`currentAppInstallation.activeSubscriptions`——2026-09-09 实测它读得到新体系下
创建的订阅，故不需要 Partner API，也就不需要多一份凭据。
**守护**：`packages/shared/src/index.ts` + `spec/check-pricing.mjs`
+ `apps/api/src/subscription/billing.service.spec.ts`。

### `ADR-15`

模型走「主 + 备」：primary `deepseek-v4/deepseek-v4-flash`，
fallbacks `zhipu/glm-4.5-flash`。`PiSupportClient` 捕获 402 / billing 后，
用**同一组 messages 与同一组 `adp_*` 工具**再跑 GLM。
**为什么**：单一 provider 的 key 一旦欠费，**全部商家的客服对话同时失败**，
而这属于我们向商家收了钱的核心功能。备用链路让欠费从「立即全线中断」降级为
「变慢、变笨，但仍在回答」。
**换模型的前置条件**：必须先验证它支持本链路依赖的 tool calling
（`adp_search_products` 等）——不支持 tool calling 的模型会一本正经地编造商品，
比报错更糟。切生产前跑 `scripts/probe-glm-tools.mjs`。
**注意主备同 key**：`deepseek-v4-flash` 与 `deepseek-v4-pro` 共用同一个
provider key，所以在 primary 上换 DeepSeek 型号**解决不了欠费**——
billing 失败时唯一有效的备用是另一个 provider（`zhipu`）。
**已实测发生过**：2026-09-08 生产日志出现
`decision=fallback_model reason=billing from=deepseek-v4/deepseek-v4-pro`
→ `candidate_succeeded ... zhipu/glm-4.5-flash`，本条备用链路在网关时代真的兜住过；
切 Pi 后等价日志为 `event=chat_agent_fallback reason=billing`。
**守护**：`packages/openclaw/src/pi-client.ts` + `packages/openclaw/src/billing.ts`
+ `scripts/probe-glm-tools.mjs`。

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
system prompt 以独立 `system` 角色发出（Pi `DefaultResourceLoader.systemPrompt`）。
Pi 使用 `SessionManager.inMemory()`，**每请求新建 session 并 `dispose`**，不落盘、不复用。
**为什么**：多轮记忆若在网关/agent 侧，重启与主备切换时语义不明确；本地库可以重建。
system prompt 不拼进用户消息前缀，店铺域由服务端注入，正文里伪造 `[shop=...]` 无效。
**注意**：这条只降低 prompt injection 的难度，不消除它。真正的边界仍是
`adp_reader` 的零表权限（`INV-2`）——即使模型被说服，它也只能调那三个只读函数。
**守护**：`packages/openclaw` 的接口只收 `messages` + `systemPrompt`；
`adp.service.spec.ts` 断言从本地库重建上下文；Pi in-memory 由 `pi-client` 单测覆盖。

### `ADR-18`

订阅状态是服务的前置条件：只有 `ACTIVE`、试用期内、或到期后 2 天宽限窗口内的
店铺才得到 AI 回答；闸门位于配额检查之前。
**为什么**：此前服务链路只看回答次数，从不看订阅状态——对
`apps/api/src/{quota,adp,public-storefront}` 搜 `frozenAt`/`FROZEN`/`CANCELLED`
零命中，`planCodeFor` 取订阅时也不筛状态、取不到就回落默认档。生产上
`chatbotdomaintest` 的 `currentPeriodEnd` 停在 2025-08-25，一年多未续仍在正常
服务；`periodStart` 那段「推进到包含现在的那一期」更让它每 30 天白拿一次额度。
闸门放在配额**之前**是因为两者语义一致：被拦下的对话不该产生上游成本，
更不该扣商家额度。
**宽限 2 天不是宽容，是安全垫**：`app_subscriptions/update` 是「付款解冻」唯一的
知情渠道，webhook 迟到时宽限窗口给同步留出时间——该 webhook 2026-09-09 前因
密钥错误全线 401，镜像滞后了一年，这个教训直接决定了宽限的存在。
**默认只观测不拦截**（`SUBSCRIPTION_GATE_ENFORCE`）：镜像刚从一年滞后中恢复，
直接开闸会误停可能只是没同步的真实付费商家。误停一个付费商家的代价，
远大于多让失效商家白用几天。确认无误判后再打开开关。
**守护**：`apps/api/src/subscription/subscription-state.spec.ts`（六个状态 ×
试用内外 × 宽限内外）+ `adp.service.spec.ts` 断言闸门早于配额且零上游调用。

### `ADR-20`

DTC 独立站的可靠投递基建必须注册 **Redis 实现**，且 Redis 用 wjclaw **宿主
systemd** 的 `redis-server`，不用容器。
**为什么必须显式注册**：Medusa v2 在未配置这些模块时**不报错、不警告地**回落到
进程内内存实现（`event-bus-local` / `workflow-engine-inmemory`）。2026-09-13
实测：`medusa-config.ts` 里只有自定义 `inquiry` module，而 `.env` 里那几条
`REDIS_URL` / `EVENTS_REDIS_URL` / `CACHE_REDIS_URL` **全是死配置**——没有任何
代码读它们。启动日志写着 `Local Event Bus installed. This is not recommended
for production.` 和 `redisUrl not found. A fake redis instance will be used.`，
但服务照常起、健康检查照常 200。
**失败模式是静默丢事件，不是报错**：Medusa 改商品 → `product.updated` 事件只
存在于本进程内存 → 进程重启即丢，subscriber 不跑，drsell 库里没有这行，
**两边都不报错**。这比直接崩掉危险得多：数据不一致且无人知道。
**为什么宿主 Redis 而非容器**：wjclaw 上 Redis 早已是 systemd 常驻
（`redis-server.service`，v7.0.15，2026-06-16 起），宿主直连没有容器网络与
生命周期耦合；容器方案会多一层要维护的编排，且宿主已有能力毫无理由不用。
**为什么 db2 + 前缀**：同机 Redis 是**多项目共享**的——db0 上是
`pubmedclaw:*` 等别家键（实测 30+ 个）。用独立 db 是硬隔离，前缀是第二道；
只加前缀不换 db 仍会与同库其他应用撞键。
**守护**：`scripts/deploy-shop.sh` 用工作区 CLI 重启后断言；启动日志须出现
`Connection to Redis in module 'event-bus-redis' established` 等四条连接成功。

⚠ **判据是「有连接成功」，不是「没有 fake redis」**：实测日志里会**稳定**出现 3 条
`redisUrl not found. A fake redis instance will be used.`，它们来自 **config 探测
阶段**（模块加载器在 env 完全生效前实例化配置），每次都被紧接着的
`Using flag MEDUSA_FF_CACHING from project config` 覆盖，与运行时路径无关。
按「没有 fake redis」写断言会永远红。

端到端判据（比日志硬）：改一个 Medusa 商品 → drsell 库对应行 `updated_at` 前进；
且 `redis-cli -n 2 --scan --pattern 'bull:*'` 能列出工作流队列键
（证明 workflow 状态落在 Redis 而非进程内存）。
**注意**：`sort -u` 合并 `.env` 时若同时存在指向 db0 的 `REDIS_URL` 与指向 db2
的那条，会留下两份同名变量、取值不同——优先级取决于出现顺序。故合并前必须
先剔除旧值（见 `deploy-shop.sh` 第 4 步）。

### `ADR-21`

DTC 独立站与 drsell 主站是**两套独立部署链路**。
**为什么不合流**：Medusa 自带一棵 `@medusajs/*` 重依赖树（生产 1100 包）。
并入 drsell 的 pnpm workspace 会让 drsell 每次 install 都被拖累，且两个 turbo
monorepo 嵌套会互相打架。故 `pnpm-workspace.yaml` 显式排除
`!apps/shop` 与 `!apps/shop-web`。
**代价（已知并接受）**：两条链路互不覆盖——`deploy-mvp.sh` 不碰 Medusa 侧，
`deploy-shop.sh` 不碰 drsell 侧。**共享面的改动要两边都想**：DTC 挂件走的是
drsell 的 `/public/chat`，改 AI reader 会同时打到两个站。
**为什么 Medusa 侧必须在服务器上构建**：本机不装那棵依赖树；构建产物
`.medusa/server` 是自包含目录，由 pm2 跑。
**守护**：`scripts/deploy-shop.sh`（含公网内容断言 + 鉴权反向断言 + 管理端产物断言）。

### `ADR-22`

DTC 摄取**复用 Shopify 语义的列名**，以 `source` 区分来源，**改名推迟**。
**为什么**：`products.shopify_product_id` / `orders.shopify_order_id` 这类列
现在同时承载 Medusa 的 `product.id` / `order.display_id`。名字是错的，但
**改名的收益只是名字好看，代价是动生产读路径**（AI reader、运营台、摄取
幂等键都按这些列走）。
**关键约束**：新列 `source` 用 `@default("shopify")`，使存量行回填 + 新插入
默认，**Shopify 侧写入代码一行不改**即保证回归不变。
**重访条件**：若将来出现第三种来源，或列名开始误导实际开发（如有人按
`shopify_*` 当字符串过滤），再评估改名。
**守护**：`source` 默认值 + `apps/api/src/ingest/ingest.service.spec.ts`。

### `ADR-23`

B2B 询价线索是 Medusa **自定义 module**，写入只经两个受控端点，不直写库。
**为什么建成 module 而不是加张表**：走 Medusa 的 module/路由机制，线索自动获得
一致的 DI/迁移/管理端鉴权；`/admin/**` 前缀由 Medusa 自带鉴权兜住，不必自己
写认证（`/admin/inquiries` 无 token 实测 401）。
**为什么公开端点是 POST-only**：`GET /store/inquiries` 若可列举，等于把客户
线索公开挂在网上；故 store 侧 GET 返回 405，列表只在管理端。
**限流的定位**：公开端点做了 zod 严格校验 + 每 IP 每分钟 5 次内存限流。
**那限流不是安全边界**（进程重启即清、多实例不共享），只是挡脚本刷表单；
真防线是后台线索分级 + 人工审核。
**守护**：反向断言（store GET 非 200、admin 无 token 401、缺联系方式 400）
已进 `scripts/deploy-shop.sh` 第 8 步。

### `ADR-24`

DTC 店面是**内容式官网**（内容获客 + 询价闭环），不是即时结账店面；规格是
**数据**而不是代码。
**为什么不做即时结账**：对标原型的定位是 B2B 内容站——采购先确认「能不能用在
我的器械上」、先看合规再看价格。B2B 走「隐藏价 → 询价 → 人工报价」，标价会
招来无效零售询盘。故产品卡是**规格矩阵卡**且**不标价**，动作是「索取报价 /
索取资料」。
**为什么规格要外置**：规格原先前端硬编码 `SPECS` 映射 handle，业务方改一条
规格要改代码 + 重新部署。迁到 `metadata.specs` 后规格是纯数据，实测闭环：
API 改 metadata → 刷新页面即变（含新增字段），零代码零部署。
**为什么必须有 `specsOrder`**：Medusa 的 `metadata` 列是 **jsonb，不保留键
顺序**。实测写入 `{涂层类型,适用器械,基材,交付形式}`，读出来是字典序
`{基材,交付形式,涂层类型,适用器械}`——规格矩阵的阅读顺序有意义，故显式存
顺序数组。前端对 order 未列出的键追加在后（字典序），**保证不丢内容**。
**另一个坑**：`metadata` 不在 Store API 默认字段集里，请求必须显式带
`metadata`，否则页面看着正常、就是没规格。
**守护**：`scripts/seed-shop-specs.sh` 回读断言「每个商品都有 specs +
specsOrder，且键集一致」，不过即 `exit 1`。

### `ADR-25`

DTC 站**不做购物车、在线结算与 Stripe**；「交易闭环」定义为
**询价 → 人工报价 → Medusa 草稿订单 → 合同账期**。
**为什么**：这是对 `ADR-24` 的直接推论，也是对一次错误规划的更正。
业务特征本身排斥购物车——医用涂层是**高值、客制化、合同制**交易：一单可能
几十万，没人点「加入购物车」；按器械定制配方，没有标准 SKU 可加购；客户是
医院/器械厂，走的是采购流程与账期，不是付款页。套上购物车 + Stripe 是**把
B2C 形态错配到 B2B**，而且会招来无效零售询盘。
**出处文档亦如此定位**：作为版式来源的「百赛飞内容式官网」原型在页内写明
「核心导向是技术内容获客 + 询价闭环，**而非即时结账**」「不展示价格，均走
隐藏价 + 询价（RFQ）→ 人工报价 → **草稿订单**路径」。全页「购物车/结算/
checkout/cart」零命中。
**闭环不等于结账**：草稿订单是 Medusa 原生能力，商务把询价转成草稿订单后走
合同/账期，系统里留成单记录用于统计——**这就是闭环**，只是不经过在线支付。
**曾经写错的地方**：`DEPLOY.md` 缺口 8.7 曾把「店面无购物车/结算/Stripe」记为
待补缺口，一轮目标也曾写成「实现在线交易闭环（Stripe/购物车/结算）」。
**那是错的**——按清单往下做会做出一个与业务模式冲突的功能。本条即更正：
该缺口作废，不是待做项。
**顾客登录保留**：B2B 客户查自己的历史订单/对账仍有价值（且 Medusa 顾客账号
与 D8 隔离能力已具备），故不随购物车一并砍掉。
**守护**：页面零购物车/结账元素（`index.html` 无 cart/checkout/Stripe 字样）；
询价单在管理端可推进到成单状态。

### `ADR-26`

B2B 客户建站（`.claude/skills/` 流水线）**每客户独立 Medusa 实例 + 独立数据库**，
不共享自家 DTC 实例（`drsell_shop`），不用一个 Medusa 的多 sales channel 承载多客户。
**为什么**：客户目录与询价线索是商业敏感数据，客户之间要的是**硬隔离**。
共库的 sales channel 方案是一个 admin、一套迁移、一个故障域——任何一家客户的
升级、事故或误操作都可能波及全部客户；网关侧已按敌意多租户收敛（`ADR-19`），
数据侧再共库等于左手设防、右手开门。自家 DTC 实例是在产生产（`ADR-20`..`ADR-25`
那套），更不该因客户工程被动。
**代价（诚实登记）**：每客户多一份 pm2 进程、PG 库、Redis db 编号与部署链路——
`ADR-21` 的「两套部署链路」会随客户数变成 N+2 套。这份成本必须由 b2b-site-build
skill 脚本化吸收；**skill 建成前禁止手工起客户实例**，防止无脚本可复现的雪花部署。
**守护**：待守护——b2b-site-build 建成时以脚本 + 断言执行；当前零客户实例。

### `ADR-27`

`b2b-reg-roadmap`（家用/低值器械 · 合规路线图匹配 skill）的监管知识走**混合可信
模型**：人工核实的**国家知识包**（每国一份数据，每条断言带官方 `source_url` +
`as_of`）当地基；LLM+联网只做**起草与刷新**（费用/文件清单/周期等易变项），产出先落
`status=draft`，经人核准才转 `verified`；引擎只装配并输出 verified 格子。
**为什么**：家用器械 Class I–II 是 1688→独立站真正可代发的一档，选品期需要「这台能
不能顺利卖到某国」的可执行答案；但监管数据既要**广度**（用户要 US/EU/英加澳/中东
东南亚/拉美 ≈11 国）又不能**幻觉**（`INV-4`）。纯人工核编稳但扩不动，纯 LLM 联网快但
对法规推理不可复现、风险高。混合模型把「稳定结构」人工焊死、「易变项」自动起草，用
「**自动起草 → 人核准 → 引擎只发 verified**」消解矛盾——与 `b2b-research`「调研提议、
只有 verified 进 catalog」同构。
**覆盖是纯数据**：引擎与国家无关，加一国 = 加一个知识包文件，非改代码；未 verified
的国由验证器（`INV-4`）强制降级为「待核实」，故广度扩张永不破红线。v1 只把 US、EU
两包做到 verified，其余先建骨架置 draft。
**与建站流水线的关系**：本 skill 上游于 `b2b-research`，产出 go/no-go + 投入估算，
决定哪些 1688 器械进 `ADR-26` 的建站流水线；选中的器械按 `ADR-24` 走 Medusa 产品源。
**守护**：待守护——`.claude/skills/b2b-reg-roadmap/validate.mjs` 建成时执行；当前零知识包。

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
