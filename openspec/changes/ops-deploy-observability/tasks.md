## 1. 部署清单

- [x] 1.1 `deploy-mvp.sh` 生成 `/opt/drsell-run/deploy-manifest.json`：commit 短哈希、 —— `deploy-manifest.json`，含 commit（工作区脏则加 `-dirty`）、构建时刻、迁移头
      构建时刻、迁移头
- [x] 1.2 清单含各应用**根 `.env` 与 standalone `.env`** 的关键项指纹（并排，D1/D2）
- [x] 1.3 指纹为 sha256 前 12 位 + 长度；**清单里绝不含明文**
- [x] 1.4 `check-deploy-facts` 断言脚本仍在生成清单——否则页面会静默显示旧值 —— 并加验「生成器确实做了 sha256 指纹化」，防止哪天改成写明文

## 2. API

- [x] 2.1 `GET /api/ops/deploy` 读清单并合并运行时信息（pm2 进程启动时刻、重启次数） —— 只精确报 API 自己的启动时刻；不 exec pm2（见 3.x 说明）
- [x] 2.2 清单缺失时返回明确的「未知」，不返回空对象让前端渲染成空白
- [x] 2.3 合并 `WebhookSecretUse` 的代际证据（D4）与各店令牌到期
- [x] 2.4 单测：指纹不一致时标记为异常
- [x] 2.5 单测：清单缺失 → `unknown`，不抛错
- [x] 2.6 单测：响应中不含任何明文密钥（用真实格式的假密钥断言不出现） —— 6 种真实格式的假密钥逐个断言被打码，含「白名单漏配」情形

## 3. 运营台视图

- [x] 3.1 `/deploy` 页：版本、配置指纹并排、密钥代际、令牌到期
- [x] 3.2 指纹不一致高亮，并说明「进程读的是 standalone 那份」
- [x] 3.3 令牌 24 小时内到期标记，并显示是否持有刷新令牌
- [x] 3.4 进 superadmin 导航，走既有鉴权与审计

## 4. 收尾

- [x] 4.1 `pnpm test`（含 `pnpm spec`）全绿 —— api 17 套/146 个，web 3/16，spec 12/12
- [x] 4.2 `openspec validate ops-deploy-observability --strict` 通过
- [x] 4.3 `DEPLOY.md` 指向该视图——文档记「应该是什么」，视图记「现在是什么」 —— DEPLOY.md §5「实况在哪看」
- [x] 4.4 部署后走公网验证 —— 退出码 0，三条公网断言过；清单记的 commit 与 HEAD 一致
      （`a20c168`）；`/api/ops/deploy` 端到端返回真实数据且无明文；三个 Next 应用的
      standalone `.env` 均已覆盖（含此前从未同步的 ops）

## 5. 实施中发现

- [x] 5.1 `apps/ops/.env` **从未被同步到服务器**——它绕过服务器根 `.env` 直接从本地构建
      进 standalone，是 DEPLOY.md §2「只有一条链路」的破口，也让运营台看不到它的配置。
      已纳入同步
- [x] 5.2 视图上线第一眼就抓到实据：`chatbotdomaintest` 的访问令牌已过期 5 小时
      （有刷新令牌兜底，故不标风险）。这类事实此前无处可见
- [x] 5.3 单测夹具曾直接用真实 Shopify app secret，靠 GitHub 推送保护才拦下。
      已换成「格式合法但含非十六进制字母」的合成值，并加 `spec/check-no-secrets.mjs`
      把发现点提前到提交之前——AGENTS.md 陷阱 6 此前没有执行体
- [x] 5.4 收尾时一次部署因 ssh 断连失败（`exit=255`），而我几乎报成成功——
      复合命令的退出码是最后那个 `curl` 的，`DEPLOY_EXIT` 打在中间被漏看。
      **是这个视图本身抓住了它**：清单 commit 停在上一版，`ops/.env` 也没同步。
      判据已写进 DEPLOY.md §4：唯一可靠的是产物，不是退出码
