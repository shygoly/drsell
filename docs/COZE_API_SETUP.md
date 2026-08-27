# Coze API 测试 - 完整指南

## 问题诊断

要测试 Coze API 连接，需要以下信息：

### 1. 获取 COZE_API_TOKEN

**步骤：**
1. 登录 [Coze 平台](https://www.coze.cn)
2. 进入 "开发者中心" → "API 密钥"
3. 创建新的 API Token 或复制现有的
4. 复制 Token 值

**示例：**
```bash
export COZE_API_TOKEN="pat_xxx...xxx"
```

### 2. 获取 COZE_SPACE_ID

**步骤：**
1. 在 Coze 平台中创建或选择一个 Space
2. 进入 Space 设置
3. 找到 Space ID（通常在 URL 中或设置页面）
4. 复制 Space ID

**示例：**
```bash
export COZE_SPACE_ID="7123456789"
```

## 快速测试

### 方式 1: 使用 Node.js 脚本

```bash
# 1. 设置环境变量
export COZE_API_TOKEN="your_token_here"
export COZE_SPACE_ID="your_space_id_here"

# 2. 运行测试
node test-coze-api.js
```

### 方式 2: 使用 curl 直接测试

```bash
# 测试 Space 信息
curl -X GET "https://api.coze.cn/v1/space/info?space_id=YOUR_SPACE_ID" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json"

# 测试机器人列表
curl -X GET "https://api.coze.cn/v1/space/bots?space_id=YOUR_SPACE_ID&page_size=10" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json"

# 测试数据集列表
curl -X GET "https://api.coze.cn/v1/space/datasets?space_id=YOUR_SPACE_ID&page_size=10" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json"
```

### 方式 3: 使用 Java 测试

```bash
# 1. 设置环境变量
export COZE_API_TOKEN="your_token_here"
export COZE_SPACE_ID="your_space_id_here"

# 2. 运行 Maven 测试
cd chatbotadmin
mvn test -Dtest=CozeApiTest
```

## 项目中的 Coze 配置

### 前端配置 (chatbot/)

**文件:** `app/models/CozeApi.server.js`

```javascript
const token = process.env.COZE_API_TOKEN || "input your coze api token"
const spaceID = process.env.COZE_SPACE_ID || "input yout space id"

const client = new CozeAPI({
    baseURL: COZE_CN_BASE_URL,
    token: token,
});
```

### 后端配置 (chatbotadmin/)

**文件:** `yudao-server/src/main/resources/application-local.yaml`

```yaml
coze:
  oauth:
    clientId: 1133483935040
    publicKey: _VzHkKSlwVT2yfAcNrZraFCpusQjQ7pXpEagzYheN7s
    baseUrl: https://api.coze.cn
  oauth2:
    clientId: 1128777746451
    publicKey: biaowGl9do-Dr_uMEZReTn8AFAqc36n925UUbo0CeWQ
```

## 测试场景

### 场景 1: 验证 API Token 有效性

```bash
# 获取 Space 信息
curl -X GET "https://api.coze.cn/v1/space/info?space_id=$COZE_SPACE_ID" \
  -H "Authorization: Bearer $COZE_API_TOKEN"

# 预期响应 (200 OK):
# {
#   "space_id": "7123456789",
#   "space_name": "My Space",
#   "created_at": 1234567890,
#   "updated_at": 1234567890
# }
```

### 场景 2: 获取机器人列表

```bash
curl -X GET "https://api.coze.cn/v1/space/bots?space_id=$COZE_SPACE_ID&page_size=10" \
  -H "Authorization: Bearer $COZE_API_TOKEN"

# 预期响应 (200 OK):
# {
#   "total": 2,
#   "space_bots": [
#     {
#       "bot_id": "7123456789",
#       "bot_name": "My Bot",
#       "description": "Bot description"
#     }
#   ]
# }
```

### 场景 3: 获取数据集列表

```bash
curl -X GET "https://api.coze.cn/v1/space/datasets?space_id=$COZE_SPACE_ID&page_size=10" \
  -H "Authorization: Bearer $COZE_API_TOKEN"

# 预期响应 (200 OK):
# {
#   "total": 1,
#   "dataset_list": [
#     {
#       "dataset_id": "7123456789",
#       "name": "My Dataset",
#       "description": "Dataset description"
#     }
#   ]
# }
```

## 常见错误和解决方案

| 错误 | 原因 | 解决方案 |
|------|------|--------|
| 401 Unauthorized | Token 无效或过期 | 重新生成 Token |
| 403 Forbidden | 无权访问该 Space | 检查权限设置 |
| 404 Not Found | Space 不存在 | 验证 Space ID |
| 500 Internal Server Error | 服务器错误 | 检查 Coze 平台状态 |
| 网络超时 | 网络连接问题 | 检查防火墙/代理 |

## 下一步

1. **获取凭证** - 从 Coze 平台获取 API Token 和 Space ID
2. **运行测试** - 使用上述任一方式运行测试
3. **验证连接** - 确保所有测试都通过
4. **集成应用** - 在项目中使用 Coze API

## 参考资源

- [Coze API 文档](https://www.coze.cn/docs/api)
- [Coze 开发者中心](https://www.coze.cn/developer)
- [项目 Coze 集成分析](./PROJECT_ANALYSIS.md#6-token-和密钥管理)
