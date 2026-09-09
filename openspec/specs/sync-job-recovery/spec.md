# sync-job-recovery Specification

## Purpose
TBD - created by archiving change fix-handoff-context-and-sync-recovery. Update Purpose after archive.
## Requirements
### Requirement: 同步任务不得因进程重启永久阻塞

系统 SHALL 保证：一个 `KnowledgeSyncJob` 因进程崩溃或重启而中断后，
该店该类目的后续同步仍能启动。

今天 `runSyncJob` 是 `void` 出去的进程内异步
（`apps/api/src/shopify/shopify.service.ts:318`），
中断后 job 永远停在 `'running'`，而 `:308` 的 `if (running) continue`
守卫会让该店该类目**再也不启动**同步——商品目录静默停止更新，
agent 继续用旧数据回答，无任何告警。

#### Scenario: 同步中途进程重启

- **WHEN** 某店 products 同步进行到一半，API 进程被重启
- **THEN** 该 job 最终被判定为失败，不再占据 `'running'`
- **AND** 下一次同步请求能够正常启动

#### Scenario: 正在运行的任务不被误杀

- **WHEN** 一次耗时较长但仍在正常推进的同步正在运行
- **THEN** 它不被判定为超时
- **AND** 并发守卫仍然阻止同店同类目的第二次启动

---

### Requirement: 运行中的任务上报心跳

`KnowledgeSyncJob` SHALL 记录 `heartbeatAt`，并在同步推进过程中周期性更新。
超时判定 SHALL 基于 `heartbeatAt` 而非 `createdAt`——
基于创建时间会误杀长时间但健康的大目录同步。

#### Scenario: 大目录同步

- **WHEN** 一个上万商品的店铺同步耗时超过超时阈值，但持续在推进
- **THEN** `heartbeatAt` 持续刷新，任务不被判定为超时

#### Scenario: 心跳停止

- **WHEN** 某 job 的 `heartbeatAt` 超过阈值未更新
- **THEN** 该 job 被判定为失败并释放并发槽位

---

### Requirement: 进程启动时清理孤儿任务

系统 SHALL 在启动时扫描 `status = 'running'` 且心跳超时的 job，
将其标记为失败并写入可读的失败原因。

#### Scenario: 启动扫描

- **WHEN** API 进程启动，库中存在心跳超时的 `'running'` job
- **THEN** 它们被标记为 `'failed'`，失败原因指明是进程中断而非 Shopify 错误
- **AND** 该操作幂等，多实例同时启动不产生重复副作用

---

### Requirement: 同步失败对商家可见

同步任务失败 SHALL 在商家端可见，SHALL NOT 只留在数据库里。
目录静默陈旧是本缺陷最实际的危害——agent 用旧数据回答顾客，商家不知情。

#### Scenario: 同步连续失败

- **WHEN** 某店某类目的同步连续失败
- **THEN** 商家端能看到该类目的最后成功同步时刻与失败状态
- **AND** 商家可以重新触发同步

