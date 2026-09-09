# DEPLOY.md

**部署与运行时配置的实况**。改任何配置、跑 `scripts/deploy-mvp.sh` 之前先读这里。

本文件只写**配置与部署的事实**：谁在跑、配置项的权威位置、生效链路、怎么验证、
以及配置类决策的由来。架构看 `ARCHITECTURE.md`，不可逆决策看 `DECISIONS.md`，
agent 行为约定看 `AGENTS.md`——本文不复述它们。

## 1. 生效拓扑（wjclaw）

| 进程 | pm2 名 | 端口 | **cwd（决定它读哪份 .env）** |
|---|---|---|---|
| API (NestJS) | `drsell-api` | 5011 | `/opt/drsell-run/apps/api` |
| Web (Next) | `drsell-web` | 5012 | `/opt/drsell-run/apps/web/standalone/apps/web` |
| Storefront (Next) | `drsell-storefront` | 5010 | `/opt/drsell-run/apps/storefront/standalone/apps/storefront` |
| Ops (Next) | `drsell-ops` | 5013 | `/opt/drsell-run/apps/ops/standalone/apps/ops` |
| AI 网关 | `openclaw-drsell` | 18790 | — |

**对外的 nginx 不在宿主机，在 `webrtc-ws-proxy` 容器里**（`nginx:alpine`，host 网络，
所以宿主机 `ss -tlnp` 里看着像本机 nginx）。宿主机上这些**都不生效**：
`/etc/nginx/conf.d/drsell.szchada.top.conf.bak`（`.bak` 不被 include）、
`/etc/nginx/sites-enabled/`（只有 `default`）、`/var/log/nginx/access.log`（0 字节）。

看生效配置与日志：

```bash
docker exec webrtc-ws-proxy nginx -T
docker exec webrtc-ws-proxy sh -c 'ls /etc/nginx/conf.d/'
```

生效的是 `drsell.szchada.top.conf`；同目录并存 `.bak.2026-09-03-1416`，别读错。

`/api/auth`、`/api/webhooks`、`/api/backend/` 打到 **web**（5012），
其余 `/api/` 打到 **api**（5011），`/` 打到 storefront。

## 2. 配置的权威位置与生效链路

**三个 Next 应用各有两份 `.env`，进程读的是 standalone 里那份。**
Next 在**构建时**把本地 `apps/<app>/.env` 复制进 `.next/standalone/`，
而 pm2 在 standalone 目录里启动 `server.js`。

链路（`deploy-mvp.sh` 保证只有这一条）：

```
本机 apps/<app>/.env
  → rsync → 服务器 apps/<app>/.env
  → 脚本 sed 修正（PORT / API_INTERNAL_URL / NEXT_PUBLIC_API_BASE …）
  → cp → apps/<app>/standalone/apps/<app>/.env   ← 进程真正读的
```

由此得出两条硬规矩：

1. **改配置改本机的 `apps/<app>/.env`，然后重新部署。** 直接改服务器上
   `apps/<app>/.env` 再 `pm2 restart` **不生效**——那份文件没人读。
2. **`pm2 restart --update-env` 帮不上忙。** 密钥不在进程环境里，是应用自己
   从 cwd 读 `.env`。查进程实际拿到什么：
   `tr '\0' '\n' < /proc/$(pm2 pid drsell-web)/environ`（会发现 `SHOPIFY_API_*` 根本不在里面）。

`apps/api` 没有 standalone 产物，只有一份 `.env`（NestJS `ConfigModule` 从 cwd 读），
所以 `SUBSCRIPTION_GATE_ENFORCE` 这类 API 侧开关直接改服务器 `.env` + 重启即可生效。

`.env` 一律不入库（`AGENTS.md` 陷阱 6）。本文只记**指纹**，不记值：
`printf '%s' "$v" | sha256sum | cut -c1-12`。

## 3. Shopify 密钥实况

