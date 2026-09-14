# DEPLOY.md

**部署与运行时配置的实况**。改任何配置、跑 `scripts/deploy-mvp.sh` 之前先读这里。

本文件只写**配置与部署的事实**：谁在跑、配置项的权威位置、生效链路、怎么验证、
以及配置类决策的由来。架构看 `ARCHITECTURE.md`，不可逆决策看 `DECISIONS.md`，
agent 行为约定看 `AGENTS.md`——本文不复述它们。

## 0. 两套部署，别混为一谈

wjclaw 上跑着**两条互不相干的部署链路**。它们共用一台机器、一套 nginx、一个 PG 簇，
但构建方式、进程管理、配置来源全不相同——**改一套时按另一套的直觉操作，就是事故**。

| | drsell（Shopify 侧） | DTC 独立站（Medusa 侧） |
|---|---|---|
| 域名 | `drsell.szchada.top` · `ops.szchada.top` | `medusa.szchada.top` |
| 源码 | 本仓 pnpm workspace | **不在 workspace**（`!apps/shop`、`!apps/shop-web`） |
| 构建 | 本机 `turbo`/`next build` → rsync | **服务器上** `npm install` + `medusa build` |
| 运行目录 | `/opt/drsell-run` | `/root/drsell-shop-build/shop`（引擎）· `/opt/drsell-shop-web`（店面） |
| 部署入口 | `scripts/deploy-mvp.sh` | **`scripts/deploy-shop.sh`**（2026-09-13 新增；此前纯手工，见 §6） |
| 进程管理 | pm2（4 个，纳入 `pm2 save`） | 店面 `drsell-shop-web` + 引擎 `drsell-shop-medusa` 均在 pm2 |
| 配置 | 本机 `apps/<app>/.env` → rsync（§2） | `/root/drsell-shop/shop.env` + `apps/backend/.env`（+ 构建产物 `.medusa/server/.env`），**服务器现场生成** |
| 数据库 | `drsell`（PG 5433） | `drsell_shop`（同簇，独立库+角色） |

**两条链路互不覆盖**：`deploy-mvp.sh` 不碰 Medusa 侧（实测脚本里 `shop`/`medusa` 零命中），
`deploy-shop.sh` 也不碰 drsell 侧。但**共享的部分要两边都想**——DTC 挂件走的是 drsell 的
`/public/chat`，改 AI reader 会同时打到两个站（§6.8 就是这种改动）。

## 1. 生效拓扑（wjclaw）

| 进程 | pm2 名 | 端口 | **cwd（决定它读哪份 .env）** |
|---|---|---|---|
| API (NestJS) | `drsell-api` | 5011 | `/opt/drsell-run/apps/api` |
| Web (Next) | `drsell-web` | 5012 | `/opt/drsell-run/apps/web/standalone/apps/web` |
| Storefront (Next) | `drsell-storefront` | 5010 | `/opt/drsell-run/apps/storefront/standalone/apps/storefront` |
| Ops (Next) | `drsell-ops` | 5013 | `/opt/drsell-run/apps/ops/standalone/apps/ops` |
| AI 网关 | `openclaw-drsell` | 18790 | — |
| DTC 店面（静态） | `drsell-shop-web` | 5020 | `/opt/drsell-shop-web`（`SHOP_WEB_ROOT`） |
| **Medusa 引擎** | `drsell-shop-medusa` | 9000 | `/root/drsell-shop-build/shop/apps/backend/.medusa/server` |

Medusa 引擎跑**生产模式**：`medusa build` 产物 `.medusa/server`（`NODE_ENV=production`，
`node_modules/.bin/medusa start`），纳入 pm2（`drsell-shop-medusa`，已 `pm2 save`）。
后台 /app 为**预构建静态资源**（`/app/assets/*`），**不再是 Vite dev 服务器**。
（2026-09-13 前曾是手工 `medusa develop`（PPID=1，重启即丢），现已切换到 pm2 生产模式。）

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

**`medusa.szchada.top` 是同一容器里的另一个 vhost**，分流规则不同：
`/app /admin /store /auth /health` → Medusa :9000，`/` → 店面 :5020。
店面与 Store API 因此**同源**，`/store/products` 没有 CORS 问题——这是刻意设计，
不是巧合：店面是无构建静态页，靠客户端调同源 API 渲染商品。

⚠ **这个 vhost 现已入仓**：`infra/nginx/medusa.szchada.top.conf`（2026-09-13 从容器里取回，
此前只存在于服务器上）。由 `scripts/deploy-shop.sh` 第 6 步同步；**改它之后必须跑那个脚本**，
否则改动只在本地。容器里另有 `medusa.szchada.top.conf.bak.20260913-181549`，别读错。
证书在 `/opt/webrtc-ws-proxy/certs/medusa.szchada.top.{crt,key}`（**自签，非 ACME** —— 
所以别指望 certbot 续期，也别把某处的站点配置照抄过来）。

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

### 浏览器体检（渲染 + console 错误）

上面 `verify_public` 断言的是**内容特征**。有一类故障它结构上抓不住：
**HTTP 200、内容也对，但页面在浏览器里是坏的**——JS 运行时报错、
`/_next/` 静态资源 404（`assetPrefix` 或 nginx location 配错时 HTML 照常返回、
chunk 全 404）、组件没挂载。`curl` 看 HTML 文本，这些都看不见。

**执行方式**（`dsh-pilot`，装机见本节末）：

```bash
bash scripts/verify-prod-browser.sh --check   # 先做无浏览器前置检查 + 打印验证规格
```

然后由 agent 按规格用 `pilot_*` 工具执行：`pilot_navigate` → `pilot_snapshot`
（断言内容特征）→ 读 navigate 返回的 **console errors**（必须为空）→
`pilot_screenshot` → `pilot_close`。

