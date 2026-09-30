# Pichat：用 Pi SDK 替换 OpenClaw Gateway

**Date:** 2026-09-30  
**Status:** Draft — awaiting review  
**Locked hosting:** 进程内 SDK（方案 A）

客服对话不再经过 wjclaw 上的 OpenClaw Gateway（`openclaw-drsell` :18790）。`apps/api` 用 `@earendil-works/pi-coding-agent` 的 `createAgentSession()` 在**同一 Node 进程**里跑 agent 循环。OpenClaw 自己也是这样嵌 Pi 的；我们拆掉中间那层网关。

## Locked decisions

| Topic | Decision |
|---|---|
| 托管 | 进程内 SDK，不设 Pi 侧车、不用 RPC 子进程 |
| 对外接口 | 保持 `chatStream({ messages, systemPrompt, shopDomain, onChunk })`；`AdpService` 几乎不改编排 |
| 包路径 | 第一期仍叫 `@drsell/openclaw`（少动 import）；实现换成 Pi。OpenClaw HTTP 客户端删除 |
| 会话 | 每请求新建 in-memory session（`SessionManager.inMemory()`）。不落盘、不复用 Pi session。上下文只来自 `ChatMessage`（`ADR-17`） |
| 工具 | Pi `tools` **白名单**：只注册 `adp_*` custom tools。不加载 `bash`/`read`/`write`/`edit` |
| 数据面 | custom tools 用 **`adp_reader` 角色**执行 `adp_*` 函数，禁止走 Prisma / `drsell_app`（`INV-2` / `ADR-7`） |
| 店铺域 | 工具闭包锁定本次请求的 `shopDomain`；模型传入的 shop 参数一律忽略 |
| 主备 | 在我们客户端重做 `ADR-15`：primary DeepSeek V4 Flash，402/billing 切 `zhipu/glm-4.5-flash`；切之前必须断言备用模型会发 tool call |
| 切流 | 环境变量 `CHAT_AGENT=pi\|openclaw`，生产显式切到 `pi` 后停 `openclaw-drsell`。不是长期双架构 |
| Node | 生产已是 v22.22.0，满足 Pi ≥22.19 |

## Goals

- 顾客 widget / 商家预览对话的延迟、正确性、配额闸门与现在一致
- 模型被说服后仍只能打只读 `adp_*`（比 OpenClaw denylist 更硬：默认编码工具根本不加载）
- 欠费时仍能回答（主备），且备用模型必须查真实商品而不是编造
- 去掉 root 跑的 OpenClaw 网关、共享 workspace、gateway token 这一整面

## Non-goals

- 不把 B2B 建站流水线、Medusa、ops 换成 Pi
- 不在本变更里申请 Shopify Protected customer data
- 不改店铺域 `drsell.szchada.top`、不改 Pichat Partner 身份
- 不把 `@drsell/openclaw` 改名（可另开）
- 不把 OpenClaw 配置目录从服务器物理删除（第一期停进程 + 文档标明废弃）

## Architecture

```
widget / storefront
  → apps/api AdpService
       闸门：human/closed/aiEnabled/订阅/配额（不变）
       组装 ChatMessage + buildSupportSystemPrompt（不变）
  → packages/openclaw chatStream
       每请求 createAgentSession({
         sessionManager: inMemory,
         tools: [只含本次允许的 adp_* 名],
         customTools: [闭包锁定 shopDomain 的函数],
         model: primary 或 fallback
       })
       subscribe 文本 delta → onChunk
  → PostgreSQL 仅经 adp_reader EXECUTE adp_*
```

`AdpService.proxyChatSse` / `previewChat` 的顺序与落库不变。换的只是 `chatStream` 的下游。

### 组件

1. **`PiSupportClient`（放在 `packages/openclaw`）**  
   实现现有 `OpenClawClient.chatStream`。模型 key 只从 `apps/api/.env` 读：
   `DEEPSEEK_API_KEY`（从今日 OpenClaw 秘钥文件**拷贝**进来，Nest **禁止**去读
   `/root/.openclaw-drsell/`）、现有 `GLM_API_KEY` / `GLM_BASE_URL`。
   不再使用 `OPENCLAW_GATEWAY_URL` / `OPENCLAW_GATEWAY_TOKEN` / `OPENCLAW_AGENT_ID`。

2. **`adp_reader` pool**  
   独立 `pg.Pool`，连接串与今日 OpenClaw MCP 相同角色（`adp_reader` @ 本机 5433）。只跑 `SELECT * FROM adp_shop_summary($1)` / `adp_search_products($1,$2,$3)` / `adp_get_order($1,$2)`。Prisma 继续给 Nest 用，**工具实现不得 import PrismaService**。

