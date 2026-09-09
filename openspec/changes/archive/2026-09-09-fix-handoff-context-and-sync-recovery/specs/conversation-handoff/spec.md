## ADDED Requirements

### Requirement: 会话状态受控词表

系统 SHALL 将 `ChatThread.status` 限制为 `ai`、`pending`、`human`、`closed` 四个取值，
并在数据库层以枚举类型约束，不得保留裸 `String`。
任何不在词表内的取值 SHALL 被写入拒绝，而非静默落库。

#### Scenario: 写入词表外的状态

- **WHEN** 任意代码路径尝试把 `ChatThread.status` 写成词表以外的值
- **THEN** 数据库约束拒绝该写入，请求以 5xx 失败并记录错误
- **AND** 不产生一条状态未知的会话

#### Scenario: 已有数据迁移

- **WHEN** 迁移在存量库上执行
- **THEN** 现存的 `'ai'` 与 `'pending'` 行原样保留
- **AND** 不存在需要人工裁定的第三种取值（`'human'` 从未被写入过）

---

### Requirement: 商家接管会话

系统 SHALL 提供一条商家侧写路径，把会话从 `ai` 或 `pending` 迁移到 `human`，
并记录接管时刻。该路径 SHALL 校验调用者对该 `shopDomain` 的归属，
跨店访问 SHALL 返回 404 而非 403（不泄露会话是否存在）。

#### Scenario: 商家接管一个 AI 会话

- **WHEN** 商家对本店一个 `status = 'ai'` 的会话发起接管
- **THEN** 该会话 `status` 变为 `'human'`，`handedOverAt` 被写入当前时刻
- **AND** 刷新页面后该状态仍然存在（不依赖前端本地 state）

#### Scenario: 跨店接管

- **WHEN** 商家 A 对属于商家 B 的会话 ID 发起接管
- **THEN** 返回 404
- **AND** 商家 B 的会话状态不变

#### Scenario: 接管一个已关闭的会话

- **WHEN** 商家对 `status = 'closed'` 的会话发起接管
- **THEN** 该会话 `status` 变为 `'human'`
- **AND** `closedAt` 被清空

---

### Requirement: 商家回复顾客

系统 SHALL 提供一条商家侧写路径，向指定会话追加一条 `role = 'agent'` 的消息。
该消息 SHALL 持久化到 `ChatMessage`，SHALL NOT 使用 `role = 'user'`
（今天的前端把商家消息标成 `user`，会污染上下文与统计）。
发送回复 SHALL 隐含接管：若会话不在 `human` 状态，SHALL 先迁移到 `human`。

#### Scenario: 商家在 pending 会话上回复

- **WHEN** 商家对一个配额耗尽转入 `'pending'` 的会话发送回复
- **THEN** 消息以 `role = 'agent'` 落库
- **AND** 会话 `status` 变为 `'human'`，`unread` 归零
- **AND** 该消息计入商家侧对话列表的 `lastMessage`

#### Scenario: 商家回复不消耗 AI 额度

- **WHEN** 商家发送回复
- **THEN** `QuotaService` 的已用额度不增加
- **AND** 不向 OpenClaw 网关发出任何请求

---

### Requirement: 商家关闭会话

系统 SHALL 提供一条商家侧写路径，把会话迁移到 `closed` 并记录 `closedAt`。
关闭 SHALL NOT 删除消息历史。

#### Scenario: 关闭一个人工会话

- **WHEN** 商家对 `status = 'human'` 的会话点击解决
- **THEN** `status` 变为 `'closed'`，`closedAt` 写入当前时刻
- **AND** 该会话的 `ChatMessage` 全部保留

---

### Requirement: 人工接管期间 AI 不得应答

当会话处于 `human` 状态时，系统 SHALL NOT 调用模型生成回复。
该闸门 SHALL 位于 `proxyChatSse` 中调用网关之前，
且 SHALL 位于配额扣减之前——被闸门拦下的对话不得让商家付费。

#### Scenario: 顾客在人工接管期间继续发言

- **WHEN** 会话 `status = 'human'`，顾客通过 widget 发送一条消息
- **THEN** 该消息以 `role = 'user'` 落库
- **AND** `unread` 加一，会话出现在商家收件箱未读中
- **AND** 不向 OpenClaw 网关发出请求，AI 额度不变
- **AND** SSE 流正常结束，widget 不显示错误

#### Scenario: 顾客在已关闭会话上再次发言

- **WHEN** 会话 `status = 'closed'`，顾客发送一条新消息
- **THEN** 会话 `status` 回到 `'ai'`，`closedAt` 清空
- **AND** AI 正常应答

#### Scenario: 配额恢复后 pending 会话回到 AI

- **WHEN** 会话因配额耗尽处于 `'pending'`，新计费周期开始后顾客再次发言
- **THEN** 配额检查通过，会话 `status` 回到 `'ai'`
- **AND** AI 正常应答

---

### Requirement: 商家回复送达顾客

系统 SHALL 为顾客侧提供一条消息拉取端点，使 widget 能取回在自己上一次
SSE 之后产生的消息（含 `role = 'agent'`）。
今天顾客侧只有 `POST public/chat` 一条 SSE 通道，商家回复**没有任何送达路径**，
接管功能不闭环。

该端点 SHALL 以游标（消息 ID 或时间戳）而非全量返回，
SHALL 按 `shopDomain` + `visitorId` 鉴权，SHALL NOT 接受任意 `threadId`。

#### Scenario: widget 拉取商家回复

- **WHEN** 商家发送回复后，顾客的 widget 处于打开状态并发起拉取
- **THEN** 返回该游标之后的消息，含商家那条 `role = 'agent'` 消息
- **AND** widget 将其渲染为区别于 AI 回复的样式

#### Scenario: 拉取他人会话

- **WHEN** 请求携带的 `visitorId` 与会话所属不符
- **THEN** 返回 404，不泄露任何消息内容

#### Scenario: widget 体积仍在扩展上限内

- **WHEN** 轮询逻辑加入 `apps/web/extensions/chatbot/assets/drsell-chat.js`
- **THEN** `spec/check-widget-asset.mjs` 仍然通过：产物 < 10000 B，且与 `widget-src/` 一致
- **AND** 若放不下，SHALL 精简 widget 源码或把逻辑移到服务端，
  SHALL NOT 抬高该检查器的阈值
