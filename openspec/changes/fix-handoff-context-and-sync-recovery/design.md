## Context

三个缺陷共享一个根因：**会话这个对象从来没有被当成有状态的东西对待。**

`ChatThread` 今天是一张列表视图的物化——`status`、`topic`、`lastMessage`、`unread`
都是为了渲染收件箱列表而存在的字段，不是会话的真实状态。
真正的会话状态（谁在应答、说到哪了）散落在两个系统之外：
UI 的 React state（F1）和 OpenClaw 的 session（F2）。
`KnowledgeSyncJob` 是同一个毛病的另一个实例：`status = 'running'` 被当作
一个只会前进的标记，而没有人负责在进程死亡时把它推向终态（F3）。

因此本变更不是三个独立修补，而是一件事：**把状态的所有权收回数据库。**

现状约束：
- 顾客侧只有一条 `POST public/chat`（SSE）通道，无拉取端点
- widget `assets/drsell-chat.js` 现 9308 字节，Shopify app block JS 上限 10240 字节
- 商家侧 `StorefrontDashboardController` 六个路由全是 `@Get`，本变更引入首个写路由
- Agent 工具全部只读（`adp_shop_summary` / `adp_search_products` / `adp_get_order`），
  `adp_reader` 零表权限（`INV-2`）——本变更不触碰这条边界

## Goals / Non-Goals

**Goals:**
- 人工接管闭环：商家能接管、能回复，且回复真的到达顾客
- 人工接管期间 AI 不抢答，且被拦下的对话不计费
- 会话上下文可从本地库完整重建，推理后端可替换
- 仪表盘上的数字要么是真的，要么不出现
- 同步任务不能把自己永久锁死，失败对商家可见

**Non-Goals:**
- Agent 写工具（退款 / 取消订单 / 改地址）——那会使 `adp_reader` 的 DB 角色隔离失效，
  需要单独的动作分级与审批设计，是另一个变更
- Control Space / Agent Planner / Intent 分类
- RAG / Embedding / 模型评测
- Commerce Connector 抽象
- 任务队列基础设施（Kafka / BullMQ / Temporal）——F3 需要的是十几行清理逻辑，不是队列
- 全渠道（`ChatThread.channel` 已有 instagram / email / whatsapp 取值，但只有 web 在用，
  本变更不扩展）

## Decisions

### D1：状态词表用四值单轴，不引入 resolvedBy 双轴

采用 `ai | pending | human | closed`，而非 `status` + `resolvedBy` 两个字段。

**理由**：双轴需要回答「AI 处理完的会话由谁标记为已解决」——顾客不会点，
AI 不知道自己解决没有，只能靠空闲超时自动结单，而那需要一个定时任务，
恰好是本变更明确不引入的东西（见 Non-Goals）。
单轴 + 派生指标（见 D2）能在不加调度器的前提下给出正确的数字。

**代价**：无法区分「人工接管后解决」和「人工接管后放弃」。
真需要时再加一个 `closeReason`，那是纯增量。

### D2：分流率派生计算，不新增状态位

分流率 = 时间窗内**未曾进入 `human`** 的会话数 / 时间窗内有活动的会话总数。
判定依据是 `handedOverAt` 是否落在窗内，而不是会话当前的 `status`。

**理由**：用当前 `status` 算会把历史会话的终态算进当期（今天的 bug 就是这么来的）。
用 `handedOverAt` 时间戳能正确切窗，且一个会话在一天内只被计一次，
两个序列自然统一为会话数（解决 F1 的单位错配）。

**代价**：`ChatStatDaily.aiResolvedCount`（消息数口径）失去用途。见 D6。

### D3：商家回复的送达用短轮询，不用 SSE 长连或 WebSocket

widget 在打开状态下按固定间隔拉取 `GET public/chat/messages?after=<cursor>`；
关闭状态不拉取。

**理由**：硬约束是 `spec/check-widget-asset.mjs` 的 10000 B 阈值，
产物现为 9308 B，**余量 692 字节**。
一个轮询循环压缩后约 300–400 字节；SSE 重连逻辑或 WebSocket 客户端放不下。
另外 widget 关闭时顾客本来就看不到消息，长连接是纯浪费。

**代价**：商家回复有最长一个轮询周期的延迟。间隔取值需要在
「商家回复延迟」和「每个开着 widget 的访客每分钟打多少次 API」之间权衡，
建议起步值 5s，并在服务端加 304 / 空响应短路。

**待决**：轮询是否要在无活动 N 分钟后退避停止，避免挂着页面的访客长期打点。

### D4：移除对 `x-openclaw-session-key` 的记忆依赖，但保留该 header

`chatStream` 改为接受 `messages: Message[]` + `systemPrompt: string`，
调用方每次发送完整上下文。session key header 保留，仅用于网关侧的日志关联与限流，
不再承担记忆职责。

**理由**：`INV`/`ADR` 层面这让推理后端真正可替换（`ADR-9` 说的是走 OpenClaw，
没说记忆必须存在 OpenClaw）。同时 `ADR-15` 规定余额不足会自动切到
`zhipu/glm-4.5-flash`——换模型时如果记忆在网关侧，切换的语义是不明确的。

