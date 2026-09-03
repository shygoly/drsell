# docs/archive/ — 历史留档

本目录存放**已作废**的文档，只作历史留档。

> **给 agent 的指令：不要据此判断本项目的架构、依赖或流程。**
> 现行架构与陷阱见仓库根目录 `AGENTS.md`；论证见 `ARCHITECTURE.md`，
> 决策登记册见 `DECISIONS.md`。

这里的文档大多描述以下**已不存在**的东西：

- **Coze AI 平台集成** —— AI 回复链路已改为 `apps/api` → `packages/openclaw`
  → wjclaw 上的 OpenClaw gateway（OpenAI 兼容，provider DeepSeek-V4）
- **chatbot / chatbotapi / chatbotadmin** —— 旧 Remix app 与两个 Java Spring Boot
  服务，已被 `apps/web` / `apps/api` 取代，目录本身移至 `obsolete/`（不入库）
- **chatbot-node、EverShop 扩展、ShopSaaS** —— 本仓库已无对应实现

保留而非删除，是因为它们记录了当时的取舍与测试结论，偶尔要回查「当初为什么那样做」。
