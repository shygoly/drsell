# 独立站（DTC）：Medusa 无头电商 + Next.js 店面 + 接入 drsell

## Why

drsell 今天只能服务 **Shopify** 商家：`apps/api` 把 Shopify 的产品/订单/顾客同步进
PG，AI（OpenClaw 经 `adp_reader` 查 PG，ADR-7）据此回答。想让一个**非 Shopify 的
单品牌独立站**用上 drsell 的 AI 客服，就需要两样东西：一个真的能卖货的店，和一条把
它的产品/订单/售后喂进 drsell 的通路。

从零自建电商引擎是数月工程且要趟遍支付/税/库存/退货的坑。**Shopify 自己的架构就是
无头电商**（引擎 + Storefront API + 组件化主题）。因此最短且对齐 Shopify 架构的路径是：
用开源无头引擎 **Medusa v2**（Node/TS/Postgres，自带 Admin、购物车、结算、订单、
退货售后、Stripe）当引擎，**Next.js App Router** 店面当"主题层"，再写一条薄连接器把
数据喂进 drsell。**产品/订单读取零改动**（数据落进同结构表，`adp_reader` 现有 SQL 照旧）；
**售后是最小新增改动**（新增一个只读 SQL 函数 + 网关 MCP 工具 + system prompt 按 source
参数化），须过 trap-1 隔离验证再上生产。

## What Changes

- 新增 `apps/shop`：Medusa v2 电商后端（商品/购物车/结算/订单/退货售后/Admin/Stripe）。
- 新增 `apps/shop-web`：Next.js 店面（RSC + Server Actions，Vercel Next.js Commerce 范式）。
- 新增 `packages/drsell-connector`：订阅 Medusa 事件，推给 drsell 摄取端点。
- `apps/api`（drsell）新增：
  - 鉴权的摄取端点 `POST /api/ingest/{products,orders,after-sales}`，upsert 进现有
    `products`/`orders`/`customers` 与**新增 `after_sales` 表**。
  - `Product`/`Order`/`Customer` 加 `source`（`'shopify'|'medusa'`）判别列；**复用**现有
    `shopify*Id` 外部 ID 列承载 Medusa ID（v1 不改生产 AI reader 的 SQL，命名泛化后置）。
  - 新增只读 AI 工具 `adp_get_after_sales`（新 `SECURITY DEFINER` SQL 函数于
    `prisma/sql/adp-reader.sql` + `GRANT` 给 `adp_reader` + 网关 MCP 注册）——**这是生产
    AI reader 改动**，非纯增量，须过 trap-1 验证（含 GLM 兜底）。
  - `buildSupportSystemPrompt` **按 source 参数化**工具清单与店铺称谓：Shopify 店 prompt
    保持逐字不变（加回归测试钉住），仅独立站的 prompt 含售后工具、不再自称"Shopify store"。
- 独立站在 drsell 里注册为一个 **Shop**（伪域名）挂在一个 Tenant 下；店内直接嵌入
  `drsell-chat.js` 挂件，用该 shop 身份换 drsell 会话。
- 基建新增：Medusa 的独立 Postgres 库 + **Redis**（Medusa v2 事件/工作流所需）。

## Impact

- 能力（新增）：`commerce-ingestion`（drsell 摄取外部电商数据、AI 读取、售后）、
  `dtc-storefront`（独立站的浏览/购物车/结算/订单/售后/AI 挂件）。
- `apps/api`：schema 迁移（`source` 列 + `after_sales` 表）、摄取模块、`adp_get_after_sales`。
- 新代码：`apps/shop`、`apps/shop-web`、`packages/drsell-connector`。
- 基建：Redis、Medusa PG 库、pm2 新进程、nginx 新 vhost/路由。
- **生产 AI 链路的改动面**（诚实登记）：产品/订单读取 SQL 与现有 Shopify 同步**不动**；
  售后需**新增**一个只读 SQL 函数 + 网关 MCP 工具，`buildSupportSystemPrompt` 按 source
  参数化（Shopify 侧不变）。均须过 trap-1 隔离验证。
- 新决策须入 `DECISIONS.md`（S8）：`ADR` — 复用 `shopify*Id` 列承载外部 ID 并推迟改名
  （携带技术债）；`DEP` — 引入 Redis 作为基建。实现时与代码同提交登记。

## 明确不做（v1）

多语言/多币种、营销与折扣体系、复杂税务、多品牌/多租户店铺、SEO 深度优化、
`shopify*Id` 列的彻底泛化改名（留作后续，避免动生产 AI reader）。