**待决**：OpenClaw 侧是否会因为收到完整历史而与自己的 session 记忆叠加，
造成上下文重复。需要在隔离网关上实测确认，必要时关掉网关侧记忆。

### D5：商家写操作暂不纳入 `INV-3` 审计

`INV-3` 与 `spec/check-ops-audit.mjs` 只覆盖运营台（superadmin 改商家订阅、
计费、解冻窗口）。商家在自己店铺内接管自己的会话，操作者与数据主体同一，
不构成 `INV-3` 要防的「改真实商家数据而无追责」。

**理由**：`INV-3` 的论证是「运营台能改真实商家的订阅、计费与解冻窗口；无审计即无追责」。
商家侧写操作不在这个论证覆盖范围内，强行套用会稀释这条不变量的含义。

**代价**：多员工商家（`Membership` / `InboxUser` 已存在）将来会需要
「谁接管的、谁回的」。届时应作为会话自身的字段（`handedOverBy`），
而不是塞进 `AuditLog`。

**待决**：`ChatMessage` 是否现在就加 `authorId`。加了成本很低，
不加将来要回填。倾向现在就加。

### D6：`aiResolvedCount` 弃用而非回填

新增派生计算后停止写入 `aiResolvedCount`，该列保留但标记弃用，
`getChart` 与 `ops.service.ts` 都改读新口径。

**理由**：回填需要从 `ChatMessage` 重放历史推算每日会话数，
而 `handedOverAt` 在历史数据上根本不存在（`'human'` 从未被写入），
回填出来的分流率必然是 100%——是假数据，比缺口更糟。

**代价**：图表在变更日之前是旧口径、之后是新口径。
应在图表上标出口径变更日，而不是假装连续。

### D7：`role` 取值扩展为 `user | assistant | agent`

商家消息用 `agent`，与 AI 的 `assistant` 区分。
组装上下文时 `agent` 映射到模型侧的 assistant 角色。

**理由**：今天前端把商家消息写成 `role: 'user'`，如果那条路径真的落库，
模型会把商家说的话当成顾客说的。三值区分是最小代价的正确做法。

## Risks / Trade-offs

**R1 — widget 体积上限（高）**
余量 692 字节（9308 / 10000），轮询逻辑必须压进去。
守护已经存在：`spec/check-widget-asset.mjs` 挂在 `pnpm spec` 下，
同时断言体积与「产物和 `widget-src/` 一致」，所以本地就会红，不必等 deploy 报错。
该检查器的错误信息写着「精简 src，勿抬阈值」——放不下时的退路是精简 widget 源码
或把逻辑移到服务端，**不是**调高阈值。

**R2 — 生产库上的枚举迁移（中）**
`status` 从 `String` 收成 enum 需要在有数据的生产库上执行。
现存取值只有 `'ai'` 和 `'pending'`（`'human'` 从未写入过），迁移是安全的，
但必须先在生产库上验证这个断言，而不是相信本文。
缓解：迁移前跑一次 `SELECT DISTINCT status FROM "ChatThread"`。

**R3 — 轮询带来的 API 负载（中）**
每个开着 widget 的访客每 5 秒一次请求。高流量店铺会显著抬高 api 进程负载，
而 api 与三个 Next 应用同机（`ADR-3`）。
缓解：空响应走短路径不查全表；加退避；必要时把该端点限流。

**R4 — system role 改造不是 prompt injection 的根治（中）**
把指令移到 system 消息降低了顾客覆盖它的难度，但不消除风险。
真正的边界仍然是 `adp_reader` 的零表权限（`INV-2`）——
即使模型被说服，它也只能调那三个只读函数。
**这条边界在本变更中必须保持不变**，它是当前最硬的一层防线。

**R5 — 上下文变长带来的推理成本（低）**
每次发完整历史会增加 token 消耗，而 `AiUsage` / 配额是按「回答次数」计的，
不按 token 计。成本上升不会反映在现有配额模型里。
缓解：D2 的截断策略；若成本显著，再考虑配额口径。

**R6 — 首个非 `@Get` handler 触及既有测试假设（已排除）**
`spec/check-ops-audit.mjs` 当前输出为「扫描 1 个 controller」，
即只覆盖 ops 控制器，不会误扫 storefront 的新写路由。
若该检查器将来扩大扫描范围，D5 的结论需要重新讨论。

**R7 — 引入 `openspec/` 与单一事实来源的张力（已关闭）**
本仓 `AGENTS.md` 是 agent 指引唯一事实来源，且明确记录过「两份事实来源漂移」的教训。
`openspec init` 已用 `--tools none` 执行，未注入托管块。
分工已写入 `AGENTS.md` 的「事实来源」表：openspec 只描述**行为需求**，
`INV`/`ADR`/`B` 独占**不可逆决策**，两者不交叉；需求牵出不可逆选择时，
结论入 `DECISIONS.md`，openspec 里只留指向该 ID 的引用。

**残留**：这条分工目前**没有守护方式**——没有检查器能防止 openspec spec 里
写进架构断言。按本仓「每条规矩要有守护方式」的规矩，它现在是一条靠自觉的约定。
`openspec/specs/` 归档后若开始变厚，应补一个检查器。
