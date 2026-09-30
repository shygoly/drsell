# Pichat Pi Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 客服对话在 `apps/api` 进程内用 Pi SDK 跑 agent 循环，替换 wjclaw 上的 OpenClaw Gateway；`adp_*` 仍只经 `adp_reader`，欠费时切 GLM 且备用模型必须带工具。

**Architecture:** 对外仍是 `chatStream({ messages, systemPrompt, shopDomain, onChunk })`。`AdpService` 闸门、落库、SSE 不动。`packages/openclaw` 里新增 `PiSupportClient`：每请求 `SessionManager.inMemory()` + `createAgentSession`，`tools` 白名单仅本次允许的 `adp_*` custom tools（闭包锁定 `shopDomain`）。`CHAT_AGENT=openclaw` 走现有 HTTP 客户端回滚；默认 `pi`。OpenClaw 网关第一期只停进程，配置目录留作回滚资料。

**Tech Stack:** `@earendil-works/pi-coding-agent`（`defineTool` + TypeBox）、`pg.Pool`（`adp_reader`）、Jest/ts-jest、Nest 11、Node 22。包名仍叫 `@drsell/openclaw`。

**Spec:** [2026-09-30-pichat-pi-agent-design.md](../specs/2026-09-30-pichat-pi-agent-design.md)

## Global Constraints

- Node ≥ 22.19（生产已是 v22.22.0）。Pi SDK 不得在更低版本上跑。
- 包路径第一期仍是 `@drsell/openclaw`。禁止为这次改名。
- 工具只经 `adp_reader` 执行 `adp_shop_summary` / `adp_search_products` / `adp_get_order`。禁止 `import` Prisma / `PrismaService`。禁止注册 `adp_get_after_sales`。
- `createAgentSession` 的 `tools` 数组只能是上述 `adp_*` 名。禁止出现 `bash` / `read` / `write` / `edit` / `exec`。`noTools: "builtin"` 与白名单同时设。
- 店铺域由闭包锁定；模型传入的 `shop` 一律忽略。
- 主模型 `deepseek-v4/deepseek-v4-flash`，备用 `zhipu/glm-4.5-flash`。402 / billing 才切备用。备用一轮必须仍注册同一组 `adp_*` 工具。
- 模型 key 只从 `apps/api` 进程环境读（`DEEPSEEK_API_KEY`、`GLM_API_KEY`）。Nest **禁止**读 `/root/.openclaw-drsell/`。
- `CHAT_AGENT` 未设置视为 `pi`。`openclaw` 是回滚开关，不是目标架构。
- **切流窗口内保留 HTTP `OpenClawClient`。** spec 里「删除 HTTP 客户端」是停网关并稳定之后的另一次变更；本计划不删，否则 `CHAT_AGENT=openclaw` 无法回滚。
- `@drsell/openclaw` 继续编成 CommonJS（Nest `require`）。Pi SDK 是 ESM：只许 `await import('@earendil-works/pi-coding-agent')`，禁止静态 `require` 它。
- 本变更不申请 Shopify Protected customer data，不把 Pichat 装回店铺，不改 Partner 身份，不重建 storefront 品牌页。
- 未获用户明确「提交」指令时，**跳过所有 git commit 步骤**（本仓库提交规矩优先于本计划的 Commit 勾选）。
- 密钥不得写入仓库、计划附件或测试夹具。测试用假 key / mock session。

---

## 前置事实（已核实，实施时无需重探）

| 事实 | 值 |
|---|---|
| 今日调用方 | `AdpService.previewChat` / `proxyChatSse` → `createOpenClawClient().chatStream` |
| 今日客户端 | `packages/openclaw/src/index.ts` 的 `OpenClawClient`：HTTP POST `OPENCLAW_GATEWAY_URL/v1/chat/completions`，SSE 解析 `choices[0].delta.content` |
| 空消息 | `messages.length === 0` 抛 `chatStream requires at least one message` |
| Medusa 工具面 | prompt 已不提 `adp_get_order`；`proxyChatSse` 算 `source` 但 **尚未**传给 `chatStream`。Pi 必须把 `source` 加进 `OpenClawChatParams` |
| `adp_reader` 函数 | `adp_shop_summary($1)`、`adp_search_products($1,$2,$3)`、`adp_get_order($1,$2)`。SQL 在 `apps/api/prisma/sql/adp-reader.sql` |
| 生产 MCP DSN 形态 | `postgresql://adp_reader:…@127.0.0.1:5433/drsell?sslmode=disable`（密码已在 api `.env` 的 `ADP_READER_PASSWORD`；**不要**把密码写进代码） |
| 主备 ID | primary `deepseek-v4/deepseek-v4-flash`，fallback `zhipu/glm-4.5-flash`；baseUrl 见 `infra/openclaw/drsell/openclaw.json.example` |
| Pi 工具 API | `defineTool({ name, label, description, parameters: Type.Object(...), execute })`；`createAgentSession({ customTools, tools: [那些 name], sessionManager: SessionManager.inMemory(), noTools: "builtin" })` |
| 文本流 | `session.subscribe`：`event.type === "message_update" && event.assistantMessageEvent.type === "text_delta"` → `delta` |
| system prompt | 创建后设 `session.agent.state.systemPrompt`；历史写入 `session.agent.state.messages`；最后一条 user 走 `session.prompt(text)` |
| 部署重启 OpenClaw | `scripts/deploy-mvp.sh` 第 138–148 行 rsync SOUL/IDENTITY/skills 并 `pm2 restart openclaw-drsell`。切 Pi 后必须删掉这段自动重启 |
| 包测试现状 | `@drsell/openclaw` 的 `test` 是 `jest --passWithNoTests`，无 `ts-jest`、无 spec。prompt 单测在 `apps/api/src/adp/support-system-prompt.spec.ts` |
| `adp.service.spec.ts` | mock `createOpenClawClient` → `{ chatStream }`。工厂名保持这个，免改 mock |

## 文件结构

| 文件 | 职责 |
|---|---|
| `packages/openclaw/src/types.ts` | `OpenClawChatParams` / `OpenClawMessage` / `SupportPersona` / `SupportSource` |
| `packages/openclaw/src/prompt.ts` | `buildSupportSystemPrompt`（从 `index.ts` 原样搬出，Task 8 才改 MCP 措辞） |
| `packages/openclaw/src/http-client.ts` | 现有 `OpenClawClient` HTTP 实现（回滚） |
| `packages/openclaw/src/tool-allowlist.ts` | `FORBIDDEN_TOOLS`、`toolNamesForSource`、`assertSafeToolAllowlist` |
| `packages/openclaw/src/adp-reader.ts` | `buildAdpReaderUrl`、`createAdpQuery`（`pg.Pool`） |
| `packages/openclaw/src/tools.ts` | `createAdpTools(shopDomain, query, source)` → `defineTool` 数组 |
| `packages/openclaw/src/billing.ts` | `isBillingError` |
| `packages/openclaw/src/pi-session.ts` | 对 Pi SDK 的适配（dynamic import、`createPiSession`） |
| `packages/openclaw/src/pi-client.ts` | `PiSupportClient.chatStream`：主备、订阅 delta、abort、dispose |
| `packages/openclaw/models.json` | DeepSeek / Zhipu provider 目录（key 用 `$DEEPSEEK_API_KEY` / `$GLM_API_KEY` 插值，无字面密钥） |
| `packages/openclaw/src/index.ts` | `createOpenClawClient` 按 `CHAT_AGENT` 分发；re-export |
| `packages/openclaw/jest.config.js` | 与 `packages/connector/jest.config.js` 同形 |
| `scripts/probe-glm-tools.mjs` | 切生产前：GLM 必须发出 `adp_search_products` tool call |
| `apps/api/src/adp/adp.service.ts` | `chatStream` 传入 `source` |
| `apps/api/.env.example` | `CHAT_AGENT`、`DEEPSEEK_*`、`GLM_*`、`ADP_READER_*` |
| `scripts/deploy-mvp.sh` | 删除每次部署重启 OpenClaw |
| `ARCHITECTURE.md` / `DECISIONS.md` / `AGENTS.md` / `DEPLOY.md` | ADR-9/15/17/19 与陷阱 1、pm2 表 |
| `infra/openclaw/drsell/DEPRECATED.md` | 第一期保留目录，标明废弃与回滚 |

