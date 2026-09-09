## ADDED Requirements

### Requirement: 运营台显示生产正在运行的版本

系统 SHALL 在运营台显示当前生产各进程运行的构建标识（commit 短哈希与构建时刻）。
SHALL NOT 依赖人工记忆或 ssh 登录来回答「线上是哪个版本」。

#### Scenario: 部署后查看版本

- **WHEN** superadmin 打开运营台的部署视图
- **THEN** 显示本次部署的 commit 短哈希与构建时刻
- **AND** 显示各 pm2 进程的启动时刻与重启次数

#### Scenario: 构建标识缺失

- **WHEN** 部署清单不存在或缺少构建标识
- **THEN** 明确显示「未知」并指出清单缺失，而不是显示空白或旧值

---

### Requirement: 配置指纹并排可见，不一致必须显眼

对每个存在两份配置的应用，系统 SHALL 并排显示两份配置中关键项的指纹，并在不一致时
高亮。SHALL NOT 显示配置项的值。

理由是事故本身：`apps/web` 的根 `.env` 与 standalone `.env` 曾长期不一致，
而没有任何视图能一眼看出；`SHOPIFY_API_SECRET` 与 `_PREVIOUS` 配反了一周。

#### Scenario: 两份配置不一致

- **WHEN** 某应用的根 `.env` 与 standalone `.env` 关键项指纹不同
- **THEN** 该行高亮为异常，并说明「进程读的是 standalone 那份」

#### Scenario: 绝不显示明文

- **WHEN** 视图渲染任何密钥、令牌或密码类配置
- **THEN** 只输出 sha256 前 12 位与长度
- **AND** 页面上不存在可还原出原值的信息

---

### Requirement: Shopify 密钥代际以实测证据呈现

系统 SHALL 显示 Shopify 实际用于签名的密钥代际，依据为真实入站请求的验签命中记录。
SHALL NOT 以配置里的变量名作为「哪把是当前密钥」的依据——变量名曾与事实相反。

#### Scenario: Shopify 仍在用旧密钥

- **WHEN** 验签命中记录中存在 `previous` 代
- **THEN** 显示为「不可删除」，并列出仍在用旧密钥的 topic

#### Scenario: 尚无证据

- **WHEN** 验签命中记录为空
- **THEN** 显示「证据不足」，而不是显示「可以删除」

---

### Requirement: 令牌到期可见

系统 SHALL 显示每个店铺 Shopify 访问令牌的到期时刻与是否持有刷新令牌。

#### Scenario: 令牌临近到期

- **WHEN** 某店访问令牌将在 24 小时内到期
- **THEN** 该行标记为临近到期
- **AND** 同时显示是否持有刷新令牌——没有刷新令牌意味着到期即失去 Admin API 访问
