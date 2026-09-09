## ADDED Requirements

### Requirement: 到期前连续三天提醒

系统 SHALL 在订阅到期前的 **D-3、D-2、D-1** 各提醒商家一次，共三次。
提醒 SHALL 说明到期时间、停服后果、以及恢复付款的去处。

#### Scenario: 正常到期路径

- **WHEN** 某店 `currentPeriodEnd` 距今 3 天
- **THEN** 发出第一次提醒
- **AND** 随后两天各再发一次

#### Scenario: 提醒期间商家完成续费

- **WHEN** D-2 时商家已续费，`currentPeriodEnd` 后移
- **THEN** 针对旧周期的剩余提醒不再发出

#### Scenario: 订阅创建时距到期不足三天

- **WHEN** 某店订阅到期日距今只有 1 天
- **THEN** 只发一次（D-1），不补发已经错过的 D-3 / D-2

---

### Requirement: 提醒必须去重

同一店铺、同一计费周期、同一提醒档位（D-3 / D-2 / D-1）SHALL 最多发出一次。
去重状态 SHALL 持久化，SHALL NOT 依赖进程内存——否则重启或多实例会重复打扰商家。

#### Scenario: 触发器重复执行

- **WHEN** 提醒触发逻辑在同一天被执行多次（重启、多实例、手工重跑）
- **THEN** 商家只收到一次 D-n 提醒

#### Scenario: 新周期重新计数

- **WHEN** 商家续费进入新周期，新周期又临近到期
- **THEN** 三次提醒重新发出，不受上一周期去重记录影响

---

### Requirement: 提醒要真正送达

提醒 SHALL 实际发送到商家可见的渠道，SHALL NOT 只写进数据库等待一个不存在的
消费者。

今天的 `sendDunning` 往 `KnowledgeSyncJob` 写一条 `status: 'queued'`，
附注 "email dispatch pending — job queued for outbound worker"——
**那个 worker 不存在**，催缴从未真正发出。本需求不接受同样的形态。

#### Scenario: 提醒发出

- **WHEN** 到达 D-3
- **THEN** 商家通过已实现的出站渠道收到提醒
- **AND** 发送结果（成功 / 失败 / 原因）被记录，失败可被发现

#### Scenario: 出站渠道不可用

- **WHEN** 邮件通道故障
- **THEN** 失败被记录并可被观察到，SHALL NOT 静默丢弃
- **AND** 商家端仍能在应用内看到到期提示（应用内提示不依赖出站通道）

---

### Requirement: 出站通道不绑定服务商

出站邮件 SHALL 走 SMTP，由环境变量配置（`SMTP_HOST`、`MAIL_FROM`，可选
`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`）。SHALL NOT 把某家服务商的 SDK 焊进代码——
那会把一个可逆的运维选择变成不可逆的代码选择。

通道未配置时系统 SHALL 抛错并把失败落库，SHALL NOT 静默视为已送达。

#### Scenario: 通道未配置

- **WHEN** 到期提醒到达发送时机，但 `SMTP_HOST` 或 `MAIL_FROM` 缺失
- **THEN** 发送失败，原因落进 `ExpiryNotice.error`
- **AND** 应用内横幅不受影响，商家仍能看到提示

#### Scenario: 商家已退订

- **WHEN** 收件人在 `MailSubscriber` 中状态为 `unsubscribed`
- **THEN** 不发送，且失败原因可追

