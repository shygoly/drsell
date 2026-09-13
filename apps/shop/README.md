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

## 已验证（2026-09-12）

Medusa 里改一个商品 → subscriber 触发 → `/api/ingest/products`（401 无 key、200 带 key）→
drsell PG `products` 出现 `source='medusa'` 行。端到端打通。

## 待续（openspec dtc-store-medusa 剩余 Phase）

4.2 subscriber 的 outbox/可靠投递 + Redis event bus；4.3 库存/软删/售后用真实事件校验；
5 AI reader 加 `adp_get_after_sales` + prompt 按 source 参数化（生产 reader 改动，过 trap-1）；
6 Next 店面；7 店内挂件；8 正式部署（pm2/nginx，替代当前 /root 手工运行）；9 治理验收。