> 每个 Task 先写失败测试，跑红，再写最小实现，跑绿。

---

## Chunk 1：拆包 + Jest，行为不变

### Task 1: 抽出类型 / prompt / HTTP 客户端，并让 `@drsell/openclaw` 能跑 TypeScript 单测

**Files:**
- Create: `packages/openclaw/jest.config.js`
- Create: `packages/openclaw/src/types.ts`
- Create: `packages/openclaw/src/prompt.ts`
- Create: `packages/openclaw/src/http-client.ts`
- Modify: `packages/openclaw/src/index.ts`
- Modify: `packages/openclaw/package.json`
- Modify: `packages/openclaw/tsconfig.json`

**Interfaces:**
- Consumes: 今日 `index.ts` 的全部 public export
- Produces: 同样的 export 名与类型。`createOpenClawClient()` 本任务仍只返回 `OpenClawClient`

- [ ] **Step 1: 加 Jest 配置（尚无业务 spec，先能跑空套件）**

`packages/openclaw/jest.config.js`：

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
};
```

`packages/openclaw/tsconfig.json` 改成：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "composite": true,
    "types": ["node", "jest"]
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.spec.ts"]
}
```

在 `packages/openclaw` 下安装测试依赖（从仓库根）：

```bash
pnpm --filter @drsell/openclaw add -D ts-jest @types/jest
```

`package.json` 的 `test` 改为 `"jest"`（去掉 `--passWithNoTests`）。

- [ ] **Step 2: 把类型、prompt、HTTP 客户端原样搬出**

`types.ts` 必须包含（字段名不得改）：

```ts
export type OpenClawClientOptions = {
  gatewayUrl?: string;
  gatewayToken?: string;
  agentId?: string;
  fetchImpl?: typeof fetch;
  /** 仅测试注入。生产走 process.env.CHAT_AGENT。 */
  agent?: 'pi' | 'openclaw';
};

export type OpenClawRole = 'system' | 'user' | 'assistant';

export type OpenClawMessage = {
  role: OpenClawRole;
  content: string;
};

export type SupportSource = 'shopify' | 'medusa';

export type OpenClawChatParams = {
  messages: OpenClawMessage[];
  systemPrompt: string;
  shopDomain: string;
  visitorId: string;
  conversationId?: string;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
  /**
   * 决定注册哪些 adp_*。省略 ≡ shopify（含 adp_get_order）。
   * Medusa 不注册 adp_get_order（D8）。
   */
  source?: SupportSource | null;
};

export type SupportPersona = {
  name?: string | null;
  tone?: string | null;
  language?: string | null;
  customInstructions?: string | null;
};

export type SupportChatClient = {
  chatStream(params: OpenClawChatParams): Promise<string>;
};
```

`prompt.ts`：把现有 `buildSupportSystemPrompt` / `replyLanguageLine` **一字不改**地搬过来（含 MCP 措辞）。本任务禁止改字符串。

`http-client.ts`：把现有 `OpenClawClient`、`sessionKey`、`parseOpenAiSseChunk` 搬过来，import 类型从 `./types`。

`index.ts` 这一步只做 re-export + 工厂仍返回 HTTP 客户端：

```ts
export type {
  OpenClawChatParams,
  OpenClawClientOptions,
  OpenClawMessage,
  OpenClawRole,
  SupportChatClient,
  SupportPersona,
  SupportSource,
} from './types';
export { buildSupportSystemPrompt } from './prompt';
export { OpenClawClient } from './http-client';
import { OpenClawClient } from './http-client';
import type { OpenClawClientOptions, SupportChatClient } from './types';

export function createOpenClawClient(options?: OpenClawClientOptions): SupportChatClient {
  return new OpenClawClient(options);
}
```

- [ ] **Step 3: 跑现有 prompt / AdpService 测试，确认拆包零行为差**

```bash
pnpm --filter @drsell/api test -- src/adp/support-system-prompt.spec.ts src/adp/adp.service.spec.ts
pnpm --filter @drsell/openclaw test
pnpm --filter @drsell/openclaw lint
```

Expected: api 那两个 spec 全绿；openclaw 的 jest 因还没有 `*.spec.ts` 会以 “No tests found” 非零退出。若非零，把 `test` 脚本改回能在零 spec 时成功的形式 **仅在下一步写出第一份 spec 之前**：先进入 Task 2 写 spec，不要为了绿而加回 `--passWithNoTests` 超过一个任务。

若 api spec 红，是 export 丢了，补 re-export，禁止改断言。

- [ ] **Step 4: Commit**（仅当用户要求提交）

```bash
git add packages/openclaw
git commit -m "$(cat <<'EOF'
refactor(openclaw): split types, prompt, and HTTP client

Keep chatStream callers unchanged so the Pi client can land behind the same factory.
EOF
)"
```

---

## Chunk 2：白名单、adp_reader、custom tools

### Task 2: 工具名白名单（静态，不打模型）

**Files:**
- Create: `packages/openclaw/src/tool-allowlist.ts`
- Test: `packages/openclaw/src/tool-allowlist.spec.ts`

**Interfaces:**
- Consumes: `SupportSource`（Task 1）
- Produces:
  - `FORBIDDEN_TOOLS: readonly string[]`
  - `toolNamesForSource(source?: SupportSource | null): string[]`
  - `assertSafeToolAllowlist(tools: string[]): string[]`（校验通过则原样返回，失败 throw）

- [ ] **Step 1: 写失败测试**

```ts
import {
  FORBIDDEN_TOOLS,
  assertSafeToolAllowlist,
  toolNamesForSource,
} from './tool-allowlist';

describe('toolNamesForSource', () => {
  it('shopify / 省略 / null 含三个 adp_*，不含 after_sales', () => {
    for (const source of ['shopify', undefined, null] as const) {
      const names = toolNamesForSource(source);
      expect(names).toEqual([
        'adp_shop_summary',
        'adp_search_products',
        'adp_get_order',
      ]);
      expect(names).not.toContain('adp_get_after_sales');
    }
  });

  it('medusa 只有商品两个工具', () => {
    expect(toolNamesForSource('medusa')).toEqual([
      'adp_shop_summary',
      'adp_search_products',
    ]);
  });
});

describe('assertSafeToolAllowlist', () => {
  it('合法白名单原样返回', () => {
    const tools = toolNamesForSource('shopify');
    expect(assertSafeToolAllowlist(tools)).toEqual(tools);
  });

  it.each(['bash', 'read', 'write', 'edit', 'exec', 'adp_get_after_sales'])(
    '拒绝 %s',
    (name) => {
      expect(() =>
        assertSafeToolAllowlist(['adp_shop_summary', name]),
      ).toThrow(/forbidden tool/i);
    },
  );

  it('FORBIDDEN_TOOLS 覆盖编码工具', () => {
    for (const name of ['bash', 'read', 'write', 'edit', 'exec']) {
      expect(FORBIDDEN_TOOLS).toContain(name);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认红**

```bash
pnpm --filter @drsell/openclaw test -- tool-allowlist.spec.ts
```

Expected: FAIL — `Cannot find module './tool-allowlist'` 或函数未定义。

- [ ] **Step 3: 最小实现**

```ts
import type { SupportSource } from './types';

export const FORBIDDEN_TOOLS = [
  'bash',
  'read',
  'write',
  'edit',
  'exec',
  'adp_get_after_sales',
] as const;

const SHOPIFY_TOOLS = [
  'adp_shop_summary',
  'adp_search_products',
  'adp_get_order',
] as const;

const MEDUSA_TOOLS = ['adp_shop_summary', 'adp_search_products'] as const;

export function toolNamesForSource(source?: SupportSource | null): string[] {
  return source === 'medusa' ? [...MEDUSA_TOOLS] : [...SHOPIFY_TOOLS];
}

export function assertSafeToolAllowlist(tools: string[]): string[] {
  const forbidden = tools.filter((name) =>
    (FORBIDDEN_TOOLS as readonly string[]).includes(name),
  );
  if (forbidden.length > 0) {
    throw new Error(`forbidden tool in Pi allowlist: ${forbidden.join(',')}`);
  }
  const allowed = new Set([...SHOPIFY_TOOLS]);
  const unknown = tools.filter((name) => !allowed.has(name as (typeof SHOPIFY_TOOLS)[number]));
  if (unknown.length > 0) {
    throw new Error(`unknown tool in Pi allowlist: ${unknown.join(',')}`);
  }
  return tools;
}
```

- [ ] **Step 4: 跑测试确认绿**

```bash
pnpm --filter @drsell/openclaw test -- tool-allowlist.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**（仅当用户要求提交）

