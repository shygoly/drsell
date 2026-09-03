# Coze API 测试指南

> **⚠️ 已作废（2026-09-03）。仅作历史留档，不要据此判断本项目架构。**
>
> 本文档描述的 Coze 集成**已不再使用**。当前 AI 回复链路是
> `apps/api` → `packages/openclaw` → wjclaw 上的 OpenClaw gateway
> （`127.0.0.1:18790`，OpenAI 兼容，provider DeepSeek-V4）。
> 现行架构与陷阱见仓库根目录 `AGENTS.md`。

## 概述

本项目提供了两个 Coze API 测试脚本，用于验证 Coze API 是否可以正常调用。

## 前置条件

### 获取必要的凭证

1. **COZE_API_TOKEN** - Coze API 令牌
   - 登录 [Coze 平台](https://www.coze.cn)
   - 进入 "开发者中心" → "API 密钥"
   - 创建或复制现有的 API Token

2. **COZE_SPACE_ID** - Coze Space ID
   - 在 Coze 平台中创建或选择一个 Space
   - Space ID 通常在 Space 设置中可以找到

### 网络要求

- 需要能够访问 `https://api.coze.cn`
- 如果在公司网络环境，可能需要配置代理

## 测试方法

### 方法 1: Node.js 测试脚本

#### 安装依赖

```bash
# 无需额外依赖，使用 Node.js 内置的 https 模块
```

#### 运行测试

```bash
# 设置环境变量
export COZE_API_TOKEN="your_token_here"
export COZE_SPACE_ID="your_space_id_here"

# 运行测试脚本
node test-coze-api.js
```

#### 预期输出

```
╔════════════════════════════════════════╗
║     Coze API 连接测试                  ║
╚════════════════════════════════════════╝

配置检查:
✓ COZE_API_TOKEN 已设置
✓ COZE_SPACE_ID 已设置
✓ Base URL: https://api.coze.cn

=== 测试 1: 获取 Space 信息 ===
状态码: 200
✓ 成功获取 Space 信息
  Space ID: xxx
  Space Name: xxx

=== 测试 2: 获取机器人列表 ===
状态码: 200
✓ 成功获取机器人列表
  总数: 5
  机器人:
    - bot1 (ID: xxx)
    - bot2 (ID: xxx)

=== 测试 3: 获取数据集列表 ===
状态码: 200
✓ 成功获取数据集列表
  总数: 3
  数据集:
    - dataset1 (ID: xxx)
    - dataset2 (ID: xxx)

╔════════════════════════════════════════╗
║     测试总结                          ║
╚════════════════════════════════════════╝

通过: 3/3

✓ Coze API 连接正常！
```

### 方法 2: Java 测试类

#### 运行测试

```bash
# 设置环境变量
export COZE_API_TOKEN="your_token_here"
export COZE_SPACE_ID="your_space_id_here"

# 运行 Maven 测试
cd chatbotadmin
mvn test -Dtest=CozeApiTest
```

#### 预期输出

```
╔════════════════════════════════════════╗
║     Coze API 连接测试 (Java)           ║
╚════════════════════════════════════════╝

配置检查:
✓ COZE_API_TOKEN 已设置
✓ COZE_SPACE_ID 已设置
✓ Base URL: https://api.coze.cn

=== 测试 1: 获取 Space 信息 ===
状态码: 200
✓ 成功获取 Space 信息
  响应: {...}

=== 测试 2: 获取机器人列表 ===
状态码: 200
✓ 成功获取机器人列表
  响应: {...}

=== 测试 3: 获取数据集列表 ===
状态码: 200
✓ 成功获取数据集列表
  响应: {...}

╔════════════════════════════════════════╗
║     测试总结                          ║
╚════════════════════════════════════════╝

通过: 3/3

✓ Coze API 连接正常！
```

## 测试内容

### 测试 1: 获取 Space 信息

**端点:** `GET /v1/space/info?space_id={space_id}`

**功能:** 验证 API Token 是否有效，以及是否能访问指定的 Space

**成功标志:** 返回 200 状态码，包含 Space 信息

### 测试 2: 获取机器人列表

**端点:** `GET /v1/space/bots?space_id={space_id}&page_size=10`

**功能:** 验证是否能获取 Space 中的机器人列表

**成功标志:** 返回 200 状态码，包含机器人列表

### 测试 3: 获取数据集列表

**端点:** `GET /v1/space/datasets?space_id={space_id}&page_size=10`

**功能:** 验证是否能获取 Space 中的数据集列表

**成功标志:** 返回 200 状态码，包含数据集列表

## 常见问题

### 问题 1: 401 Unauthorized

**原因:** API Token 无效或过期

**解决方案:**
1. 检查 `COZE_API_TOKEN` 是否正确设置
2. 在 Coze 平台重新生成 API Token
3. 确保 Token 没有过期

### 问题 2: 403 Forbidden

**原因:** Token 没有访问该 Space 的权限

**解决方案:**
1. 检查 `COZE_SPACE_ID` 是否正确
2. 确保 Token 对应的账户有该 Space 的访问权限
3. 在 Coze 平台检查权限设置

### 问题 3: 404 Not Found

**原因:** Space 不存在或 API 端点错误

**解决方案:**
1. 验证 `COZE_SPACE_ID` 是否存在
2. 检查 Coze API 文档是否有更新

### 问题 4: 网络超时

**原因:** 网络连接问题或代理配置

**解决方案:**
1. 检查网络连接
2. 如果在公司网络，配置代理
3. 尝试增加超时时间

### 问题 5: 连接被拒绝

**原因:** 无法访问 `api.coze.cn`

**解决方案:**
1. 检查防火墙设置
2. 确保 DNS 解析正常
3. 尝试 ping `api.coze.cn` 测试连接

## 集成到项目

### 前端集成

在 `chatbot/app/models/CozeApi.server.js` 中已经集成了 Coze API 调用：

```javascript
const client = new CozeAPI({
    baseURL: COZE_CN_BASE_URL,
    token: token,
});
```

### 后端集成

在 `chatbotadmin/yudao-module-mail/coze/` 模块中已经集成了 Coze API 调用：

```java
// CozeApiServiceImpl 中的实现
public void callCozeApi() {
    // 使用 Coze API
}
```

## 进阶测试

### 测试创建机器人

```bash
# 修改测试脚本，添加 POST 请求
curl -X POST https://api.coze.cn/v1/space/bots \
  -H "Authorization: Bearer $COZE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "space_id": "'$COZE_SPACE_ID'",
    "name": "test-bot",
    "description": "Test bot"
  }'
```

### 测试上传文档

```bash
# 上传文档到数据集
curl -X POST https://api.coze.cn/v1/datasets/{dataset_id}/documents \
  -H "Authorization: Bearer $COZE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "document_bases": [
      {
        "name": "test-doc",
        "source_info": {
          "file_base64": "base64_encoded_content",
          "file_type": "txt"
        }
      }
    ]
  }'
```

## 参考资源

- [Coze API 文档](https://www.coze.cn/docs/api)
- [Coze 开发者中心](https://www.coze.cn/developer)
- [项目 Coze 集成代码](../docs/PROJECT_ANALYSIS.md#6-token-和密钥管理)

## 支持

如有问题，请：

1. 检查本文档的常见问题部分
2. 查看 Coze API 官方文档
3. 检查项目的 `docs/PROJECT_ANALYSIS.md` 中的 Coze 集成部分
