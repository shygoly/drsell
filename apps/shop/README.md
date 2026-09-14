# apps/shop — DTC 独立站的 Medusa v2 引擎

独立站（DTC）的电商引擎，openspec change `dtc-store-medusa` 的 Phase 1 + 连接器 wire-up。
**不并入 drsell 的 pnpm workspace**（见根 `pnpm-workspace.yaml` 的 `!apps/shop`）——它自身是
create-medusa-app 生成的 turbo monorepo，独立构建/运行。

本目录只提交**手写的 wire-up 源码**（drsell 连接器 subscriber + mapper），不提交 create-medusa-app
的生成产物（可按下方命令重生）。生成的全量源码目前运行在 wjclaw:`/root/drsell-shop-build/shop`。

## 重生成脚手架

```bash
# wjclaw（Node 22 + 公网 npm）。DATABASE_URL/REDIS 见 /root/drsell-shop/shop.env
cd <parent> && printf 'N\n' | npx create-medusa-app@2.21.0 shop \
  --db-url "$DATABASE_URL" --no-migrations --no-browser --use-npm
# 生成后：把本目录 apps/backend/src/{lib,subscribers}/ 覆盖进去，再：
cd shop/apps/backend && npx medusa db:migrate      # 建表 + 初始 seed（含样例商品）
npx medusa user --email <admin> --password <pw>    # 建管理员
npx medusa develop                                  # :9000（in-memory event bus）
```

## Wire-up（本目录提交的部分）

- `apps/backend/src/lib/drsell-connector.ts` —— Medusa 实体 → drsell 摄取 DTO 的纯映射
  （`@drsell/connector` 的 vendored 拷贝；apps/shop 不在 drsell workspace 里，故内联）。
- `apps/backend/src/lib/drsell-ingest.ts` —— POST 到 drsell `/api/ingest/*`，`x-store-key` 鉴权。
- `apps/backend/src/subscribers/drsell-{product,order,customer,after-sales}.ts` —— 订阅 Medusa 事件
  （`product.*`/`order.*`/`customer.*`/`order.return|claim|exchange.*`），用 `query.graph` 取全量后
  映射 + 推送。非阻塞（出错只记日志）。

后端 `.env` 需要：`DATABASE_URL`（drsell_shop）、`DRSELL_INGEST_URL=http://127.0.0.1:5011/api/ingest`、
`INGEST_STORE_KEY`（与 drsell `apps/api/.env` 的同名值一致）。drsell 侧对应
`INGEST_STORE_KEY` + `INGEST_STORE_DOMAIN`，摄取端点在 `apps/api/src/ingest/`。

## 店面（apps/shop-web）

面向顾客的店面 + AI 挂件在同仓 **`apps/shop-web/`**（无构建静态页，独立于本 Medusa monorepo）。
线上 **https://medusa.szchada.top/**：展示 Medusa 商品 + 右下角 drsell 智能客服，已端到端验证可对话。
nginx 在 `medusa.szchada.top` 分流：`/`→店面 :5020（pm2 `drsell-shop-web`）、
`/app /admin /store /auth /health`→本 backend :9000。

## 已验证（2026-09-12）

Medusa 里改一个商品 → subscriber 触发 → `/api/ingest/products`（401 无 key、200 带 key）→
drsell PG `products` 出现 `source='medusa'` 行。端到端打通。

## 待续（openspec dtc-store-medusa 剩余缺口）

> 本节曾列出「5/6/7/8 未做」——**该清单写于这些 Phase 完成之前，已过期并造成误判**
> （2026-09-13 有人据此把线上已完成的店面/挂件/部署当成未做）。**判断进度以
> `openspec/changes/dtc-store-medusa/tasks.md` 的勾选状态 + 线上实测为准，不要以本文为准。**

**已完成（勿再当作待办）**：5 AI reader（`adp_get_after_sales` + prompt 按 source 参数化，
公网复验通过）· 6.1 目录展示 · 7 店内挂件（含按登录顾客隔离订单/售后）·
8 生产部署（Redis + 独立 `drsell_shop` 库 + pm2 `drsell-shop-web`/`drsell-shop-medusa` + nginx vhost）。

**真正剩余**：

- **4.2 / 4.3** subscriber 的 outbox / Redis 可靠投递（现为 in-memory bus，失败仅记日志）；
  库存、软删、售后的真实事件校验。
- **1.2 / 6.2 / 6.3 在线交易闭环**：Stripe 支付、购物车、结算 → 下单、顾客登录 +
  `account/orders` 及售后申请入口。**这是唯一未实现的整层能力。**
- **8.3** Admin 后台访问保护（`/app` 目前公网可达登录页）。
- **9 治理验收**：`DECISIONS.md` 登记 ADR（复用 `shopify*Id` 列）/ DEP（引入 Redis）；
  `pnpm spec`、`pnpm test` 跑绿；下单→支付→售后全链路公网复验。

**未记录在 tasks.md 但已存在的能力**：B2B 询盘（RFQ）模块
（`apps/backend/src/modules/inquiry/` + `api/{store,admin}/inquiries/`）——身份分流 × 需求分级
× 线索状态机，见该目录源码注释。