**为什么判据在脚本里、执行在 agent 里**：dsh-pilot 是**进程内工具**，没有 HTTP
接口，bash 调不动它。所以 `verify-prod-browser.sh` 负责确定性地列出「该验哪些 URL、
断言什么内容特征」，agent 只负责执行。**不要让 agent 自己决定验什么**——
那样每次标准都不一样，等于没有标准。

部署时附带打印规格（默认关闭，无人值守时没有 agent 在场）：

```bash
BROWSER_VERIFY=1 bash scripts/deploy-mvp.sh
```

**两个已知约束**：

1. **origin 必须显式放行**。本地 host（`localhost`/`127.0.0.1`/`[::1]`）免授权，
   公网域名要写进 profile 的 `~/.dsh/profiles/web/cordis.patch.yml`：
   ```yaml
   - id: pilot
     config:
       allowedOrigins:
         - https://drsell.szchada.top
         - https://ops.szchada.top
   ```
   没放行时 `pilot_navigate` 报 `origin ... was rejected by the user`——**那是设计
   如此，不是 bug，也不要绕**。

2. **改完 patch 要重启 dsh web**。`config` 在插件 `apply()` 时被闭包捕获，
   热重载（`dev_reload_package`）只重建 fiber、不会重读 patch 层——实测改完配置
   热重载仍然拒绝 origin。

**装机**：`dsh plugin --profile web add dsh-pilot` 在本机是**失败**的（pnpm store
版本冲突 + pnpm 在本包上产出指向自身的符号链接，详见
`scripts/fix-dsh-pilot-link.sh` 头部注释）。链接损坏、或 GUI 里 `pilot_*` 工具消失时：

```bash
bash scripts/fix-dsh-pilot-link.sh   # 幂等；修完重启 dsh web
```

## 5. 实况在哪看

本文件记的是「配置**应该**是什么」。「**现在**是什么」在运营台：

**`https://ops.szchada.top/deploy`** —— 线上 commit 与构建时刻、每个应用两份 `.env`
的并排指纹（不一致即高亮）、迁移头是否一致、各店令牌到期与是否持有刷新令牌。

数据来自部署时生成的 `/opt/drsell-run/deploy-manifest.json`（由
`scripts/deploy-manifest.mjs` 在服务器上生成）。页面与清单**都只有指纹，没有值**。

清单显示为「缺失」意味着这次部署没走 `deploy-mvp.sh`，或生成失败——
那是「不知道」，不是「没问题」。

## 6. DTC 独立站（Medusa）的部署过程

openspec change `dtc-store-medusa`。**与 §1–§5 是两套东西**，见 §0 对照表。
这里记的是 2026-09-12/13 实际走通的顺序，含踩过的坑。

### 6.1 基建：PG + Redis（幂等脚本）

```bash
bash scripts/setup-shop-infra.sh      # 在 wjclaw 上跑
```

**为什么不用现成的库**：wjclaw 的 PG（容器 `cb_postgres_5433`，:5433）是**多项目共享**的，
里面已经有别的项目的 `medusa_db` 和超管角色 `medusa`。直接复用名字会串台，
故用 `drsell` 命名空间隔离：

| 资源 | 取值 | 隔离手段 |
|---|---|---|
| 库 | `drsell_shop` | 独立 database |
| 角色 | `drsell_shop_app` | `NOSUPERUSER NOCREATEROLE NOCREATEDB` |
| Redis | `127.0.0.1:6379` **db2** | 库选择 + 键前缀 `drsellshop:` |

Redis 的 db0 已被别的项目占用，所以选 db2 并加前缀——**只选 db 不加前缀不够**，
同库多应用仍会撞键。

DDL 走**容器内 socket + trust**（超管角色 `medusa`），因此脚本**不需要在任何地方保存超管密码**。
角色密码 `openssl rand -hex 24` 现场生成，只写 `/root/drsell-shop/shop.env`（`chmod 600`，root-only），
**不入库、不回显**。脚本幂等：角色存在则轮换密码，库存在则跳过。

**脚本自带连通性自检**（TCP + 密码，模拟 Medusa 的连接路径），失败即 `exit 1`——
因为 `cb_postgres` 的 `pg_hba` 曾收窄过，DDL 成功不代表应用连得上。

### 6.2 引擎：Medusa v2 scaffold + 构建

**在服务器上构建，不在本机。** 本机不装 Medusa 那棵 `@medusajs/*` 重依赖树
（`pnpm-workspace.yaml` 显式 `!apps/shop` 排除，否则 drsell 的 install 会被拖垮）。

```bash
# wjclaw，Node 22 + 公网 npm
cd /root/drsell-shop-build
printf 'N\n' | npx create-medusa-app@2.21.0 shop \
  --db-url "$DATABASE_URL" --no-migrations --no-browser --use-npm
```

生成产物**不入库**（`apps/shop/README.md` 有重生成命令）。仓库只提交**手写的 wire-up**：
`apps/backend/src/lib/drsell-*.ts` + `src/subscribers/drsell-*.ts`，
scaffold 后覆盖进去。

两个在日志里看着像错误、其实不是的：

- `redisUrl not found. A fake redis instance will be used.` —— 构建期读不到 Redis 是正常的，
  它是**事件总线**的运行时依赖，不影响构建。
- `Lint produced 1 warning`（`drsell-ingest.ts` 抛通用 `Error`）—— 警告不阻断构建。

```bash
cd shop/apps/backend
npm install --omit=dev          # 生产依赖，1100 包约 2 分钟
npx medusa db:migrate           # 建表 + 初始 seed（含样例商品）
npx medusa user --email <admin> --password <pw>
npx medusa build                # 编译 backend(9s) + frontend(28s)
```

