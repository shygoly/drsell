## ADDED Requirements

### Requirement: 试用期不计入计费周期

计费周期 SHALL 从**试用结束**起算。试用期内 SHALL NOT 消耗计费周期，
也 SHALL NOT 因试用跨越自然月而重置额度。

#### Scenario: 试用中的店铺

- **WHEN** 某店 `trialEnds` 在未来，顾客发来消息
- **THEN** 闸门放行（试用属可服务状态）
- **AND** 计费周期尚未开始，额度按试用规则计

#### Scenario: 试用刚结束

- **WHEN** `trialEnds` 时刻到达
- **THEN** 第一个计费周期从该时刻起算，而不是从安装日或自然月起算

#### Scenario: 试用期长于一个周期长度

- **WHEN** 试用期被设置得比一个计费周期还长
- **THEN** 整个试用期内周期都不推进，不产生多个"周期"

---

### Requirement: 到期后给两天宽限

订阅到期（`currentPeriodEnd` 已过）后，系统 SHALL 提供**最多 2 天**的宽限窗口，
窗口内照常服务。宽限窗口 SHALL 从 `currentPeriodEnd` 起算，
SHALL NOT 因重复检查而延长。

#### Scenario: 到期后第 1 天

- **WHEN** `currentPeriodEnd` 已过 1 天，顾客发来消息
- **THEN** 闸门放行，服务继续
- **AND** 商家端显示宽限中与剩余时间

#### Scenario: 到期后第 3 天

- **WHEN** `currentPeriodEnd` 已过超过 2 天
- **THEN** 闸门拦下，服务停止

#### Scenario: 宽限窗口不可被刷新

- **WHEN** 同一个 `currentPeriodEnd` 被反复检查
- **THEN** 宽限截止时刻始终是同一个值，不随检查次数后移

---

### Requirement: 失效订阅不再自动续期

`periodStart` SHALL NOT 为已失效的订阅把周期推进到包含"现在"的那一期。

今天的实现会这么做（为修「陈旧 `currentPeriodEnd` 把额度永久钉死」而加），
副作用是让过期订阅**每 30 天自动获得一次免费额度**。生产上
`chatbotdomaintest` 的 `currentPeriodEnd` 停在 2025-08-25，却一直在正常服务。

周期推进 SHALL 只对处于可服务状态的订阅生效；失效订阅由闸门拦下，
根本不需要计算周期。

#### Scenario: 一年未续费的订阅

- **WHEN** 某店 `currentPeriodEnd` 是一年前，订阅未续
- **THEN** 不推进周期、不重置额度
- **AND** 服务被闸门拦下

#### Scenario: 正常续费但本地镜像滞后

- **WHEN** 商家已在 Shopify 侧续费，但 `app_subscriptions/update` 尚未同步过来
- **THEN** 宽限窗口内仍然服务，给同步留出时间
- **AND** 同步到达后周期与状态被纠正

---

### Requirement: 付款恢复即解冻

商家恢复付款后，系统 SHALL 自动恢复服务，SHALL NOT 需要人工干预。
恢复的知情渠道是 `app_subscriptions/update` webhook（`ADR-14`）。

#### Scenario: 冻结后恢复付款

- **WHEN** 某店此前 `FROZEN`，商家恢复付款，Shopify 发来
  `app_subscriptions/update` 且状态变为 `ACTIVE`
- **THEN** 本地镜像更新，闸门随即放行
- **AND** 不需要运营台手工解冻

#### Scenario: webhook 迟到

- **WHEN** 商家已付款但 webhook 尚未到达
- **THEN** 若仍在宽限窗口内，服务不中断
- **AND** webhook 到达后状态被纠正