3. **Custom tools**  
   | 工具 | Shopify 店 | Medusa 店 |
   |---|---|---|
   | `adp_shop_summary` | 有 | 有 |
   | `adp_search_products` | 有 | 有 |
   | `adp_get_order` | 有 | **不注册**（D8：订单走 prompt 注入） |

   `shop` 参数若出现在 schema 里，执行时强制替换为会话 `shopDomain`。

4. **主备**  
   一次 `chatStream` 先用 primary。捕获 provider 的 402 / 明确 billing 错误后，**同一组 messages** 用 fallback 再跑一轮。两轮都失败才抛给 `AdpService`（现有错误路径）。禁止「备用模型不带 tools」——单测必须覆盖「fallback 仍发出 `adp_search_products`」。

### 数据流

与现在相同：用户消息先落库 → 闸门 → `buildContext` → `chatStream` → assistant 落库。Pi 事件里的 tool 调用对顾客不可见，只把最终 assistant 文本推进 SSE。

### 错误处理

- Pi/session 抛错：与今日 OpenClaw HTTP 非 2xx 一样冒泡，不吞
- billing 切主备：打结构化日志（`reason=billing from=… to=…`），便于对照 2026-09-08 那次生产兜底
- `adp_reader` 查询失败：工具返回短错误字符串给模型，不把连接串/SQL 细节给顾客

### 切流

1. 代码默认 `CHAT_AGENT=pi`。未设置即走 Pi。
2. 生产第一次发这版代码时**显式**写 `CHAT_AGENT=openclaw`，旧网关继续服务；对话探针（含 tool calling）通过后再改成 `pi` 并只重启 `drsell-api`
3. 观察无回归后 `pm2 stop openclaw-drsell`（不要在第一期 `pm2 delete` 除非明确要求）
4. `deploy-mvp.sh` 去掉「每次部署重启 openclaw」；`AGENTS.md` 陷阱 1 改成 Pi

`CHAT_AGENT=openclaw` 是回滚开关，不是目标架构。目标是只留 Pi。

## Prompt

`buildSupportSystemPrompt` 保留护栏顺序。把「MCP calls / drsell-pg」改成「tools `adp_shop_summary` / `adp_search_products` / `adp_get_order`」。Medusa 分支仍不提订单工具。现有 `support-system-prompt.spec.ts` 改断言字符串，行为不变。

## Testing

- 单元：Pi client 在 mock session 下把 delta 转成 `onChunk`；billing 错误触发第二模型
- 单元：custom tool **忽略**错误 shop 参数，只查闭包域名
- 单元：Medusa 会话的 tools 列表不含 `adp_get_order`
- 现有 `adp.service.spec.ts` 继续 mock `@drsell/openclaw` 的 `chatStream`
- 守护：仿 `verify-adp-isolation.sh` 加一条「agent 不可用 bash/write」——断言 `createAgentSession` 的 tools 白名单不含内置编码工具（启动期静态断言即可，不必真打模型）
- 主备：在换备用模型前，对 GLM 做一次带 `adp_search_products` 的 tool-calling 探针（可脚本，失败则禁止切生产）

## 文档与决策

同一实现提交内更新（openspec 只引用 ID，不写架构）：

- `ADR-9`：客服对话经 api 进程内 Pi SDK，不再经 OpenClaw Gateway
- `ADR-15`：主备逻辑从网关配置挪到 `packages/openclaw` 客户端；守护文件改指向该包 + env
- `ADR-17`：删除「网关 session key」表述；改为 Pi in-memory、每请求新 session
- `ADR-19`：denylist 作废。改为「Pi tools 白名单 = 本次允许的 `adp_*`」。禁止再引入 `tools.allow` 式 MCP 时序坑
- `AGENTS.md` 陷阱 1：链路改为 api → `@drsell/openclaw`（Pi）→ DeepSeek/GLM
- `DEPLOY.md`：pm2 表去掉或标注 `openclaw-drsell` 已停；密钥指纹若 GLM/DeepSeek 仍在 api `.env` 则只指路不抄值

`infra/openclaw/` 第一期保留作回滚资料，注明废弃。

## Out of scope leftovers (explicit)

今日 OpenClaw MCP 还能执行 `adp_get_after_sales`。客服 prompt 未列它（D8）。Pi 白名单**不要**注册该工具，与 prompt 一致。
