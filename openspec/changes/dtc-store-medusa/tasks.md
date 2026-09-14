# Tasks

## 0. 前置探针 + 定死待解项（决定后续实现）
- [~] 0.1 Medusa v2 事件覆盖：**已确认命名空间**——售后=`order.*`
      （`order.return_requested/received`、`order.claim_created`、`order.exchange_created`）、
      product=`product.*`、库存走 inventory 模块事件。剩：对钉定版本核对完整 payload 字段（scaffold 后）
- [x] 0.2 顾客身份换发通路（D8/B5）：**已定**——签名 Medusa 顾客令牌 → drsell 会话 →
      按顾客过滤订单/售后；匿名会话不回敏感字段
- [x] 0.3 独立站订阅/额度归属（D9/S1）：**已定**——无 plan，豁免订阅/额度闸门（始终可服务），
      仍记 AiUsage 供观测
- [x] 0.4 wjclaw 上 Redis 与 Medusa PG 库落位（容器/端口/备份）

## 1. Medusa 引擎（apps/shop）
- [x] 1.1 scaffold Medusa v2.21（wjclaw `/root/drsell-shop-build/shop`）+ 迁移/seed 到独立库
      drsell_shop + 运行于 :9000。**Redis 现为 in-memory event bus**（wire-up 够用；生产可靠
      投递用 Redis event bus 留 4.2）。源码见 apps/shop/README.md（生成产物暂运行于 wjclaw）
- [ ] 1.2 Stripe 支付模块（测试模式）+ 单一 region/currency（N2）——seed 已建默认 region，Stripe 待配
- [~] 1.3 Admin 已建、初始 seed 含样例商品/库存；管退货 UI 待验

## 1b. drsell 侧摄取上线（Phase 3 部署）
- [x] 部署 drsell-api（迁移 20260912140000 已应用生产）+ `INGEST_STORE_KEY/DOMAIN` 入 apps/api/.env；
      `/api/ingest/*` 公网 401（live+guarded）

## 2. drsell schema（apps/api）
- [x] 2.1 迁移：`products/orders/customers` 加 `source @default('shopify')` + 版本/updatedAt 承载（S5）
- [x] 2.2 迁移：新增 `after_sales` 表（D2）；`Order.itemsJson` 轻量行项目（S4）
- [x] 2.3 靠列默认 `source='shopify'`（迁移 ADD COLUMN DEFAULT 回填存量行 + 新插入默认），
      未改 Shopify 写入代码即保证回归不变；`prisma generate` 已更新 client

## 3. 摄取端点（apps/api）
- [x] 3.1 `POST /api/ingest/{products,orders,after-sales,inventory}`：store 密钥鉴权
- [x] 3.2 幂等 upsert：产品/订单/顾客走 `tenantId_shopify*Id`（B3）；售后走 `tenantId,source,externalId`；
      **始终 set `shopId`**（S9）；`Order.customerId`=Medusa 顾客 id（S6）；display_id 入 `shopifyOrderId`（B4）
- [x] 3.3 版本化写入：拒绝比已存更旧的版本（S5）
- [x] 3.4 单测：鉴权、幂等、版本拒旧、字段映射、始终带 shopId、坏数据拒绝

## 4. 连接器（packages/drsell-connector + apps/shop subscriber）
- [x] 4.1 纯映射（事件载荷 → 摄取 DTO）在 package，单测无网络
- [~] 4.2 subscriber（product/order/customer/after-sales）已写并**在生产触发验证**（Medusa 事件→
      映射→POST /api/ingest）；**outbox/Redis 可靠投递待续**（S7，现为 in-memory bus、失败仅记日志）
- [~] 4.3 after-sales subscriber 已写（best-effort，待真实退货事件校验 entity/字段）；
      inventory 软删/库存 subscriber 待补（S2/S3）
- [x] 4.4 **端到端已验（2026-09-12）**：Medusa 改商品 → drsell PG `products` 出现 `source='medusa'` 行。
      订单/售后/库存同机制，待各自事件触发验证

## 5. AI 读取（生产 reader 改动，须过 trap-1）
- [x] 5.1 `adp-reader.sql` 新增 `adp_get_after_sales` SECURITY DEFINER 函数 + GRANT（生产已应用）。
      `adp_search_products` 在售过滤（S2）**未做**（留待）
- [x] 5.2 `buildSupportSystemPrompt` 按 source 参数化：medusa 用中性措辞；**回归测试锁 Shopify prompt 逐字不变**
      （新增 `Shop.source` 列 + 迁移 20260913120000，ingest 自愈为 medusa，proxyChatSse 按 source 选分支）
- [x] 5.3 售后工具经 GRANT 到 `adp_reader` + SOUL/SKILL 文档登记；**订单/售后按顾客隔离改用服务端注入**
      （见 7.2/D8）：medusa prompt 不给模型跨顾客订单工具，顾客本人数据由 drsell 验签后拉取注入