唯一合法 client_id 见 `AGENTS.md` 陷阱 4。密钥的两把指纹：

| 变量 | 指纹 | 实况 |
|---|---|---|
| `SHOPIFY_API_SECRET` | `58e8f70fb2a5` | **Shopify 实际在用的那把**（2026-09-09 对调后） |
| `SHOPIFY_API_SECRET_PREVIOUS` | `4c3a72ece258` | 2026-09-03 填入的那把，Shopify 从未使用 |

2026-09-09 之前两者是反的，OAuth 因此全线失败——见 §5 的 DEP-1。
判据是持久化的，不靠翻日志：
`WebhookSecretUse` 表按「密钥代 × topic」记录每条 webhook 的验签命中，
运营台 `/gate` 展示。该表**只能由真实 Shopify webhook 填充**——自签探针会伪造出
「已切换」的假象（2026-09-09 污染过一次，已清表）。

## 4. 验证（每条都因为漏过真实故障而存在）

### 一条命令跑完全部

```bash
bash scripts/verify-prod.sh
```

**只读**：全是 GET / SELECT，不写库、不重启进程、不改配置。
输出只含指纹（sha256 前 12 位），绝不含密钥、令牌或连接串。
任一硬断言失败则 `exit 1`，可直接接进 CI 或 cron。

它覆盖的正是下面这些规矩——**写成可执行的断言，而不是靠人记得**：

| 检查 | 对应的真实故障 |
|---|---|
| 三条公网入口走域名 + 断言内容 | nginx location 指错应用 → 200 但内容是另一个站 |
| OAuth 入口带浏览器 UA，断言 307 与 client_id | 裸 curl 被 `isbot` 判成 bot → 假报「OAuth 全坏」 |
| 部署清单 commit / 构建时刻 | 复合命令吞掉退出码 → 失败部署被当成成功 |
| 两份 `.env` 指纹是否一致 | 改根 `.env` 重启，进程读的却是 standalone 那份 |
| 迁移头代码 vs 数据库 | `migrate deploy` 失败或被跳过 |
| 密钥槽位（`latestSlot`） | 轮换期把「将要接管的新密钥」当旧密钥删掉 |
| 令牌到期与刷新令牌 | 令牌过期且无刷新令牌 = 该店 Admin API 已死 |
| 闸门模式与「镜像从未同步」 | 据未同步的镜像停服 = 误停真实付费商家 |

判据逻辑在 `scripts/verify-prod-report.mjs`（有分支的业务判断放 JS，
不写成没人敢改的 jq 一行式）。

### 逐条说明



`AGENTS.md` 陷阱 3 是这几条的出处，不在此复述其论证。操作要点：

- **走公网 + 断言内容**。`deploy-mvp.sh` 的 `verify_public` 在 nginx reload 后执行，
  不过就 `exit 1`。
- **别把脚本接管道**：`bash scripts/deploy-mvp.sh | tail -10` 拿到的是 `tail` 的
  退出码。重定向到文件再单独取 `$?`。
- **验产物指纹**比任何退出码都硬：首页取 `/_next/static/chunks/app/layout-<hash>.js`，
  哈希没变就是没部署上去。

额外两条（本文件独有）：

- **复合命令的退出码不是部署脚本的。** `bash deploy.sh > log; RC=$?; echo ...; curl ...`
  作为一条后台命令跑，整体退出码是**最后那个 `curl`** 的。2026-09-09 一次
  `exit=255` 的失败部署（rsync 中途 ssh 断连）差点被当成成功——`DEPLOY_EXIT` 打在
  中间，而我只看了输出末尾。**唯一可靠的判据是产物**：运营台 `/deploy` 上的
  commit 是不是你刚提交的那个。

- **别用裸 `curl` 判 `/api/auth` 健康。** `@shopify/shopify-api` 的 `auth.begin()`
  开头有 `isbot(userAgent)`，命中就返 410 且不设 `Location`，路由随即 500。
  curl 默认 UA 会被判成 bot。必须带浏览器 UA，健康时是 307 → Shopify 授权页。

