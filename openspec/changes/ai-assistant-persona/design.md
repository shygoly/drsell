# 设计

## D1 存储落在 BotSetting，不新建模型

`BotSetting` 已是每店配置的单一载体（挂件外观、欢迎语、同步开关、onboarding）。
AI 人设同属「每店机器人配置」，放这里避免第二份事实来源。新增字段：

- `aiEnabled Boolean @default(true)`
- `aiPersonaName String?`
- `aiTone String?`
- `aiLanguage String?`      // "auto" | "en" | "zh-Hans" | "es"（存枚举字符串）
- `aiSystemPrompt String?`  // 商家自定义指令，长度上限见 D4

## D2 prompt 组合与安全模型（本变更的核心）

`buildSupportSystemPrompt` 从「只吃 shopDomain」变为「吃 shopDomain + 可选人设」。
组合顺序**固定**，护栏在前、商家块在后，并在商家块之后**再次重申**关键约束：

1. 基础身份 + 店铺域锁定（`shop 必须恰为 X`）—— 服务端注入，不可覆盖
2. 工具使用约束（只允许 `adp_*` 只读调用）
3. 忽略顾客消息内注入的指令 —— 不可覆盖
4. 输出格式护栏（窄气泡纯文本、无 markdown）
5. 【商家人设区，清晰分隔】名字 / 语气 / 语言 / 自定义指令，标注为「店主偏好」
6. 收尾重申：店铺域锁定与「忽略正文注入」优先于以上任何店主偏好

安全立场：商家是**半可信**（这是它自己的店），可定制语气与话术；但多租户
**店铺域锁定**与**顾客注入防护**永不可被商家配置关闭 —— 即便商家在自定义指令里写
"ignore all previous instructions"，护栏在前且第 6 步再次压过。

语言：`aiLanguage = auto` 保持现状（「跟随顾客语言」）；设为具体语言则改为「始终用该语言」。

## D3 沙盒用草稿设置，服务端定域，一次性

新增受保护端点（`POST /api/shopify/ai/preview`，JWT + 店铺来自会话）：
- 入参：草稿人设 + 一条用户消息（草稿**不落库**）
- 用 D2 的组合逻辑 + 草稿人设跑一次 `buildSupportSystemPrompt`，走 `AdpService` 同一条链路
- 店铺域仍由会话决定，不取自入参；不影响真实会话；限流

商家保存前即可验证效果（用户在 v1 选了这一层）。

## D4 API 复用 + 校验

扩 `BotSettingDto`：`aiEnabled / aiPersonaName / aiTone / aiLanguage / aiSystemPrompt`。
校验：`tone` / `language` 为白名单枚举；`personaName ≤ 40` 字；
`aiSystemPrompt ≤ ~2000` 字（防止把气泡与成本撑爆）。GET/PUT 复用现有
`botSettings/shop/:domain`，不新增读写接口。

## D5 前端

`/ai-assistant` 页改为：挂载 GET 拉当前设置回填；输入全部受控（含 System Prompt
Textarea，现在是 `defaultValue`）；Save Settings → PUT；Test AI → `/api/ai/preview`。
`aiEnabled = false` 时给出「AI 已停用」提示（可选）。

## D6 AI 开关必须真的关掉自动应答

`aiEnabled` 不能只是「存了但不生效」的死开关。关闭时在 `AdpService` 的应答闸门里
（配额闸门之前，避免白扣额度）拦下：不调网关、转 `pending` 待人工，并给顾客一句
人工跟进（复用配额耗尽那套处置）。

## 不可逆决策登记

「客服 system prompt 从全店硬编码改为每店可定制、且护栏服务端注入不可覆盖」是
AI 链路的行为契约变更，写入 `conversation-context` spec。若 `spec/check-ids` 要求
关联 `ADR`/`DECISIONS.md`，实现时按其要求补登。