⚠ **`npm install` 报 76 vulnerabilities 是实况，不是可忽略的噪音**，
但当前未处理——记在这里是为了下次见到时知道「这不是新引入的」。

### 6.2a 可靠投递：必须显式注册 Redis 模块（`ADR-20`）

Medusa v2 在**未配置**这些模块时**不报错地**回落到进程内内存实现，
`.env` 里的 `REDIS_URL` / `EVENTS_REDIS_URL` / `CACHE_REDIS_URL` 会**全是死配置**
（没有任何代码读它们）。2026-09-13 实测：`medusa-config.ts` 里只有自定义
`inquiry` module，启动日志写着 `Local Event Bus installed. This is not
recommended for production.` 和 `redisUrl not found. A fake redis instance
will be used.`，**而服务照常起、健康检查照常 200**。

失败模式是**静默丢事件**：Medusa 改商品 → `product.updated` 只存在于本进程内存
→ 重启即丢 → subscriber 不跑 → drsell 库里没有这行，**两边都不报错**。

四个模块（缺一不可，见 `apps/shop/apps/backend/medusa-config.ts`）：

```ts
{ resolve: "@medusajs/medusa/event-bus-redis",       options: { redisUrl: EVENTS_REDIS_URL } },
{ resolve: "@medusajs/medusa/workflow-engine-redis", options: { redis: { redisUrl: REDIS_URL } } },
{ resolve: "@medusajs/medusa/caching",  options: { providers: [{ resolve: "@medusajs/caching-redis", is_default: true, options: { redisUrl: CACHE_REDIS_URL } }] } },
{ resolve: "@medusajs/medusa/locking",  options: { providers: [{ resolve: "@medusajs/medusa/locking-redis", is_default: true, options: { redisUrl: REDIS_URL } }] } },
```

`caching` 还需 `featureFlags: { caching: true }` 才生效。

**Redis 用宿主 systemd 的，不用容器**：wjclaw 上 `/usr/bin/redis-server`
（`redis-server.service`，v7.0.15）早已常驻 127.0.0.1:6379，宿主直连无容器
网络/生命周期耦合。**drsell 占 db2**——db0 是**多项目共享**的
（`pubmedclaw:*` 等，实测 30+ 键），故用独立 db + `REDIS_PREFIX=drsellshop:` 双保险。

⚠ **`.env` 合并时会踩一个坑**：`apps/backend/.env` 里有一条
`REDIS_URL=redis://localhost:6379`（指向 **db0**），而 `shop.env` 里那三条带 `/2`。
若直接 `cat` 两处再 `sort -u`，会**留下两份同名变量、取值不同**，谁生效取决于
出现顺序。`deploy-shop.sh` 第 4 步先剔除旧值再合并，务必照做。

验生效（**看日志，不看健康检查**）：

```bash
pm2 logs drsell-shop-medusa --lines 60 --nostream | grep -iE "redis|event.bus"
# 期望：Connection to Redis in module 'event-bus-redis' established
#       [Workflow-engine-redis] Connection to Redis ... established
#       Redis cache connection established successfully
# 绝不能出现：Local Event Bus installed
```

⚠ **日志里会稳定出现 3 条 `redisUrl not found. A fake redis instance will be
used.`——那不是故障，别去追。** 2026-09-13 为它排查过一轮：这 3 条来自
**config 探测阶段**（模块加载器在 env 完全生效前实例化配置，每次都被紧接着的
`Using flag MEDUSA_FF_CACHING from project config` 覆盖），与运行时路径无关。
**判据应是「有没有 Connection to Redis established」，而不是「有没有 fake redis」**
——脚本里若按后者断言会永远红。

端到端判据（比日志硬）：
1. 改一个 Medusa 商品 → drsell 库对应行 `updated_at` 前进（实测通过：
   `product.updated` → `drsell: product ... synced`）；
2. `redis-cli -n 2 --scan --pattern 'bull:*'` 能列出工作流队列键
   （证明 workflow 状态落在 Redis 而非内存）。

**以生产模式跑起来（2026-09-13 起，替代 `medusa develop`）**：`medusa build` 产出的
`.medusa/server` 是自包含目录，起服务并纳入 pm2。**统一跑 `scripts/deploy-shop.sh`**（第 3–4 步），
它把下面这些坑都封住了。手工做的话是这样：

```bash
S=/root/drsell-shop-build/shop/apps/backend/.medusa/server
B=/root/drsell-shop-build/shop/apps/backend
cp "$B/.env" "$S/.env"                      # 生产从 cwd 读 .env
grep -E '^(REDIS_URL|EVENTS_REDIS_URL|CACHE_REDIS_URL|REDIS_PREFIX)=' /root/drsell-shop/shop.env >> "$S/.env"
cd "$S" && pm2 start /root/drsell-shop-build/shop/node_modules/@medusajs/cli/cli.js \
  --name drsell-shop-medusa --interpreter /usr/bin/node -- start
pm2 save
```

⚠ **两个坑，都实际踩过（2026-09-13）：**

1. **`medusa build` 会整个删掉 `.medusa/server` 再重建**，所以：
   - 重建后里面**没有 `.env`**。不补就起不来，报 `[config] ⚠️ http.jwtSecret not found.`
     ——因为 Medusa 从 **cwd** 读 `.env`（和 drsell 侧 Next standalone 是同一类坑，见 §2）。
   - **别把 pm2 的 script path 指向 `.medusa/server/node_modules/.bin/medusa`**：
     那个路径随每次 build 消失，重启即 `MODULE_NOT_FOUND`。
     要用**工作区根**的 `node_modules/@medusajs/cli/cli.js`（不随 build 消失），
     配合 `exec cwd = .medusa/server`。