## 5. 实况在哪看

本文件记的是「配置**应该**是什么」。「**现在**是什么」在运营台：

**`https://ops.szchada.top/deploy`** —— 线上 commit 与构建时刻、每个应用两份 `.env`
的并排指纹（不一致即高亮）、迁移头是否一致、各店令牌到期与是否持有刷新令牌。

数据来自部署时生成的 `/opt/drsell-run/deploy-manifest.json`（由
`scripts/deploy-manifest.mjs` 在服务器上生成）。页面与清单**都只有指纹，没有值**。

清单显示为「缺失」意味着这次部署没走 `deploy-mvp.sh`，或生成失败——
那是「不知道」，不是「没问题」。

## 6. 配置决策

### DEP-1：`SHOPIFY_API_SECRET` 与 `_PREVIOUS` 配反了（2026-09-09）

**证据**（两个独立通道，都指向 `58e8f70fb2a5`）：

- webhook：真实 `app/scopes_update` 只有用 `_PREVIOUS` 才验得过
- OAuth 回调：`lib/oauth-diagnose.ts` 判定 `hmacCurrent=false / hmacPrevious=true`，
  且 `stateMatch=true`（排除链接过期与并发覆盖，唯一坏的就是 HMAC）

**曾被误当作反证的**「嵌入应用能用，所以当前密钥没错」不成立：日志里没有任何
session token 换发记录，商家端跑的是 localStorage 里缓存的本站 JWT，
不经过 Shopify 验签。

**结论**：`_PREVIOUS` 才是当前密钥，两者已对调（2026-09-09）。此前「等 Shopify
切到新密钥再删 `_PREVIOUS`」的判断方向是错的——Shopify 从未切换过。

**更正（同日，晚些时候）**：上一段曾写「`4c3a72ece258` 是 Shopify 侧从未使用的密钥，
应当删除」——**错，而且删了会出事**。

对照 Partner 后台后真相是：轮换进行中，后台**同时列出两把**，而 Shopify 仍用 old 签名。

| 后台 | 指纹 | 我们的槽位 | Shopify 是否用它签名 |
|---|---|---|---|
| old | `58e8f70fb2a5` | `SHOPIFY_API_SECRET` | 是 |
| new | `4c3a72ece258` | `SHOPIFY_API_SECRET_PREVIOUS` | 尚未 |

所以 `_PREVIOUS` 里装的不是将死的旧密钥，而是**将要接管的新密钥**。
它一直静默恰恰是「还没启用」的表现，不是「可以删」的证据。删掉它，
Shopify 切过去那一刻 webhook 与 OAuth 会同时全挂。

**当前状态是正确的，不需要改配置**：两把都配着，切换发生时无缝。

⚠ **变量名在这段窗口里是反的**——`SHOPIFY_API_SECRET_PREVIOUS` 持有的是**新**密钥。
不能为了让名字好看而对调：`SHOPIFY_API_SECRET` 是库用来验 session token、
签 OAuth state cookie 的那把，必须等于 Shopify 当下实际使用的密钥。
等 Shopify 切到 new 之后，再把两个槽位对调，那时 `_PREVIOUS` 才是可删的。

判据已把这条固化：`SHOPIFY_API_SECRET_LATEST_FP` 填后台**最新**那把的指纹，
运营台 `/gate` 据此拒绝在 `_PREVIOUS` 持有新密钥时建议删除。

### DEP-2：`.env` 只有一条生效链路（2026-09-09）

见 §2。此前服务器上并存两份，脚本自己的 `sed` 修正（`API_INTERNAL_URL`、
`NEXT_PUBLIC_API_BASE`）也一直改在没人读的文件上，空转了很久没被发现。
修法是部署时把根 `.env` 覆盖进 standalone，让链路唯一。
