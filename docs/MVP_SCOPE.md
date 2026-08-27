# Drsell MVP 范围（2026-08-26）

从「全量平台迁移」收敛为 **可上架 Shopify App 的最小闭环**。

## P0 — 必须完成

| 功能 | 路径/模块 |
|------|-----------|
| Shopify OAuth + 嵌入 | `apps/web` `/app/*`, `/api/auth/*` |
| Webhooks（卸载、合规） | `apps/web/api/webhooks`, `apps/api/shopify/webhooks` |
| 机器人设置（含 ADP AppKey） | `/app/settings`, `BotSetting` |
| **首次安装 Onboarding Wizard** | `/app/onboarding` Steps 1–3 + 5 |
| 店面 Theme Extension + ADP 对话代理 | `extensions/chatbot`, `PublicStorefrontModule` |
| 部署 | `https://drsell.szchada.top` @ wjclaw |
| Partner 上架 | Drsell `264501002241`，更新 URL 后提审 |

## P1 — 下一迭代

- 产品/订单/客户同步 → ADP 知识库 + `products`/`orders` 表（`tenant_id` 隔离）
- 今日对话统计
- 真实 Inbox（当前为占位）

## 明确不做（MVP 阶段）

- Yudao 式 `/admin` 运营后台
- Mail 模块、订阅计费模块
- 旧 Java `chatbotadmin` / `chatbotapi` 行为对齐
- PG 公网 SNI（`wjclawpg`）— 运维需要时再开
- Docker 在 wjclaw 内构建（磁盘不足；改本地构建 + 产物同步）

## Nest 模块（P0）

`Auth`, `Tenant`, `Shopify`, `Adp`, `PublicStorefront`, `Prisma`, `Health`

## 部署方式

```bash
./scripts/deploy-mvp.sh
```

本地 `pnpm build` → rsync 产物 → wjclaw 上 `node`/`pm2` 直接运行（不占用构建缓存）。
