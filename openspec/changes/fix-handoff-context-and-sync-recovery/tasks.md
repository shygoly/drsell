> 实施于分支 `feat/handoff-context-sync-recovery`，2026-09-08 已部署到 wjclaw。
> 唯一未完成的是 6.4 的商家侧往返——需要真实商家会话，只能由商家本人点一次。

## 1. 前置核实（不写代码，先证伪假设）

- [x] 1.1 生产库已核实（wjclaw / `drsell` @ 5433）：`ChatThread.status` 只有 `ai`（6 行），
      `ChatMessage.role` 只有 `user`(19) / `assistant`(19)，两列均仍是 `text`。
      **无词表外取值，枚举迁移安全**。迁移仍保留防御性归一，不依赖这个观察。
      顺带：`KnowledgeSyncJob` 无 `running` 行（5 skipped / 4 done）——F3 的死锁尚未
      发生，修的是隐患；`ChatStatDaily` 两行 `count` 与 `aiResolvedCount` 完全相等，
      印证「两个都在数消息、且从没有人工」。
- [x] 1.2 ~~确认 `spec/check-ops-audit.mjs` 扫描范围~~ — 只扫 1 个 controller（ops），不影响 storefront 新写路由（R6 已排除）
- [x] 1.3 已在 wjclaw 网关实测，**结论是「会叠加」，D4 因此改写、代码已修**：
      稳定 key 下第二轮不带历史仍答得出第一轮口令（网关自己记着）；换成每请求唯一 key
      则回 `UNKNOWN`；唯一 key + 历史放进 `messages` 正常作答。
      故 `sessionKey()` 改为每请求附加 uuid。
      **另发现**：网关还有一层落盘的跨租户 agent 记忆（`workspace-drsell/memory/*.md`），
      见 design.md 的 R8——探针写入的文件已清除，`SOUL.md` 加了禁止写记忆的硬性规则，
      但那只是提示词级约束，不是守护方式。
- [x] 1.4 widget 余量实测：改造后 9783 B / 阈值 10000 B，**余量 217 字节**（98%）。放得下，但很贴边。

## 2. 数据模型与迁移

- [x] 2.1 `ChatThread.status` → enum `ChatThreadStatus`（`ai`/`pending`/`human`/`closed`）
- [x] 2.2 `ChatThread` 新增 `handedOverAt`、`closedAt` + `(shopDomain, handedOverAt)` 索引
- [x] 2.3 `ChatMessage.role` → enum `ChatMessageRole`（`user`/`assistant`/`agent`）
- [x] 2.4 `KnowledgeSyncJob` 新增 `heartbeatAt` + `(status, heartbeatAt)` 索引
- [x] 2.5 `ChatStatDaily` 新增 `threadCount`/`humanThreadCount`；`aiResolvedCount` 停写并标注弃用
- [x] 2.6 迁移 `20260908040000_conversation_handoff_and_sync_recovery`；`pnpm db:generate` 通过

## 3. AI 应答闸门与状态迁移（F1 核心）

- [x] 3.1 闸门置于配额检查**之前**：`human` 不调模型
- [x] 3.2 `human` 状态下顾客消息仍落库、`unread` 加一、SSE 正常结束不报错
- [x] 3.3 `closed` 状态下顾客新消息把会话拉回 `ai` 并清 `closedAt`
- [x] 3.4 `pending` 状态下配额恢复后回到 `ai`
- [x] 3.5 单测覆盖四种状态分支，断言 `human` 分支零上游调用、零配额消耗

## 4. 商家写路径（F1）

- [x] 4.1 `POST storefront/inbox/:threadId/takeover`
- [x] 4.2 `POST storefront/inbox/:threadId/reply`（`role: 'agent'`，隐含接管，`unread` 归零）
- [x] 4.3 `POST storefront/inbox/:threadId/close`
- [x] 4.4 三条路由统一 `shopDomain` 归属校验，跨店返回 404
- [x] 4.5 单测：跨店 404 且不改动目标会话；空回复被拒不写库

## 5. 商家回复的送达通道（F1 闭环）

- [x] 5.1 `GET public/chat/messages?shop=&visitorId=&after=` — 按 (shopDomain, visitorId) 定位，不收 threadId
- [x] 5.2 无会话直接返回空数组，不做全表扫描
- [x] 5.3 widget 打开态 5s 轮询；首轮只认游标不渲染；`agent` 气泡另给配色
- [x] 5.4 重新构建 widget 产物并提交
- [x] 5.5 `spec/check-widget-asset.mjs` 仍绿：9783 B < 10000 B，产物与 src 一致

