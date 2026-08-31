# Drsell MVP (Next.js + NestJS + 腾讯云 ADP)

Shopify 嵌入式 AI 客服插件。**MVP 范围见 [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md)**。

## 结构

| 路径 | 作用 |
|------|------|
| `apps/web` | Shopify 嵌入、`/app` 设置、Theme Extension |
| `apps/api` | Nest：`/api` — Shopify、ADP 代理、店面公开 API |
| `packages/adp` | 腾讯云 ADP SSE |
| `packages/shopify` | Webhook HMAC、GraphQL |

## 本地开发

```bash
pnpm install
pnpm --filter @drsell/shared build && pnpm --filter @drsell/adp build && pnpm --filter @drsell/shopify build
cp apps/api/.env.example apps/api/.env   # 填 ADP_DEFAULT_APP_KEY、数据库等
cp apps/web/.env.example apps/web/.env
pnpm --filter @drsell/api exec prisma migrate dev
pnpm --filter @drsell/api dev    # :3001
pnpm --filter @drsell/web dev    # :3000
```

## 部署（推荐）

本地构建，避免 wjclaw 磁盘/build 压力：

```bash
chmod +x scripts/deploy-mvp.sh
./scripts/deploy-mvp.sh
```

- 应用 URL：`https://drsell.szchada.top`
- Partner：**Drsell** App `264501002241` — 见 [docs/DRSELL_PUBLISH.md](docs/DRSELL_PUBLISH.md)

## 登录认证（drsell.szchada.top/login）

首次安装进入应用时，会先看到 **4 步配置向导**（/onboarding）：
1) Welcome + 权限说明 → 2) 选择要同步的产品/订单/客户 → 3) 配置 Widget
外观并启用 Theme App Embed（激活点，不可跳过）→ 5) 完成。未完成向导的
店铺访问任意页面都会自动跳转到向导。

登录页支持三种方式，统一签发 7 天 JWT（`typ=admin` 存于 `localStorage.drsell_user_token`）：

1. **Google 授权登录**：`/api/auth/google` → Google OAuth → `/api/auth/google/callback` 换取
   userinfo 并调用 Nest `POST /api/auth/google/exchange`（用 `INTERNAL_API_KEY` 保护）按邮箱
   查找或创建 `AdminUser`，然后以 `#token=...&email=...` 跳回 `/login` 完成会话。
2. **账号密码登录**：`POST /api/auth/admin/login`（apps/web 代理到 Nest），注册为
   `POST /api/auth/admin/register`；初始超管由 `BOOTSTRAP_ADMIN_EMAIL/PASSWORD` 自动创建。
3. **Shopify 授权登录**：输入店铺域名 → `/api/auth?shop=...`（apps/web 处理 OAuth install），
   回调后写入 shop 会话并跳转 `/widget-config?shop=...`。

### Google 凭据配置（上线 Google 登录前必做）

在 Google Cloud Console 创建 OAuth 2.0 Client（Web），配置：

- 授权回调 URI：`https://drsell.szchada.top/api/auth/google/callback`
- 然后在服务器 `apps/web/.env` 填入：

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
INTERNAL_API_KEY=...   # 与 apps/api/.env 中一致
```

重启 `drsell-web` 后 Google 按钮即可完成授权登录。

### 生产数据库运维备注（2026-08-31 起）

DrSell 生产库运行在 wjclaw 的 Docker 容器 `cb_postgres_5433`（`postgres_data` 卷，
host 端口 **5433**，`--restart unless-stopped`）。服务器上另有 oildata 项目的原生
PostgreSQL 占用 5432，两者不冲突。`apps/api/.env` 的 `DATABASE_URL` 使用
`127.0.0.1:5433`；本地构建/部署时保持该端口即可，勿改回 5432。

## 旧代码

`chatbot/`、`chatbotapi/`、`chatbotadmin/` 为 legacy，MVP 不依赖，仅作参考。