2. **Redis 凭据不在 `apps/backend/.env` 里**，在 root-only 的 `/root/drsell-shop/shop.env`。
   只 `cp` 前者会得到 `redisUrl not found. A fake redis instance will be used.`——
   生产上这意味着事件总线退化成进程内内存实现（§7 的 8.4）。

**改 wire-up 源码后必须重新 build + 重启**，否则改动不生效：运行的是 `.medusa/server`
里的编译产物，不是 `src/`。判断线上是不是最新：`POST /store/inquiries` 若返回
`Cannot POST`（404）说明跑的还是旧产物。

验产物是不是生产版：`curl -s -H 'Host: medusa.szchada.top' 127.0.0.1:9000/app | grep -o '/app/[^"]*\.js'`
——出现 `/app/assets/index-*.js` 才是 prod 构建；出现 `/app/@vite/client` 说明还在跑 dev。

### 6.2b 询价模块（自定义 module + API 路由）

参考页的「询价表单」原本是 `alert` 演示；本站把它接成**真落库**，表建在 `drsell_shop`。
用户要求「用 api 的方式」写数据，故全程走 Medusa 的模块/路由机制，无旁路直写库。

| 文件 | 作用 |
|---|---|
| `src/modules/inquiry/models/inquiry.ts` | 数据模型（字段见下） |
| `src/modules/inquiry/service.ts` | `MedusaService({ Inquiry })` 自动给 CRUD |
| `src/modules/inquiry/index.ts` | `Module("inquiry", ...)` 定义 |
| `medusa-config.ts` | `modules: [{ resolve: "./src/modules/inquiry" }]` |
| `src/api/store/inquiries/route.ts` | `POST` 公开提交（zod 校验 + 限流）；`GET` 故意 405 |
| `src/api/admin/inquiries/route.ts` | `GET` 列表（走 `/admin/**`，Medusa 自动鉴权） |

建表（生成 + 应用，**不要手写迁移**）：

```bash
cd /root/drsell-shop-build/shop/apps/backend && set -a && . .env && set +a
npx medusa db:generate inquiry    # → src/modules/inquiry/migrations/Migration*.ts
npx medusa db:migrate             # → drsell_shop.inquiry 表
```

**字段为什么这么设计**（B2B 医疗器械获客惯例，见调研出处）：

- `contactRole` + `inquiryType` 是**线索分级**的基础。研究里明确：表单只留
  「姓名+电话」无法判断优先级，必须能按身份/需求类型**路由到不同负责人**
  （采购 / 渠道 / 资料索取 / 售后是四类完全不同的线索）。
- **刻意不含价格字段**：B2B 走「隐藏价 → 询价 → 人工报价」，线索里也不预置报价，
  避免未审核的报价外流。
- `status` + `internalNote` + `source` + `conversationId` 是**留痕**要求
  （研究强调「可追溯」），也留了口子给 AI 客服转人工时带上会话 id。

**安全取舍**（写下来免得后人以为漏了）：公开 `POST` 端点做了 zod 严格校验 +
每 IP 每分钟 5 次的内存限流。**那个限流不是安全边界**（进程重启即清空、多实例不共享），
只是挡脚本刷表单；真防线是后台线索分级 + 人工审核。`GET` 在 store 侧返回 405——
否则等于把客户线索公开挂网上。管理端列表在 `/admin/inquiries`，**实测未鉴权返回 401**。

### 6.3 店面：静态页 + 零依赖服务器

**没有构建步骤**。`apps/shop-web/` 只有 `index.html` + `server.mjs`（零依赖），
由 pm2 直接跑：

```bash
SW=/opt/drsell-shop-web
scp index.html server.mjs wjclaw:$SW/
PORT=5020 SHOP_WEB_ROOT=$SW pm2 start $SW/server.mjs --name drsell-shop-web
pm2 save
```

**发布密钥与 region 必须部署时注入**，仓库里是 `__PUBLISHABLE_KEY__` / `__REGION_ID__`
占位符（前端公开值，但仍不入库）。`deploy-shop.sh` 第 5 步的做法是**从现网页面取旧值回填**
（不必连库），并在替换后断言占位符已消失才 `mv` 就位：

```bash
PK=$(grep -o 'pk_[a-f0-9]*' $SW/index.html | head -1)
REG=$(grep -o 'reg_[A-Za-z0-9]*' $SW/index.html | head -1)
sed -i "s|__PUBLISHABLE_KEY__|$PK|; s|__REGION_ID__|$REG|" $SW/index.html.new
grep -q '__PUBLISHABLE_KEY__' $SW/index.html.new && exit 1   # 没换干净就别上线
mv $SW/index.html.new $SW/index.html
```

⚠ **`data-shop` 必须等于 drsell 侧该店的 `Shop.shopDomain`**（= `INGEST_STORE_DOMAIN`
= `drsell-shop.szchada.top`）。写错不会报错，只会让 AI **查不到本店数据**——
`adp_search_products` 按 shopDomain→tenant 过滤，查不到就一本正经地编。
这个域名**不是** `medusa.szchada.top`（顾客访问域名），两者刻意不同，别顺手改一致。

### 6.3b 内容式官网（2026-09-13 改版）

店面从「商品网格店」改为**内容式官网**（对标 Coze 原型「百赛飞内容式官网」）：
hero + 数据条 + 产品矩阵 + 应用领域 + 资质 + 服务 + 资料库 + FAQ + 双渠道询价。
视觉沿用原型的 design token（`--primary:#2D8C87`、bg `#F4FBFA`、ink `#153A3C`、
radius 14px），实测 computed style 逐项一致。

**产品模块按 B2B 医疗器械特征重新设计**（这是与原型的最大差别，原型是涂层材料站）：

