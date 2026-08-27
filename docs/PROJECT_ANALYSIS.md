# 项目深度分析文档

## 1. 项目功能概览

这是一个**多服务 AI 聊天机器人平台**，专为 Shopify 店铺设计，集成 Coze AI 平台。核心业务流程：

```
Shopify Store → Remix App (chatbot) → Java API (chatbotapi) → Java Backend (chatbotadmin)
                                                            ↓
                                                    Coze AI Platform
```

**核心功能：**
- AI 客服助手（中文）
- 知识库同步（产品、订单、客户数据）
- 实时聊天管理
- Shopify OAuth 认证
- Coze 机器人管理

---

## 2. 前端功能 (chatbot/)

**技术栈：** Remix 2.15 + React 18 + TypeScript + Shopify Polaris

### 主要路由

| 路由 | 功能 |
|------|------|
| `/app` | 主应用入口 |
| `/app/inbox` | 收件箱（聊天管理） |
| `/app/settings` | 设置页面 |
| `/app/ai_assistant` | AI 助手配置 |
| `/app/additional` | 附加功能 |
| `/auth/login` | 认证登录 |

### 核心模型文件

- `app/models/CozeApi.server.js` - Coze API 集成
- `app/models/ChadaApi.server.js` - 后端 API 调用
- `app/models/AIAsist.server.js` - 产品数据获取（GraphQL）
- `app/models/Setting.server.js` - 店铺设置管理

### 数据库模型 (Prisma)

```prisma
model Session {
  id, shop, state, isOnline, scope, expires, accessToken, userId
  firstName, lastName, email, accountOwner, locale, collaborator
  emailVerified, cozebotInfoId
}

model CozebotInfo {
  id, cozebotId, cozeApi, companyLogo
}

model GeneralSettings {
  id, storeName, logo, avatar
}
```

### 与后端交互

- 基础 URL: `https://coze.szchada.top/` 和 `http://bizmail.szchada.com/`
- 端点：`/botSettings`, `/admin-api/mail/shopify/auth/login`
- Token 缓存机制用于性能优化

---

## 3. 中间层 API 功能 (chatbotapi/)

**技术栈：** Spring Boot 3.4.4 + Java 17 + JPA + MySQL

### 主要 Controller 和端点

| Controller | 端点 | 功能 |
|-----------|------|------|
| BotSettingController | `/botSettings` | CRUD 机器人设置 |
| InboxUserController | `/inboxUser` | 收件箱用户管理 |
| OAuthController | `/oauth/token` | Coze OAuth 令牌获取 |

### 关键实体

```java
BotSetting {
  id: Long
  shopId: String (unique)
  botId: String
  shopName: String
  chatLogo: String
  chatAvatar: String
}

InboxUser {
  // 收件箱用户数据
}
```

### Coze OAuth 集成

- 文件：`src/main/java/com/chada/chatbot/chatapi/oauth/CozeOauthService.java`
- 使用 JWT OAuth 方式
- 私钥存储：`src/main/resources/private_key.pem`
- 配置：`application.properties`

### 配置示例

```properties
spring.datasource.url=jdbc:mysql://szchada520.mysql.rds.aliyuncs.com:3306/chadatest
coze.oauth.clientId=1125091591863
coze.oauth.publicKey=u21zmMeHEVhTBVjuPYS_kmAiWl90gtXs_TwGioPcH_Q
coze.oauth.baseUrl=https://api.coze.cn
```

---

## 4. 后端功能 (chatbotadmin/)

**技术栈：** Spring Boot 2.7.18 + Yudao 框架 + MyBatis Plus + MySQL/PostgreSQL

### 核心模块结构

```
yudao-server/                    # 主应用入口
yudao-module-system/             # 系统管理（用户、角色、权限）
yudao-module-infra/              # 基础设施（文件、配置、任务）
yudao-module-mail/               # 邮件和 Shopify 集成 ⭐
yudao-module-bpm/                # 业务流程管理（Flowable）
```

### yudao-module-mail/ 详细结构

| 模块 | 功能 |
|------|------|
| `shopifyauth/` | Shopify OAuth 认证、数据同步 |
| `coze/` | Coze API 调用、OAuth、数据集上传 |
| `shopifybotsetting/` | 机器人设置管理 |
| `shopifyinboxuser/` | 收件箱用户管理 |
| `product/` | 产品数据管理 |
| `order/` | 订单数据管理 |
| `customer/` | 客户数据管理 |
| `cozechathistory/` | 聊天历史记录 |

