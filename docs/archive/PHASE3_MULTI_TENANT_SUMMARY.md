# Phase 3: Multi-Tenant Integration - 实施总结

> **⚠️ 已作废（2026-09-03）。仅作历史留档，不要据此判断本项目架构。**
>
> 本文围绕 `chatbot-node` 展开，而**本仓库已无该目录**（连同 Coze 集成一并作废）。
> 当前多租户实现在 `apps/api`（NestJS + Prisma + PostgreSQL）。
>
> 现行架构与陷阱见仓库根目录 `AGENTS.md`。

## 已完成的工作

### 1. chatbot-node 多租户支持 ✅

#### 数据模型
- ✅ `Tenant`: 租户主表 (shopId, merchantId, instanceUrl, SSO配置)
- ✅ `TenantConfig`: 租户配置 (name, logoUrl, botId, syncScopes)
- ✅ `WebhookDelivery`: Webhook投递记录

#### 鉴权中间件
- ✅ `auth-shopsaas.ts`: ShopSaaS后端调用鉴权 (x-shopsaas-secret)
- ✅ `auth-sso.ts`: EverShop SSO JWT鉴权 (issuer=shopsaas, aud=chatbot-node)

#### API路由
- ✅ `POST /api/admin/tenants/register`: 租户注册 (ShopSaaS调用)
- ✅ `GET /api/admin/tenants/:shopId/config`: 获取配置 (SSO)
- ✅ `PUT /api/admin/tenants/:shopId/config`: 更新配置 (SSO)
- ✅ `POST /api/sync/:shopId/products|orders|promotions`: Webhook接收器 (HMAC验证)
- ✅ `GET /api/import/:shopId/products|orders|promotions`: 初始同步代理 (SSO)

#### 服务层
- ✅ `tenant.service.ts`: 租户CRUD、配置管理、Webhook记录

### 2. ShopSaaS 平台实现 ✅

**项目位置**: `~/projects/shopsaas`

#### 技术栈
- Node.js + Express + TypeScript
- Prisma ORM + PostgreSQL
- JWT认证
- Axios (HTTP客户端)

#### 数据模型
- ✅ `Merchant`: 商户账号 (email, password, creditBalance)
- ✅ `Tenant`: 店铺实例 (shopId, merchantId, instanceUrl, status)
- ✅ `CreditLedger`: 积分流水 (merchantId, delta, reason, balanceAfter)
- ✅ `Subscription`: 功能订阅 (merchantId, shopId, feature, status, expiresAt)
- ✅ `TenantSecret`: SSO/Webhook密钥 (shopId, ssoSharedKey, webhookSecret)

#### 核心服务
- ✅ `credit.service.ts`: 积分管理 (充值、扣费、查询流水)
- ✅ `tenant.service.ts`: 租户管理 (创建店铺、启用功能、查询订阅、密钥管理)
- ✅ `chatbot-integration.service.ts`: chatbot-node集成 (注册、配置查询、SSO签发)

#### API路由
- ✅ `POST /api/auth/register`: 商户注册 (初始200积分)
- ✅ `POST /api/auth/login`: 商户登录
- ✅ `POST /api/tenants`: 创建店铺 (-100积分)
- ✅ `GET /api/tenants`: 列出店铺
- ✅ `GET /api/tenants/:shopId`: 店铺详情
- ✅ `POST /api/tenants/:shopId/provision`: 更新实例URL
- ✅ `POST /api/tenants/:shopId/sso/issue`: 签发SSO JWT
- ✅ `POST /api/features/chatbot/enable`: 启用智能客服 (-50积分)
- ✅ `GET /api/features/chatbot/config`: 获取智能客服配置

#### 配置文件
```env
DATABASE_URL=postgresql://mac@localhost:5432/shopsaas
PORT=8080
CHATBOT_BASE_URL=http://localhost:3000
CHATBOT_SHARED_SECRET=shopsaas-chatbot-secret-dev-2024
CREDIT_SHOP_CREATION=100
CREDIT_CHATBOT_ENABLEMENT=50
```

### 3. 三方集成架构

