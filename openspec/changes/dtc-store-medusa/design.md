# 设计

## 全景

```
apps/shop         Medusa v2 引擎（Node/TS）— Postgres(独立库) + Redis
                  商品/购物车/结算/订单/退货售后/Admin/Stripe
apps/shop-web     Next.js 15 App Router 店面（RSC）→ Medusa Store API（JS SDK）
packages/drsell-connector  纯映射 + HTTP 客户端（供 apps/shop 的 subscriber 调用）
apps/api (drsell) 摄取端点 + after_sales 表 + adp_get_after_sales；产品/订单读取不动
```

"参考 Shopify 技术/模板架构"落地：Medusa = Shopify 的无头引擎（对应 Storefront/Admin
API）；`apps/shop-web` = 主题层（对应 Hydrogen/theme）。二者通过 Medusa Store API 解耦。

## D1 引擎用 Medusa v2，不自建

Medusa v2 覆盖 v1 全部电商核心（product/variant、cart、checkout、order、fulfillment、
return/exchange/claim=售后、payment via Stripe、Admin UI）。Node/TS/Postgres 与团队栈一致。
自建这些是数月工程，不做（已排除 Saleor=Python、Vendure=同类但 Medusa 生态/Next 集成更顺）。

## D2 集成：Medusa 事件 → drsell 摄取端点 → drsell PG

**方向**：push（apps/shop 内的 subscriber 调 `packages/drsell-connector` 的纯映射+HTTP），
不共享库、不让 AI 直查 Medusa。产品/订单读取沿用现有 `adp_reader` SQL、与 Shopify 同步同构；
售后另见 D3。

- **店铺归属与隔离（S9）**：独立站 = drsell 的一个 `Shop`（`shopDomain` 用真实/伪域名），
  **挂在一个专属 `Tenant`**（不与任何 Shopify 商家共 tenant）。`adp_reader` 按
  `tenant + shopDomain + (shop_id IS NULL OR shop_id = s.id)` 隔离，故连接器写入**必须始终
  set `shopId`**，避免 `shop_id IS NULL` 造成跨店泄漏。
- 连接器订阅并映射（**事件名以 task 0.1 探针为准，此处非权威，N3**）：
  product → `/api/ingest/products`；order/fulfillment/payment → `/api/ingest/orders`；
  **售后=`order.*` 事件**（已确认 Medusa 2.x：`order.return_requested/received`、
  `order.claim_created`、`order.exchange_created`）→ `/api/ingest/after-sales`；
  **inventory 模块事件 → 更新 stock（S3）**
  （stock 在 Medusa Inventory 模块，不随 product 事件变，否则 AI 报错库存）。
- 摄取端点用 **store 专属密钥**鉴权（服务端到服务端，非商家 JWT）。
- **幂等键（B3，对齐真实唯一约束）**：`products/orders/customers` 的 upsert 走
  `@@unique([tenantId, shopify*Id])`——Medusa id 放进复用的 `shopify*Id` 列，`where` 用
  `tenantId_shopify*Id`。`source` 只作判别列，不是唯一键的一部分。
- **订单号语义（B4）**：`adp_get_order` 匹配 `shopify_order_id`；顾客用 Medusa 的
  **display_id（如 #1234）**指代订单，非内部 `order_01J…`。故连接器把 **display_id 存进
  `shopifyOrderId` 列**（AI 匹配的就是它），内部 id 如需保留另置列。
- **删除/下架（S2）**：删除/下架 → 写 `status`（软删）；`adp_search_products` 现有 SQL 不滤
  status，需在同一批 reader 改动里补在售过滤；订单取消同理更新 `status`。
- **事件顺序（S5）**：Redis 总线 at-least-once 且可能乱序。DTO 带 source 的 `updatedAt`/version，
  端点**按版本拒绝更旧的写**（last-writer-by-version，非 by-received）。
- **顾客关联（S6）**：连接器须 set `Order.customerId` = Medusa 顾客 id，并把同一 id 存进该
  顾客行的复用列，使顾客维度可查（D8 前提）。
- **行项目（S4）**：现有 `Order` 无行项目、`after_sales` 无 item 引用。v1 建议加轻量
  `Order.itemsJson`（成本低），否则明确限定售后为订单级状态。
- **schema（已定 a 方案）**：`products/orders/customers` 加 `source String @default('shopify')`；
  现有 Shopify 写入路径显式写 `source='shopify'`（行为不变）。
- **售后表**（net-new）：`after_sales` —— `tenantId/shopId/source/externalId/orderExternalId
  (=display_id)/type/status/reason/amount/currency(N2)/version/createdAt`，
  `@@unique([tenantId, source, externalId])`（新表，无历史约束冲突）。

## D3 AI 读取（诚实登记：售后**是**生产 reader 改动）

- **产品/订单：零改动**——`adp_reader` 现有 SQL 照旧命中 `products`/`orders`（多 `source` 列不
  影响；仅 S2 的在售过滤是一处小改）。