```bash
git add packages/openclaw/src/tool-allowlist.ts packages/openclaw/src/tool-allowlist.spec.ts
git commit -m "$(cat <<'EOF'
feat(openclaw): statically forbid coding tools on the Pi allowlist

ADR-19 denylist is replaced by an allowlist that cannot include bash/write.
EOF
)"
```

---

### Task 3: `adp_reader` 连接串与查询封装

**Files:**
- Create: `packages/openclaw/src/adp-reader.ts`
- Test: `packages/openclaw/src/adp-reader.spec.ts`
- Modify: `packages/openclaw/package.json`（`pg`）

**Interfaces:**
- Consumes: `process.env` 形状如下（测试传入 fake env，不读真实 `.env`）
- Produces:
  - `buildAdpReaderUrl(env: NodeJS.Dict<string>): string`
  - `type AdpQuery = (sql: string, params: unknown[]) => Promise<unknown[]>`
  - `createAdpQuery(pool: { query: Function }): AdpQuery`
  - `lookupShopSummary(query, shop): Promise<string>`
  - `lookupProducts(query, shop, q, limit): Promise<string>`
  - `lookupOrder(query, shop, orderId): Promise<string>`

SQL 必须是：

```sql
SELECT * FROM adp_shop_summary($1)
SELECT * FROM adp_search_products($1, $2, $3)
SELECT * FROM adp_get_order($1, $2)
```

查询失败返回短字符串 `lookup failed`，**不得**把 SQL、连接串、password 放进返回值。

- [ ] **Step 1: 安装 pg**

```bash
pnpm --filter @drsell/openclaw add pg
pnpm --filter @drsell/openclaw add -D @types/pg
```

- [ ] **Step 2: 写失败测试**

```ts
import {
  buildAdpReaderUrl,
  createAdpQuery,
  lookupOrder,
  lookupProducts,
  lookupShopSummary,
} from './adp-reader';

describe('buildAdpReaderUrl', () => {
  it('ADP_READER_DATABASE_URL 优先', () => {
    expect(
      buildAdpReaderUrl({
        ADP_READER_DATABASE_URL: 'postgresql://adp_reader:x@127.0.0.1:5433/drsell?sslmode=disable',
        ADP_READER_PASSWORD: 'ignored',
      }),
    ).toBe('postgresql://adp_reader:x@127.0.0.1:5433/drsell?sslmode=disable');
  });

  it('用密码、host、port 拼 DSN，密码做 URL 编码', () => {
    expect(
      buildAdpReaderUrl({
        ADP_READER_PASSWORD: 'p@ss/w',
        ADP_READER_HOST: '127.0.0.1',
        ADP_READER_PORT: '5433',
      }),
    ).toBe(
      'postgresql://adp_reader:p%40ss%2Fw@127.0.0.1:5433/drsell?sslmode=disable',
    );
  });

  it('缺密码则抛错', () => {
    expect(() => buildAdpReaderUrl({})).toThrow(/ADP_READER/);
  });
});

describe('lookups', () => {
  it('shop_summary 把闭包 shop 作为 $1', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = createAdpQuery({
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [{ product_count: 2 }] };
      },
    });
    const text = await lookupShopSummary(query, 'real.myshopify.com');
    expect(calls[0].sql).toMatch(/adp_shop_summary\(\$1\)/);
    expect(calls[0].params).toEqual(['real.myshopify.com']);
    expect(text).toContain('product_count');
  });

  it('search 使用 $1 shop、$2 query、$3 limit', async () => {
    const calls: Array<{ params: unknown[] }> = [];
    const query = createAdpQuery({
      query: async (_sql: string, params: unknown[]) => {
        calls.push({ params });
        return { rows: [] };
      },
    });
    await lookupProducts(query, 'real.myshopify.com', 'shoe', 7);
    expect(calls[0].params).toEqual(['real.myshopify.com', 'shoe', 7]);
  });

  it('失败返回 lookup failed，不含 sql', async () => {
    const query = createAdpQuery({
      query: async () => {
        throw new Error('password=secret SELECT * FROM adp_shop_summary');
      },
    });
    const text = await lookupShopSummary(query, 'x.com');
    expect(text).toBe('lookup failed');
    expect(text).not.toMatch(/secret|SELECT/i);
  });

  it('get_order 使用 $1 shop、$2 order id', async () => {
    const calls: Array<{ params: unknown[] }> = [];
    const query = createAdpQuery({
      query: async (_sql: string, params: unknown[]) => {
        calls.push({ params });
        return { rows: [{ status: 'paid' }] };
      },
    });
    await lookupOrder(query, 'real.myshopify.com', '1001');
    expect(calls[0].params).toEqual(['real.myshopify.com', '1001']);
  });
});
```

- [ ] **Step 3: 跑测试确认红**

```bash
pnpm --filter @drsell/openclaw test -- adp-reader.spec.ts
```

Expected: FAIL — 模块不存在。

- [ ] **Step 4: 最小实现**

```ts
export type AdpQuery = (sql: string, params: unknown[]) => Promise<unknown[]>;

type PoolLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

export function buildAdpReaderUrl(env: NodeJS.Dict<string>): string {
  const explicit = env.ADP_READER_DATABASE_URL?.trim();
  if (explicit) return explicit;
  const password = env.ADP_READER_PASSWORD;
  if (!password) {
    throw new Error('ADP_READER_PASSWORD or ADP_READER_DATABASE_URL is required');
  }
  const host = env.ADP_READER_HOST?.trim() || '127.0.0.1';
  const port = env.ADP_READER_PORT?.trim() || '5433';
  const db = env.ADP_READER_DATABASE?.trim() || 'drsell';
  return `postgresql://adp_reader:${encodeURIComponent(password)}@${host}:${port}/${db}?sslmode=disable`;
}

export function createAdpQuery(pool: PoolLike): AdpQuery {
  return async (sql, params) => {
    const result = await pool.query(sql, params);
    return result.rows;
  };
}

async function runLookup(query: AdpQuery, sql: string, params: unknown[]): Promise<string> {
  try {
    const rows = await query(sql, params);
    return JSON.stringify(rows);
  } catch {
    return 'lookup failed';
  }
}

export function lookupShopSummary(query: AdpQuery, shop: string): Promise<string> {
  return runLookup(query, 'SELECT * FROM adp_shop_summary($1)', [shop]);
}

export function lookupProducts(
  query: AdpQuery,
  shop: string,
  q: string | null,
  limit: number,
): Promise<string> {
  return runLookup(query, 'SELECT * FROM adp_search_products($1, $2, $3)', [
    shop,
    q,
    limit,
  ]);
}

export function lookupOrder(query: AdpQuery, shop: string, orderId: string): Promise<string> {
  return runLookup(query, 'SELECT * FROM adp_get_order($1, $2)', [shop, orderId]);
}

export function createAdpReaderPool(env: NodeJS.Dict<string> = process.env): import('pg').Pool {
  const { Pool } = require('pg') as typeof import('pg');
  return new Pool({
    connectionString: buildAdpReaderUrl(env),
    max: 4,
    statement_timeout: 5000,
  });
}
```

`createAdpReaderPool` 用 `require('pg')` 是为了让单测不必真连库。Pi 客户端只注入 `AdpQuery`。

- [ ] **Step 5: 跑测试确认绿**

```bash
pnpm --filter @drsell/openclaw test -- adp-reader.spec.ts
```

Expected: PASS

- [ ] **Step 6: Commit**（仅当用户要求提交）

```bash
git add packages/openclaw/src/adp-reader.ts packages/openclaw/src/adp-reader.spec.ts packages/openclaw/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(openclaw): query adp_* through adp_reader, not Prisma

