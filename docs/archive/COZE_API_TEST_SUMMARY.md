# Coze API 测试 - 完整方案总结

> **⚠️ 已作废（2026-09-03）。仅作历史留档，不要据此判断本项目架构。**
>
> 本文档描述的 Coze 集成**已不再使用**。当前 AI 回复链路是
> `apps/api` → `packages/openclaw` → wjclaw 上的 OpenClaw gateway
> （`127.0.0.1:18790`，OpenAI 兼容，provider DeepSeek-V4）。
> 现行架构与陷阱见仓库根目录 `AGENTS.md`。

## 📦 已创建的文件

### 1. 测试脚本

#### `test-coze-api.js` - 自动化测试脚本
- **用途**: 自动测试 Coze API 连接
- **使用方式**:
  ```bash
  export COZE_API_TOKEN="your_token"
  export COZE_SPACE_ID="your_space_id"
  node test-coze-api.js
  ```
- **功能**:
  - 验证 API Token 有效性
  - 获取 Space 信息
  - 列出机器人
  - 列出数据集

#### `test-coze-interactive.js` - 交互式测试工具
- **用途**: 交互式输入凭证并测试
- **使用方式**:
  ```bash
  node test-coze-interactive.js
  ```
- **功能**:
  - 提示输入 API Token
  - 提示输入 Space ID
  - 运行测试并显示结果
  - 提供故障排查建议

#### `CozeApiTest.java` - Java 测试类
- **用途**: 在 Maven 项目中运行测试
- **使用方式**:
  ```bash
  export COZE_API_TOKEN="your_token"
  export COZE_SPACE_ID="your_space_id"
  cd chatbotadmin
  mvn test -Dtest=CozeApiTest
  ```
- **位置**: `chatbotadmin/yudao-server/src/test/java/cn/iocoder/yudao/CozeApiTest.java`

### 2. 文档

#### `docs/COZE_API_TEST.md` - 详细测试指南
- 前置条件和凭证获取
- 三种测试方法
- 测试内容说明
- 常见问题解决

#### `docs/COZE_API_SETUP.md` - 设置和配置指南
- 如何获取 API Token 和 Space ID
- 快速测试方式
- 项目中的 Coze 配置
- 测试场景示例

#### `docs/PROJECT_ANALYSIS.md` - 项目深度分析
- 项目功能概览
- 前端、中间层、后端功能
- Shopify 集成
- Token 和密钥管理
- 数据库配置
- 部署配置

## 🚀 快速开始

### 步骤 1: 获取凭证

1. 登录 [Coze 平台](https://www.coze.cn)
2. 进入 "开发者中心" → "API 密钥"
3. 创建或复制 API Token
4. 获取 Space ID

### 步骤 2: 选择测试方式

#### 方式 A: 自动化测试（推荐）
```bash
export COZE_API_TOKEN="your_token_here"
export COZE_SPACE_ID="your_space_id_here"
node test-coze-api.js
```

#### 方式 B: 交互式测试
```bash
node test-coze-interactive.js
# 按提示输入 Token 和 Space ID
```

#### 方式 C: Java 测试
```bash
export COZE_API_TOKEN="your_token_here"
export COZE_SPACE_ID="your_space_id_here"
cd chatbotadmin
mvn test -Dtest=CozeApiTest
```

#### 方式 D: curl 直接测试
```bash
curl -X GET "https://api.coze.cn/v1/space/info?space_id=YOUR_SPACE_ID" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

### 步骤 3: 验证结果

成功的测试应该显示：
- ✓ Space 信息获取成功
- ✓ 机器人列表获取成功
- ✓ 数据集列表获取成功

## 📊 测试覆盖范围

### 测试 1: Space 信息
- **端点**: `GET /v1/space/info`
- **验证**: API Token 有效性和 Space 访问权限

### 测试 2: 机器人列表
- **端点**: `GET /v1/space/bots`
- **验证**: 能否获取 Space 中的机器人

### 测试 3: 数据集列表
- **端点**: `GET /v1/space/datasets`
- **验证**: 能否获取 Space 中的数据集

## 🔧 项目集成

### 前端集成 (chatbot/)
```javascript
// app/models/CozeApi.server.js
const token = process.env.COZE_API_TOKEN
const spaceID = process.env.COZE_SPACE_ID

const client = new CozeAPI({
    baseURL: COZE_CN_BASE_URL,
    token: token,
});
```

### 后端集成 (chatbotadmin/)
```yaml
# application-local.yaml
coze:
  oauth:
    clientId: 1133483935040
    publicKey: _VzHkKSlwVT2yfAcNrZraFCpusQjQ7pXpEagzYheN7s
    baseUrl: https://api.coze.cn
```

## ❌ 常见问题

### 问题 1: 401 Unauthorized
**原因**: Token 无效或过期
**解决**: 重新生成 Token

### 问题 2: 403 Forbidden
**原因**: 无权访问该 Space
**解决**: 检查权限设置

### 问题 3: 404 Not Found
**原因**: Space 不存在
**解决**: 验证 Space ID

### 问题 4: 网络超时
**原因**: 网络连接问题
**解决**: 检查防火墙/代理

## 📚 参考资源

- [Coze API 文档](https://www.coze.cn/docs/api)
- [Coze 开发者中心](https://www.coze.cn/developer)
- [项目分析文档](./docs/PROJECT_ANALYSIS.md)
- [测试指南](./docs/COZE_API_TEST.md)
- [设置指南](./docs/COZE_API_SETUP.md)

## ✅ 下一步

1. **获取凭证** - 从 Coze 平台获取 API Token 和 Space ID
2. **运行测试** - 使用上述任一方式验证连接
3. **配置项目** - 在项目中设置环境变量
4. **集成功能** - 在应用中使用 Coze API
5. **部署上线** - 配置生产环境

## 📝 文件清单

```
/Users/mac/Sync/project/drsell/
├── test-coze-api.js                    # 自动化测试脚本
├── test-coze-interactive.js            # 交互式测试工具
├── docs/
│   ├── PROJECT_ANALYSIS.md             # 项目深度分析
│   ├── COZE_API_TEST.md                # 详细测试指南
│   └── COZE_API_SETUP.md               # 设置和配置指南
└── chatbotadmin/
    └── yudao-server/src/test/java/
        └── cn/iocoder/yudao/
            └── CozeApiTest.java        # Java 测试类
```

---

**准备好了吗？** 获取你的 Coze API Token 和 Space ID，然后运行测试！

```bash
node test-coze-interactive.js
```
