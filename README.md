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

## 旧代码

`chatbot/`、`chatbotapi/`、`chatbotadmin/` 为 legacy，MVP 不依赖，仅作参考。