- [x] 5.4 **公网复验（陷阱 1）**：medusa 店问售后 → AI 调 `adp_get_after_sales` 作答；商品查询照常；
      Shopify 路径 prompt 逐字不变（单测锁）。隔离环境 GLM 兜底复验留待

## 6. 店面（apps/shop-web）
- [~] 6.1 **目录展示已做**（静态页 client-side 调 Medusa Store API `/store/products` 同源渲染，
      见 apps/shop-web）；**购物车/详情页未做**（GOAL 只需能对话，YAGNI 推迟）
- [ ] 6.2 Stripe 结算 → 下单
- [ ] 6.3 顾客登录 + account/orders 订单与物流追踪；售后申请入口
- [~] 6.4 采用**无构建静态页**（非 Next/shadcn）：GOAL 是「页面能正常客服对话」，取最短路径；
      SSR/shadcn 升级留待需要时

## 7. 店内 AI 挂件
- [x] 7.1 嵌入 `drsell-chat.js`（`data-shop=drsell-shop.szchada.top` = INGEST_STORE_DOMAIN，
      `DRSELL_API_BASE=https://drsell.szchada.top/api`）。**AI 链路零改动**：chat 路径无 Shopify 耦合，
      `adp_search_products` 按 shopDomain→tenant 过滤、不看 source，故直接命中 medusa 商品
- [x] 7.2 **线上试聊 + 按顾客隔离已验（2026-09-13，D8）**：商品问答用真实 medusa 商品作答；
      挂件带 `window.DRSELL_CUSTOMER_TOKEN`（店面登录 Medusa `/auth/customer/emailpass` 后设），
      drsell 用 `MEDUSA_JWT_SECRET` 验签 → 拉该顾客本人订单/售后**注入 prompt**（不给模型跨顾客订单工具）。
      curl+浏览器验：登录顾客只见本人订单（A100/D900），窥探他人订单(B200)被拒，匿名一律引导登录。
      **残留边界**：未验签的旧式 `adp_get_order/adp_get_after_sales`（按订单号，不看顾客）仍 GRANT 给共享
      `adp_reader`——medusa prompt 不列它们，但要**结构性**杜绝需给 DTC 建独立 role/agent（留待，见 design D8）

## 8. 部署与基建
- [x] 8.1 Redis + Medusa PG 已在 wjclaw（`drsell_shop` 库；REDIS_URL 已配）；`.env` 不入库
- [x] 8.2 pm2：`drsell-shop-web`（店面静态 :5020）+ **`drsell-shop-medusa`（Medusa 生产模式 :9000）**
      均 `pm2 start`+`pm2 save`。Medusa 已 `medusa build`（`.medusa/server`，NODE_ENV=production），
      **不再跑 Vite dev**（后台 /app 为预构建静态资源）
- [x] 8.3 nginx `medusa.szchada.top` vhost（`/`→店面 :5020、`/app /admin /store /auth /health`→Medusa :9000）
      + 自签证书 + 公网内容断言。**后台已是预构建生产资源**（Vite dev 服务器已下线）。
      **Admin 访问保护**（/app 加认证/IP 限制）仍待做——目前 /app 公网可达登录页

## 9. 治理与验收
- [x] 9.1 `DECISIONS.md` 登记：`ADR-20`（Redis 可靠投递基建）、`ADR-21`（两套部署链路）、
      `ADR-22`（复用 shopify*Id 列名 + 推迟改名）、`ADR-23`（询价 module）、
      `ADR-24`（内容式官网 + 规格外置）、`ADR-25`（不做在线结账：闭环=询价→草稿订单）。
      论证写入 `ARCHITECTURE.md` 对应锚点（格式契约 7 要求每个在册 ID 有 `### \`ADR-n\``）。
      **Redis 的 DEP 并入 `ADR-20`**——校验器只认 `INV`/`ADR`/`B`/`DS` 四个命名空间，
      `DEP-` 不在册（`ADR-20` 记的是「必须注册 Redis 实现」这个不可逆选择本身）。
- [~] 9.2 `pnpm spec` **15/15 绿**。`commerce-ingestion` / `dtc-storefront` 两个 spec
      文件待 `openspec archive` 时生成——change 尚未归档，故 `openspec/specs/` 仍为空。
- [x] 9.3 `pnpm test` 绿：9/9 tasks、24 suites、221 tests（已强制无缓存重跑确认）。
- [~] 9.4 公网复验：
      **询价 → 草稿订单闭环已验**（含幂等 `reused`、401/400 反向断言、公开侧未被牵连）；
      AI 只答本店 + 按顾客隔离已验（7.2 / 6.8）。
      **原「下单→支付→售后」中的「支付」一项作废**（`ADR-25`：B2B 不走在线支付，
      这是业务决策而非未完成）；售后 reader 已上（6.8），待真实退货事件复验；
      店铺域锁定待独立复验。
