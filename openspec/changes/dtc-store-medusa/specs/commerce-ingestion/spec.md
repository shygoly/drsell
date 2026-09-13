## ADDED Requirements

### Requirement: 外部电商数据经鉴权摄取端点入 PG

系统 SHALL 提供服务端到服务端的摄取端点，接收非 Shopify 来源（如 Medusa）的产品、订单、
库存、售后数据，鉴权 SHALL 用 store 专属密钥（非商家 JWT）。写入 SHALL 幂等——产品/订单/
顾客按各表既有唯一约束 `tenantId + 外部ID列` upsert（外部 ID 存入复用的 `shopify*Id` 列），
售后按 `tenantId + source + externalId` upsert；`source` 列 SHALL 标记来源、SHALL NOT 覆盖
其他来源同表数据。写入 SHALL 始终带 `shopId`（禁止 `shop_id` 为空导致跨店泄漏），且 SHALL
按来源版本拒绝比已存记录更旧的写入（乱序/重投不回退状态）。

#### Scenario: 重复或乱序投递不产生重复行、不回退状态

- **WHEN** 同一来源的同一外部 ID 被投递多次，或旧版本晚于新版本到达
- **THEN** 记录被 upsert 为同一行（幂等），且更旧的版本被拒绝
- **AND** 不新增重复行、不把状态回退

#### Scenario: 无效密钥被拒

- **WHEN** 摄取请求未带或带错 store 密钥
- **THEN** 端点拒绝（未授权），不写库

#### Scenario: 不同来源同表并存且隔离

- **WHEN** 同一部署下既有 Shopify 同步数据又有 Medusa 摄取数据
- **THEN** 两者以 `source` 区分并存、互不覆盖，且各自带 `shopId`
- **AND** 现有 Shopify 同步与产品/订单 AI 读取行为逐字不变

### Requirement: AI 可回答独立站的产品/订单/售后，且敏感数据按顾客隔离

系统 SHALL 让 AI 客服能就独立站的产品、订单、售后作答，数据来源对 AI 透明
（source-neutral）。售后 SHALL 由一个只读工具暴露给 AI。含金额/原因的售后与订单明细
SHALL 按提问顾客的身份过滤，SHALL NOT 允许匿名访客凭订单号读取他人订单/退款。店铺域锁定
与顾客注入防护（见 conversation-context）SHALL 对独立站同样生效。给独立站启用售后工具
SHALL NOT 改变 Shopify 店的 system prompt 与既有工具调用。

#### Scenario: 顾客问自己订单的退货进度

- **WHEN** 已识别身份的独立站顾客询问其订单的退货/退款状态
- **THEN** AI 经只读售后工具查到该顾客该订单的售后记录并作答

#### Scenario: 匿名访客不能凭订单号读他人敏感数据

- **WHEN** 未识别身份的访客报出一个订单号索要退款金额/原因
- **THEN** 系统不返回该订单的金额/原因等敏感字段

#### Scenario: 启用售后不回归 Shopify 店

- **WHEN** 新增售后工具并按 source 参数化 prompt 后，Shopify 店处理常规查询
- **THEN** Shopify 店的 system prompt 逐字不变、既有产品/订单工具调用不回归
