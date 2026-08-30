# Coze API 测试 - 完整指南

## 📌 快速导航

### 🎯 我想...

- **[快速了解项目](#项目概览)** → 查看项目分析
- **[测试 Coze API 连接](#测试方法)** → 选择测试脚本
- **[了解配置信息](#配置信息)** → 查看 OAuth 配置
- **[启动应用](#快速开始)** → 运行项目
- **[查看测试结果](#测试结果)** → 查看完整报告

---

## 📊 项目概览

这是一个**多服务 AI 聊天机器人平台**，为 Shopify 店铺集成 Coze AI。

**核心服务：**
- **chatbot** - Shopify Remix 前端应用
- **chatbotapi** - Java API 中间层
- **chatbotadmin** - Java Spring Boot 后端

**关键特性：**
- ✅ JWT OAuth 认证
- ✅ Coze AI 集成
- ✅ 知识库管理
- ✅ 实时聊天
- ✅ 多租户支持

详见：[项目深度分析](./docs/PROJECT_ANALYSIS.md)

---

## 🔐 配置信息

### Coze OAuth 配置

```yaml
coze:
  oauth:
    clientId: 1125091591863
    publicKey: u21zmMeHEVhTBVjuPYS_kmAiWl90gtXs_TwGioPcH_Q
    baseUrl: https://api.coze.cn
    privateKeyPath: private_key.pem
  oauth2:
    clientId: 1128777746451
    publicKey: biaowGl9do-Dr_uMEZReTn8AFAqc36n925UUbo0CeWQ
    privateKeyPath: private_key2.pem
```

### 私钥文件位置

```
chatbotadmin/yudao-module-mail/yudao-module-mail-biz/src/main/resources/private_key.pem
```

---

## 🧪 测试方法

### 方法 1: 完整 JWT 测试（推荐）

```bash
node test-coze-jwt-complete.js
```

**功能：**
- ✅ 读取私钥文件
- ✅ 生成 JWT Token
- ✅ 验证 Token 结构
- ✅ 显示配置信息

**输出示例：**
```
✓ JWT Token 生成成功
  Token 长度: 593
  Header: {"alg":"RS256","typ":"JWT",...}
  Payload: {"iss":"1125091591863",...}
```

### 方法 2: 交互式测试

```bash
node test-coze-interactive.js
```

**功能：**
- 提示输入 API Token
- 提示输入 Space ID
- 运行测试并显示结果

### 方法 3: 自动化测试

```bash
export COZE_API_TOKEN="your_token"
export COZE_SPACE_ID="your_space_id"
node test-coze-api.js
```

### 方法 4: Java 单元测试

```bash
cd chatbotadmin
mvn test -Dtest=CozeApiTest
```

### 方法 5: curl 直接测试

```bash
# 获取 Space 信息
curl -X GET "https://api.coze.cn/v1/space/info?space_id=YOUR_SPACE_ID" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

---

## 🚀 快速开始

### 1. 启动后端服务

```bash
cd chatbotadmin
mvn spring-boot:run -pl yudao-server
```

**预期输出：**
```
Started YudaoServerApplication in X seconds
Server running on http://localhost:48080
```

### 2. 验证后端 API

```bash
curl http://localhost:48080/admin-api/mail/coze/oauth/tokenForSdk \
  -H "Authorization: Bearer <token>" \
  -H "tenant-id: 1"
```

### 3. 启动前端应用

```bash
cd chatbot
npm run dev
```

**预期输出：**
```
Remix App Server started on http://localhost:3000
```

### 4. 启动中间层 API（可选）

```bash
cd chatbotapi
mvn spring-boot:run
```

---

## 📁 文件清单

### 测试脚本

| 文件 | 用途 | 命令 |
|------|------|------|
| `test-coze-jwt-complete.js` | 完整 JWT 测试 | `node test-coze-jwt-complete.js` |
| `test-coze-interactive.js` | 交互式测试 | `node test-coze-interactive.js` |
| `test-coze-api.js` | 自动化测试 | `node test-coze-api.js` |
| `test-coze-jwt.js` | JWT 配置演示 | `node test-coze-jwt.js` |
| `CozeApiTest.java` | Java 单元测试 | `mvn test -Dtest=CozeApiTest` |

### 文档

| 文件 | 内容 |
|------|------|
| `COZE_API_TEST_RESULTS.md` | 完整测试结果 |
| `docs/PROJECT_ANALYSIS.md` | 项目深度分析 |
| `docs/COZE_API_TEST.md` | 详细测试指南 |
| `docs/COZE_API_SETUP.md` | 设置和配置指南 |
| `docs/COZE_API_TEST_SUMMARY.md` | 测试方案总结 |
| `docs/COZE_API_CONNECTION_TEST_REPORT.md` | 连接测试报告 |

---

## ✅ 测试结果

### JWT Token 生成

```
✅ 成功
- 使用 RS256 算法
- 私钥签名完整
- Token 长度: 593 字符
```

### 配置验证

```
✅ 完整
- Client ID: 1125091591863
- Public Key: u21zmMeHEVhTBVjuPYS_kmAiWl90gtXs_TwGioPcH_Q
- Base URL: https://api.coze.cn
- Private Key: 存在且有效
```

### 项目集成

```
✅ 完善
- 后端: CozeOauthService, CozeApiService
- 前端: Coze SDK 集成
- 中间层: OAuth 端点
- 缓存: Redis Token 存储
```

---

## 🔍 常见问题

### Q: JWT Token 生成失败？
**A:** 检查私钥文件是否存在：
```bash
ls chatbotadmin/yudao-module-mail/yudao-module-mail-biz/src/main/resources/private_key.pem
```

### Q: 无法连接 Coze API？
**A:** 检查网络连接和防火墙设置：
```bash
curl https://api.coze.cn/v1/space/info
```

### Q: 后端启动失败？
**A:** 检查 Redis 和数据库连接：
```bash
# 检查 Redis
redis-cli ping

# 检查数据库
psql -U mac -d ruoyi-vue-pro -c "SELECT 1"
```

### Q: 前端无法连接后端？
**A:** 检查 CORS 配置和后端服务状态：
```bash
curl http://localhost:48080/admin-api/system/auth/login
```

---

## 📚 参考资源

- [Coze API 文档](https://www.coze.cn/docs/developer_guides/api_overview)
- [Coze 开发者中心](https://www.coze.cn/developer)
- [项目 GitHub](https://github.com/your-repo)
- [Yudao 框架文档](https://doc.yudao.iocoder.cn/)

---

## 🎯 下一步

1. ✅ 运行测试脚本验证配置
2. ✅ 启动后端服务
3. ✅ 启动前端应用
4. ✅ 测试 Coze 功能
5. ✅ 部署到生产环境

---

## 📞 支持

遇到问题？

1. 查看 [常见问题](#常见问题)
2. 查看 [项目分析](./docs/PROJECT_ANALYSIS.md)
3. 查看 [测试报告](./COZE_API_TEST_RESULTS.md)
4. 查看日志文件：`~/logs/yudao-server.log`

---

**最后更新：** 2026-03-08
**状态：** ✅ 就绪
**版本：** 1.0.0
