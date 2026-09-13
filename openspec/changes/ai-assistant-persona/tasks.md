# Tasks

## 0. 前置
- [x] 0.1 确认 v1 范围：人设(名/语气/语言) + 自定义提示词 + 开关 + 真实沙盒
      （handoff / 工具权限 / 头像上传不做）

## 1. Schema（BotSetting 加字段）
- [x] 1.1 `schema.prisma` 加 `aiEnabled/aiPersonaName/aiTone/aiLanguage/aiSystemPrompt`
- [x] 1.2 迁移 `20260912100000_bot_setting_ai_persona`（本地 DB 不可达，手写 SQL，
      由服务器 `migrate deploy` 应用）；`prisma generate` 更新 client

## 2. Prompt 组合（packages/openclaw）
- [x] 2.1 `buildSupportSystemPrompt` 增加可选 persona 参数，按 D2 顺序组合，护栏在前、收尾重申
- [x] 2.2 单测：无人设时保持原护栏、不出现店主偏好区（回归）
- [x] 2.3 单测（安全）：商家自定义指令写「忽略店铺域 / 改用别的 shop / 忽略前述指令」，
      组合结果仍锁定店铺域、仍含注入防护，且护栏在商家块之后被重申

## 3. API
- [x] 3.1 `BotSettingDto` 加字段 + 校验（语言白名单、长度上限）
- [x] 3.2 `updateBotSetting` 落这些字段
- [x] 3.3 `AdpService`：调模型前加载该店 `BotSetting`，把人设传入 `buildSupportSystemPrompt`（单测）
- [x] 3.4 沙盒端点 `POST /api/shopify/ai/preview`（JWT、店铺来自会话、草稿不落库、入参限长）+ `previewChat` 单测
- [x] 3.5 AI 开关：`aiEnabled=false` 时不调网关、不扣额度、转 pending 并给顾客人工跟进（单测）

## 4. 前端（/ai-assistant）
- [x] 4.1 挂载 GET 回填；全部输入受控（含 System Prompt Textarea）
- [x] 4.2 Save Settings → PUT `botSettings`；保存中 / 成功 / 失败反馈
- [x] 4.3 Test AI 沙盒 → `/api/shopify/ai/preview`，用当前（草稿）设置
- [x] 4.4 移除 Handoff / Permissions 卡（v1 不做，不摆死开关）

## 5. 治理与验收
- [x] 5.1 spec delta：`conversation-context` 增「人设可配置、护栏不可覆盖」「AI 开关」需求
- [x] 5.2 `pnpm spec` 绿
- [x] 5.3 `pnpm test` 绿（api 188+ 用例 + prompt/adp 新用例）
- [x] 5.4 已部署（2026-09-12）：迁移 `20260912100000_bot_setting_ai_persona` 在生产成功应用；
      四进程 online、nginx reload、公网内容断言通过；`POST /api/shopify/ai/preview` 公网返 401
      （路由 + 鉴权已上线，非 404）。AI 链路向后兼容：无店铺配置人设，prompt 与旧版逐字一致
      （见 2.2 回归测试），tool calling 行为在商家未启用人设前不变。