| 设计点 | 为什么 |
|---|---|
| 卡片是**规格矩阵卡**而非商品卡 | 采购先确认「能不能用在我的器械上」，故显式列「涂层类型/适用器械/基材/交付形式」 |
| **不标价**，改双动作「索取报价 / 索取资料」 | B2B 走隐藏价 + RFQ；标价会招来无效零售询盘 |
| 分类筛选（介入器械/血液接触器械/…） | 按应用场景定位，而不是按 SKU |
| 资质模块独立成区 | 研究结论：采购**先看合规再看价格** |

**规格是数据，不是代码**（2026-09-13 迁移，原为前端硬编码的 `SPECS` 常量）：

| 存哪 | 含义 |
|---|---|
| `metadata.specs` | `{标签: 值}` —— 规格内容 |
| `metadata.specsOrder` | `[标签, ...]` —— **展示顺序** |

前端 `readSpecs()` 只读渲染，仓库里**没有**规格副本；改规格 = 改后台数据，
**不需要改代码、不需要重新部署**（实测闭环：API 改 metadata → 刷新页面即变，
含新增字段）。

```bash
bash scripts/seed-shop-specs.sh    # 幂等写入 + 回读校验（在服务器上跑）
```

⚠ **为什么必须有 `specsOrder`**：Medusa 的 `metadata` 列是 **jsonb，不保留键顺序**。
实测写入 `{涂层类型,适用器械,基材,交付形式}`，读出来变成字典序
`{基材,交付形式,涂层类型,适用器械}`——规格矩阵的阅读顺序是有意义的，
故显式存一份顺序数组。前端对 order 里没提到的键会自动追加在后（字典序），
**保证不丢内容**（后台手加字段忘更新 order 时不会消失）。

⚠ **`metadata` 不在 Store API 的默认字段集里**，请求必须显式带 `metadata`，
否则规格永远渲染不出来（页面看着正常、就是没规格，很难查）。

### 6.4 nginx：新 vhost + 自签证书

配置的**仓库副本**是 `infra/nginx/medusa.szchada.top.conf`（由 `deploy-shop.sh` 同步）。要点：

- 证书自签，放 `/opt/webrtc-ws-proxy/certs/medusa.szchada.top.{crt,key}`
  （其他站点走 ACME，这个没有，因为域名不解析到公网 CA 可达处）
- 店面与 API 同源分流是**设计要求**，不是省事（§1）——询价表单能直接 POST 同源
  `/store/inquiries` 正是靠这个，否则要额外配 CORS
- `location ^~ /app` → Medusa :9000（后台是**预构建静态资源**，`/app/assets/*` 全在 `/app` 前缀下；
  `Upgrade` 头保留无害，生产模式无 HMR ws）

改完照例 `docker exec webrtc-ws-proxy nginx -t && ... nginx -s reload`。

### 6.4b 产品数据：走 Admin API，不直写库

`scripts/seed-shop-products.sh` 用 **Medusa Admin API** 创建 B2B 医疗器械产品目录
（用户要求「用 api 的方式」）。走 API 而非 SQL 的理由：产品自动获得 Medusa 完整模型
（variant / price / sales_channel / category），Store API 与后台立即可见，无绕校验的旁路写入。

```bash
bash scripts/seed-shop-products.sh    # 幂等：按 handle 查，存在则跳过
```

三个踩过的点：

1. **创建产品的分类字段是 `categories: [{id}]`，不是 `category_ids`** ——
   传错报 `Unrecognized fields: 'category_ids'`。
2. **价格币种必须匹配 region**。本站 region 只有 EUR，写 `cny` 的价格算不出来，
   Store API 返回 `calculated_amount: null`，页面就成了「价格待定」。
3. **脚本里别把 `curl` 接进 `set -euo pipefail` 的管道判存在性**：
   `curl -sf ... | python3 -c 'sys.exit(0 if ... else 1)'` 在「不存在」时整体非零，
   脚本静默中止（当时 6 个产品一个没建，却因为前面 echo 了分类名而看着像在跑）。
   改成先落盘、再单独判，并且**创建失败必须打出来**。

⚠ **删示例商品要删两处，只删一处会让 AI 说错话。** Medusa 的 seed 自带 4 款
服饰样例（t-shirt/sweatpants/shorts/sweatshirt），它们已被 subscriber 摄取进
**drsell 的 `drsell` 库**（`source='medusa'`）。在 Medusa 里软删只影响店面，
**AI 读的是 drsell 库**——它会继续把这些衣服当成"本店商品"报给顾客
（2026-09-13 实测：AI 答"本店共 11 款产品…另有少量服饰类商品"）。两处都要清：

```bash
# Medusa 侧（店面不再展示）
docker exec cb_postgres_5433 psql -U medusa -p 5433 -d drsell_shop \
  -c "UPDATE product SET deleted_at=now() WHERE handle IN ('t-shirt','sweatpants','shorts','sweatshirt') AND deleted_at IS NULL;"
# drsell 侧（AI 不再读取）
docker exec cb_postgres_5433 psql -U medusa -p 5433 -d drsell \
  -c "DELETE FROM products WHERE source='medusa' AND name IN ('Medusa T-Shirt','Medusa Sweatpants','Medusa Shorts','Drsell E2E 142107');"
```

核对两侧一致：Store API 的 `count` 应等于 `SELECT count(*) FROM products WHERE source='medusa'`。

### 6.4c 询价线索后台页（Medusa Admin 扩展）

`https://medusa.szchada.top/app/inquiries`（侧边栏「询价线索」）。
代码在 `src/admin/routes/inquiries/page.tsx`——**Medusa Admin 的 UI 路由约定**：
文件路径即路由（`src/admin/routes/<path>/page.tsx`），必须默认导出 React 组件 +
导出 `defineRouteConfig({ label, icon })` 才会出现在侧边栏。

