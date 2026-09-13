## ADDED Requirements

### Requirement: 顾客可浏览目录、加购并完成结算下单

独立站 SHALL 提供商品目录浏览、商品详情、购物车与结算。结算 SHALL 经 Stripe 完成支付
并生成订单。商品/购物车/订单数据 SHALL 来自电商引擎（Medusa Store API），店面 SHALL NOT
自持电商业务逻辑。

#### Scenario: 完成一笔下单

- **WHEN** 顾客加购商品并用 Stripe 完成结算
- **THEN** 生成一笔订单
- **AND** 该订单经摄取通路出现在 drsell PG，供 AI 查询

### Requirement: 顾客可查订单与物流并发起售后

独立站 SHALL 提供订单查询与物流追踪，并提供发起售后（退货/换货/理赔）的入口。售后状态
变化 SHALL 经摄取通路进入 drsell，供 AI 作答。

#### Scenario: 发起退货后 AI 能答进度

- **WHEN** 顾客在账户页对某订单发起退货，随后在挂件里询问进度
- **THEN** AI 能查到该退货记录及其状态并作答

### Requirement: 店内 AI 挂件以本店身份应答

独立站页面 SHALL 嵌入 drsell 挂件，并以本店的 shop 身份换发 drsell 会话，使 AI 的数据
查询限定在本店。挂件 SHALL NOT 依赖 Shopify App Bridge。

#### Scenario: 挂件在非 Shopify 宿主可用

- **WHEN** 顾客在独立站（非 Shopify、无 App Bridge）打开挂件发问
- **THEN** 挂件用本店 shop 身份建立 drsell 会话
- **AND** AI 只返回本店数据
