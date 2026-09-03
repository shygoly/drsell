# AGENTS.md

给**任何** code agent（Claude Code、Codex、Cursor、OpenCode、Gemini CLI 等）
在本仓库工作时的指引。工具中立，不写任何单一工具的专有语法。

> 本文件是 agent 指引的**唯一事实来源**。根目录的 `CLAUDE.md` 只是指向这里的
> 指针，不含内容——本仓库吃过「两份事实来源漂移」的亏（旧版 CLAUDE.md 一路漂到
> 描述一整套已作废的架构），故不再复制第二份。

## 事实来源

本文件只指路和列陷阱，**不复述架构**——复制即制造第二个事实来源。

| 要查什么 | 去哪 |
|---|---|
| 架构全景与不可逆决策论证 | `ARCHITECTURE.md`（`INV-n`/`ADR-n`/`B-n` 的出处） |
| 决策登记册（ID 唯一权威） | `DECISIONS.md`（一条一行，论证留在出处） |
| UI 反模式与设计规范 | `DESIGN.md` |
| 最近一次发布的实况 | `docs/RELEASE-2026-09-02.md` |

代码或文档里出现的 `INV-n`/`ADR-n`/`B-n` **必须在 `DECISIONS.md` 里**，否则 `pnpm spec` 红。

## 仓库结构

pnpm workspace + turbo。**活的只有这些**：

```
apps/api          NestJS 11 + Prisma 6 + PostgreSQL     生产 :5011（dev :3001）
apps/web          Next 15 + Polaris 13 + App Bridge 4   生产 :5012（dev :3000）
                  Shopify embedded app：/app、OAuth 回调、webhooks
                  theme app extension 在 apps/web/extensions/chatbot
apps/ops          Next 15                               生产 :5013
                  运营控制台 ops.szchada.top，superadmin + 审计
apps/storefront   Next 15 + App Bridge                  生产 :5010（dev :3100）
packages/         shared · shopify · adp · openclaw
spec/             治理校验器（8 个 check-*.mjs），pnpm spec
infra/            nginx vhost · cloudflare · docker · openclaw profile
scripts/          deploy-mvp.sh 等
```

**`obsolete/` 不属于本项目——不要读、不要改、不要据此判断架构。**
它被 `.gitignore` 忽略，也不在 pnpm workspace / turbo / tsconfig 范围内，里面是已作废的
旧实现（旧 Remix app `chatbot/`、两个 Java Spring Boot 服务 `chatbotapi/`
`chatbotadmin/`、Coze 联调脚本）。这些目录从未进过 git。明细见 `obsolete/README.md`。

## 常用命令

```bash
pnpm dev            # turbo run dev（全部）
pnpm build          # turbo run build
pnpm spec           # 治理校验（8 个检查器）
pnpm test           # pnpm spec + turbo run test —— 提交前必须绿
pnpm lint
pnpm db:generate    # prisma generate
pnpm db:migrate     # prisma migrate deploy
bash scripts/deploy-mvp.sh   # 构建 + rsync 到 wjclaw + pm2 重启四进程 + nginx reload
```

## 陷阱（踩过的，别再踩）

1. **AI 回复链路走 OpenClaw，不是 Coze。** `apps/api` → `packages/openclaw` →
   wjclaw 上的 OpenClaw gateway（`127.0.0.1:18790`，OpenAI 兼容 `/v1/chat/completions`，
   provider DeepSeek-V4，pm2 进程 `openclaw-drsell`）。仓库配置模板在
   `infra/openclaw/drsell/`。该 gateway **正在服务生产对话**，不要改
   `agents.defaults.model.primary`。全仓 `coze` 零命中。

2. **`apps/web` 与 `apps/storefront` 共用 `drsell.szchada.top` 域名根，抢同一片路径空间。**
   `location /` → storefront，`location ^~ /app` → web。两者静态资产都在 `/_next/`，
   故 `apps/web` 用 `assetPrefix`（`ASSET_PREFIX=/app`）隔离到 `/app/_next/`，
   nginx 有更具体的 `location ^~ /app/_next/` 剥前缀回源。
   动 `/app`、`/_next` 或任一应用的路由前，先读 `infra/nginx/drsell.szchada.top.conf`。
   **「该留哪个应用」仍是未决架构问题**，assetPrefix 只是止血。

3. **验证生产必须走公网域名并断言内容特征**（如 `<title>`）。
   `scripts/deploy-mvp.sh` 的健康检查用 `curl 127.0.0.1:5012/app` 直连上游、绕过 nginx，
   曾让两个生产故障全程绿灯。纯状态码断言覆盖不了「200 但内容错」。

4. **Shopify app 只有一个合法身份**：client_id `0b36b70772220b71b2fe296b3deba914`
   （name `Drsell`，handle `drseller-alpha`，App ID 264501002241）。
   legacy jade app `f286a4af8f1d80cb8e6228bc648f4786` **严禁用于生产**——
   它那份**可用的** `shopify.app.toml` 现已移入 `obsolete/chatbot/`（不再位于仓库根附近），
   但 `shopify app deploy` **仍必须带 `--path apps/web`**：仓库根没有 toml，路径写错就可能
   发错 app。
   CLI 4.7.1 起 deploy 会**覆盖 Partner 后台配置**（含 name/handle）。

5. **`.stitch/` 不在版本库**（2026-09-03 决定，见 `docs/RELEASE-2026-09-02.md`）。
   11.1MB 设计基线仅本地保留；`scripts/stitch-*` 依赖的 `.stitch/fixtures.json`
   随之出仓，clone 者需自行获取才能跑设计回归。

6. **`.env` 一律不入库**。密钥出现在代码、文档或提交里都是事故。

## 约定

- 提交前跑 `pnpm test`（含 `pnpm spec`），红了不要提交。
- 治理文档改动要同步 `DECISIONS.md` 的 ID，否则 `spec/check-links.mjs` 会红。
- 生产改动（nginx / pm2 / env）先备份、`nginx -t` 通过再 reload，改完走公网验证。