页面走的是**同一个受鉴权的 `/admin/inquiries` 接口**，不新增暴露面。设计取向：
**按「谁能跟」组织，而不是按时间堆**——列表显式展示身份(`contactRole`) 与
需求类型(`inquiryType`)，因为这两列决定线索归谁（§6.2b 的字段设计正为此）。
状态可就地推进（`new→qualified→quoted→won→closed`），不必进详情页。

两个部署要点：

1. **admin 扩展是前端产物，必须 `medusa build` 才会编译进去**。
   只改 `page.tsx` 不重新 build，页面永远不会出现。
2. **别只测 HTTP 200**——后台整页是 SPA，路由写错也返回 200。
   `deploy-shop.sh` 第 9 步的判据是**产物里搜得到页面标题**
   （`grep -rq '询价线索' .medusa/server/public/admin/`），这才是真判据。
   本轮实测：侧边栏出现「询价线索」→ 打开 `/app/inquiries` 表格渲染出线索
   → 点「标记为已确认」→ DB `status` 变为 `qualified`。

### 6.4d 成单闭环：询价 → 草稿订单（`ADR-25`）

**先明确不做什么**：DTC 站**不做购物车 / 在线结算 / Stripe**。「闭环」定义为

```
询价（/store/inquiries）→ 人工报价 → Medusa 草稿订单 → 合同账期
```

为什么：医用涂层是**高值、客制化、合同制**交易——一单可能几十万，
没人在网站上点「加入购物车」；按器械定制配方，没有标准 SKU 可加购；
客户是医院/器械厂，走采购流程与账期。套购物车 + Stripe 是**把 B2C 形态错配到
B2B**，还会招来无效零售询盘。出处文档（版式来源的内容式官网原型）在页内写明
「核心导向是技术内容获客 + 询价闭环，**而非即时结账**」。

**落地**（管理端询价页的「转为草稿订单」按钮）：

```
PATCH /admin/inquiries/:id?action=convert   body: { quotedAmount, quotedCurrency?, itemTitle?, quantity? }
```

- 用 `Order Module` 的 `createOrders`，**自定义行项目**（`title` + `unit_price`）
  而不是 `variant_id`——B2B 按方案报价，不是按 SKU 加购。
- 金额由商务**人工核定后录入**（UI 用 prompt），不做「按商品价计算」的假精确。
- **幂等**：已有 `draftOrderId` 直接复用，不重复建单（防商务手抖点两次出两张）。
- 订单 `metadata.inquiry_id` 回指线索，便于统计「官网询价 → 成单」转化。
- 线索 `status` 自动推到 `quoted`，并回填 `draftOrderId` / `quotedAmount` / `quotedCurrency`。

三条反向断言（已实测）：

| 请求 | 期望 | 实测 |
|---|---|---|
| 无 token 调 convert | 401 | 401 |
| 不带 `quotedAmount` | 400 `quoted_amount_required` | 400 |
| 同一线索 convert 两次 | 第二次 `reused: true`，订单数仍为 1 | 通过 |

⚠ **草稿订单不是收款凭据**，付款走合同与账期。别把「生成草稿订单」当成「已成交」。

### 6.4e 后台访问保护：Basic **只能加在 `/app`**，不能加在 `/admin`

**规则一句话**：nginx `auth_basic` 只加在 `/app`（UI 外壳）；
`/admin`（数据接口）交给 **Medusa 自己**鉴权。

```nginx
location ^~ /app {                      # ← 只有这里加 Basic
  auth_basic           "Drsell Admin";
  auth_basic_user_file /etc/nginx/certs/medusa-admin.htpasswd;
  proxy_pass http://127.0.0.1:9000;
}
location ^~ /admin { proxy_pass http://127.0.0.1:9000; }   # ← 不加，靠 Medusa 鉴权
```

⚠ **为什么 `/admin` 绝不能加 Basic——踩过，症状是「登录成功但整页空白」**
（2026-09-13 实测，由 `drsell-admin` 登录后页面全空暴露）：

`Authorization` 这个 HTTP **头一次只能承载一种认证方案**：

| 谁 | 发的头 |
|---|---|
| 后台 SPA 的 XHR | `Authorization: Bearer <medusa-jwt>` |
| nginx Basic 期望 | `Authorization: Basic <base64>` |

同一个头，二选一。SPA 发了 `Bearer` → 就没有 `Basic` → **nginx 直接 401**
→ SPA 取不到任何数据 → 页面渲染成空白（**外壳在、内容是空的**，所以极容易
误判为「前端 bug」或「登录失败」）。

**识别方法**：看 401 的**响应体**。
- nginx 的拦截是 **HTML**：`<center>nginx</center> / 401 Authorization Required`
- Medusa 的拦截是 **JSON**：`{"message":"Unauthorized"}`

`scripts/deploy-shop.sh` 第 8 步就按这个差异断言——只测「401 受保护」是**不够的**，
它会放过「保护过头」这种故障。故另加一条**正向**断言（第 8b 步）：
用真 token 经公网调 `/admin/products`，**必须 200**。

**为什么 `/app` 加 Basic 没事**：外壳的 HTML/JS/CSS 由浏览器直接取，
只带 Basic、不带 Bearer，不冲突。SPA 起来之后的 XHR 才需要 Bearer。

**`/store` 与 `/auth` 也绝不能加 Basic**——店面询价与顾客登录的公开 API，
加了会让顾客侧全挂。

其他两个坑：

- **htpasswd 权限**：文件若 `640 root:root`，而 nginx worker 以 `nginx`(uid 101)
  运行 → **读不到** → 带/不带凭据**都返回 500**（不是 401）。修法
  `chown 101:101`。文件在 certs 挂载卷
  （`/opt/webrtc-ws-proxy/certs/medusa-admin.htpasswd`），**不入库**；
  口令在服务器 `/root/.medusa-admin-pw`（600）。
