# Ops Stitch 设计管线

与商户端 `design/stitch-export/stitch_shopify_ai_chat_dashboard/` 对称，运营台走 **stitch-to-shadcn-pro** 流程，阶段 B 落地在 `apps/ops`（Tailwind v4 + shadcn/ui）。

## 目录

| 路径 | 用途 |
|------|------|
| `.stitch/designs/<page>.html` | Stitch MCP 原样落盘（勿在内存里改） |
| `.stitch/spec/<page>.spec.json` | measure.js 盒模型 |
| `.stitch/reports/<page>/baseline.png` | 像素基线 |
| `.stitch/rebuild/<page>.html` | 静态参照（移植前） |
| `design/stitch-export/drsell_ops_console/` | MCP 导出归档 |

## 命令

```bash
# 阶段 A：测量 + baseline（需 STITCH_DEPS_DIR，见 ~/.cursor/skills/stitch-to-shadcn-pro/PORTING.md）
export STITCH_DEPS_DIR=~/stitch-deps
export ENGINE=$HOME/.cursor/skills/stitch-to-shadcn-pro
bash scripts/stitch-ops-integrate.sh

# 或在 apps/ops
pnpm stitch:integrate
```

## 四屏 ↔ 路由

| 屏 | 路由 |
|----|------|
| expiry_queue | `/` |
| shop_detail | `/shops/[domain]` |
| account_detail | `/accounts/[id]` |
| audit_log | `/audit` |

令牌：`apps/ops/app/tokens.css`（hex 权威）→ `globals.css` shadcn 映射。
