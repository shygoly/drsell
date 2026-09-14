# apps/shop-web — DTC 独立站店面（Phase 6/7）

openspec change `dtc-store-medusa` 的店面层：一个**面向顾客**的商店页，展示 Medusa 商品，
并内嵌 drsell AI 智能客服挂件。**不入 pnpm workspace**（见根 `pnpm-workspace.yaml` 的
`!apps/shop-web`）——它是无构建的静态页 + 一个零依赖的 node 静态服务器。

线上：**https://medusa.szchada.top/**（2026-09-13 上线并端到端验证：商品网格由 Store API
实时渲染，右下角挂件可就商品正常对话）。截至 2026-09-13 复测，`/store/products` 供 **6 款**
商品（医疗器械功能涂层系列），价格均为 0 —— 与「隐藏价 → 询价 → 人工报价」的 B2B 惯例一致，
**不是缺陷**。

## 构成

- `index.html` —— 店面单页。客户端同源调用 **Medusa Store API**（`/store/products`，nginx 把
  `/store` 反代到 Medusa :9000，故无 CORS）渲染商品网格；底部内嵌挂件：
  ```html
  <div id="drsell-chat-root" data-shop="drsell-shop.szchada.top"></div>
  <script>window.DRSELL_API_BASE = "https://drsell.szchada.top/api";</script>
  <script src="https://drsell.szchada.top/drsell-chat.js" defer></script>
  ```
  `data-shop` **必须等于** drsell 侧该店 `Shop.shopDomain`（= `INGEST_STORE_DOMAIN`
  = `drsell-shop.szchada.top`），否则 AI 查不到本店数据。发布密钥（publishable key）与
  region 是前端公开值，**部署时**从 Medusa 库注入（`__PUBLISHABLE_KEY__`/`__REGION_ID__`
  占位符），不入库。
- `server.mjs` —— 零依赖 node 静态服务器（默认 `127.0.0.1:5020`，`SHOP_WEB_ROOT`/`PORT` 可配）。

## 部署（wjclaw，Phase 8）

```bash
SW=/opt/drsell-shop-web            # 生产运行目录（不在 nginx 容器挂载内，故走 pm2 反代）
scp index.html server.mjs wjclaw:$SW/
# 注入前端公开的 pk/region（从 Medusa 库读，勿硬编码进仓库）
PK=$(psql "$MEDUSA_DB" -tAc "SELECT token FROM api_key WHERE type='publishable' LIMIT 1")
REG=$(psql "$MEDUSA_DB" -tAc "SELECT id FROM region LIMIT 1")
sed -i "s|__PUBLISHABLE_KEY__|$PK|; s|__REGION_ID__|$REG|" $SW/index.html
PORT=5020 SHOP_WEB_ROOT=$SW pm2 start $SW/server.mjs --name drsell-shop-web && pm2 save
```

nginx（`medusa.szchada.top` vhost，在 `webrtc-ws-proxy` 容器 `conf.d/`）路径分流：
`/app /admin /store /auth /health` → Medusa :9000；`/` → 店面 :5020。

## 待续（相对 openspec Phase 6/8 的诚实缺口）

本页是**目录展示 + 挂件 + 询盘**的最小可交易前身，**不含购物车/结算/Stripe/顾客登录**（Phase
6.2/6.3）与 shadcn/Next SSR（6.4）——GOAL 是「页面能正常智能客服对话」，已达成。

> **2026-09-13 更正**：本节原先写「Phase 7.2 按登录顾客隔离订单/售后待做：当前挂件为匿名会话」——
> **该描述已过期**。7.2 已完成并公网验过：挂件带 `window.DRSELL_CUSTOMER_TOKEN`（店面登录
> Medusa `/auth/customer/emailpass` 后设），drsell 用 `MEDUSA_JWT_SECRET` 验签后按顾客拉取
> 订单/售后**注入 prompt**（不给模型跨顾客订单工具）。curl + 浏览器已验证：登录顾客只见本人
> 订单，窥探他人订单被拒，匿名一律引导登录。权威见
> `openspec/changes/dtc-store-medusa/tasks.md` 7.2。

**真正剩余**：Stripe 支付 + 购物车 + 结算 → 下单（1.2/6.2）；顾客登录页与 `account/orders`
售后申请入口（6.3）；shadcn/Next SSR 升级（6.4，按需）。

> 另注：页面已含 B2B 询盘（RFQ）提交通路（`POST /store/inquiries`，反代到 Medusa），
> 该能力**未记录在 openspec tasks.md**，源码见 `apps/shop/apps/backend/src/modules/inquiry/`。

## 非 Medusa 标准能力一览（易被漏读）

| 能力 | 位置 |
|---|---|
| 询盘模块（模型/服务/迁移） | `apps/shop/apps/backend/src/modules/inquiry/` |
| 公开提交通路 | `apps/shop/apps/backend/src/api/store/inquiries/route.ts` |
| 管理端线索列表 / 状态更新 | `apps/shop/apps/backend/src/api/admin/inquiries/` |