INV-2 stays at the database role; the Pi tools will reuse this query helper.
EOF
)"
```

---

### Task 4: custom tools 忽略模型传入的 shop

**Files:**
- Create: `packages/openclaw/src/tools.ts`
- Test: `packages/openclaw/src/tools.spec.ts`
- Modify: `packages/openclaw/package.json`（`typebox`；Pi SDK 在 Task 9 才加，本任务 `defineTool` 可先用本地薄封装以免提前引入 ESM）

**Interfaces:**
- Consumes: `AdpQuery`、`lookup*`（Task 3）、`toolNamesForSource`（Task 2）、`SupportSource`
- Produces:
  - `createAdpTools({ shopDomain, query, source })` 返回 `{ names: string[]; tools: AdpToolDef[] }`
  - `AdpToolDef`：`{ name: string; execute: (id: string, params: Record<string, unknown>) => Promise<{ content: [{ type: 'text'; text: string }]; details: Record<string, never> }> }`

本任务 **先不** `import` Pi 的 `defineTool`。形状与 Pi 文档一致，Task 9 再 `defineTool()` 包一层。这样 Task 4 的测试在 CJS Jest 里就能跑。

- [ ] **Step 1: 写失败测试**

```ts
import { createAdpTools } from './tools';
import type { AdpQuery } from './adp-reader';

function mockQuery(capture: { sql?: string; params?: unknown[] }): AdpQuery {
  return async (sql, params) => {
    capture.sql = sql;
    capture.params = params;
    return [{ ok: true }];
  };
}

describe('createAdpTools', () => {
  const shop = 'locked.myshopify.com';

  it('execute 忽略 params.shop，只查闭包域名', async () => {
    const capture: { params?: unknown[] } = {};
    const { tools } = createAdpTools({
      shopDomain: shop,
      source: 'shopify',
      query: mockQuery(capture),
    });
    const search = tools.find((t) => t.name === 'adp_search_products');
    expect(search).toBeDefined();
    const result = await search!.execute('call-1', {
      shop: 'evil.myshopify.com',
      query: 'shoe',
      limit: 3,
    });
    expect(capture.params?.[0]).toBe(shop);
    expect(capture.params?.[0]).not.toBe('evil.myshopify.com');
    expect(result.content[0].text).toContain('ok');
  });

  it('medusa 不包含 adp_get_order', () => {
    const { names, tools } = createAdpTools({
      shopDomain: shop,
      source: 'medusa',
      query: mockQuery({}),
    });
    expect(names).not.toContain('adp_get_order');
    expect(tools.map((t) => t.name)).not.toContain('adp_get_order');
  });

  it('shopify 包含 adp_get_order，且 order id 来自 params、shop 仍锁定', async () => {
    const capture: { params?: unknown[] } = {};
    const { tools } = createAdpTools({
      shopDomain: shop,
      source: 'shopify',
      query: mockQuery(capture),
    });
    const getOrder = tools.find((t) => t.name === 'adp_get_order');
    await getOrder!.execute('c', { shop: 'other.com', order_id: '1001' });
    expect(capture.params).toEqual([shop, '1001']);
  });
});
```

- [ ] **Step 2: 跑测试确认红**

```bash
pnpm --filter @drsell/openclaw test -- tools.spec.ts
```

Expected: FAIL — 模块不存在。

- [ ] **Step 3: 最小实现**

```ts
import {
  type AdpQuery,
  lookupOrder,
  lookupProducts,
  lookupShopSummary,
} from './adp-reader';
import { assertSafeToolAllowlist, toolNamesForSource } from './tool-allowlist';
import type { SupportSource } from './types';

export type AdpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, never>;
};

export type AdpToolDef = {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<AdpToolResult>;
};