```
┌─────────────────────────────────────────────────────────┐
│                      ShopSaaS                           │
│                    (Port 8080)                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Merchant   │  │ CreditLedger │  │ Subscription  │ │
│  │   Account   │  │   (流水)     │  │  (订阅管理)   │ │
│  └─────────────┘  └──────────────┘  └───────────────┘ │
│          │                                              │
│          ▼                                              │
│  ┌─────────────────────────────────────────────────┐  │
│  │       Tenant (店铺) + TenantSecret              │  │
│  │  shopId, instanceUrl, ssoKey, webhookSecret    │  │
│  └─────────────────────────────────────────────────┘  │
└──────────────│──────────────────────│──────────────────┘
               │                      │
               │ 1. Register          │ 2. SSO JWT
               │ (x-shopsaas-secret)  │ (shopId, role)
               │                      │
               ▼                      ▼
┌──────────────────────────────────────────────────────────┐
│                   chatbot-node                           │
│                    (Port 3000)                           │
│  ┌────────────┐  ┌───────────────┐  ┌─────────────────┐│
│  │  Tenant    │  │ TenantConfig  │  │ WebhookDelivery ││
│  │  (镜像)    │  │ (name,logo,   │  │  (投递记录)     ││
│  │            │  │  syncScopes)  │  │                 ││
│  └────────────┘  └───────────────┘  └─────────────────┘│
│                          │                               │
│                          │ 3. Create/Publish Bot         │
│                          ▼                               │
│                   ┌─────────────┐                       │
│                   │  Coze API   │                       │
│                   │  (via Proxy)│                       │
│                   └─────────────┘                       │
└──────────────│────────────────────────────│──────────────┘
               │                            │
               │ 4. Config API (SSO)        │ 5. Webhooks (HMAC)
               │ GET/PUT config             │ POST /sync/:shopId/...
               ▼                            ▼
┌──────────────────────────────────────────────────────────┐
│                  EverShop Instance                       │
│                  (Per-Merchant)                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │  Admin Plugin: Chatbot Settings                    ││
│  │  - Name, Logo, Sync Scopes (Products/Orders/Promos)││
│  │  - Trigger Initial Sync                             ││
│  └─────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────┐│
│  │  Webhook Emitter                                    ││
│  │  - Product CRUD → chatbot-node                      ││
│  │  - Order CRUD → chatbot-node                        ││
│  │  - Promotion CRUD → chatbot-node                    ││
│  └─────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────┐│
│  │  Export Endpoints (for Initial Sync)                ││
│  │  - GET /api/admin/export/products?page=1            ││
│  │  - GET /api/admin/export/orders?page=1              ││
│  │  - GET /api/admin/export/promotions?page=1          ││
│  └─────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

## 积分计费模型

| 操作 | 消耗积分 | 说明 |
|------|---------|------|
| 新商户注册 | +200 | 初始赠送 |
| 创建店铺 | -100 | 一次性 |
| 启用智能客服 | -50 | 一次性 |
| 月度续费 | -10 | 每月 (待实现) |

## API 调用流程示例

### 完整开通流程

```bash
# 1. 商户注册
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass123","name":"Test Merchant"}'
# 返回: { merchant: {...}, token: "..." }

# 2. 创建店铺 (-100积分)
TOKEN="<your-token>"
curl -X POST http://localhost:8080/api/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"shopName":"My Shop"}'
# 返回: { tenant: { shopId: "shop-xxx", status: "provisioning" } }

# 3. 手动部署 EverShop (或自动化脚本)
# ... 部署容器/进程 ...

# 4. 更新实例 URL
SHOP_ID="shop-xxx"
curl -X POST http://localhost:8080/api/tenants/$SHOP_ID/provision \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"instanceUrl":"https://myshop.example.com"}'

# 5. 启用智能客服 (-50积分)
curl -X POST http://localhost:8080/api/features/chatbot/enable \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"shopId":"shop-xxx","botName":"Shop Assistant"}'
# 自动：
#  - 调用 chatbot-node /api/admin/tenants/register
#  - 创建并发布 Coze bot
#  - 生成 SSO 密钥和 Webhook 密钥

