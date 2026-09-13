# AI Assistant 从假页面变成真功能（v1：人设 + 提示词 + 真实沙盒）

## Why

`apps/storefront` 的 `/ai-assistant` 页是一整页纯前端 mockup：全页 **0 个接口调用**，
"Save Settings" 存不进任何地方，"Test AI" 沙盒返回写死的假回复。但它挂在侧栏主导航，
商家点进去配置人设、点保存——什么都没发生。

后端侧，客服 system prompt 由 `buildSupportSystemPrompt(shopDomain)`
（`packages/openclaw/src/index.ts`）**硬编码**，所有店铺完全一样。商家无法定制 AI 的
人设、语气或指令。这既误导商家（配了 = 没配），也是上架审核的减分项。

（同一轮已把首页/收件箱/挂件配置里的装饰性死控件按「无功能就删」清掉；AI Assistant
是唯一确定要**建成真功能**而非删除的页面。）

## What Changes

- 在既有 `BotSetting` 模型上持久化每店 AI 人设：名字、语气、语言、自定义系统提示词、开关。
- 客服 system prompt 改为**组合**：服务端注入的安全护栏（店铺域锁定、忽略顾客注入、
  输出格式）**在前且不可被覆盖** + 商家人设/指令（受限追加、结尾重申护栏）。
- AI Assistant 页接既有的 `botSettings/shop/:domain` GET/PUT 读写（不新造模型/接口）。
- "Test AI" 沙盒改为用**草稿（未保存）设置**真正调一次 AI 试聊，店铺域仍由服务端会话决定。
- **v1 不做**：handoff 自动转人工规则；工具权限（Issue Discounts / Process Refunds
  是目前不存在的写操作工具，风险高、工量大）；头像上传。

## Impact

- 能力：修改 `conversation-context`（system prompt 的内容与所有权）。
- `apps/api`：`BotSettingDto` / `updateBotSetting` 扩字段；`AdpService` 加载人设并传入
  prompt 组装；新增沙盒预览端点。
- `packages/openclaw`：`buildSupportSystemPrompt` 增加人设参数与组合逻辑。
- `apps/storefront`：`/ai-assistant` 页接真数据（加载 / 保存 / 沙盒），输入受控。
- Prisma：`BotSetting` 迁移。
- **触及 AI 链路（AGENTS.md 陷阱 1）**：改完必须复验 tool calling 与店铺域锁定仍生效。