- **`/app` 受保护后，后台入口是两步**：先弹 Basic（用户名 `drsell-admin`），
  再进 Medusa 自己的登录页（`ADMIN_EMAIL`/`ADMIN_PASSWORD` 在 `shop.env`）。

验证矩阵（改完**全部要测**，只测 401 会漏掉 500 与「空白页」两类故障）：

| 请求 | 期望 |
|---|---|
| `/app` 无凭据 | 401 |
| `/app` 错口令 | 401 |
| `/app` 对口令 | 200 |
| `/admin/**` 无 token | 401，且响应体是 **Medusa 的 JSON**（非 nginx HTML） |
| `/admin/products` **带真 token** | **200**（这条才拦得住「空白页」） |
| `/` · `/health` · `/store/products` | 200（**公开侧不能被牵连**） |

### 6.5 AI 链路：零改动即通（这是本次最反直觉的一点）

DTC 店面挂件**没有改任何 AI 代码**就能答本店商品。原因值得记下来，否则下次会白改：

chat 路径**没有 Shopify 耦合**。`adp_search_products` 按 `shopDomain` → tenant 过滤，
**不看 `source` 字段**。所以 Medusa 商品只要进了 drsell 库，AI 自然就能查到。
挂件只需 `data-shop` 指对该店 + `DRSELL_API_BASE` 指向 `drsell.szchada.top/api`。

**但有一条必须补**：Medusa 的 subscriber 只对**增改事件**触发，**存量 seed 商品不会自己进来**。
一次性回填：

```bash
cd /root/drsell-shop-build/shop/apps/backend
npx medusa exec ./src/scripts/backfill-drsell.ts
```

漏跑这一步的症状是「AI 说没有商品，但后台明明有」——**先查回填，再查挂件配置**。

### 6.6 验证（DTC 侧）

```bash
curl -s https://medusa.szchada.top/health                       # 期望 OK
curl -s https://medusa.szchada.top/ | grep -c "内容式官网"        # 断言内容，不只状态码（陷阱 3）
curl -s https://medusa.szchada.top/ | grep -c "drsell-chat-root" # 挂件在
```

**询价落库必须真提一次**（这是本次新加的唯一写路径，只在浏览器点过不算数）：

```bash
PK=$(curl -s https://medusa.szchada.top/ | grep -o 'pk_[a-f0-9]*' | head -1)
curl -s -X POST https://medusa.szchada.top/store/inquiries \
  -H "Content-Type: application/json" -H "x-publishable-api-key: $PK" \
  -d '{"contactRole":"purchaser","inquiryType":"sample","contactName":"验证","contactPhone":"13800000000"}'
# 期望 201 {"ok":true,"id":"..."}；再查库确认这行真的在 drsell_shop.inquiry
```

三条反向断言（**能挡住「看起来部署成功了」的假象**）：

| 断言 | 期望 | 含义 |
|---|---|---|
| `GET /store/inquiries` **带** pk | 405 | 线索不被公开列举 |
| `GET /store/inquiries` **不带** pk | 400 | （这层是 Medusa 的 pk 中间件拦的，早于我们的 handler） |
| `GET /admin/inquiries`（无 token） | 401 | 管理端受保护 |
| `POST /store/inquiries` 缺联系方式 | 400 | 校验生效 |

**规格与后台页也要验**（两条都容易「看着没坏」）：

```bash
# 规格：经 Store API 回读，必须每个商品都有 specs + specsOrder，且键集一致
bash scripts/seed-shop-specs.sh          # 自带回读校验，不过即 exit 1

# 后台页：判据是**产物里有页面**，不是 HTTP 200（SPA 路由错也返回 200）
ssh wjclaw "grep -rq '询价线索' /root/drsell-shop-build/shop/apps/backend/.medusa/server/public/admin/ \
  && echo ok || echo MISSING"
```

手动验规格是否真从 metadata 来（而不是被兜底掩盖）：改后台某商品的 `metadata.specs`
加一个字段 → 刷新页面 → 新字段应出现、且**不改代码不部署**。这条做过一次，
是 `metadata` 迁移的唯一有效证据。

**AI 必须真问一次**（陷阱 1：不支持 tool calling 的模型会编造商品）：
浏览器打开 medusa.szchada.top → 问某款涂层产品的用途 → 答案要与
`/store/products` 里的真实商品对得上。**只看 200 不算验证过。**

⚠ `scripts/verify-prod.sh` **不覆盖** medusa.szchada.top——它只跑 §4 那些 drsell 侧断言。
DTC 侧的回归现在由 `scripts/deploy-shop.sh` 第 7 步兜底（公网 + 内容断言 + 不过就 `exit 1`），
但那只在**部署时**跑；非部署期的日常巡检仍是缺口（§7 第 8.5 条）。

### 6.7 端到端已验（2026-09-12/13）

- 引擎：Medusa 改商品 → subscriber 触发 → `POST /api/ingest/products`（无 key 401、带 key 200）
  → drsell PG `products` 出现 `source='medusa'` 行
- 店面：商品正常渲染，右下角挂件可对话，AI 用真实 Medusa 商品作答（curl + 浏览器双验）
- **2026-09-13 改版后复验**：内容式官网上线（hero/产品矩阵/FAQ/询价全在），
  6 款 B2B 医疗器械产品经 Store API 渲染、分类筛选取自真实 `categories`、
  询价表单经公网 POST 落库 `drsell_shop.inquiry`（201 + 库内可见）、
  管理端 `/admin/inquiries` 能列出该线索、移动端（390px）单列无横向滚动。
  随后**整跑一次 `scripts/deploy-shop.sh`（exit 0）再复验询价 201**，确认改动可重放。

### 6.8 售后 AI + 按顾客隔离（D8，2026-09-13）