## 6. 商家端前端接线（F1）

- [x] 6.1 `handleTakeOver`/`handleResolve`/`handleSend` 改调真实 API
- [x] 6.2 失败渲染可见错误条（"nothing was sent"）+ 按钮 busy 禁用，不静默吞掉
- [x] 6.3 `ConversationStatus` 增加 `closed`；`ChatMessage.role` 增加 `agent`；`resolvedIds` 本地态删除，改由服务端 `closed` 决定
- [ ] 6.4 **部分完成**。已部署，公网确认：`GET /api/public/chat/messages` 200 且返回
      真实两条消息（探针会话，已清理）；`POST /api/storefront/inbox/:id/reply` 由 404
      变为 401（路由存在且鉴权生效）。
      **仍未做**：带真实商家会话 token 的「接管 → 刷新 → 状态仍在」往返——
      需要商家自己在嵌入应用里点一次，我不持有也不应持有商家凭据。

## 7. 上下文所有权（F2）

- [x] 7.1 用户消息改为在调用网关**之前**落库
- [x] 7.2 `packages/openclaw` 接口改为 `messages: OpenClawMessage[]` + `systemPrompt`
- [x] 7.3 `AdpService` 从 `ChatMessage` 组装历史，`agent` 映射到 assistant 侧
- [x] 7.4 截断策略：`CONTEXT_MESSAGE_LIMIT = 20`，取最近 N 条，不从中间丢弃
- [x] 7.5 system prompt 走 `role: 'system'`，不再拼进用户消息前缀
- [x] 7.6 店铺域由服务端注入 system prompt；正文伪造 `[shop=...]` 无效
- [x] 7.7 单测：网关记忆缺失时仍能从本地库重建上下文

## 8. 指标重算（F1 连带）

- [x] 8.1 图表两序列统一按会话数、统一时间窗
- [x] 8.2 当天既被 AI 回复又被接管的会话只计入人工序列（`ai = threadCount - humanThreadCount`）
- [x] 8.3 `aiResolution` 改为窗内 deflection rate；无数据返回 `null`，前端渲染 `—`
- [x] 8.4 移除硬编码 `avgFirstResponseSec: 12`，改由 `ChatMessage` 时间戳两次 groupBy 真实计算
- [x] 8.5 `ops.service.ts` 的 AI 用量改读 `AiUsage.answers`（配额的权威计数器），不再读已停写的 `aiResolvedCount`
- [x] 8.6 统计窗一律不早于口径变更日 `COUNTING_CHANGED_AT`——宁可图表短一截，也不把「没有数据」画成一排零
- [x] 8.7 `spec/check-dashboard-metrics.mjs` 挂进 `pnpm spec`，并加两条负向验证（能证明自己会红）

## 9. 同步任务恢复（F3）

- [x] 9.1 `runSyncJob` 每 30s 刷新 `heartbeatAt`，`finally` 清理定时器
- [x] 9.2 超时判定基于 `heartbeatAt`（5 分钟）而非 `createdAt`
- [x] 9.3 `onModuleInit` 扫描心跳超时的 `running` job 标记失败并写明原因；`updateMany` 天然幂等；失败只留痕不拦启动
- [x] 9.4 `getSyncStatus` 增加 `lastSuccessAt` 与 `failureReason`
- [x] 9.5 单测：只释放心跳停摆的任务、不按 createdAt 判、写终态与可读原因、清理失败不拦启动

## 10. 收尾

- [x] 10.1 `pnpm test` 全绿：8/8 turbo 任务，13 套 80 个测试（新增 23）；`pnpm build` 8/8
- [x] 10.2 `openspec validate --strict` 通过
- [x] 10.3 新增 `ADR-16`（会话状态词表由 DB 枚举守住）与 `ADR-17`（上下文所有权在本地库），
      论证入 `ARCHITECTURE.md`，登记入 `DECISIONS.md`，`check-links`/`check-ids` 绿
- [x] 10.4 `openspec/` 与治理文档的分工已写入 `AGENTS.md` 事实来源表
- [x] 10.5 已部署并走公网验证：迁移 `20260908040000` 于 14:11:48 落地，
      `ChatThread.status`→`ChatThreadStatus`、`ChatMessage.role`→`ChatMessageRole`
      均为枚举，数据完好（6 threads / 38 messages）。
      内容断言：`drsell.szchada.top/` 与 `/inbox` 200 且 `<title>Dr Sell — AI customer
      support`；`ops.szchada.top/login` 200 `<title>Drsell 运营台`。
      端到端对话经公网跑通并返回真实商品数据（探针会话与计数已回退）。
