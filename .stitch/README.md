# Ops Stitch 设计管线

运营台走 **stitch-to-shadcn-pro** 流程，阶段 B 落地在 `apps/ops`（Tailwind v4 + shadcn/ui）。
当前权威设计源是 **Stitch 项目 `11226504772808429506`**（9 屏），原始 HTML 与令牌在
`.stitch/project-11226504772808429506/`。

## 目录

| 路径 | 用途 |
|------|------|
| `.stitch/mcp/screens-11226504772808429506.json` | MCP `list_screens` 原样返回 |
| `.stitch/project-11226504772808429506/designs/*.html` | 9 屏 HTML 原样落盘（勿在内存里改） |
| `.stitch/project-11226504772808429506/shots/*.png` | 9 屏缩略图 |
| `.stitch/project-11226504772808429506/tokens-*.json` | 两套主题的 Stitch 实测令牌 |
| `.stitch/designs/<page>.html` | 旧四屏 Stitch MCP 落盘（保留） |
| `.stitch/spec/<page>.spec.json` | 旧四屏 measure.js 盒模型 |
| `.stitch/reports/<page>/` | 旧四屏像素基线/报告 |
| `.stitch/rebuild/<page>.html` | 旧四屏静态参照（移植前） |
| `design/stitch-export/drsell_ops_console/` | 旧四屏 MCP 导出归档 |

## 拉取 Stitch 源

```bash
export STITCH_API_KEY='<project api key>'
bash scripts/stitch-mcp.sh list_screens '{"projectId":"11226504772808429506"}'
```

## 命令

```bash
# 阶段 A：测量 + baseline（旧四屏；需 STITCH_DEPS_DIR，见 ~/.cursor/skills/stitch-to-shadcn-pro/PORTING.md）
export STITCH_DEPS_DIR=~/stitch-deps
export ENGINE=$HOME/.cursor/skills/stitch-to-shadcn-pro
bash scripts/stitch-ops-integrate.sh

# 或在 apps/ops
pnpm stitch:integrate
```

## 新源九屏 ↔ 主题 ↔ 路由

| 屏 | 主题 | 路由 |
|----|------|------|
| 00 Onboarding: Welcome | merchant-light | `apps/storefront/app/onboarding` |
| 01 Home Dashboard | merchant-light | `apps/storefront/app` |
| 02 Accounts & Membership Overview | superadmin-dark | `apps/ops/app/accounts` |
| 03 AI Assistant: Settings | merchant-light | `apps/storefront/app/ai-assistant` |
| 04 Inbox: Conversations | merchant-light | `apps/storefront/app/inbox` |
| 05 System Health & Global Config | superadmin-dark | `apps/ops/app/system` |
| 06 Widget Configuration | merchant-light | `apps/storefront/app/widget-config` |
| 07 Active Support Session (Impersonation) | superadmin-dark | `apps/ops/app/impersonation` |
| 08 Store & Subscription Details | superadmin-dark | `apps/ops/app/shops/[domain]` |

保留功能（不在 9 屏）：`apps/ops/app/` 的 `/` 到期队列、`/shops`、`/audit`、`/plans`、`/login`
按 superadmin-dark 令牌体系重排。

令牌：`apps/ops/app/tokens.css`（hex 权威，superadmin-dark）→ `globals.css` shadcn 映射。
商家端令牌：`apps/storefront/src/app/globals.css`（merchant-light）。