- **售后：新增只读能力，非纯增量**——需在 `prisma/sql/adp-reader.sql` 新增
  `adp_get_after_sales(...)` 的 `SECURITY DEFINER` SQL 函数 + `GRANT EXECUTE ... TO adp_reader`
  （生产 PG 改动），并在生产 OpenClaw 网关的 `drsell-pg` MCP 注册该工具。"由 apps/api 暴露端点
  由 reader 调"作废（N1）——reader 是 PG 角色，不是 HTTP 客户端。
- **system prompt 按 source 参数化（B2/N4）**：`buildSupportSystemPrompt` 是**共享**函数，
  rails 里工具清单是**封闭白名单**且自称"Shopify store"。要给独立站开售后工具，必须把工具清单
  与店铺称谓按 source 参数化——**Shopify 店 prompt 逐字不变（加回归测试钉住）**，仅独立站
  prompt 含 `adp_get_after_sales`、不自称 Shopify。
- **上线门槛**：以上任何 reader/工具/prompt 改动，先隔离验 tool calling（含 GLM 兜底），
  再走公网复验（陷阱 1）。

## D4 店面（前端模板架构）

Next.js 15 App Router + RSC + Server Actions，参照 Vercel Next.js Commerce：
`collections/[handle]`、`product/[handle]`、`cart`、`checkout`、`account/orders`、
`account/orders/[id]`（含售后入口）。Medusa JS SDK 取数；shadcn/Tailwind 主题层（与
drsell 现有 Next 栈一致）。SSR/流式渲染，性能对齐 Commerce 范式。

## D5 店内 AI 挂件（可行性 OK，真正待解的是顾客身份，见 D8）

嵌入 `drsell-chat.js`（widget 本就是 JS snippet，靠 `data-shop` + 匿名 `visitorId` 走公开
`/public/chat`，无 App Bridge，CORS `origin:true`）。只要有该店的 `Shop` 行（伪域名、
`uninstalledAt IS NULL`），会话即可建立（N5）。挂件不依赖 Shopify。

## D6 支付/结算

Medusa Stripe 模块，v1 用 Stripe 测试模式跑通 加购→结算→支付→订单→售后 全链路。
真实密钥、webhook 验签、退款按 Medusa 既有能力接。

## D7 基建/部署（已定 b：接受 Redis）

沿用 pm2+nginx+rsync。新增：Medusa 独立 Postgres 库（不与 drsell PG 共享，隔离故障面，
数据只经摄取端点流动）；**Redis**（Medusa v2 event bus/workflow/缓存所需）；pm2 新进程
`shop`/`shop-web`（subscriber 并入 shop 进程）；nginx 店铺 vhost + Admin 保护；密钥入 `.env`
（不入库，陷阱 6）。

## D8 顾客身份与隐私（B5，实现前必须定）

现状：`/public/chat` 无顾客鉴权，`adp_get_order` 按 shop 返回**任意**订单，`after_sales`
含 `amount/reason`。若挂件只带匿名 `visitorId`，任何人猜到订单号即可读他人退款——隐私漏洞。
**决议（已定 D8）**：采用首选——登录顾客在店面拿一枚**签名的 Medusa 顾客令牌**，挂件换
drsell 会话时带上；订单/售后查询按顾客 id 过滤（依赖 D2 的 S6 关联）。匿名会话不返回
金额/原因等敏感字段。兜底方案不采用。

## D9 独立站的订阅/额度归属（S1）

`/public/chat` 会跑 `assertSubscriptionServiceable` + `assertWithinQuota`，`AiUsage` 按
`shopId` 计。独立站没有 Shopify `Subscription`。**决议（已定 D9）**：独立站**无 plan**——
豁免订阅/额度闸门（视为始终可服务），但**仍记 `AiUsage`** 供观测/成本核算。实现须让对话
路径对该 shop（按 `source='medusa'` 或专属 tenant 判定）跳过 `assertSubscriptionServiceable`
与 `assertWithinQuota`。

## 组件边界

- `packages/drsell-connector`：纯映射 + HTTP 客户端，无状态、可单测（Medusa 事件载荷 →
  摄取 DTO）。可靠投递（重试/顺序）由 apps/shop 侧 subscriber + outbox/工作流承载（S7），
  不塞进纯映射包。
- 摄取端点：只做鉴权 + 校验 + 版本化幂等 upsert，不含业务编排。
- 店面：只读 Medusa Store API + 展示，不持有电商业务逻辑。

## 决策登记（S8，实现时与代码同提交）

- `ADR-n`：复用 `shopify*Id` 列承载外部 ID 并推迟改名（携带技术债，出处此设计）。
- `DEP-n`：引入 Redis 作为基建（出处 DEPLOY.md）。
- 改名为 source-neutral 列名列为显式后续项（不在 v1，避免动生产 reader）。

## 风险 / 待验证

- Medusa v2 事件覆盖与命名（尤其 return/exchange/claim 与 inventory）——task 0.1 探针先验。
- D8 顾客身份换发通路——build 前定死。
- `adp_get_after_sales` + prompt 参数化上生产前的 tool-calling 回归（陷阱 1）。
- Redis 运维（wjclaw 新增，备份/监控纳入）。