function textResult(text: string): AdpToolResult {
  return { content: [{ type: 'text', text }], details: {} };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asLimit(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 20;
  return n;
}

export function createAdpTools(opts: {
  shopDomain: string;
  query: AdpQuery;
  source?: SupportSource | null;
}): { names: string[]; tools: AdpToolDef[] } {
  const shop = opts.shopDomain;
  const names = assertSafeToolAllowlist(toolNamesForSource(opts.source));
  const tools: AdpToolDef[] = [];

  tools.push({
    name: 'adp_shop_summary',
    label: 'Shop summary',
    description: 'Summarize catalog size and price range for this shop.',
    parameters: { type: 'object', properties: { shop: { type: 'string' } } },
    execute: async () => textResult(await lookupShopSummary(opts.query, shop)),
  });

  tools.push({
    name: 'adp_search_products',
    label: 'Search products',
    description: 'Search products in this shop by keyword.',
    parameters: {
      type: 'object',
      properties: {
        shop: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
    execute: async (_id, params) =>
      textResult(
        await lookupProducts(opts.query, shop, asString(params.query), asLimit(params.limit)),
      ),
  });

  if (names.includes('adp_get_order')) {
    tools.push({
      name: 'adp_get_order',
      label: 'Get order',
      description: 'Look up one order in this shop by order id.',
      parameters: {
        type: 'object',
        properties: {
          shop: { type: 'string' },
          order_id: { type: 'string' },
        },
      },
      execute: async (_id, params) =>
        textResult(await lookupOrder(opts.query, shop, asString(params.order_id) ?? '')),
    });
  }

  return { names, tools };
}
```

注意：`adp_get_order` 的参数名用 `order_id`（与 SQL `p_order_id` 对应）。若 Task 9 接到 Pi/模型实际发出 `orderId`，在 `execute` 里同时读 `params.order_id ?? params.orderId`，并补一条单测。不要等生产才发现。

- [ ] **Step 4: 跑测试确认绿**

```bash
pnpm --filter @drsell/openclaw test -- tools.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**（仅当用户要求提交）

```bash
git add packages/openclaw/src/tools.ts packages/openclaw/src/tools.spec.ts
git commit -m "$(cat <<'EOF'
feat(openclaw): lock adp_* tools to the session shopDomain

Model-supplied shop arguments are ignored so prompt injection cannot retarget the reader.
EOF
)"
```

---

## Chunk 3：主备、Pi 客户端、工厂

### Task 5: billing 判定

**Files:**
- Create: `packages/openclaw/src/billing.ts`
- Test: `packages/openclaw/src/billing.spec.ts`

**Interfaces:**
- Produces: `isBillingError(err: unknown): boolean`

判定为 true 当且仅当：HTTP 402，或消息匹配 `billing` / `insufficient balance` / `余额不足` / `payment required`（大小写不敏感）。超时、5xx、普通 Error 为 false。

- [ ] **Step 1: 写失败测试**

```ts
import { isBillingError } from './billing';

describe('isBillingError', () => {
  it('402', () => {
    expect(isBillingError({ status: 402, message: 'Payment Required' })).toBe(true);
    expect(isBillingError(Object.assign(new Error('no'), { status: 402 }))).toBe(true);
  });

  it('billing 文案', () => {
    expect(isBillingError(new Error('decision=fallback_model reason=billing'))).toBe(true);
    expect(isBillingError(new Error('Insufficient Balance'))).toBe(true);
    expect(isBillingError(new Error('余额不足'))).toBe(true);
  });

  it('非欠费', () => {
    expect(isBillingError(new Error('timeout'))).toBe(false);
    expect(isBillingError({ status: 500, message: 'upstream' })).toBe(false);
    expect(isBillingError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑红**

```bash
pnpm --filter @drsell/openclaw test -- billing.spec.ts
```

Expected: FAIL

- [ ] **Step 3: 实现**

```ts
export function isBillingError(err: unknown): boolean {
  if (err == null) return false;
  const rec = err as { status?: number; message?: string; cause?: { status?: number; message?: string } };
  const status = rec.status ?? rec.cause?.status;
  if (status === 402) return true;
  const msg = [rec.message, rec.cause?.message, err instanceof Error ? err.message : String(err)]
    .filter(Boolean)
    .join(' ');
  return /billing|insufficient\s*balance|余额不足|payment required|\b402\b/i.test(msg);
}
```

- [ ] **Step 4: 跑绿**

```bash
pnpm --filter @drsell/openclaw test -- billing.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**（仅当用户要求提交）

```bash
git add packages/openclaw/src/billing.ts packages/openclaw/src/billing.spec.ts
git commit -m "$(cat <<'EOF'
feat(openclaw): detect provider billing failures for ADR-15 fallback

402 and balance errors must switch provider; timeouts must not.
EOF
)"
```

---

### Task 6: `PiSupportClient`（注入 session 工厂，不在本任务装 Pi SDK）

**Files:**
- Create: `packages/openclaw/src/pi-client.ts`
- Test: `packages/openclaw/src/pi-client.spec.ts`

**Interfaces:**
- Consumes: `OpenClawChatParams`、`createAdpTools`、`assertSafeToolAllowlist`、`isBillingError`
- Produces:
  - `type CreatePiSession = (input: PiSessionInput) => Promise<PiSessionHandle>`
  - `class PiSupportClient implements SupportChatClient`
  - `PiSupportClient` 构造函数：`{ createSession, query, primaryModel, fallbackModel, log? }`

`PiSessionInput`：

```ts
export type PiSessionInput = {
  model: unknown;
  tools: string[];
  customTools: unknown[];
  systemPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastUserText: string;
  signal?: AbortSignal;
};
```

`PiSessionHandle`：

```ts
export type PiSessionHandle = {
  subscribe: (listener: (event: {
    type: string;
    assistantMessageEvent?: { type: string; delta?: string };
  }) => void) => () => void;
  prompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  dispose: () => void;
};
```

行为：
1. `messages.length === 0` → 抛与 HTTP 客户端相同的错。
2. 最后一条必须是 `user`，否则 throw `chatStream last message must be user`。
3. 用 `source` 建 tools；`createSession` 收到的 `tools` 必须等于 `assertSafeToolAllowlist(...)`。
4. subscribe 把 `text_delta` 交给 `onChunk`，并拼接返回值。
5. primary 的 `prompt` 若 `isBillingError`，**同一 messages / 同一 tools** 再用 `fallbackModel` 建第二轮；打日志对象 `{ event: 'chat_agent_fallback', reason: 'billing', from: 'deepseek-v4/deepseek-v4-flash', to: 'zhipu/glm-4.5-flash' }`（`log` 默认为 `console.info`）。
6. 非 billing 错误原样抛出，不切备用。
7. `finally` 里 `dispose()`。`signal` abort 时调 `abort()`。

- [ ] **Step 1: 写失败测试**

```ts
import { PiSupportClient } from './pi-client';
import type { CreatePiSession, PiSessionHandle } from './pi-client';
import type { AdpQuery } from './adp-reader';

const query: AdpQuery = async () => [];

function handle(opts: {
  deltas?: string[];
  prompt?: () => Promise<void>;
}): PiSessionHandle {
  return {
    subscribe(listener) {
      for (const delta of opts.deltas ?? []) {
        listener({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta },
        });
      }
      return () => undefined;
    },
    prompt: opts.prompt ?? (async () => undefined),
    abort: async () => undefined,
    dispose() {
      /* captured by tests via jest.fn wrap */
    },
  };
}

describe('PiSupportClient', () => {
  it('把 text_delta 转成 onChunk', async () => {
    const chunks: string[] = [];
    const createSession: CreatePiSession = async () => handle({ deltas: ['Hel', 'lo'] });
    const client = new PiSupportClient({
      createSession,
      query,
      primaryModel: { id: 'primary' },
      fallbackModel: { id: 'fallback' },
    });
    const full = await client.chatStream({
      shopDomain: 'a.myshopify.com',
      visitorId: 'v',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      onChunk: (c) => chunks.push(c),
    });
    expect(chunks.join('')).toBe('Hello');
    expect(full).toBe('Hello');
  });

  it('billing 时第二轮仍带 adp_search_products', async () => {
    const seen: string[][] = [];
    let round = 0;
    const createSession: CreatePiSession = async (input) => {
      seen.push(input.tools);
      round += 1;
      if (round === 1) {
        return handle({
          prompt: async () => {
            throw Object.assign(new Error('Insufficient Balance'), { status: 402 });
          },
        });
      }
      return handle({ deltas: ['ok'] });
    };
    const logs: unknown[] = [];
    const client = new PiSupportClient({
      createSession,
      query,
      primaryModel: { id: 'deepseek' },
      fallbackModel: { id: 'glm' },
      log: (row) => logs.push(row),
    });
    await client.chatStream({
      shopDomain: 'a.myshopify.com',
      visitorId: 'v',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'shoes?' }],
      onChunk: () => undefined,
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain('adp_search_products');
    expect(seen[1]).toEqual(seen[0]);
    expect(logs[0]).toMatchObject({
      event: 'chat_agent_fallback',
      reason: 'billing',
      from: 'deepseek-v4/deepseek-v4-flash',
      to: 'zhipu/glm-4.5-flash',
    });
  });

  it('medusa 传给 createSession 的 tools 不含 adp_get_order', async () => {
    let tools: string[] = [];
    const createSession: CreatePiSession = async (input) => {
      tools = input.tools;
      return handle({ deltas: ['x'] });
    };
    const client = new PiSupportClient({
      createSession,
      query,
      primaryModel: {},
      fallbackModel: {},
    });
    await client.chatStream({
      shopDomain: 'a.myshopify.com',
      visitorId: 'v',
      source: 'medusa',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      onChunk: () => undefined,
    });
    expect(tools).not.toContain('adp_get_order');
    expect(tools).toContain('adp_search_products');
  });

  it('非 billing 不切备用', async () => {
    let rounds = 0;
    const createSession: CreatePiSession = async () => {
      rounds += 1;
      return handle({
        prompt: async () => {
          throw new Error('timeout');
        },
      });
    };
    const client = new PiSupportClient({
      createSession,
      query,
      primaryModel: {},
      fallbackModel: {},
    });
    await expect(
      client.chatStream({
        shopDomain: 'a.myshopify.com',
        visitorId: 'v',
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        onChunk: () => undefined,
      }),
    ).rejects.toThrow('timeout');
    expect(rounds).toBe(1);
  });
});
```

- [ ] **Step 2: 跑红**

```bash
pnpm --filter @drsell/openclaw test -- pi-client.spec.ts
```

Expected: FAIL

- [ ] **Step 3: 实现 `PiSupportClient`**

要点（完整类写入 `pi-client.ts`）：

```ts
async chatStream(params: OpenClawChatParams): Promise<string> {
  if (params.messages.length === 0) {
    throw new Error('chatStream requires at least one message');
  }
  const last = params.messages[params.messages.length - 1];
  if (last.role !== 'user') {
    throw new Error('chatStream last message must be user');
  }
  const { names, tools } = createAdpTools({
    shopDomain: params.shopDomain,
    query: this.query,
    source: params.source,
  });
  const history = params.messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: m.content,
  }));
  try {
    return await this.runRound({
      model: this.primaryModel,
      params,
      names,
      tools,
      history,
      lastUserText: last.content,
    });
  } catch (err) {
    if (!isBillingError(err)) throw err;
    this.log({
      event: 'chat_agent_fallback',
      reason: 'billing',
      from: 'deepseek-v4/deepseek-v4-flash',
      to: 'zhipu/glm-4.5-flash',
    });
    return await this.runRound({
      model: this.fallbackModel,
      params,
      names,
      tools,
      history,
      lastUserText: last.content,
    });
  }
}
```

`runRound`：`createSession` → subscribe → `prompt` → 返回拼接文本 → `finally dispose`。`params.signal?.aborted` 时 `abort()`。primary 轮抛出的 billing 必须在 dispose 之后再 throw，以便第二轮能建新 session。

- [ ] **Step 4: 跑绿**

```bash
pnpm --filter @drsell/openclaw test -- pi-client.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**（仅当用户要求提交）

```bash
git add packages/openclaw/src/pi-client.ts packages/openclaw/src/pi-client.spec.ts
git commit -m "$(cat <<'EOF'
feat(openclaw): stream Pi deltas and retry once on billing errors

Fallback keeps the same adp_* allowlist so GLM cannot answer without tools.
EOF
)"
```

---

### Task 7: `CHAT_AGENT` 工厂 + `AdpService` 传入 `source`

**Files:**
- Modify: `packages/openclaw/src/index.ts`
- Test: `packages/openclaw/src/index.spec.ts`
- Modify: `apps/api/src/adp/adp.service.ts`（`previewChat` 与 `proxyChatSse` 的 `chatStream` 调用）

**Interfaces:**
- Consumes: `PiSupportClient`（Task 6）、`OpenClawClient`（Task 1）
- Produces: `createOpenClawClient(options?)`：`options.agent ?? process.env.CHAT_AGENT ?? 'pi'` 为 `openclaw` 时 HTTP，否则 Pi

`AdpService.proxyChatSse` 现有：

```ts
await this.openclaw.chatStream({
  shopDomain: params.shopDomain,
  visitorId: params.visitorId,
  conversationId: params.conversationId,
  systemPrompt: buildSupportSystemPrompt(...),
  messages,
  onChunk,
  signal: params.signal,
});
```

在参数对象里增加 `source: source ?? 'shopify'`。`previewChat` 不查库，不传 `source`（默认 shopify 工具面，与今日预览一致）。

- [ ] **Step 1: 写失败测试（工厂）**

```ts
import { createOpenClawClient } from './index';
import { OpenClawClient } from './http-client';
import { PiSupportClient } from './pi-client';

describe('createOpenClawClient', () => {
  const prev = process.env.CHAT_AGENT;
  afterEach(() => {
    if (prev === undefined) delete process.env.CHAT_AGENT;
    else process.env.CHAT_AGENT = prev;
  });

  it('未设置时走 Pi', () => {
    delete process.env.CHAT_AGENT;
    expect(createOpenClawClient()).toBeInstanceOf(PiSupportClient);
  });

  it('CHAT_AGENT=openclaw 走 HTTP', () => {
    process.env.CHAT_AGENT = 'openclaw';
    expect(createOpenClawClient()).toBeInstanceOf(OpenClawClient);
  });

  it('options.agent 覆盖 env', () => {
    process.env.CHAT_AGENT = 'openclaw';
    expect(createOpenClawClient({ agent: 'pi' })).toBeInstanceOf(PiSupportClient);
  });
});
```

`PiSupportClient` 无 query 时构造会连库——工厂里要能 `new PiSupportClient()` 用默认 `createAdpQuery(createAdpReaderPool())`。**本测试只断言 instanceof**，不要调 `chatStream`。若构造函数在缺密码时 throw，给 `PiSupportClient` 延迟建 pool：第一次 `chatStream` 再 `buildAdpReaderUrl`。工厂测试才能在无环境密码时通过。

调整 Task 6 构造：`query` 可选；缺省时 `this.query = (sql, params) => this.pool().then(...)` 懒创建。把这条补进 `pi-client.spec.ts` 已注入 `query` 的路径（不受影响）。

- [ ] **Step 2: 跑红**

```bash
pnpm --filter @drsell/openclaw test -- index.spec.ts
```

Expected: FAIL（工厂仍只返回 HTTP）

- [ ] **Step 3: 改工厂**

```ts
export function createOpenClawClient(options?: OpenClawClientOptions): SupportChatClient {
  const mode = (options?.agent ?? process.env.CHAT_AGENT ?? 'pi').toLowerCase();
  if (mode === 'openclaw') return new OpenClawClient(options);
  return new PiSupportClient();
}
```

`adp.service.ts` 的 `proxyChatSse` 调用增加 `source: source ?? 'shopify'`。

在 `adp.service.spec.ts` 里找到 `chatStream` 被调用且店铺为默认 Shopify 的用例，加：

```ts
expect(chatStream.mock.calls[0][0].source).toBe('shopify');
```

若现有用例 mock 的 `botSetting.shop.source === 'medusa'`，断言 `source` 为 `'medusa'`。没有 medusa 用例就加一条最小用例：seed `shop: { source: 'medusa' }`，走完闸门后 `expect(chatStream.mock.calls[0][0].source).toBe('medusa')`。

- [ ] **Step 4: 跑绿**

```bash
pnpm --filter @drsell/openclaw test -- index.spec.ts
pnpm --filter @drsell/api test -- src/adp/adp.service.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**（仅当用户要求提交）

```bash
git add packages/openclaw/src/index.ts packages/openclaw/src/index.spec.ts packages/openclaw/src/pi-client.ts apps/api/src/adp/adp.service.ts apps/api/src/adp/adp.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(openclaw): default chatStream to in-process Pi with OpenClaw rollback

CHAT_AGENT=openclaw keeps the HTTP gateway client for the cutover window.
EOF
)"
```

---

## Chunk 4：prompt、真 SDK、探针、文档、切流

### Task 8: 把 prompt 里的 MCP 措辞改成 tools

**Files:**
- Modify: `packages/openclaw/src/prompt.ts`
- Modify: `apps/api/src/adp/support-system-prompt.spec.ts`

**Interfaces:**
- 护栏顺序不变。只替换工具称呼。Shopify 省略 `source` ≡ `'shopify'` 的逐字相等测试必须继续成立。

替换对照：

| 旧 | 新 |
|---|---|
| `use only the MCP calls adp_shop_summary and adp_search_products, ` | `use only the tools adp_shop_summary and adp_search_products, ` |
| `use only the MCP calls adp_shop_summary, adp_search_products and adp_get_order, ` | `use only the tools adp_shop_summary, adp_search_products and adp_get_order, ` |
| `Never reveal the gateway address, tokens or any other store data.` | `Never reveal API keys, tokens or any other store data.` |

其余句子不动。

- [ ] **Step 1: 先改 spec 断言（TDD：实现前 spec 应红）**

在 `support-system-prompt.spec.ts` 增加（或改现有 contain）：

```ts
expect(prompt).toContain('use only the tools adp_shop_summary, adp_search_products and adp_get_order');
expect(prompt).not.toContain('MCP calls');
expect(prompt).not.toContain('gateway address');
```

Medusa 匿名用例改为断言 `use only the tools adp_shop_summary and adp_search_products`，仍 `not.toContain('adp_get_order')`。

- [ ] **Step 2: 跑红**

```bash
pnpm --filter @drsell/api test -- src/adp/support-system-prompt.spec.ts
```

Expected: FAIL on the new string assertions.

- [ ] **Step 3: 改 `prompt.ts` 两处 intro + gateway 句**

- [ ] **Step 4: 跑绿**

```bash
pnpm --filter @drsell/api test -- src/adp/support-system-prompt.spec.ts
```

Expected: PASS，含「省略 source ≡ shopify 逐字相等」。

- [ ] **Step 5: Commit**（仅当用户要求提交）

```bash
git add packages/openclaw/src/prompt.ts apps/api/src/adp/support-system-prompt.spec.ts
git commit -m "$(cat <<'EOF'
fix(openclaw): name adp_* as tools in the support prompt

The MCP/gateway wording would be a lie after the in-process Pi cutover.
EOF
)"
```

---

### Task 9: 接入真实 Pi SDK（dynamic import）

**Files:**
- Create: `packages/openclaw/src/pi-session.ts`
- Create: `packages/openclaw/models.json`
- Modify: `packages/openclaw/src/pi-client.ts`（默认 `createSession`）
- Modify: `packages/openclaw/package.json`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Consumes: Task 6 的 `CreatePiSession`
- Produces: `createDefaultPiSession: CreatePiSession`；默认模型从 `ModelRuntime.getModel('deepseek-v4', 'deepseek-v4-flash')` 与 `getModel('zhipu', 'glm-4.5-flash')` 读取

- [ ] **Step 1: 安装 SDK（销版本，不要写浮动 range 到文档以外）**

```bash
pnpm --filter @drsell/openclaw add @earendil-works/pi-coding-agent typebox
```

打开生成的 `package.json`，把这两包的版本抄进本任务实现注释顶上（例如 `// pi-coding-agent@x.y.z`）。随后所有 import 只走 `await import(...)`。

- [ ] **Step 2: 写 `models.json`（无密钥）**

路径：`packages/openclaw/models.json`。内容与 `infra/openclaw/drsell/openclaw.json.example` 的 `models.providers` 对齐，`apiKey` 用环境变量插值：

```json
{
  "providers": {
    "deepseek-v4": {
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "$DEEPSEEK_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "deepseek-v4-flash",
          "name": "DeepSeek V4 Flash",
          "reasoning": true,
          "input": ["text"],
          "contextWindow": 131072,
          "maxTokens": 8192
        }
      ]
    },
    "zhipu": {
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "apiKey": "$GLM_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "glm-4.5-flash",
          "name": "GLM 4.5 Flash",
          "input": ["text"],
          "contextWindow": 131072,
          "maxTokens": 8192
        }
      ]
    }
  }
}
```

若 Pi 实际解析的是 `GLM_BASE_URL` 而不是写死 bigmodel，把 zhipu `baseUrl` 改成 `"$GLM_BASE_URL"`，并在 `.env.example` 给默认值 `https://open.bigmodel.cn/api/paas/v4`。

- [ ] **Step 3: `pi-session.ts` 默认实现**

必须做到：

1. `const sdk = await import('@earendil-works/pi-coding-agent');`
2. `ModelRuntime.create({ modelsPath: path.join(__dirname, '..', 'models.json'), credentials: new InMemoryCredentialStore() })`。`InMemoryCredentialStore` 从 `@earendil-works/pi-ai` 导入（若该 export 不存在，用 `setRuntimeApiKey('deepseek-v4', process.env.DEEPSEEK_API_KEY ?? '')` 与 `setRuntimeApiKey('zhipu', process.env.GLM_API_KEY ?? '')`，**禁止**写 `auth.json` 到磁盘）。
3. `createAgentSession({ sessionManager: sdk.SessionManager.inMemory(), model, modelRuntime, thinkingLevel: 'off', noTools: 'builtin', tools: input.tools, customTools: input.customTools.map(toDefineTool), cwd: emptyDir, agentDir: emptyDir })`
4. `toDefineTool`：把 Task 4 的 `AdpToolDef` 交给 `sdk.defineTool`，`parameters` 用 `Type.Object({ ... })` 重写一遍（不要把 JSON schema 对象直接塞进去——以你安装的那版 `defineTool` 签名为准；若它收 JSON schema，就保持 Task 4 的 schema）。
5. 创建后：`session.agent.state.systemPrompt = input.systemPrompt`；把 `input.history` 写进 `session.agent.state.messages`（缺 `id`/`timestamp` 就补 `randomUUID()` + `Date.now()`，以通过类型检查）。
6. `tools` 在调用前再跑一次 `assertSafeToolAllowlist(input.tools)`。
7. `emptyDir`：`fs.mkdtempSync(path.join(os.tmpdir(), 'drsell-pi-'))`。不要用进程 `cwd`（api 生产 cwd 是 `/opt/drsell-run/apps/api`，DefaultResourceLoader 会去扫技能文件）。
8. handle.prompt → `session.prompt(text)`；abort → `session.abort()`；dispose → `session.dispose()`。
9. 缺 `DEEPSEEK_API_KEY` 时，Pi 路径 throw `DEEPSEEK_API_KEY is not configured`（对标 HTTP 客户端缺 token 的快速失败）。

写一条 **不打网** 的单测 `pi-session.spec.ts`：mock `import()` 做不到干净时，改为测试 `toDefineTool` 映射与 `assertSafeToolAllowlist` 被调用。至少保证：若有人把 `tools: ['bash']` 传入 `createDefaultPiSession`，在调用 SDK 前就 throw。

```ts
it('createDefaultPiSession 在 SDK 前拒绝 bash', async () => {
  await expect(
    createDefaultPiSession({
      model: {},
      tools: ['bash'],
      customTools: [],
      systemPrompt: 's',
      history: [],
      lastUserText: 'hi',
    }),
  ).rejects.toThrow(/forbidden tool/i);
});
```

这一条不需要真 SDK。把 `assertSafeToolAllowlist` 放在 `import()` **之前**。

- [ ] **Step 4: 默认 `PiSupportClient` 使用 `createDefaultPiSession` + lazy pool**

无注入时：`primaryModel` / `fallbackModel` 在第一次 `chatStream` 从 runtime `getModel` 取。单测仍然注入 fake `createSession`，不碰 SDK。

- [ ] **Step 5: `.env.example`**

在 `apps/api/.env.example` 追加（空值，无密钥）：

```
CHAT_AGENT=pi
DEEPSEEK_API_KEY=""
DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"
GLM_API_KEY=""
GLM_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
ADP_READER_HOST="127.0.0.1"
ADP_READER_PORT="5433"
# ADP_READER_DATABASE_URL=""   # 若设置则覆盖上面的拼接
```

保留现有 `OPENCLAW_GATEWAY_*`（回滚仍需要）和 `ADP_READER_PASSWORD`。

- [ ] **Step 6: 编译**

```bash
pnpm --filter @drsell/openclaw lint
pnpm --filter @drsell/openclaw test
pnpm --filter @drsell/api lint
```

Expected: 全绿。若 tsc 对 ESM 类型抱怨，只在 `pi-session.ts` 使用 `await import()`，不要改整个包的 `module`。

- [ ] **Step 7: Commit**（仅当用户要求提交）

```bash
git add packages/openclaw apps/api/.env.example pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(openclaw): embed pi-coding-agent with env-sourced model keys

Sessions are in-memory and coding tools stay off the allowlist.
EOF
)"
```

---

### Task 10: GLM tool-calling 探针（切生产门禁）

**Files:**
- Create: `scripts/probe-glm-tools.mjs`

**Interfaces:**
- Consumes: `GLM_API_KEY`、`GLM_BASE_URL`（默认 `https://open.bigmodel.cn/api/paas/v4`）
- Produces: 退出码 0 当且仅当响应 `choices[0].message.tool_calls` 里存在 `function.name === 'adp_search_products'`。失败打印无密钥的状态码与 `error.message`。

- [ ] **Step 1: 写脚本**

```js
#!/usr/bin/env node
import process from 'node:process';

const key = process.env.GLM_API_KEY;
const base = (process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
if (!key) {
  console.error('GLM_API_KEY is required');
  process.exit(2);
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'adp_search_products',
      description: 'Search products in the shop by keyword.',
      parameters: {
        type: 'object',
        properties: {
          shop: { type: 'string' },
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
];

const res = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'glm-4.5-flash',
    messages: [
      {
        role: 'system',
        content: 'You are a shop assistant. To look up products you must call adp_search_products.',
      },
      { role: 'user', content: 'Do you have any shoes in stock?' },
    ],
    tools,
    tool_choice: 'auto',
  }),
});

const body = await res.json();
if (!res.ok) {
  console.error('GLM HTTP', res.status, body.error?.message || body);
  process.exit(1);
}

const calls = body.choices?.[0]?.message?.tool_calls ?? [];
const names = calls.map((c) => c.function?.name);
if (!names.includes('adp_search_products')) {
  console.error('GLM did not call adp_search_products; got', names, 'finish', body.choices?.[0]?.finish_reason);
  process.exit(1);
}
console.log('glm_tool_calling_ok', names);
```

- [ ] **Step 2: 无 key 时失败模式**

```bash
env -u GLM_API_KEY node scripts/probe-glm-tools.mjs
```

Expected: exit 2，stderr 含 `GLM_API_KEY is required`。

- [ ] **Step 3: 有 key 时（执行机若无 key 则跳过实打，但代码必须提交）**

```bash
GLM_API_KEY=... node scripts/probe-glm-tools.mjs
```

Expected: `glm_tool_calling_ok` 且 exit 0。失败则 **禁止** Task 12 把生产 `CHAT_AGENT` 设为 `pi`。

- [ ] **Step 4: Commit**（仅当用户要求提交）

```bash
git add scripts/probe-glm-tools.mjs
git commit -m "$(cat <<'EOF'
test: probe GLM tool calling before Pi production fallback

A fallback model that cannot call adp_search_products would fabricate catalog answers.
EOF
)"
```

---

### Task 11: 决策文档与部署脚本（与实现同一逻辑变更一起改；若尚未提交则与 Task 9 同批）

**Files:**
- Modify: `ARCHITECTURE.md`（`ADR-9`、`ADR-15`、`ADR-17`、`ADR-19` 四节）
- Modify: `DECISIONS.md` 对应四行（只改那一行的「内容 / 锁定依据 / 状态」，**不新增 ADR ID**）
- Modify: `AGENTS.md` 陷阱 1
- Modify: `DEPLOY.md` pm2 表 `openclaw-drsell` 行
- Modify: `scripts/deploy-mvp.sh` 删除 SOUL rsync + `pm2 restart openclaw-drsell` 整块（约 138–148 行）
- Create: `infra/openclaw/drsell/DEPRECATED.md`

openspec **不写**架构断言；若某处引用 ADR-9，只保留 ID。

- [ ] **Step 1: 改 `DECISIONS.md` 四行**（与 ARCHITECTURE 论证同一提交）

`ADR-9` 内容改为：客服对话经 `apps/api` 进程内 Pi SDK（`packages/openclaw` 的 `PiSupportClient`），不再经 OpenClaw Gateway。锁定依据：`packages/openclaw/src/pi-client.ts`。状态：已守护。

`ADR-15` 锁定依据改为：`packages/openclaw/src/pi-client.ts` + `packages/openclaw/src/billing.ts` + `scripts/probe-glm-tools.mjs`。内容仍是同一主备对；删掉「OpenClaw 把 402 归为 billing」改成「`PiSupportClient` 捕获 402/billing 后用同一 messages 再跑 GLM」。

`ADR-17` 内容改为：会话上下文由本地 `ChatMessage` 组装；Pi 使用 `SessionManager.inMemory()`，每请求新 session，不落盘、不复用。锁定依据去掉网关 session key 表述，改为 `packages/openclaw/src/pi-client.ts` + `adp.service.spec.ts`。

`ADR-19` 内容改为：Pi `tools` 白名单 = 本次允许的 `adp_*`；禁止再引入 OpenClaw `tools.allow` 式 MCP 时序。锁定依据：`packages/openclaw/src/tool-allowlist.ts`。状态：已守护。

- [ ] **Step 2: 改 `ARCHITECTURE.md` 四节论证**

`ADR-9`：为什么进程内——去掉网关 token、root 进程、共享 workspace；延迟与闸门仍在 api。守护文件改为 Pi 客户端 + allowlist 单测。

`ADR-15`：主备从网关配置挪到客户端；守护改为 billing 单测 + GLM 探针。保留「同 key 换 DeepSeek 型号兜不住欠费」和 2026-09-08 那次真实兜底作为历史证据。

`ADR-17`：删除「网关会话键 / sessionKey uuid / 每次部署同步 SOUL.md」作为现行机制。改为 in-memory、每请求 dispose。`INV-2` 仍是真正边界。

`ADR-19`：明确 denylist 作废。白名单在编码工具注册之后仍只启用 listed names（Pi 的 `tools` 是 allowlist，与当年 OpenClaw `tools.allow` 踩的 MCP 时序坑不是同一层——custom tools 与 allowlist 一起传入 `createAgentSession`）。禁止有人「为了对称」再加 MCP allow 配置。

- [ ] **Step 3: `AGENTS.md` 陷阱 1 替换为**

客服链路：`apps/api` → `@drsell/openclaw`（进程内 Pi）→ DeepSeek V4 Flash，billing 时切 `zhipu/glm-4.5-flash`。全仓 `coze` 零命中。改 primary 前先验 tool calling，改完走公网复验，并同步 `ADR-15`。`deepseek-v4-flash` 与 `deepseek-v4-pro` 共用同一 key，换型号兜不住欠费。回滚：`CHAT_AGENT=openclaw` 且 `openclaw-drsell` 仍在时才走网关。

- [ ] **Step 4: `DEPLOY.md`**

pm2 表「AI 网关 `openclaw-drsell`」行改为：已停用（Pi 切流完成后 `pm2 stop`；目录 `/root/.openclaw-drsell/` 第一期保留）。密钥：DeepSeek / GLM 在 **api** `.env`，只指路不抄值。注明 Next standalone 与 api 不同：api 读 `apps/api/.env`，不要只改仓库根 `.env` 以为 api 会拿到（对照 DEP-2 精神，写清 cwd）。

- [ ] **Step 5: `deploy-mvp.sh`**

删除「Sync OpenClaw agent prompts … restart gateway」整段。不要在脚本里 `pm2 stop openclaw-drsell`（停网关是 Task 12 的人工步骤，避免第一次带着 `CHAT_AGENT=openclaw` 发布时把回滚面停掉）。

- [ ] **Step 6: `infra/openclaw/drsell/DEPRECATED.md`**

写明：本目录是 OpenClaw 回滚资料；现行客服不读这些文件。回滚步骤：api `.env` 设 `CHAT_AGENT=openclaw`、确认 `OPENCLAW_GATEWAY_TOKEN`、`pm2 start openclaw-drsell`、只重启 `drsell-api`。禁止 Nest 读这个目录里的 key。

- [ ] **Step 7: 治理校验**

```bash
pnpm spec
```

Expected: 11 个检查器绿。ID 四条仍在册。

- [ ] **Step 8: Commit**（仅当用户要求提交）

```bash
git add ARCHITECTURE.md DECISIONS.md AGENTS.md DEPLOY.md scripts/deploy-mvp.sh infra/openclaw/drsell/DEPRECATED.md
git commit -m "$(cat <<'EOF'
docs: move ADR-9/15/17/19 from OpenClaw gateway to in-process Pi

Keep the gateway profile on disk as rollback material; stop restarting it on every deploy.
EOF
)"
```

---

### Task 12: 生产切流（人工 runbook，本任务不改代码）

**Files:** 无代码。执行时对照 `DEPLOY.md`。

顺序不可颠倒：

1. **拷 key 进 api `.env`（一次性，人工）**  
   从 OpenClaw 配置把 DeepSeek / GLM key **复制**到 `/opt/drsell-run/apps/api/.env` 的 `DEEPSEEK_API_KEY` / `GLM_API_KEY`。不要让 Node 去读 `/root/.openclaw-drsell/`。`ADP_READER_PASSWORD` 已存在则不要轮换。补 `ADP_READER_HOST=127.0.0.1`、`ADP_READER_PORT=5433`（或直接 `ADP_READER_DATABASE_URL` 与今日 MCP DSN 相同）。

2. **第一次发这版代码时显式 `CHAT_AGENT=openclaw`**  
   旧网关继续服务。部署后走公网 widget 探针（含商品查询），确认与今日行为一致。

3. **`node scripts/probe-glm-tools.mjs` 必须 exit 0**（在能访问 bigmodel 的机器上，用同一份 GLM key）。

4. **改 `CHAT_AGENT=pi`，只重启 `drsell-api`**（cwd `/opt/drsell-run/apps/api`）。不要只 `pm2 restart` 却改了仓库根 `.env`。不要重启 web/storefront（本变更不碰它们）。

5. **公网对话探针**：至少一条会触发 `adp_search_products` 的问法（真实店铺商品关键词），断言回复含目录里的商品名而不是道歉编造。再人为看 api 日志无 `forbidden tool`、无 Prisma 来自 tools 的查询。

6. **观察无回归后** `pm2 stop openclaw-drsell`。不要 `pm2 delete`，除非用户明确要求。

7. 回滚：`CHAT_AGENT=openclaw`，`pm2 start openclaw-drsell`（若已 stop），只重启 `drsell-api`。

本任务没有 Commit。未做步骤 3 不得做步骤 4。

---

## Self-review

**Spec coverage**

| spec 条 | 任务 |
|---|---|
| 进程内 SDK，无侧车 | Task 9 |
| `chatStream` 接口、AdpService 几乎不改编排 | Task 7 |
| 包名不改 | Global + Task 1 |
| HTTP 客户端：spec 写删除；计划在切流窗口保留 | Global + Task 1/7/12 |
| in-memory 每请求新 session | Task 6/9 |
| tools 白名单、无 bash/read/write | Task 2/4/6/9 |
| `adp_reader` 非 Prisma | Task 3 |
| shop 闭包锁定 | Task 4 |
| ADR-15 客户端主备 + fallback 仍带 tools | Task 5/6 |
| `CHAT_AGENT` 默认 pi，生产先 openclaw | Task 7/12 |
| prompt MCP → tools | Task 8 |
| 单测 delta / billing / shop ignore / medusa 无 get_order | Task 4/6 |
| `adp.service.spec.ts` 继续 mock `createOpenClawClient` | Task 7 |
| 静态无编码工具 | Task 2/9 |
| GLM tool-calling 探针 | Task 10 |
| ADR-9/15/17/19、AGENTS、DEPLOY、deploy-mvp 去 OpenClaw 重启 | Task 11 |
| 不注册 `adp_get_after_sales` | Task 2 |
| 错误冒泡、billing 结构化日志、工具失败短字符串 | Task 3/6 |
| 不停物理删除 `infra/openclaw` | Task 11 DEPRECATED.md |
| 不申请 PCD、不改域名/Partner | Global |

**Placeholder scan:** 无 TBD。Pi `defineTool` 的 TypeBox 与 JSON schema 分叉在 Task 9 Step 3 写明「以安装版本的函数签名为准」，并要求单测在 SDK 调用前挡住 `bash`。

**Type consistency:** `SupportChatClient.chatStream(OpenClawChatParams)`、`source?: SupportSource`、`CreatePiSession` / `AdpQuery` / `AdpToolDef` 在后续任务中的名字与 Task 1–6 一致。工厂名保持 `createOpenClawClient`。