### 关键 Controller

```java
ShopifyAuthController (/mail/shopify/auth)
  - POST /login                    # Shopify 用户登录
  - GET /getTenantId/{shopId}      # 获取租户 ID
  - GET /initialization/**         # 初始化流程

CozeApiController (/mail/coze)
  - 聊天接口
  - 数据集管理
  - OAuth 令牌处理

ShopifyBotSettingController (/mail/shopifybotsetting)
  - 机器人设置 CRUD
```

### 关键服务

- `ShopifyAuthServiceImpl` - 认证和用户管理
- `CozeApiServiceImpl` - Coze API 调用（聊天、数据集、文件上传）
- `CozeOauthServiceImpl` - OAuth 令牌管理（JWT 和 Web OAuth）
- `ShopifyDataSyncService` - 异步数据同步
- `CozeDatasetUploadService` - 知识库上传

---

## 5. Shopify 集成

### 认证流程

1. Shopify 店铺通过 OAuth 授权
2. 获取 `shop_id` 和 `access_token`
3. 调用 `/admin-api/mail/shopify/auth/login` 登录
4. 系统创建租户和用户账户
5. 返回 JWT token 用于后续请求

### 数据同步

```java
ShopifyDataSyncService.syncProductsAsync()
  ↓
ShopifyApi.processAllProductsReactive()  // 使用 WebClient 异步获取
  ↓
ShopifyProductService.saveProductData()  // 保存到数据库
  ↓
CozeDatasetUploadService.startUploadRequestByType()  // 上传到 Coze
```

### Shopify API 调用

- 使用 WebClient (Spring WebFlux) 进行异步 HTTP 请求
- 支持代理配置（用于网络隔离环境）
- GraphQL 查询获取产品、订单、客户数据

### 配置 (application-local.yaml)

```yaml
shopify:
  client:
    id: f286a4af8f1d80cb8e6228bc648f4786
    secret: a79e38df2ac8faa08f9ae49100378408
  proxy:
    enabled: true
    host: 127.0.0.1
    port: 7890
```

---

## 6. Token 和密钥管理

### Shopify Token

- 存储位置：`ShopifyMappingUserDO` 数据表
- 使用方式：在 `ShopifyApi` 中用于 GraphQL 查询
- 缓存：Redis 缓存机制（前端 `TokenCache.js`）

### Coze Token

**JWT OAuth 方式：**
- 私钥文件：`yudao-server/src/main/resources/private_key.pem`
- 配置：`coze.oauth.clientId`, `coze.oauth.publicKey`
- 用途：服务端获取 Coze API 访问令牌

**Web OAuth 方式：**
- 配置：`coze.oauth2.clientId`, `coze.oauth2.publicKey`
- 用途：用户授权获取令牌

**存储：** Redis 缓存（`StringRedisTemplate`）

### 其他 Token

- Shopify API Token：用于 GraphQL 查询
- Coze API Token：用于 SDK 调用（前端 `COZE_API_TOKEN`）

---

## 7. 数据库配置

### 支持的数据库

- MySQL 5.7/8.0+（生产环境）
- PostgreSQL（Fly.io 部署）
- Oracle、SQLServer、DM、KingbaseES（可选）

### 主要数据表（mail 模块）

```sql
shopify_bot_setting          # 机器人设置
shopify_inbox_user           # 收件箱用户
shopify_product              # 产品数据
shopify_order                # 订单数据
shopify_customer             # 客户数据
shopify_mapping_user         # Shopify 用户映射
coze_conversation            # Coze 对话
coze_chat_history            # 聊天历史
coze_info                    # Coze 信息
coze_dataset_upload_status   # 数据集上传状态
```

### MyBatis Plus 配置

- ID 生成：NONE（自动适配 AUTO/INPUT）
- 逻辑删除：1（已删除）/ 0（未删除）
- 方言：MySQL8Dialect / PostgreSQL

---

## 8. 部署和环境配置

### Fly.io 部署配置 (fly.toml)

```toml
app = "chatbotadmin"
primary_region = "sin"

[build]
dockerfile = "Dockerfile.optimized"

[env]
SPRING_PROFILES_ACTIVE = "flyio-minimal"
REDIS_HOST = "fly-chatbotadmin-redis.upstash.io"
REDIS_PORT = "6379"

[http_service]
internal_port = 48080
force_https = true
min_machines_running = 1

[[vm]]
memory_mb = 2048
cpu_kind = "shared"
cpus = 1
```

