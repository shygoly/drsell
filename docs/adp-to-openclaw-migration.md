# ADP → OpenClaw 迁移 Runbook（wjclaw）

## 概述

客服对话从腾讯云 ADP SSE 迁移到 wjclaw 本地 OpenClaw Gateway（独立 `--profile drsell`，端口 **18790**）。
商品/订单数据经 MCP 连接 `adp_reader` 角色，只执行 `adp_*` 函数。

## 一键初始化（wjclaw）

```bash
cd /opt/drsell-run   # 或 rsync 后的仓库路径

# 从 pubmedclaw OpenClaw 配置读取 DeepSeek key
export DEEPSEEK_API_KEY="$(python3 -c "import json;print(json.load(open('/root/.openclaw/openclaw.json'))['models']['providers']['deepseek-v4']['apiKey'])")"

bash infra/openclaw/drsell/setup-wjclaw.sh
```

脚本会：
1. 创建 `adp_reader` + 应用 `adp-reader.sql`
2. 写入 `/root/.openclaw-drsell/openclaw.json`
3. 部署 workspace（SOUL.md / drsell-pg skill）
4. `pm2 start openclaw-drsell`
5. 生成 `/root/.openclaw-drsell/drsell-secrets.env`

## 更新 drsell-api

```bash
grep -q OPENCLAW_GATEWAY_URL /opt/drsell-run/apps/api/.env || \
  cat /root/.openclaw-drsell/drsell-secrets.env >> /opt/drsell-run/apps/api/.env

cd /opt/drsell-run
pnpm install && pnpm --filter @drsell/api build
pm2 restart drsell-api
```

可注释或删除 `ADP_DEFAULT_APP_KEY`、`ADP_CHAT_URL`（保留 24h 作回滚备份）。

## 验收

```bash
source /root/.openclaw-drsell/drsell-secrets.env

# Gateway 健康
openclaw --profile drsell gateway call health --token "$OPENCLAW_GATEWAY_TOKEN"

# PG 隔离
ADMIN_DSN="postgres://medusa@127.0.0.1:5432/drsell" \
ADP_DSN="postgres://adp_reader:${ADP_READER_PASSWORD}@127.0.0.1:5432/drsell" \
SHOP_A="<店铺域名>" \
bash scripts/verify-adp-isolation.sh

# 对话 smoke（需替换店铺域名）
curl -sS -N http://127.0.0.1:18790/v1/chat/completions \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-openclaw-agent-id: main" \
  -H "x-openclaw-session-key: drsell:demo.myshopify.com:test" \
  -d '{"model":"openclaw/main","stream":true,"messages":[{"role":"user","content":"[shop=demo.myshopify.com] hello"}]}'
```

## 回滚

1. 恢复 `apps/api/.env` 中的 `ADP_*` 变量
2. `pm2 restart drsell-api`
3. `pm2 stop openclaw-drsell`（可选）

## 相关文件

| 路径 | 说明 |
|---|---|
| [`infra/openclaw/drsell/openclaw.json.example`](infra/openclaw/drsell/openclaw.json.example) | Gateway 配置模板 |
| [`infra/openclaw/drsell/ecosystem.config.cjs`](infra/openclaw/drsell/ecosystem.config.cjs) | pm2 进程 |
| [`packages/openclaw`](../packages/openclaw) | NestJS 调用的 HTTP 客户端 |
| [`docs/adp-pg-access.md`](adp-pg-access.md) | PG / adp_reader 运维 |
