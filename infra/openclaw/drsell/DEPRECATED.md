# OpenClaw profile — 已废弃（回滚资料）

现行客服对话走 `apps/api` 进程内 Pi SDK（`ADR-9`）。**本目录不再被 `deploy-mvp.sh` 同步或重启。**

Nest **禁止**读取 `/root/.openclaw-drsell/` 里的 key。DeepSeek / GLM 只进 api `.env`。

## 回滚（`CHAT_AGENT=openclaw`）

1. 确认 `OPENCLAW_GATEWAY_URL` / `OPENCLAW_GATEWAY_TOKEN` 仍在 api `.env`。
2. `pm2 start openclaw-drsell`（若已 `stop`）。
3. api `.env` 设 `CHAT_AGENT=openclaw`。
4. 只重启 `drsell-api`（cwd `/opt/drsell-run/apps/api`）。