### 环境配置文件

| 文件 | 用途 |
|------|------|
| `application.yaml` | 主配置 |
| `application-local.yaml` | 本地开发（PostgreSQL） |
| `application-dev.yaml` | 开发环境 |
| `application-prod.yaml` | 生产环境（MySQL） |
| `application-mysql.yaml` | MySQL 配置示例 |
| `application-postgresql.yaml` | PostgreSQL 配置 |
| `application-flyio.yaml` | Fly.io 部署 |
| `application-flyio-minimal.yaml` | Fly.io 最小化配置 |

### 关键环境变量

```yaml
# 数据库
spring.datasource.url: jdbc:postgresql://127.0.0.1:5432/ruoyi-vue-pro
spring.datasource.username: mac

# Redis
spring.redis.host: 127.0.0.1
spring.redis.port: 6379
spring.redis.database: 14

# Coze OAuth
coze.oauth.clientId: 1133483935040
coze.oauth.publicKey: _VzHkKSlwVT2yfAcNrZraFCpusQjQ7pXpEagzYheN7s
coze.oauth.baseUrl: https://api.coze.cn

# Shopify
shopify.client.id: f286a4af8f1d80cb8e6228bc648f4786
shopify.client.secret: a79e38df2ac8faa08f9ae49100378408
```

### Docker 部署

```dockerfile
# Dockerfile.optimized 用于 Fly.io
# 基础镜像：Java 17
# 端口：48080
# 健康检查：/actuator/health
```

### 开发、测试、生产环境差异

| 方面 | 本地 | 开发 | 生产 | Fly.io |
|------|------|------|------|--------|
| 数据库 | PostgreSQL | MySQL | MySQL | PostgreSQL |
| Redis | 本地 | 远程 | 远程 | Upstash |
| Quartz | 禁用 | 启用 | 启用 | 禁用 |
| 日志 | DEBUG | INFO | INFO | INFO |
| Druid 监控 | 启用 | 启用 | 禁用 | 禁用 |

---

## 9. 关键文件位置总结

### 前端 (chatbot/)

- `/Users/mac/Sync/project/drsell/chatbot/app/routes/` - 路由定义
- `/Users/mac/Sync/project/drsell/chatbot/app/models/` - 业务逻辑
- `/Users/mac/Sync/project/drsell/chatbot/prisma/schema.prisma` - 数据库模型
- `/Users/mac/Sync/project/drsell/chatbot/shopify.app.toml` - Shopify 配置

### 中间层 API (chatbotapi/)

- `/Users/mac/Sync/project/drsell/chatbotapi/src/main/java/com/chada/chatbot/chatapi/controller/` - 控制器
- `/Users/mac/Sync/project/drsell/chatbotapi/src/main/java/com/chada/chatbot/chatapi/oauth/` - OAuth 实现
- `/Users/mac/Sync/project/drsell/chatbotapi/src/main/resources/application.properties` - 配置

### 后端 (chatbotadmin/)

- `/Users/mac/Sync/project/drsell/chatbotadmin/yudao-module-mail/` - 邮件和 Shopify 模块
- `/Users/mac/Sync/project/drsell/chatbotadmin/yudao-server/src/main/resources/` - 配置文件
- `/Users/mac/Sync/project/drsell/chatbotadmin/sql/` - 数据库脚本
- `/Users/mac/Sync/project/drsell/chatbotadmin/yudao-server/fly.toml` - Fly.io 配置

---

## 10. 技术栈总结

| 层级 | 技术 | 版本 |
|------|------|------|
| **前端** | Remix | 2.15 |
| | React | 18.2 |
| | TypeScript | 5.2 |
| | Shopify Polaris | 12.0 |
| **中间层** | Spring Boot | 3.4.4 |
| | Java | 17 |
| | JPA | - |
| **后端** | Spring Boot | 2.7.18 |
| | Java | 8+ |
| | MyBatis Plus | - |
| | Yudao 框架 | 2.4.1 |
| **数据库** | MySQL | 5.7/8.0+ |
| | PostgreSQL | 12+ |
| **缓存** | Redis | 5.0/6.0/7.0 |
| **工作流** | Flowable | 6.8.0 |
| **AI** | Coze | - |

---

## 总结

这个项目是一个完整的企业级 SaaS 平台，具有：
- 多租户支持
- 复杂的数据同步机制
- 深度的第三方集成（Shopify、Coze）
- 灵活的部署选项（本地、云端、Fly.io）
- 完善的认证和授权体系
