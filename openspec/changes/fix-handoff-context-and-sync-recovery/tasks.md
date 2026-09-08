## 1. 前置核实（不写代码，先证伪假设）

- [ ] 1.1 在生产库跑 `SELECT DISTINCT status FROM "ChatThread"`，确认取值只有 `ai` / `pending`（R2）
- [x] 1.2 ~~确认 `spec/check-ops-audit.mjs` 扫描范围~~ — 已确认只扫 1 个 controller（ops），不影响 storefront 新写路由（R6 已排除）
- [ ] 1.3 在隔离 OpenClaw 网关上实测：发送多条 `messages` 时，网关侧 session 记忆是否叠加导致上下文重复（D4 待决）
- [ ] 1.4 余量只有 692 字节（`spec/check-widget-asset.mjs` 阈值 10000 B，现 9308 B）。先写一版最小轮询逻辑测实际增量，判断是否放得下（R1）

## 2. 数据模型与迁移

- [ ] 2.1 `ChatThread.status` 从 `String` 改为 enum `ai | pending | human | closed`
- [ ] 2.2 `ChatThread` 新增 `handedOverAt`、`closedAt`
- [ ] 2.3 `ChatMessage.role` 扩展为 `user | assistant | agent`；按 D5 待决决定是否同时加 `authorId`
- [ ] 2.4 `KnowledgeSyncJob` 新增 `heartbeatAt`
- [ ] 2.5 `ChatStatDaily.aiResolvedCount` 标记弃用（注释说明口径变更日，不删列）
- [ ] 2.6 写迁移并在本地库验证；确认 `pnpm db:generate` 后类型无残留 `string`

## 3. AI 应答闸门与状态迁移（F1 核心）

- [ ] 3.1 `AdpService.proxyChatSse` 在配额检查**之前**加状态闸门：`human` 不调模型
- [ ] 3.2 `human` 状态下顾客消息仍落库、`unread` 加一、SSE 正常结束不报错
- [ ] 3.3 `closed` 状态下顾客新消息把会话拉回 `ai` 并清 `closedAt`
- [ ] 3.4 `pending` 状态下配额恢复后回到 `ai`
- [ ] 3.5 单测覆盖四种状态各自的分支，断言 `human` 分支下 OpenClaw client 零调用、配额零消耗

## 4. 商家写路径（F1）

- [ ] 4.1 `POST storefront/inbox/:threadId/takeover` — 迁移到 `human`，写 `handedOverAt`
- [ ] 4.2 `POST storefront/inbox/:threadId/reply` — 追加 `role: 'agent'` 消息，隐含接管，`unread` 归零
- [ ] 4.3 `POST storefront/inbox/:threadId/close` — 迁移到 `closed`，写 `closedAt`
- [ ] 4.4 三条路由统一做 `shopDomain` 归属校验，跨店返回 404（不用 403）
- [ ] 4.5 单测：跨店访问返回 404 且不改动目标会话；商家回复不触发 OpenClaw、不扣配额

## 5. 商家回复的送达通道（F1 闭环）

- [ ] 5.1 `GET public/chat/messages?after=<cursor>` — 按 `shopDomain` + `visitorId` 鉴权的游标拉取
- [ ] 5.2 空响应走短路径，不做全表扫描（R3）
- [ ] 5.3 widget 增加打开态轮询（起步 5s）+ 无活动退避；`agent` 消息渲染成区别于 AI 的样式
- [ ] 5.4 重新构建 widget 产物并**提交**（`shopify app deploy` 从工作区打包，不跑本仓构建）
- [ ] 5.5 确认 `spec/check-widget-asset.mjs` 仍绿：产物 < 10000 B 且与 src 一致。放不下就精简源码，不抬阈值（R1）

## 6. 商家端前端接线（F1）

- [ ] 6.1 `inbox-client.tsx` 的 `handleTakeOver` / `handleResolve` / `handleSend` 改调真实 API
- [ ] 6.2 三个动作失败时给出可操作的错误，不静默吞掉
- [ ] 6.3 `lib/types.ts` 的 `ConversationStatus` 与后端枚举对齐（增加 `closed`）
- [ ] 6.4 手工验证：接管后刷新页面，状态仍在（今天会丢）

## 7. 上下文所有权（F2）

- [ ] 7.1 用户消息改为在调用网关**之前**落库
- [ ] 7.2 `packages/openclaw` 接口从单条 `message` 改为 `messages: Message[]` + `systemPrompt`
- [ ] 7.3 `AdpService` 从 `ChatMessage` 组装历史，`agent` 消息映射到 assistant 侧
- [ ] 7.4 实现上下文截断策略（保留最近若干轮完整问答对，不从中间丢弃）
- [ ] 7.5 system prompt 改用 `role: 'system'` 消息，不再拼进用户消息前缀
- [ ] 7.6 店铺域从服务端会话取，不从消息正文解析（防伪造）
- [ ] 7.7 单测：网关侧记忆缺失时仍能从本地库重建完整上下文

## 8. 指标重算（F1 连带）

- [ ] 8.1 `getChart` 两个序列统一按会话数、统一时间窗；依据 `handedOverAt` 切窗
- [ ] 8.2 一个会话当天既被 AI 回复又被接管时，只计入人工序列
- [ ] 8.3 `aiResolution` 改为窗内 deflection rate 并更名；无数据时返回空值而非 0/100
- [ ] 8.4 移除硬编码的 `avgFirstResponseSec`：真算，或不返回该字段
- [ ] 8.5 `ops.service.ts` 的汇总改读新口径，与商家端一致
- [ ] 8.6 图表标出口径变更日（D6：不回填，不假装连续）
- [ ] 8.7 新增检查器：仪表盘响应中出现硬编码度量值即失败，挂进 `pnpm spec`

## 9. 同步任务恢复（F3）

- [ ] 9.1 `runSyncJob` 推进过程中周期性刷新 `heartbeatAt`
- [ ] 9.2 超时判定改为基于 `heartbeatAt` 而非 `createdAt`（避免误杀大目录同步）
- [ ] 9.3 进程启动时扫描心跳超时的 `'running'` job，标记失败并写明原因；保证幂等
- [ ] 9.4 商家端展示各类目最后成功同步时刻与失败状态，并可重新触发
- [ ] 9.5 单测：模拟中断后下一次同步能启动；健康长任务不被误杀

## 10. 收尾

- [ ] 10.1 `pnpm test`（含 `pnpm spec`）全绿
- [ ] 10.2 `openspec validate fix-handoff-context-and-sync-recovery --strict` 通过
- [ ] 10.3 按 D6 在 `DECISIONS.md` 决定是否需要新 ADR（`status` 词表、上下文所有权两项属不可逆选择）
- [x] 10.4 ~~决定 `openspec/` 与治理文档的分工~~ — 已写入 `AGENTS.md` 事实来源表：openspec 管行为需求，`INV`/`ADR`/`B` 独占不可逆决策，两者不交叉（R7 已关闭）
- [ ] 10.5 生产验证走公网域名并断言内容特征，不用 `curl 127.0.0.1` 直连上游
