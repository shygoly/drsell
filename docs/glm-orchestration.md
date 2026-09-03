# GLM-5.3-Flash 并行编排

**状态**：已实现，未接真实 key 运行。位置 `tools/glm-swarm/`。
**日期**：2026-09-02

一句话：把高频、可并行、**结果能被机器复核**的开发侧检查扇出给 GLM-5.3-Flash，
由确定性校验器决定哪些候选算数。**GLM 只提候选，校验器下结论。**

---

## 1. 接入参数

### 1.1 已确认（附来源）

| 项 | 值 | 来源 |
|---|---|---|
| Model ID | `glm-5.3-flash` | [bigmodel 模型页](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash) |
| Base URL（国内，默认） | `https://open.bigmodel.cn/api/paas/v4/` | [OpenAI 兼容页](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction) |
| Base URL（国际） | `https://api.z.ai/api/paas/v4` | [OpenClaw zai provider](https://docs.openclaw.ai/providers/zai) |
| Coding Plan 端点 | `.../api/coding/paas/v4`（两区皆有） | 同上 |
| 路径 / 认证 | `POST {base}/chat/completions`，Bearer + API Key | [对话补全 API](https://docs.bigmodel.cn/api-reference/模型-api/对话补全) |
| OpenAI 兼容 | **是**。官方："后端兼容 OpenAI 所有 Endpoint，仅需更换 api_key 与 base_url" | [OpenAI 兼容页](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction) |
| 上下文 / 最大输出 | 1M / 128K tokens | [bigmodel 模型页](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash) |
| 输入模态 | 文本、图像、视频、文件（原生多模态）；输出仅文本 | 同上 |
| Tool calling | 支持，最多 128 个 function | [对话补全 API](https://docs.bigmodel.cn/api-reference/模型-api/对话补全) |
| 流式 | 支持 `stream`；官方建议同开 `tool_stream: true` | [z.ai 模型页](https://docs.z.ai/guides/llm/glm-5.3-flash) |
| 结构化输出 | **仅 `response_format.type: "json_object"`，无 json_schema 强约束** | [对话补全 API](https://docs.bigmodel.cn/api-reference/模型-api/对话补全)、[OpenRouter](https://openrouter.ai/z-ai/glm-5.3-flash) |
| 思考 | **`thinking.type` 只接受 `enabled`，不可关闭** | [bigmodel 模型页](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash)、[z.ai 模型页](https://docs.z.ai/guides/llm/glm-5.3-flash) |
| 采样 | `temperature` (0,1) 默认 0.6；`top_p` 默认 0.95；`stop` 最多 4 项 | [OpenAI 兼容页](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction) |
| 限流 | **按账户**限「并发数」（同时处理中的请求数），按模型独立计数；官方**未公布** RPM/QPS/TPM | [速率限制页](https://docs.bigmodel.cn/cn/api/rate-limit) |
| 限流错误码 | `1302` 账户超速率、`1305` 平台过载 | 同上 |
| 价格（国际 list） | 输入 $0.15 ｜ 缓存输入 $0.03 ｜ 输出 $0.50（每百万 token） | [z.ai 定价页](https://docs.z.ai/guides/overview/pricing) |
| 价格（国际促销） | $0.075 / $0.015 / $0.25，**截止 2026-09-09 (UTC+8)** | 同上 |
| 相对价位 | 约为 GLM-5.3 的 1/10（GLM-5.3 为 $1.4 / $4.4） | 同上 |

### 1.2 未确认清单（代码里不得当硬数字用）

| 项 | 说明 |
|---|---|
| 账户实际并发配额 | 官方限流页无公开数值，只能登录 [控制台速率限制页](https://bigmodel.cn/usercenter/proj-mgmt/rate-limits) 查。**编排器因此把并发做成可配 + 自适应下调**。 |
| `reasoning_effort` 在 flash 上的档位 | GLM-5.3 文档明确 `low`/`high`/`max`；flash 页面只说"支持思考模式"，未列档位。当前实现**不发** `reasoning_effort`。 |
| 国内价格 | 上表未列国内价的官方出处。代码内置的国内价目 `confirmed: false`，运行时会打印警告，以控制台账单为准。 |
| 上下文精确值 | 官方 1M，OpenRouter 标 1,310,720。计费/截断口径未知，长语料需留余量。 |
| 缓存输入命中条件 | 有 cached input 计价档，但触发规则（前缀长度、TTL）未在文档核到。 |
| 免费额度 | 有多项时效性活动的二手报道，今日是否有效需在控制台确认。 |
| 架构 320B 总 / 18B 激活 | 二手报道一致，未在官方文档核到。 |

---

## 2. 三条硬约束如何塑造了这套设计

这不是三条注意事项，是三条直接决定代码长什么样的约束。

### 约束 1：思考不可关闭 → 成本必须可见

`thinking.type` 只接受 `enabled`，意味着**每一次调用都会产生 `reasoning_content`**，
延迟下限和输出 token 成本都高于"flash"这个名字给人的预期。**不要按亚秒级快模型做容量规划。**

**代码怎么应对**：`client.mjs` 的 `_accumulate()` 把 `completion_tokens_details.reasoning_tokens`
单独统计，每次运行结束由 `run.mjs` 的 `printSummary()` 打印思考 token 数与估算成本，
并显式提示"思考 token 计入输出计费"。促销价与截止日期写进 `PRICING`，
过了 `2026-09-09T23:59:59+08:00` 自动切标准价。国内价目标 `confirmed: false` 并打印警告。

### 约束 2：没有 json_schema 强约束 → 校验与回灌必须自己做

只有 `response_format: {type:"json_object"}`，模型可以返回**合法 JSON 但结构不对**的东西。

**代码怎么应对**：`lib.mjs` 实现了一个 JSON Schema 子集校验器 `validateShape()`
（支持 type/required/properties/items/enum/minItems/minLength/minimum/maximum）。
每个任务**必须**声明 `schema`。校验失败时 `fanout()` 不是盲目重试，而是把
**校验器的错误原文回灌**给模型再试（`--retries` 可配，默认 2）：

```
[system, user] → 坏返回 → [.., assistant(坏返回), user("校验器报告：\n- $.findings: 缺少必填字段\n请只输出修正后的 JSON")]
```

重试到上限仍不合规 → 标记 `schema-failed`，该单元**零发现计入**，不污染结论。

### 约束 3：限流是账户级并发且数值不公开 → 并发必须自适应

配额查不到，只能保守起步并在撞墙时退让。

**代码怎么应对**：`Pool` 的上限可在运行中下调。`client.chat()` 把 HTTP 429 与业务码
`1302`/`1305` 统一归为 rate-limit，做**指数退避 + 50%~100% 抖动**重试
（`backoffDelay`，上限 20s），同时触发 `onRateLimit` 回调 → `pool.degrade()`
把并发**对半砍**（地板 1）。致命错误（4xx 非限流）直接抛出不重试，避免无谓烧钱。

---

## 3. 核心纪律：GLM 只提候选，校验器下结论

**这是强制的，不是约定。**

`run.mjs` 的 `loadTasks()` 在**加载期**就检查每个任务是否有 `verify` 函数与 `schema`，
缺任何一个直接抛 `INVALID_TASK` 并以退出码 2 拒绝运行，报错信息会点名理由。

```
✗ 任务定义非法：
  - tasks/bad.task.mjs: 字段 verify 必须是 function（纪律：GLM 只提候选，判定必须由确定性 verify 给出）
```

**为什么**：GLM-5.3-Flash 是 flash 档，且没有 json_schema 强约束，输出不稳定。
让它当唯一裁判等于把一个会编造引文的组件放在结论位置上。
所以每条候选都必须能被一段**不经模型**的代码复核：文件真的存在吗？那一行真的是这么写的吗？
这个词真的在现役代码里搜不到吗？复核不过的候选**直接丢弃**，只在报告尾部留一条丢弃原因供调 prompt 用。

报告里"确认发现"与"被丢弃的候选"分两栏，丢弃率是衡量 prompt 质量的直接指标。

---

## 4. 角色分工与并发模型

```
run.mjs（编排器，单进程）
  │
  ├─ 1. collect()  确定性采集，不经模型 —— 产出工作单元
  │      config-consistency → 5 个分片（按不一致类别切）
  │      doc-drift          → 每个文档 1 个分片
  │                                     实测共 28 个工作单元
  │
  ├─ 2. fanout()   全部单元汇入同一个 Pool（全局并发上限 GLM_CONCURRENCY）
  │      ├── worker ─→ GLM ─→ 抠 JSON ─→ validateShape ─┬─ 通过 → verify()
  │      ├── worker                        └─ 不通过 → 回灌重试 ↺
  │      ├── worker          （撞限流 → 退避 + Pool 并发对半砍）
  │      └── ...
  │
  └─ 3. verify()   确定性复核，不经模型 —— kept / dropped
         └─ 报告落盘 .runs/<时间戳>/{report.json, report.md}
```

**两个任务共用一条并发车道**，所以 `GLM_CONCURRENCY` 是全局真实上限，不会因为任务多而叠加。
每个工作单元内部串行（调用 → 校验 → 可能回灌重试），单元之间并行。

### 任务一：`config-consistency`

跨 `apps/*/.env*`、`apps/*/package.json`、`apps/web/shopify.app.toml`、`infra/**`、
根配置（`package.json`/`turbo.json`/`pnpm-workspace.yaml`/`tsconfig.base.json`）找配置不一致。

**扇出方式**：1M 上下文让整份配置语料能一次喂进去，所以分片切的是**问题面**而不是内容 ——
5 个分片各自只问一类：`ports` / `urls` / `env-keys` / `db` / `names`。同一份语料，5 个聚焦提问。

**确定性 verify**：
- 一条"不一致"必须跨 **≥2 个不同文件**，否则丢弃
- 每条 evidence 的文件必须在本次语料清单内，否则丢弃（防模型引用凭空文件）
- 每条 evidence 的 `path:line` 必须真实存在，且该行原文必须**空白归一后包含** `text`，否则丢弃

### 任务二：`doc-drift`

拿 `CLAUDE.md`/`README.md`/`ARCHITECTURE.md`/`DESIGN.md`/`DECISIONS.md`/`docs/*.md`
里的断言对照真实代码，找过期描述。**扇出方式**：一个文档一个分片，天然并行。

**确定性 verify**（三类漂移各有对应的机器检查）：

| driftKind | 机器判据 | 判据不成立时 |
|---|---|---|
| `missing-path` | `repoPathExists(target) === false` | 路径实际存在 → 丢弃 |
| `missing-script` | 根 `package.json` scripts 不含 `target` | 脚本实际存在 → 丢弃 |
| `stale-term` | `grep target` 在 `apps/` + `packages/` 零命中 | 现役代码里搜得到 → 丢弃 |

外加通用检查：`docPath` 不得越出本分片；`docPath:docLine` 必须存在且原文包含 `quote`。

**`stale-term` 的搜索范围刻意只含 `apps/` 与 `packages/`（现役架构），排除 `chatbot*/`
等历史遗留目录** —— 否则遗留代码会把"文档已过期"这个事实掩盖掉。
这正是本仓库的真实痛点：`CLAUDE.md` 通篇写 Coze 集成，而 `coze` 在 `apps/`、`packages/`、
`scripts/`、`infra/` 里**零命中**（已实测）。

### 为什么只上这两个任务

按能力边界（§7），**冒烟分诊与日志分诊暂不上**：这两类目前**没有确定性基线**
（`scripts/` 下只有部署脚本，没有 smoke runner）。没有基线就上 AI 分诊，
等于让 flash 模型当唯一裁判，违反 §3 的纪律。等基线建起来再加任务。

---

## 5. 密钥脱敏：送模型前的最后一道闸

配置核对任务天然要读 `.env`，这些文件**含真实凭证**。送给第三方 API 前必须抹掉。

`repo.mjs` 的 `redactSecrets()` 处理四种赋值形状（env/shell、JSON、TOML/YAML）中
**键名像密钥**的值，外加 URL/DSN 内嵌的 `user:pass@`，以及裸露的 ≥32 位随机串。
任务只准通过 `readForPrompt()` / `buildCorpus()` 取内容，这两个函数强制走脱敏。

**保留键名与非密值**（如 `PORT=3000`），因为不一致判断靠的正是键名与端口/URL 这类非密值。
实测：`apps/api/.env` 脱敏 10 处、`apps/web/.env` 5 处，疑似泄漏 0 处。

---

## 6. 启用步骤

### 6.1 需要你提供

| 项 | 说明 |
|---|---|
| `GLM_API_KEY` | 从选定入口的控制台申请 |
| 入口 | 默认国内 `https://open.bigmodel.cn/api/paas/v4/`；设 `GLM_BASE_URL=https://api.z.ai/api/paas/v4` 切国际 |
| 并发起点 | 查 [控制台速率限制页](https://bigmodel.cn/usercenter/proj-mgmt/rate-limits) 的实际配额，填 `GLM_CONCURRENCY` |

密钥来源顺序：`GLM_API_KEY` 环境变量 → `~/.drsell-secrets/creds.env`（`KEY=VALUE` 格式）。
**仓库内不存任何真实 key。**

### 6.2 命令

```bash
# 0) 无需 key 的自检（应 78/78 通过）
node tools/glm-swarm/selftest.mjs

# 1) 无需 key 的分片预览
node tools/glm-swarm/run.mjs --list
node tools/glm-swarm/run.mjs --dry-run

# 2) 连通性验证（先确认单次调用能通，再跑全量）
export GLM_API_KEY=...
curl -s https://open.bigmodel.cn/api/paas/v4/chat/completions \
  -H "Authorization: Bearer $GLM_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"glm-5.3-flash","messages":[{"role":"user","content":"只输出 JSON: {\"ok\":true}"}],
       "max_tokens":64,"response_format":{"type":"json_object"}}' | head -c 800

# 3) 小步试跑：先跑一个任务、并发压到 2
GLM_CONCURRENCY=2 node tools/glm-swarm/run.mjs --task doc-drift

# 4) 全量
GLM_CONCURRENCY=4 node tools/glm-swarm/run.mjs
```

### 6.3 验证跑通了什么

跑完看三处：

1. **控制台**：token 消耗与账单是否与报告里的估算量级一致（估算价目见 §1.2 未确认项）。
2. **报告 `report.md`**：
   - "确认发现"里应至少出现 `CLAUDE.md` 的 Coze 漂移（已用 mock 验证过 verify 认这条）
   - "被丢弃的候选"栏为空说明 prompt 太保守，占比过高（>50%）说明 prompt 需要收紧
3. **终端汇总**：`限流命中` 次数。>0 说明 `GLM_CONCURRENCY` 设高了，按打印出的降级值调回去。

### 6.4 回滚

这套东西是**自包含的、只读的、离线可测的**：

- 它只读仓库文件、只写 `tools/glm-swarm/.runs/`（已 gitignore），**不改任何代码**
- 它**不在** `pnpm test` / `pnpm spec` 链路上，删掉不影响任何既有流程
- 完全回滚：`rm -rf tools/glm-swarm docs/glm-orchestration.md`
- 临时停用：不设 `GLM_API_KEY` 即可，`run.mjs` 会以退出码 2 拒绝运行
- 未改动 `package.json` / `pnpm-lock.yaml` / `infra/openclaw/`，无依赖与配置副作用

---

## 7. 能力边界：什么交给它，什么不交

**原则：GLM-5.3-Flash 只做"提出候选"，不做"下最终结论"。
凡是它的输出没有确定性校验器兜底的任务，都不该交给它。**

| 适合 | 理由 |
|---|---|
| 配置一致性核对 | 判据客观，可用 grep/读行确定性复核；1M 上下文一次吞下全部配置 |
| 文档漂移核对 | 同上；断言可归约成"路径存在吗/脚本存在吗/词搜得到吗" |
| 日志分诊（**待基线**） | 1M 上下文整文件喂入不用切块，输出是固定枚举 |
| 冒烟结果三分类（**待基线**） | 每条独立、天然并行、可重跑验证 |
| 只读取数 SQL（**待基线**） | SQL 可先 EXPLAIN 再执行，是纯机器校验 |
| UI 截图初筛（**待基线**） | 原生图像输入，官方点名 UI 场景 |

| 不适合 | 理由 |
|---|---|
| 跨服务根因定位 | 长链条推理，错一步全错，且结论**无法机器校验** |
| 架构 / DB schema 设计 | 一次性、高影响、不可并行，省这点钱没意义 |
| 安全审查判断题 | 漏报代价极高，flash 档不该当最后一道关 |
| 直接改生产代码 | 无 schema 强约束 + 思考不可关 → 输出不稳定，不能进 apply 路径 |
| 有状态的长重构 | 并行编排在这里收益为零 |

需要深推理的活留给 deepseek-v4-pro（wjclaw 上 OpenClaw drsell profile 的默认模型）。

---

## 8. 成本与限流注意

- **成本主要由输入决定**：`config-consistency` 每个分片约 26K 字符语料 × 5 分片，
  且 5 个分片喂的是**同一份语料** —— 如果缓存命中条件（§1.2 未确认）成立，
  后 4 个分片应大幅走缓存价（$0.015/M vs $0.075/M）。跑完对一下 `cached_tokens` 是否非零。
- **思考 token 计入输出计费**，而输出价是输入价的 3.3 倍。这是最容易被低估的一项。
- **促销价 2026-09-09 (UTC+8) 截止**，之后单价翻倍，代码会自动切换并在汇总里标注档位。
- **并发保守起步**：默认 3。配额未公开，撞到 `1302`/`1305` 会自动对半降并发，
  但降级**不会自动恢复**（本次运行内一路降到底），这是刻意的保守设计。
- **国内价目未官方确认**，代码里 `confirmed: false`，运行时打印警告，别拿它做预算。

---

## 9. 文件清单

```
tools/glm-swarm/
  run.mjs                             CLI 入口；加载期强制 verify/schema 纪律；报告落盘
  client.mjs                          GLM 客户端：退避重试、用量累计、成本估算、密钥解析
  lib.mjs                             Pool（可降并发）、validateShape、extractJson、fanout、summarize
  repo.mjs                            确定性仓库检查 + 密钥脱敏（送模型前的闸）
  selftest.mjs                        离线自测，mock fetch，无需 key
  tasks/config-consistency.task.mjs   配置一致性核对（5 分片）
  tasks/doc-drift.task.mjs            文档漂移核对（每文档 1 分片）
  .gitignore                          忽略 .runs/
docs/glm-orchestration.md             本文档
```

零新增 npm 依赖，只用 Node 18+ 内置（`fetch`、`node:fs`、`node:path`、`node:util`、`node:os`、`node:url`）。
