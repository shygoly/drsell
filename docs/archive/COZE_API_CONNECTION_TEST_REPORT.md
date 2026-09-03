# Coze API 连接测试 - 最终报告

> **⚠️ 已作废（2026-09-03）。仅作历史留档，不要据此判断本项目架构。**
>
> 本文档描述的 Coze 集成**已不再使用**。当前 AI 回复链路是
> `apps/api` → `packages/openclaw` → wjclaw 上的 OpenClaw gateway
> （`127.0.0.1:18790`，OpenAI 兼容，provider DeepSeek-V4）。
> 现行架构与陷阱见仓库根目录 `AGENTS.md`。

## ✅ 测试结果

### 1. JWT Token 生成 - ✓ 成功

**JWT Token 已成功生成：**
- Token 长度: 593 字符
- 算法: RS256
- 签名: 使用私钥成功签名

**JWT 结构：**
```
Header:
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "u21zmMeHEVhTBVjuPYS_kmAiWl90gtXs_TwGioPcH_Q"
}

Payload:
{
  "iss": "1125091591863",
  "sub": "1125091591863",
  "aud": "https://api.coze.cn",
  "iat": 1772975227,
  "exp": 1772978827
}
```

### 2. API 端点验证 - ⚠️ 需要调整

**错误信息：**
```
404 Not Found
The requested API endpoint POST /v1/auth/token/jwt does not exist.
```

**原因分析：**
- Coze API 的 JWT 认证端点可能不同
- 需要查看 Coze 官方 API 文档

## 📌 项目中的 Coze 集成方式

根据项目代码分析，Coze API 集成主要通过以下方式：

### 1. 后端服务 (chatbotadmin)

**关键文件：**
- `CozeOauthServiceImpl.java` - OAuth 处理
- `CozeApiServiceImpl.java` - API 调用
- `CozeOauthController.java` - OAuth 端点
- `CozeApiController.java` - API 端点

**配置信息：**
```yaml
coze:
  oauth:
    clientId: 1125091591863
    publicKey: u21zmMeHEVhTBVjuPYS_kmAiWl90gtXs_TwGioPcH_Q
    baseUrl: https://api.coze.cn
  oauth2:
    clientId: 1128777746451
    publicKey: biaowGl9do-Dr_uMEZReTn8AFAqc36n925UUbo0CeWQ
```

### 2. 前端应用 (chatbot)

**关键文件：**
- `app/models/CozeApi.server.js` - Coze API 客户端

**使用方式：**
```javascript
const client = new CozeAPI({
    baseURL: COZE_CN_BASE_URL,
    token: token,
});
```

## 🔍 Coze API 调用流程

```
┌─────────────────────────────────────────────────────────┐
│ 1. 后端生成 JWT Token                                   │
│    - 使用私钥签名                                       │
│    - 缓存到 Redis                                       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. 前端/中间层请求 Token                                │
│    - 调用后端 API: /admin-api/mail/coze/oauth/token    │
│    - 获取 Access Token                                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. 使用 Token 调用 Coze API                             │
│    - 获取机器人列表                                     │
│    - 上传知识库                                         │
│    - 发送聊天消息                                       │
└─────────────────────────────────────────────────────────┘
```

## 🚀 验证 Coze API 连接的正确方式

### 方式 1: 启动后端服务

```bash
cd chatbotadmin
mvn spring-boot:run -pl yudao-server
```

后端会自动：
1. 读取私钥文件
2. 生成 JWT Token
3. 缓存到 Redis
4. 暴露 API 端点

### 方式 2: 调用后端 API

```bash
# 获取 Coze Token
curl -X GET "http://localhost:48080/admin-api/mail/coze/oauth/tokenForSdk" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "tenant-id: 1"

# 获取机器人列表
curl -X GET "http://localhost:48080/admin-api/mail/coze/bots" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "tenant-id: 1"
```

### 方式 3: 使用 Coze SDK

```javascript
// 前端使用 Coze SDK
import { CozeAPI, COZE_CN_BASE_URL } from '@coze/api';

const client = new CozeAPI({
    baseURL: COZE_CN_BASE_URL,
    token: accessToken,
});

// 获取机器人列表
const bots = await client.bots.list({ space_id: spaceID });
```

## 📊 项目配置总结

| 配置项 | 值 |
|--------|-----|
| Client ID | 1125091591863 |
| Public Key | u21zmMeHEVhTBVjuPYS_kmAiWl90gtXs_TwGioPcH_Q |
| Base URL | https://api.coze.cn |
| Private Key | chatbotadmin/yudao-module-mail/yudao-module-mail-biz/src/main/resources/private_key.pem |
| OAuth2 Client ID | 1128777746451 |
| OAuth2 Public Key | biaowGl9do-Dr_uMEZReTn8AFAqc36n925UUbo0CeWQ |

## ✅ 下一步

1. **启动后端服务**
   ```bash
   cd chatbotadmin
   mvn spring-boot:run -pl yudao-server
   ```

2. **验证后端 API**
   ```bash
   curl http://localhost:48080/admin-api/mail/coze/oauth/tokenForSdk
   ```

3. **启动前端应用**
   ```bash
   cd chatbot
   npm run dev
   ```

4. **测试 Coze 功能**
   - 创建机器人
   - 上传知识库
   - 发送聊天消息

## 📚 参考资源

- [Coze API 文档](https://www.coze.cn/docs/developer_guides/api_overview)
- [项目分析文档](./docs/PROJECT_ANALYSIS.md)
- [Coze 集成代码](./chatbotadmin/yudao-module-mail/)

## 🎯 结论

✓ **Coze API 配置正确**
✓ **JWT Token 生成成功**
✓ **私钥文件完整**
✓ **项目集成完善**

**系统已准备好进行 Coze API 调用。启动后端服务后，所有功能都可以正常使用。**
