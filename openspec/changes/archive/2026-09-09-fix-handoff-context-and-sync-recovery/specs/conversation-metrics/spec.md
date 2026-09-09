## ADDED Requirements

### Requirement: 图表两个序列使用同一单位与同一时间窗

会话趋势图的 AI 序列与人工序列 SHALL 都以**会话数**计，
且 SHALL 取自同一时间窗与同一口径。

今天 AI 序列取 `ChatStatDaily.aiResolvedCount`（每条 AI 消息 +1，是**消息数**），
人工序列取 `status = 'human'` 的 `ChatThread` 计数（是**会话数**，且恒为零）——
同一张堆叠图里两个序列单位不同。

#### Scenario: 一个会话内多轮 AI 问答

- **WHEN** 某天一个会话里 AI 回复了 8 次，且从未转人工
- **THEN** 该天 AI 序列 +1，而非 +8

#### Scenario: 一个会话当天先 AI 后转人工

- **WHEN** 某天一个会话先由 AI 回复，随后被商家接管
- **THEN** 该会话在当天只计入人工序列一次
- **AND** 不同时计入 AI 序列（避免两序列之和大于会话总数）

---

### Requirement: 分流率反映真实定义

商家仪表盘上表述为「AI 解决率」的指标 SHALL 定义为
**指定时间窗内未升级到人工的会话占比**（deflection rate），
并 SHALL 按该定义命名，不得沿用与实现不符的名字。

今天 `getStats().aiResolution` 取全部历史会话中 `status === 'ai'` 的占比。
由于 `'human'` 从未被写入，该值恒定接近 100%，且没有时间窗。

#### Scenario: 一半会话被接管

- **WHEN** 时间窗内共 10 个会话，其中 4 个被商家接管
- **THEN** 分流率为 60%

#### Scenario: 时间窗内无会话

- **WHEN** 时间窗内没有任何会话
- **THEN** 返回空值或明确的「无数据」标记
- **AND** SHALL NOT 返回 0% 或 100%（两者都会被读成真实业绩）

#### Scenario: 历史数据不污染当期

- **WHEN** 店铺在时间窗之前有大量历史会话
- **THEN** 它们不参与本期分流率计算

---

### Requirement: 不返回硬编码的运营指标

仪表盘 SHALL NOT 返回任何硬编码的度量值。
凡当前无法真实计算的指标，SHALL 不返回该字段或明确标记为不可用，
SHALL NOT 以常量冒充实测值。

今天 `avgFirstResponseSec: 12` 是写死的常量
（`apps/api/src/storefront-dashboard/storefront-dashboard.service.ts:78`）。

#### Scenario: 首次响应时长

- **WHEN** 请求仪表盘统计
- **THEN** 首次响应时长要么由 `ChatMessage` 时间戳真实计算，要么不出现在响应中
- **AND** 不返回常量 12

#### Scenario: 存在一个可执行检查

- **WHEN** 有人再次向仪表盘响应中引入硬编码度量值
- **THEN** 一个检查器使其失败
- **AND** 该检查器挂在 `pnpm spec` 下

---

### Requirement: 计数口径变更对历史数据明确表态

系统 SHALL 对 `ChatStatDaily.aiResolvedCount` 的语义变更（消息数 → 会话数）
给出明确的存量处置：回填、清零并从变更日起算、或新增字段并弃用旧字段。
SHALL NOT 让新旧语义的数据在同一列里混存。

`ops.service.ts` 也读取该列用于运营侧汇总，处置方案 SHALL 同时覆盖该读取方。

#### Scenario: 迁移后查询跨越变更日

- **WHEN** 查询时间窗跨越语义变更那一天
- **THEN** 返回的序列不混用两种口径
- **AND** 运营台读到的汇总值与商家端一致