# 6. EverShop Admin 获取配置 (通过 ShopSaaS 签发的 SSO JWT)
SSO_TOKEN=$(curl -X POST http://localhost:8080/api/tenants/$SHOP_ID/sso/issue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}' | jq -r .jwt)

curl http://localhost:3000/api/admin/tenants/$SHOP_ID/config \
  -H "Authorization: Bearer $SSO_TOKEN"
# 返回: { shopId, name, logoUrl, botId, syncScopes: [] }
```

## 待实现功能 (下一阶段)

### 1. EverShop Admin 插件 (高优先级)
- [ ] Chatbot Settings 页面 UI
  - 名称、Logo 上传
  - 同步范围选择 (Products/Orders/Promotions)
  - "立即同步"按钮
- [ ] 后端 API 适配器 (调用 chatbot-node)

### 2. EverShop Webhook 发射器
- [ ] Product 事件监听 (create/update/delete)
- [ ] Order 事件监听 (create/update/status_change)
- [ ] Promotion 事件监听 (create/update/delete)
- [ ] HMAC-SHA256 签名生成

### 3. EverShop Export 端点
- [ ] `GET /api/admin/export/products?page=1&pageSize=50`
- [ ] `GET /api/admin/export/orders?page=1&pageSize=50`
- [ ] `GET /api/admin/export/promotions?page=1&pageSize=50`
- [ ] SSO JWT 验证中间件

### 4. ShopSaaS 自动化部署
- [ ] EverShop 克隆脚本
- [ ] Docker 容器编排
- [ ] 数据库初始化
- [ ] 环境变量注入 (SHOP_ID, CHATBOT_BASE, WEBHOOK_SECRET)

### 5. 运营功能
- [ ] 月度续费扣费任务
- [ ] 积分不足通知
- [ ] 订阅过期处理
- [ ] 密钥轮换 API

## 部署清单

### 本地开发环境 ✅
- [x] PostgreSQL (chatbot_node, shopsaas)
- [x] chatbot-node (localhost:3000)
- [x] ShopSaaS (localhost:8080)
- [x] Cloudflare Worker (Coze API 代理)

### 生产环境 (Fly.io)
- [x] chatbot-node (chatbot-node.fly.dev)
- [ ] ShopSaaS (待部署)
- [ ] EverShop 模板容器 (待准备)

## 关键文件位置

### chatbot-node
- `prisma/schema.prisma` - 多租户模型
- `src/middleware/auth-shopsaas.ts` - ShopSaaS 鉴权
- `src/middleware/auth-sso.ts` - SSO JWT 鉴权
- `src/services/tenant.service.ts` - 租户服务
- `src/routes/tenant-admin.routes.ts` - 管理API
- `src/routes/sync.routes.ts` - Webhook 接收
- `src/routes/import.routes.ts` - 初始同步代理

### ShopSaaS
- `prisma/schema.prisma` - 商户/租户/积分模型
- `src/services/credit.service.ts` - 积分管理
- `src/services/tenant.service.ts` - 租户管理
- `src/services/chatbot-integration.service.ts` - chatbot-node 集成
- `src/routes/auth.routes.ts` - 认证
- `src/routes/tenant.routes.ts` - 租户API
- `src/routes/feature.routes.ts` - 功能订阅API
- `INTEGRATION_GUIDE.md` - 集成文档

## 测试验证

### chatbot-node 测试
```bash
cd /Users/mac/Sync/project/drsell/chatbot-node
npm run dev  # Port 3000
```

### ShopSaaS 测试
```bash
cd ~/projects/shopsaas
npm run dev  # Port 8080
```

### 集成测试
参考 `~/projects/shopsaas/INTEGRATION_GUIDE.md` 中的 Quick Start 步骤。

## 下一步建议

1. **优先级1**: 实现 EverShop Admin 插件 UI
   - 使用现有的 `https://evershop-fly.fly.dev/admin` 作为参考
   - 创建 Chatbot Settings 页面
   - 集成配置API调用

2. **优先级2**: 实现 EverShop Webhook 和 Export
   - 监听核心业务事件
   - 发送到 chatbot-node
   - 提供分页导出接口

3. **优先级3**: ShopSaaS 自动化部署
   - EverShop 容器化
   - 一键开店脚本
   - 环境变量管理

4. **优先级4**: 生产部署和监控
   - 部署 ShopSaaS 到 Fly.io
   - 配置域名和 SSL
   - 添加监控和日志

## 总结

已完成三方集成的核心架构：
- ✅ chatbot-node 支持多租户
- ✅ ShopSaaS 平台实现
- ✅ SSO 和 Webhook 安全机制
- ✅ 积分计费系统
- ✅ API 完整对接

下一阶段重点是 EverShop 端的集成，包括 Admin 插件 UI、Webhook 发射器和 Export 端点。