在 §6.5「零改动」之上，这次加了售后问答与顾客隔离，**动了生产 reader，过陷阱 1**：

- **售后 reader**：`adp-reader.sql` 加 `adp_get_after_sales`（SECURITY DEFINER，按 shopDomain 隔离）。
  应用到生产：`docker exec -i cb_postgres_5433 psql -U medusa -p 5433 -d drsell < .../prisma/sql/adp-reader.sql`
  （超管 `medusa` 经容器 socket；函数 owner 是 `drsell_app`、GRANT 给 `adp_reader`）。
- **prompt 按 source 参数化**：新增 `Shop.source` 列（迁移 `20260913120000_shop_source`）；
  `ingest.service.shop()` 首次把该店自愈为 `medusa`；`buildSupportSystemPrompt(shop, persona, source, customerContext)`
  ——medusa 用中性措辞、不给模型跨顾客订单工具；**Shopify 分支逐字不变（单测锁死）**。
- **D8 顾客隔离**：店面登录 Medusa `/auth/customer/emailpass` 拿 JWT → 挂件 `window.DRSELL_CUSTOMER_TOKEN`
  → `POST /public/chat` 带 `customerToken` → drsell 用 `MEDUSA_JWT_SECRET` 验 HS256（内置 crypto，无新依赖）
  → 拉该顾客本人订单/售后**注入 system prompt**。匿名不注入、prompt 引导登录。
  **`MEDUSA_JWT_SECRET` 必须 = Medusa `JWT_SECRET`**（同一把签名密钥），入 drsell `apps/api/.env`。
- SOUL.md / drsell-pg SKILL.md 登记售后工具后，`pm2 restart openclaw-drsell`（同 `deploy-mvp.sh` §—部分）。

**两个部署陷阱（这次踩到）**：

1. **drsell-api 的 env 由 pm2 注入，进程不在运行时读 `.env`。** 改 `apps/api/.env`（如加
   `MEDUSA_JWT_SECRET`）后，`pm2 restart --update-env` 只从**当前 shell** 取值——必须先
   `cd /opt/drsell-run/apps/api; set -a; . ./.env; set +a` 再 `pm2 restart drsell-api --update-env`。
   `/proc/PID/environ` 只反映 exec 时的 env，看不到运行时 dotenv，别拿它当判据。
2. **`prisma migrate deploy` 必须带 `--schema prisma/schema.prisma`。** `apps/api/` 下残留一份陈旧的
   顶层 `schema.prisma` + `migrations/`（18 个），prisma 默认会选它 → 报「no pending」**静默漏迁移**；
   真库在 `prisma/migrations`（19 个）。清理顶层残留是待办。

## 7. DTC 侧的已知缺口（诚实清单）

这些是**实况，不是计划**。写在这里是因为它们各自对应一次「以为没事」：

| # | 缺口 | 后果 | 严重度 |
|---|---|---|---|
| ~~8.1~~ | ✅ 已解决（2026-09-13）：Medusa 已 `medusa build` + pm2（`drsell-shop-medusa`，`pm2 save`） | — | — |
| ~~8.2~~ | ✅ 已解决（2026-09-13）：vhost 已入仓 `infra/nginx/medusa.szchada.top.conf`，由 `scripts/deploy-shop.sh` 同步 | — | — |
| ~~8.3~~ | ✅ 已解决：后台改预构建生产资源，Vite dev 已下线 | — | — |
| ~~8.4~~ | ✅ 已解决（2026-09-13）：注册 Redis 实现（`ADR-20`），事件经宿主 Redis db2 可靠投递 | — | — |
| 8.5 | 日常无自动回归（§6.6）；`deploy-shop.sh` 第 7 步只在**部署时**跑公网断言 | 非部署期的破坏性改动无人拦 | 中 |
| ~~8.6~~ | ✅ 已解决：D8 顾客隔离已上（验签 + 服务端注入，见 §6.8） | — | — |
| ~~8.7~~ | ✅ **作废（非缺口）**：不做购物车/在线结算/Stripe 是**刻意的业务决策**（`ADR-25`），不是待补 | — | — |
| 8.8 | D8 靠 prompt + 服务端注入，**未给 DTC 建独立 `adp_reader` role/agent** | 旧式 `adp_get_order`（按订单号、不看顾客）仍 GRANT 给共享 role，medusa prompt 不列但非结构性杜绝 | 中 |
| 8.9 | `MEDUSA_JWT_SECRET` 仍是 Medusa 出厂默认弱密钥（未轮换；值不在此登记） | 顾客令牌可伪造 → 冒充任意顾客 | **高** |
| ~~8.10~~ | ✅ 已解决（2026-09-13）：`/app` 加 nginx HTTP Basic（**仅 UI 外壳**，`/admin` 靠 Medusa 自身鉴权——加错会让后台空白，见 §6.4e） | — | — |
| ~~8.11~~ | ✅ 已解决（2026-09-13）：询价线索后台页 `/app/inquiries`（Medusa Admin 扩展，见 §6.4c） | — | — |
| 8.12 | 询价的限流是内存态（进程重启即清空、多实例不共享） | 挡不住持续刷表单；真防线是后台人工审核 | 低 |
| ~~8.13~~ | ✅ 已解决（2026-09-13）：规格迁入 Medusa `metadata.specs`，页面只读渲染（§6.3b） | — | — |

**「下一次重启就会咬人」的两个（8.1/8.2）现已都解决。8.9 是当前最高危**（弱密钥应轮换）。

**已作废的非缺口**：8.7（购物车/结算）不是待办，是业务决策（`ADR-25`）。
把「清单上还有一项没做」当成待补是危险的——按清单做下去会做出一个与业务模式冲突的功能。

## 8. 配置决策

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
