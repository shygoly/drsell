## ADDED Requirements

### Requirement: 订阅状态决定是否提供 AI 服务

系统 SHALL 在调用模型之前检查该店订阅状态，只有处于**可服务状态**的店铺才继续。
可服务状态为：`ACTIVE`、仍在试用期内、或处于宽限窗口内。
`FROZEN`、`CANCELLED`、`EXPIRED`、`DECLINED` 且已过宽限窗口的店铺 SHALL NOT 得到
AI 回答。

该闸门 SHALL 位于配额检查**之前**——被订阅状态拦下的对话不该消耗商家额度，
也不该产生上游推理成本。

#### Scenario: 订阅已取消且过了宽限

- **WHEN** 会话所属店铺的订阅为 `CANCELLED`，且已超过宽限窗口，顾客发来消息
- **THEN** 不调用推理网关，AI 额度不变
- **AND** 顾客收到一条得体的说明，不暴露商家的套餐或欠费状态
- **AND** 会话转入待人工接管，商家在收件箱里看得见

#### Scenario: 订阅正常

- **WHEN** 订阅为 `ACTIVE` 且在周期内
- **THEN** 闸门放行，后续照常走配额检查

#### Scenario: 闸门早于配额

- **WHEN** 店铺订阅失效**且**额度也已用尽
- **THEN** 拦截原因记为订阅失效，而非额度耗尽
- **AND** 不产生任何上游请求

---

### Requirement: 套餐档位只取自有效订阅

`planCodeFor` SHALL 只考虑处于可服务状态的订阅。
SHALL NOT 拿一条 `CANCELLED` / `EXPIRED` 的订阅的 `planCode` 当作额度依据。

今天的实现是 `findFirst({ where: { shopId } })` 不带任何状态条件，
取不到就回落默认档——等于给没有订阅的店免费额度。

#### Scenario: 只有一条已取消的订阅

- **WHEN** 某店唯一的订阅为 `CANCELLED`
- **THEN** 该店不被视为持有任何套餐
- **AND** 服务被闸门拦下，而不是按默认档放行

#### Scenario: 同店多条订阅记录

- **WHEN** 某店有一条历史 `CANCELLED` 与一条当前 `ACTIVE`
- **THEN** 取 `ACTIVE` 那条的档位

---

### Requirement: 商家侧必须能看到被停服的原因

商家端 SHALL 明确显示当前订阅状态、停服原因与恢复方式。
SHALL NOT 只让顾客侧看到异常而商家一无所知——那会让商家以为产品坏了。

#### Scenario: 店铺处于停服状态

- **WHEN** 商家打开嵌入应用
- **THEN** 页面显著位置说明服务已暂停、原因、以及去哪里恢复付款
- **AND** 该提示与「额度用尽」区分开，两者的处置动作不同
