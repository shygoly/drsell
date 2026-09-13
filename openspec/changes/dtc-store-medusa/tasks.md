# Tasks

## 0. 前置探针 + 定死待解项（决定后续实现）
- [ ] 0.1 Medusa v2 事件覆盖：确认 product/order/fulfillment/payment/**inventory** 及
      return/exchange/claim 的**事件名与载荷字段**（决定连接器映射，D2/N3）
- [ ] 0.2 顾客身份换发通路（D8/B5）：定死方案——签名 Medusa 顾客令牌 → drsell 会话 →
      按顾客过滤订单/售后。**build 前必须定**（金额涉敏）
- [ ] 0.3 独立站订阅/额度归属（D9/S1）：合成订阅 vs 豁免 vs 独立计费，选定
- [ ] 0.4 wjclaw 上 Redis 与 Medusa PG 库落位（容器/端口/备份）

## 1. Medusa 引擎（apps/shop）
- [ ] 1.1 scaffold Medusa v2 + Postgres(独立库) + Redis event bus/workflow
- [ ] 1.2 Stripe 支付模块（测试模式）+ 单一 region/currency（N2）
- [ ] 1.3 Admin 可管商品/订单/退货；导入样例商品

## 2. drsell schema（apps/api）
- [ ] 2.1 迁移：`products/orders/customers` 加 `source @default('shopify')` + 版本/updatedAt 承载（S5）
- [ ] 2.2 迁移：新增 `after_sales` 表（D2）；`Order.itemsJson` 轻量行项目（S4）
- [ ] 2.3 现有 Shopify 写入路径显式写 `source='shopify'`（回归不变）；`prisma generate`

## 3. 摄取端点（apps/api）
- [ ] 3.1 `POST /api/ingest/{products,orders,after-sales,inventory}`：store 密钥鉴权
- [ ] 3.2 幂等 upsert：产品/订单/顾客走 `tenantId_shopify*Id`（B3）；售后走 `tenantId,source,externalId`；
      **始终 set `shopId`**（S9）；`Order.customerId`=Medusa 顾客 id（S6）；display_id 入 `shopifyOrderId`（B4）
- [ ] 3.3 版本化写入：拒绝比已存更旧的版本（S5）
- [ ] 3.4 单测：鉴权、幂等、版本拒旧、字段映射、始终带 shopId、坏数据拒绝

## 4. 连接器（packages/drsell-connector + apps/shop subscriber）
- [ ] 4.1 纯映射（事件载荷 → 摄取 DTO）在 package，单测无网络
- [ ] 4.2 subscriber 在 `apps/shop/src/subscribers/*` 调映射+HTTP；**outbox/工作流**保证可靠投递（S7）
- [ ] 4.3 删除/下架/取消 → 软删 status（S2）；inventory 事件 → 更新 stock（S3）
- [ ] 4.4 本地端到端：Medusa 改动 → drsell PG 出现该店数据（含软删、库存、售后）

## 5. AI 读取（生产 reader 改动，须过 trap-1）
- [ ] 5.1 `adp-reader.sql` 新增 `adp_get_after_sales` SECURITY DEFINER 函数 + GRANT；
      `adp_search_products` 补在售过滤（S2）
- [ ] 5.2 `buildSupportSystemPrompt` 按 source 参数化工具清单与店铺称谓（B2/N4）；
      **回归测试：Shopify（无 source=medusa）prompt 逐字不变**
- [ ] 5.3 生产网关 `drsell-pg` MCP 注册售后工具；订单/售后查询按顾客过滤（D8）
- [ ] 5.4 **隔离环境验 tool calling（含 GLM 兜底）** → 公网复验（陷阱 1）

## 6. 店面（apps/shop-web）
- [ ] 6.1 目录/详情/购物车（Medusa Store API + JS SDK）
- [ ] 6.2 Stripe 结算 → 下单
- [ ] 6.3 顾客登录 + account/orders 订单与物流追踪；售后申请入口
- [ ] 6.4 shadcn/Tailwind 主题层，SSR/性能对齐 Commerce 范式

## 7. 店内 AI 挂件
- [ ] 7.1 嵌入 `drsell-chat.js`，注入 store 的 shop 标识 + 登录顾客令牌（D8）
- [ ] 7.2 线上试聊：能查本店产品/订单/售后，且**只**返回该顾客的数据

## 8. 部署与基建
- [ ] 8.1 Redis + Medusa PG 上 wjclaw；`.env`（不入库）
- [ ] 8.2 pm2 进程（shop / shop-web）纳入部署脚本
- [ ] 8.3 nginx 店铺 vhost + Admin 保护 + 公网内容断言（陷阱 3）

## 9. 治理与验收
- [ ] 9.1 `DECISIONS.md` 登记 ADR（复用 shopify*Id 列 + 推迟改名）与 DEP（Redis）（S8）
- [ ] 9.2 spec：`commerce-ingestion`、`dtc-storefront` 两能力；`pnpm spec` 绿
- [ ] 9.3 `pnpm test` 绿（摄取/连接器/映射/版本/回归单测 + 关键路径）
- [ ] 9.4 公网复验：下单→支付→售后 全链路；AI 只答本店且按顾客隔离；店铺域锁定生效
