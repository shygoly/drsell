# 元语地基 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 drsell 建立元语治理地基——`DECISIONS.md` ID 登记册 + 4 个校验器 + 欠账棘轮，挂进 `pnpm test`，使后续每条治理规矩都能回答「我违反了会怎么被抓住」。

**Architecture:** 登记册是被解析的数据，`spec/*.mjs` 是兑现它的执行体。共享工具收进 `spec/lib.mjs`（文件遍历 / 注释剥离 / 登记册解析 / 统一输出），4 个校验器各自单一职责，`run-all.mjs` 按文件名 glob 聚合，`negative-verify.mjs` 用「注入违规 → 断言变红 → 还原」证明每个校验器真的会红。

**Tech Stack:** Node ESM（`.mjs`），零运行时依赖，只用 `node:fs` / `node:path` / `node:child_process`。不引入任何 npm 包。

**Spec:** [2026-08-29-metalang-foundation-design.md](../specs/2026-08-29-metalang-foundation-design.md)

---

## 前置事实（已实测，实施时无需重新验证）

| 事实 | 值 |
|---|---|
| 扫描面内已存在的 ID 形态文本 | **0 处** —— 落地不会误红 |
| `packages/*` 对 apps 的依赖 | **0** —— 只依赖 `@drsell/shared`，`B-1` 现状通过 |
| `apps/storefront` 的 polaris 命中 | **1 处，是块注释** `stat-card.tsx:15` —— 剥离注释后 `B-2` 通过 |
| `apps/web` 扫描面 tailwind/radix 命中 | **0** —— `B-3` 现状通过 |
| extension 的 hex 字面量 | **8 处，全在** `apps/web/extensions/chatbot/assets/drsell-chat.js` |
| 根目录 `.md` | 共 6 个，`CLAUDE.md` / `README.md` 留下，**4 个**迁 `docs/archive/` |
| 缺隔离键的 Prisma model | `MailSubscriber` / `KnowledgeSyncJob` / `ChatStatDaily` = **3 个**（`Tenant` 自身除外） |

## 文件结构

| 文件 | 职责 |
|---|---|
| `DECISIONS.md` | ID 命名空间唯一权威。被解析的数据，不含论证 |
| `spec/lib.mjs` | 共享工具：`walk` / `stripComments` / `matchLines` / `parseDecisions` / `Reporter` / `rejectFix` |
| `spec/run-all.mjs` | glob `check-*.mjs` 并聚合退出码。新增校验器无需改它 |
| `spec/negative-verify.mjs` | 负向验证。每个校验器任务往 `CASES` 追加用例 |
| `spec/check-ids.mjs` | ID 在册 + 登记表非空 + 零引用 WARN |
| `spec/check-links.mjs` | 元语文档相对链接目标存在 + 白名单 WARN |
| `spec/check-boundaries.mjs` | `B-1` / `B-2` / `B-3` 的 grep 守护 |
| `spec/check-ratchet.mjs` | 4 项欠账计数 vs 基线，只减不增 |
| `spec/.unguarded-baseline.json` | 欠账基线。由 `--print` 生成，不手写 |

> `spec/lib.mjs` 是 spec 文件清单之外的新增。理由：4 个校验器都要遍历文件与剥离注释，不抽共享工具就是四份重复。这是对 spec §5 的实现细化，不改变任何行为契约。

---

## Chunk 1：归档、共享库、登记册

### Task 1：归档根目录历史报告

**Files:**
- Create: `docs/archive/`
- Move: 4 份根目录历史报告

- [ ] **Step 1: 建目录并迁移**

```bash
mkdir -p docs/archive
git mv BACKEND_STARTUP_TEST_REPORT.md COZE_API_TEST_RESULTS.md FINAL_SUMMARY.md README_COZE_API_TESTING.md docs/archive/
```

- [ ] **Step 2: 验证根目录只剩 3 个 md 的前身**

Run: `ls -1 *.md`
Expected: 仅 `CLAUDE.md`、`README.md`（`DECISIONS.md` 尚未创建）

- [ ] **Step 3: 找出指向这 4 份文件的残留链接**

Run: `git grep -nE '(BACKEND_STARTUP_TEST_REPORT|COZE_API_TEST_RESULTS|FINAL_SUMMARY|README_COZE_API_TESTING)\.md' -- ':!docs/archive'`
Expected: 无输出。若有输出，把链接前缀改为 `docs/archive/` 后再继续。

- [ ] **Step 4: Commit**

```bash
git add -A docs/archive && git commit -m "docs: 历史报告降为归档快照（元语规矩：阶段性报告不是元语）"
```

---

### Task 2：`spec/lib.mjs` 共享库

**Files:**
- Create: `spec/lib.mjs`

- [ ] **Step 1: 写文件**

```js
// spec/lib.mjs — 校验器共享工具。零运行时依赖。
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_EXCLUDE = new Set([
  'node_modules', '.next', 'dist', 'build', '.pnpm-store',
  '.git', '.turbo', '.serena', '.workbuddy', 'docs', 'design', 'test-results',
]);

/** 递归收集文件。dir 相对 REPO_ROOT；depth=1 表示只看该层。返回相对路径。 */
export function walk(dir, { exts = null, exclude = DEFAULT_EXCLUDE, depth = Infinity } = {}) {
  const out = [];
  let entries;
  try { entries = readdirSync(join(REPO_ROOT, dir)); } catch { return out; }
  for (const name of entries) {
    if (exclude.has(name)) continue;
    const rel = dir === '.' ? name : join(dir, name);
    let st;
    try { st = statSync(join(REPO_ROOT, rel)); } catch { continue; }
    if (st.isDirectory()) {
      if (depth > 1) out.push(...walk(rel, { exts, exclude, depth: depth - 1 }));
    } else if (!exts || exts.includes(extname(name))) {
      out.push(rel);
    }
  }
  return out;
}

const JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

/**
 * 剥离注释，用等长空格替换以保持行号与列号。
 * 只处理已知语言；未知扩展名原样返回（宁可漏报，不可误报）。
 */
export function stripComments(src, ext) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  if (ext === '.css') return src.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (!JS_EXTS.has(ext)) return src;
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

/** 逐行匹配。regex 的 g 标志会被剥掉以避免 lastIndex 状态污染。 */
export function matchLines(relPath, regex, { strip = false } = {}) {
  const ext = extname(relPath);
  let src;
  try { src = readFileSync(join(REPO_ROOT, relPath), 'utf8'); } catch { return []; }
  if (strip) src = stripComments(src, ext);
  const re = new RegExp(regex.source, regex.flags.replace('g', ''));
  const hits = [];
  src.split('\n').forEach((text, i) => {
    if (re.test(text)) hits.push({ file: relPath, line: i + 1, text: text.trim() });
  });
  return hits;
}

/**
 * 解析 DECISIONS.md。
 * sections: 章节号 → 该节的原始表格行数组
 * byPrefix: 仅 §1–§4 为登记表，§6/§7 引用已登记 ID，不计入注册
 */
export function parseDecisions() {
  const md = readFileSync(join(REPO_ROOT, 'DECISIONS.md'), 'utf8');
  const sections = {};
  let cur = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(\d+)\./);
    if (h) { cur = h[1]; sections[cur] ??= []; continue; }
    if (cur && line.trimStart().startsWith('|')) sections[cur].push(line);
  }
  const SECTION_PREFIX = { 1: 'INV', 2: 'ADR', 3: 'B', 4: 'DS' };
  const byPrefix = { INV: new Set(), ADR: new Set(), B: new Set(), DS: new Set() };
  for (const [num, prefix] of Object.entries(SECTION_PREFIX)) {
    for (const line of sections[num] ?? []) {
      const m = line.match(/^\|\s*`([A-Z]+-\d+)`\s*\|/);
      if (m && m[1].startsWith(`${prefix}-`)) byPrefix[prefix].add(m[1]);
    }
  }
  return { md, sections, byPrefix };
}

/** 统一输出与退出码。0 = PASS（可含 WARN），1 = FAIL。 */
export class Reporter {
  constructor(name) { this.name = name; this.passes = []; this.warns = []; this.fails = []; }
  pass(m) { this.passes.push(m); }
  warn(m) { this.warns.push(m); }
  fail(m) { this.fails.push(m); }
  done() {
    console.log(`== ${this.name} ==`);
    for (const m of this.passes) console.log(`  ✓ ${m}`);
    for (const m of this.warns) console.log(`  ! ${m}`);
    for (const m of this.fails) console.log(`  ✗ ${m}`);
    console.log(`  ${this.passes.length} pass / ${this.warns.length} warn / ${this.fails.length} fail`);
    process.exit(this.fails.length ? 1 : 0);
  }
}

/** 治理只诊断、不自动改。 */
export function rejectFix() {
  if (process.argv.includes('--fix')) {
    console.error('✗ 治理只诊断、不自动改。本校验器不提供 --fix。');
    process.exit(2);
  }
}
```

- [ ] **Step 2: 冒烟验证**

Run: `node -e "import('./spec/lib.mjs').then(m=>console.log(m.walk('packages',{exts:['.ts']})))"`
Expected: 打印 3 个 `packages/*/src/index.ts` 路径，无异常。

- [ ] **Step 3: Commit**

```bash
git add spec/lib.mjs && git commit -m "feat(spec): 校验器共享库"
```

---

### Task 3：`DECISIONS.md` 登记册

**Files:**
- Create: `DECISIONS.md`

- [ ] **Step 1: 写文件**

内容严格照 spec §「DECISIONS.md 内容规范」。**格式硬要求**：§1–§4、§6、§7 的表格首列 ID 必须用反引号包裹，否则解析不到。

````markdown
# DECISIONS.md — 决策登记册（ID 命名空间唯一权威）

> **本文件是登记册，不是论证书，也不是日志。** 每条只占一行：ID + 一句话 + 结论 + 出处。
> **论证与推导留在出处文档**，不在此复制——复制即制造第二个事实来源。
>
> **机器校验**：`pnpm spec`（已挂进 `pnpm test`）。
> 代码或元语文档里出现的 ID **必须在本册**，否则测试红。
>
> **新增决策**：按对应命名空间递增，写进本册 + 在出处文档补论证，**同一提交**。
> **待定项唯一位置 = 本册的「待定」节**。决出后入册 + 销项，**同一提交**。

---

## 0. 命名空间

| 前缀 | 含义 | 出处（论证在此） | 数量 |
|---|---|---|---|
| `INV-n` | **不变量**：任何实现都不得违反的硬约束 | [`ARCHITECTURE.md`](ARCHITECTURE.md)（子项目 3 创建） | 1 |
| `ADR-n` | **架构决策**：工程层不可逆选择 | [`ARCHITECTURE.md`](ARCHITECTURE.md)（子项目 3 创建） | 6 |
| `B-n` | **边界规矩**：模块/包之间的硬边界 | [`ARCHITECTURE.md`](ARCHITECTURE.md)（子项目 3 创建） | 3 |
| `DS-n` | **UI 反模式**：呈现层禁止事项 | [`DESIGN.md`](DESIGN.md)（子项目 2 创建） | 6 |

> 出处文档在子项目 1 尚不存在。`check-links.mjs` 对其放行并打印 WARN，
> 子项目 2/3 创建对应文件时从白名单移除。

---

## 1. INV — 不变量

| ID | 内容 | 守护层 |
|---|---|---|
| `INV-1` | 所有租户数据必须经 `Shop` 外键可达（`tenantId` 或 `shopId`） | DB 外键约束；**未配** |

---

## 2. ADR — 架构决策

| ID | 内容 | 锁定依据 | 状态 |
|---|---|---|---|
| `ADR-1` | pnpm 8.15.4 + turbo 2.5 workspace，包在 `apps/*` 与 `packages/*` | `pnpm-workspace.yaml` | 已守护 |
| `ADR-2` | api 监听 3001，全局前缀 `api` | `apps/api/src/main.ts` | 未配 |
| `ADR-3` | web 监听 3000，storefront 监听 3100 | `apps/web/package.json` | 未配 |
| `ADR-4` | 持久化用 Prisma 6 + PostgreSQL | `apps/api/prisma/schema.prisma` | 已守护 |
| `ADR-5` | api 全局 ValidationPipe：`whitelist` + `forbidNonWhitelisted` | `apps/api/src/main.ts` | 未配 |
| `ADR-6` | 双设计系统并存：web = Polaris 13，storefront = shadcn/Tailwind v4 | `apps/storefront/package.json` | 已守护 |

---

## 3. B — 边界规矩

| ID | 内容 | 状态 |
|---|---|---|
| `B-1` | `packages/*` 不得 import `apps/*` | `spec/check-boundaries.mjs` |
| `B-2` | `apps/storefront` 不得引入 `@shopify/polaris` | `spec/check-boundaries.mjs`（剥离注释后匹配） |
| `B-3` | `apps/web` 不得引入 tailwind / shadcn / radix | `spec/check-boundaries.mjs` |

---

## 4. DS — UI 反模式

| ID | 内容 | 状态 |
|---|---|---|
| `DS-1` | 业务/布局组件禁止硬编码尺寸（`-[Npx]` 任意值） | `scripts/check-stitch-gate.sh` |
| `DS-2` | 业务/布局组件禁止硬编码十六进制颜色 | `scripts/check-stitch-gate.sh` |
| `DS-3` | 禁止 Material Symbols 图标字体残留（应为 lucide-react） | `scripts/check-stitch-gate.sh` |
| `DS-4` | 禁止 Tailwind CDN 引用 | `scripts/check-stitch-gate.sh` |
| `DS-5` | `apps/storefront/src/app/globals.css` 须含 `--primary` / `--ring` / `--border` 令牌 | `scripts/check-stitch-gate.sh` |
| `DS-6` | 业务组件语义令牌引用次数 ≥ 10 | `scripts/check-stitch-gate.sh` |

---

## 6. 决策 ↔ 实现的已知偏离

> `性质` 列不可省略——*已改主意* 意味着代码是对的、登记册待更新；
> *未实现* 意味着登记册是对的、代码待补。**两者的修复方向完全相反。**

| ID | 在册结论 | 代码现状 | 性质 |
|---|---|---|---|
| `INV-1` | 租户数据经 `Shop` 外键可达 | `MailSubscriber` / `KnowledgeSyncJob` / `ChatStatDaily` 用 `shopDomain: String` 软关联，无外键；`MailSubscriber.shopDomain` 且可空 | 部分实现 |
| `DS-2` | UI 源码禁止 hex 字面量 | 守护面仅覆盖 `apps/storefront/src/components/{business,layout}`；`apps/web` 与 `apps/web/extensions/chatbot` 未纳入 | 部分实现 |

---

## 7. 待定（**唯一位置**）

> 每条必须写明「决出前禁止做什么」——**倾向本身会诱导预埋**，故倾向列一律为 `—`。

| # | 事项 | 倾向 | 决出前禁止 |
|---|---|---|---|
| `TBD-1` | `apps/storefront` 与 `apps/web` 谁是权威商家 UI | — | 禁止在 web 引入 shadcn（`B-3`）；禁止在 storefront 引入 Polaris（`B-2`）；禁止把 storefront 接进 Shopify OAuth |
| `TBD-2` | `apps/web/extensions/chatbot` 的令牌唯一源 | — | 禁止扩大 hex 散点，现值为棘轮上限 |

---

## 附录：格式契约（校验器解析规则）

1. §1–§4、§6、§7 表格首列是 ID，须用**反引号**包裹（使 grep 可区分 ID 与普通文本）。
2. 代码与元语文档中出现的 ID（**词边界**匹配）必须在册 —— 硬失败。
3. `INV-n.m` 按父编号 `INV-n` 查册。
4. 在册但全仓零引用 → **WARN，不红**。
5. 相对路径链接目标必须存在（`check-links.mjs` 白名单除外）。
6. **§1–§4 任一登记表解析为 0 行 = 格式契约破坏 = 红；§6/§7 少于 2 行 = 红。**
````

- [ ] **Step 2: 验证表格可解析**

Run:
```bash
node -e "import('./spec/lib.mjs').then(m=>{const d=m.parseDecisions();console.log(Object.fromEntries(Object.entries(d.byPrefix).map(([k,v])=>[k,v.size])));console.log('§6',d.sections['6'].filter(l=>/^\|\s*\`/.test(l.trim())).length,'§7',d.sections['7'].filter(l=>/^\|\s*\`/.test(l.trim())).length)})"
```
Expected: `{ INV: 1, ADR: 6, B: 3, DS: 6 }` 与 `§6 2 §7 2`

- [ ] **Step 3: Commit**

```bash
git add DECISIONS.md && git commit -m "feat: DECISIONS.md 登记册（INV×1 ADR×6 B×3 DS×6）"
```

---

## Chunk 2：校验框架与四个校验器

### Task 4：`run-all.mjs` + `negative-verify.mjs` 框架 + package.json

框架先行，后续每个校验器任务才能「先写测试」。`run-all.mjs` 按 glob 发现校验器，新增校验器无需改它。

**Files:**
- Create: `spec/run-all.mjs`, `spec/negative-verify.mjs`
- Modify: `package.json`

- [ ] **Step 1: 写 `spec/run-all.mjs`**

```js
#!/usr/bin/env node
// spec/run-all.mjs — 依次执行 spec/check-*.mjs，聚合退出码。
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.includes('--fix')) {
  console.error('✗ 治理只诊断、不自动改。');
  process.exit(2);
}

const SPEC_DIR = dirname(fileURLToPath(import.meta.url));
const checkers = readdirSync(SPEC_DIR).filter((f) => /^check-.*\.mjs$/.test(f)).sort();

let failed = 0;
for (const c of checkers) {
  try {
    execFileSync('node', [join(SPEC_DIR, c)], { stdio: 'inherit' });
  } catch {
    failed++;
  }
}
console.log(`\n== spec 汇总：${checkers.length - failed}/${checkers.length} 校验器通过 ==`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: 写 `spec/negative-verify.mjs`**

两个关键设计：

1. 每个用例注入前先跑一次干净状态，断言退出 0。否则「校验器文件不存在 → node 退出 1」会伪装成测试通过。
2. 用例可带 `expectMatch` 断言输出内容。**只断言退出码不够**——多条规矩共用一个校验器时，退出码 1 无法区分是哪条规矩红的，用例会名不副实。

```js
#!/usr/bin/env node
// spec/negative-verify.mjs — 负向验证：校验器必须能证明自己会红。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib.mjs';

function run(checker) {
  try {
    const out = execFileSync('node', [join(REPO_ROOT, 'spec', checker)], {
      stdio: 'pipe', encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : -1,
      out: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    };
  }
}

/** 临时写入文件，返回还原函数。 */
function tempFile(rel, content) {
  const abs = join(REPO_ROOT, rel);
  const had = existsSync(abs);
  const prev = had ? readFileSync(abs, 'utf8') : null;
  writeFileSync(abs, content);
  return () => { if (had) writeFileSync(abs, prev); else unlinkSync(abs); };
}

/** 在既有文件上做一次字符串替换，返回还原函数。 */
function patchFile(rel, from, to) {
  const abs = join(REPO_ROOT, rel);
  const prev = readFileSync(abs, 'utf8');
  if (!prev.includes(from)) throw new Error(`patchFile: ${rel} 中找不到锚点 ${JSON.stringify(from)}`);
  writeFileSync(abs, prev.replace(from, to));
  return () => writeFileSync(abs, prev);
}

// 各校验器任务往此数组追加用例。
// { name, checker, inject: () => restoreFn, expect: 退出码, expectMatch?: RegExp }
// tempFile / patchFile 在 Task 4 尚无调用者，属预留，勿删。
const CASES = [];

const gitStatus = () =>
  execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' });

console.log('== negative-verify ==');
const before = gitStatus();
let fails = 0;

for (const c of CASES) {
  // 前置：干净状态下该校验器必须绿。
  // 否则「注入后变红」可能只是校验器不存在，测试会伪装通过。
  const clean = run(c.checker);
  if (clean.code !== 0) {
    console.log(`  ✗ ${c.name}: 干净状态下 ${c.checker} 退出 ${clean.code}，应为 0`);
    fails++;
    continue;
  }

  let restore = () => {};
  let res;
  try {
    restore = c.inject();
    res = run(c.checker);
  } catch (e) {
    console.log(`  ✗ ${c.name}: 注入抛错 — ${e.message}`);
    fails++;
    continue;
  } finally {
    restore();   // finally 在 continue 之前执行，抛错路径也能还原
  }

  if (res.code !== c.expect) {
    console.log(`  ✗ ${c.name}: 退出 ${res.code}，期望 ${c.expect}`);
    fails++;
  } else if (c.expectMatch && !c.expectMatch.test(res.out)) {
    console.log(`  ✗ ${c.name}: 退出码对，但输出未匹配 ${c.expectMatch}`);
    console.log(res.out.split('\n').map((l) => `      ${l}`).join('\n'));
    fails++;
  } else {
    console.log(`  ✓ ${c.name}（退出 ${res.code}）`);
  }
}

const after = gitStatus();
if (before !== after) {
  console.log('  ✗ 工作区未还原：git status 前后不一致');
  console.log(`--- 前 ---\n${before}--- 后 ---\n${after}`);
  fails++;
} else {
  console.log('  ✓ 工作区已还原（git status 前后一致）');
}

console.log(`  ${CASES.length - fails} pass / ${fails} fail`);
process.exit(fails ? 1 : 0);
```

- [ ] **Step 3: 改 `package.json`**

在 `scripts` 中新增两项，并把 `test` 串上 spec：

```json
"scripts": {
  "dev": "turbo run dev",
  "build": "turbo run build",
  "lint": "turbo run lint",
  "spec": "node spec/run-all.mjs",
  "spec:negative": "node spec/negative-verify.mjs",
  "test": "node spec/run-all.mjs && turbo run test",
  "db:generate": "pnpm --filter @drsell/api prisma generate",
  "db:migrate": "pnpm --filter @drsell/api prisma migrate deploy"
}
```

- [ ] **Step 4: 验证框架空跑**

Run: `pnpm spec && pnpm spec:negative`
Expected: 两条都退出 0。`spec` 打印 `0/0 校验器通过`；`negative-verify` 打印 `工作区已还原` 与 `0 pass / 0 fail`。

- [ ] **Step 5: Commit**

```bash
git add spec/run-all.mjs spec/negative-verify.mjs package.json
git commit -m "feat(spec): 校验框架（run-all glob 发现 + negative-verify 骨架）"
```

---

### Task 5：`check-ids.mjs` — ID 在册

**Files:**
- Create: `spec/check-ids.mjs`
- Modify: `spec/negative-verify.mjs`（追加 2 个用例）

- [ ] **Step 1: 先写失败的测试——往 `CASES` 追加两条**

```js
  {
    name: 'check-ids 抓未在册 ID',
    checker: 'check-ids.mjs',
    inject: () => tempFile('packages/shared/src/__negverify.ts', '// DS-99 未在册\nexport {};\n'),
    expect: 1,
    expectMatch: /未在册的 DS-99/,
  },
  {
    name: 'check-ids 抓空登记表（§3 B）',
    checker: 'check-ids.mjs',
    // 改章节号 → §3 变成 §33，SECTION_PREFIX 查不到 → B 表解析为 0 行
    inject: () => patchFile('DECISIONS.md', '## 3. B — 边界规矩', '## 33. B — 边界规矩'),
    expect: 1,
    expectMatch: /B 登记表解析为 0 行/,
  },
```

> `expectMatch` 在这里是必需的，不是锦上添花。两条用例都让 `check-ids` 退出 1，
> 没有输出断言就无法证明第二条真的走到了「0 行」分支——它同样会因为
> `B-1`/`B-2`/`B-3` 变成未在册而变红，测试会名不副实。

- [ ] **Step 2: 运行，确认测试失败**

Run: `pnpm spec:negative`
Expected: FAIL，两条都报 `干净状态下 check-ids.mjs 退出 1，应为 0`（文件尚不存在）。**这正是要看到的**——证明测试没有伪装通过。

- [ ] **Step 3: 写 `spec/check-ids.mjs`**

```js
#!/usr/bin/env node
// spec/check-ids.mjs — 代码与元语文档中的 ID 必须在 DECISIONS.md 在册。
import { walk, matchLines, parseDecisions, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-ids — ID 在册');

const { sections, byPrefix } = parseDecisions();

// 格式契约 6：§1–§4 任一登记表 0 行 = 红
for (const [prefix, set] of Object.entries(byPrefix)) {
  if (set.size === 0) r.fail(`${prefix} 登记表解析为 0 行 — 格式契约破坏`);
  else r.pass(`${prefix} 登记 ${set.size} 条`);
}

// 格式契约 6：§6 / §7 各须 ≥2 数据行
for (const [num, label] of [['6', '已知偏离'], ['7', '待定']]) {
  const rows = (sections[num] ?? []).filter((l) => /^\|\s*`/.test(l.trim()));
  if (rows.length < 2) r.fail(`§${num} ${label} 仅 ${rows.length} 行，须 ≥2`);
  else r.pass(`§${num} ${label} ${rows.length} 行`);
}

const REGISTERED = new Set([...byPrefix.INV, ...byPrefix.ADR, ...byPrefix.B, ...byPrefix.DS]);

// 这两个文件字面包含 ID 样本，排除以免自噬
const EXCLUDE_FILES = new Set(['spec/check-ids.mjs', 'spec/negative-verify.mjs']);
// DECISIONS.md 自身含全部 ID，计入引用会让「零引用 WARN」永远不触发
const REF_EXCLUDE = new Set(['DECISIONS.md']);

const files = [
  ...walk('.', { exts: ['.md'], depth: 1 }),
  ...walk('apps', { exts: ['.ts', '.tsx'] }),
  ...walk('packages', { exts: ['.ts'] }),
  ...walk('spec', { exts: ['.mjs'] }),
].filter((f) => !EXCLUDE_FILES.has(f));

const ID_RE = /\b(?:INV|ADR|B|DS)-\d+(?:\.\d+)?\b/;
const ID_RE_G = /\b(?:INV|ADR|B|DS)-\d+(?:\.\d+)?\b/g;

const referenced = new Set();
let bad = 0;
for (const f of files) {
  for (const hit of matchLines(f, ID_RE)) {
    for (const m of hit.text.matchAll(ID_RE_G)) {
      // 格式契约 3：INV-n.m 按父编号查册
      const parent = m[0].replace(/\.\d+$/, '');
      if (!REF_EXCLUDE.has(f)) referenced.add(parent);
      if (!REGISTERED.has(parent)) { r.fail(`${hit.file}:${hit.line} 未在册的 ${m[0]}`); bad++; }
    }
  }
}
if (!bad) r.pass(`扫描 ${files.length} 个文件，无未在册 ID`);

// 格式契约 4：在册但零引用 → WARN，不红
for (const id of [...REGISTERED].sort()) {
  if (!referenced.has(id)) r.warn(`${id} 在册但全仓零引用`);
}

r.done();
```

- [ ] **Step 4: 运行，确认测试通过**

Run: `pnpm spec:negative`
Expected: 两条 `check-ids` 用例 `✓`，工作区已还原。

Run: `node spec/check-ids.mjs`
Expected: 退出 0，并打印 **16 条零引用 WARN**（`INV-1` + `ADR-1`…`ADR-6` + `B-1`…`B-3` + `DS-1`…`DS-6`）。

**这是预期输出，不是缺陷**——格式契约 4 明确「在册但零引用 → WARN，不红」。WARN 数会随后续任务下降：

| 时点 | WARN 数 | 变化 |
|---|---|---|
| Task 5 完成 | 16 | 基线 |
| Task 7 完成 | 13 | `B-1`/`B-2`/`B-3` 被 `check-boundaries.mjs` 引用 |
| 子项目 2 完成 | 7 | `DS-1`…`DS-6` 被 `check-design.mjs` 引用 |
| 子项目 3 完成 | 0 | `INV-1`、`ADR-*` 被 `check-architecture.mjs` 引用 |

- [ ] **Step 5: Commit**

```bash
git add spec/check-ids.mjs spec/negative-verify.mjs
git commit -m "feat(spec): check-ids — ID 在册 + 登记表非空"
```

---

### Task 6：`check-links.mjs` — 元语文档链接

**Files:**
- Create: `spec/check-links.mjs`
- Modify: `spec/negative-verify.mjs`（追加 1 个用例）

- [ ] **Step 1: 先写失败的测试**

```js
  {
    name: 'check-links 抓死链',
    checker: 'check-links.mjs',
    inject: () => patchFile(
      'DECISIONS.md',
      '## 1. INV — 不变量',
      '## 1. INV — 不变量\n\n见 [不存在的文件](NO_SUCH_FILE.md)。\n',
    ),
    expect: 1,
    expectMatch: /NO_SUCH_FILE\.md 目标不存在/,
  },
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm spec:negative`
Expected: 该用例报 `干净状态下 check-links.mjs 退出 1，应为 0`。

- [ ] **Step 3: 写 `spec/check-links.mjs`**

```js
#!/usr/bin/env node
// spec/check-links.mjs — 元语文档的相对路径链接目标必须存在。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { REPO_ROOT, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-links — 元语文档链接');

// 元语文件清单：子项目 2–4 各自追加
const METALANG_FILES = ['DECISIONS.md'];

// 尚未创建的出处文档白名单。移除时机绑定在 spec §5.2 的表里。
const WHITELIST = new Map([
  ['DESIGN.md', '子项目 2'],
  ['ARCHITECTURE.md', '子项目 3'],
  ['DOMAIN.md', '子项目 4'],
  ['FLOWS.md', '子项目 4'],
  ['DEPLOY.md', '子项目 4'],
]);

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
let bad = 0;

for (const f of METALANG_FILES) {
  const abs = join(REPO_ROOT, f);
  if (!existsSync(abs)) { r.fail(`元语文件缺失：${f}`); bad++; continue; }
  readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(LINK_RE)) {
      const target = m[1].split('#')[0].trim();
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      if (WHITELIST.has(target)) {
        r.warn(`${f}:${i + 1} → ${target} 尚未创建（白名单，${WHITELIST.get(target)} 移除）`);
        continue;
      }
      if (!existsSync(resolve(dirname(abs), target))) {
        r.fail(`${f}:${i + 1} → ${target} 目标不存在`);
        bad++;
      }
    }
  });
}
if (!bad) r.pass(`${METALANG_FILES.length} 个元语文件的链接目标全部存在`);
r.done();
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm spec:negative && node spec/check-links.mjs`
Expected: 用例 `✓`；`check-links` 退出 0，打印 4 条白名单 WARN（`ARCHITECTURE.md`×3 + `DESIGN.md`×1，来自 §0 命名空间表）。

- [ ] **Step 5: Commit**

```bash
git add spec/check-links.mjs spec/negative-verify.mjs
git commit -m "feat(spec): check-links — 元语文档链接目标存在"
```

---

### Task 7：`check-boundaries.mjs` — B-1 / B-2 / B-3

**Files:**
- Create: `spec/check-boundaries.mjs`
- Modify: `spec/negative-verify.mjs`（追加 3 个用例，含一条**注释豁免必须不红**的反向用例）

- [ ] **Step 1: 先写失败的测试**

第三条用例是关键：注释里提到 polaris 必须**不红**。缺了它，注释剥离逻辑退化成「什么都匹配」也能全绿。

```js
  {
    name: 'check-boundaries B-1 抓 packages import apps',
    checker: 'check-boundaries.mjs',
    inject: () => tempFile('packages/shared/src/__negverify.ts', "import '@drsell/api';\nexport {};\n"),
    expect: 1,
    expectMatch: /B-1 违反/,
  },
  {
    name: 'check-boundaries B-2 抓 storefront 引 polaris（代码）',
    checker: 'check-boundaries.mjs',
    inject: () => tempFile('apps/storefront/src/__negverify.ts', "import '@shopify/polaris';\nexport {};\n"),
    expect: 1,
    expectMatch: /B-2 违反/,
  },
  {
    name: 'check-boundaries B-2 注释提及 polaris 必须不红',
    checker: 'check-boundaries.mjs',
    inject: () => tempFile('apps/storefront/src/__negverify.ts', '// 参考 @shopify/polaris 的 Card\nexport {};\n'),
    expect: 0,
  },
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm spec:negative`
Expected: 三条都报 `干净状态下 check-boundaries.mjs 退出 1，应为 0`。

- [ ] **Step 3: 写 `spec/check-boundaries.mjs`**

```js
#!/usr/bin/env node
// spec/check-boundaries.mjs — B-1 / B-2 / B-3 硬边界守护。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, walk, matchLines, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-boundaries — 边界规矩');

const RULES = [
  {
    id: 'B-1',
    desc: 'packages/* 不得 import apps/*',
    roots: [{ dir: 'packages', exts: ['.ts', '.json'] }],
    patterns: [/@drsell\/(?:api|web|storefront)/, /\.\.\/\.\.\/apps/],
  },
  {
    id: 'B-2',
    desc: 'apps/storefront 不得引入 @shopify/polaris',
    roots: [{ dir: 'apps/storefront/src', exts: ['.ts', '.tsx', '.css'] }],
    files: ['apps/storefront/package.json'],
    patterns: [/polaris/i],
  },
  {
    id: 'B-3',
    desc: 'apps/web 不得引入 tailwind / shadcn / radix',
    roots: [
      { dir: 'apps/web/app', exts: ['.ts', '.tsx', '.css'] },
      { dir: 'apps/web/components', exts: ['.ts', '.tsx'] },
      { dir: 'apps/web/hooks', exts: ['.ts', '.tsx'] },
      { dir: 'apps/web/lib', exts: ['.ts', '.tsx'] },
    ],
    files: ['apps/web/package.json'],
    patterns: [/tailwind/i, /@radix-ui/, /class-variance-authority/],
  },
];

for (const rule of RULES) {
  const files = [
    ...rule.roots.flatMap((x) => walk(x.dir, { exts: x.exts })),
    ...(rule.files ?? []).filter((f) => existsSync(join(REPO_ROOT, f))),
  ];
  let hits = 0;
  for (const f of files) {
    for (const p of rule.patterns) {
      // strip: true —— 注释里提及不算违反
      for (const h of matchLines(f, p, { strip: true })) {
        r.fail(`${rule.id} 违反：${h.file}:${h.line}  ${h.text}`);
        hits++;
      }
    }
  }
  if (!hits) r.pass(`${rule.id} ${rule.desc} — 扫描 ${files.length} 个文件，0 命中`);
}

r.done();
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm spec:negative && node spec/check-boundaries.mjs`
Expected: 三条用例全 `✓`（含注释豁免那条 expect 0）；`check-boundaries` 退出 0，三条规矩全 PASS。

> 若 `B-2` 意外报 `stat-card.tsx:15`，说明块注释剥离没生效——检查 `stripComments` 的 `.tsx` 分支。

- [ ] **Step 5: Commit**

```bash
git add spec/check-boundaries.mjs spec/negative-verify.mjs
git commit -m "feat(spec): check-boundaries — B-1/B-2/B-3 守护（注释豁免已负向验证）"
```

---

### Task 8：`check-ratchet.mjs` — 欠账棘轮

**Files:**
- Create: `spec/check-ratchet.mjs`, `spec/.unguarded-baseline.json`
- Modify: `spec/negative-verify.mjs`（追加 1 个用例）

**基线不手写。** 用 `--print` 由同一段代码生成，避免口径漂移（spec §5.4）。

- [ ] **Step 1: 先写失败的测试**

```js
  {
    name: 'check-ratchet 抓欠账增加',
    checker: 'check-ratchet.mjs',
    inject: () => {
      const rel = 'spec/.unguarded-baseline.json';
      const prev = readFileSync(join(REPO_ROOT, rel), 'utf8');
      const obj = JSON.parse(prev);
      obj.soft_tenant_models -= 1;   // 把基线压低 → 实测值超标 → 必须红
      writeFileSync(join(REPO_ROOT, rel), JSON.stringify(obj, null, 2) + '\n');
      return () => writeFileSync(join(REPO_ROOT, rel), prev);
    },
    expect: 1,
    expectMatch: /soft_tenant_models: \d+ > 基线/,
  },
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm spec:negative`
Expected: FAIL，报 `干净状态下 check-ratchet.mjs 退出 1，应为 0`（校验器尚不存在，前置断言拦住，`inject` 根本没被调用）。

- [ ] **Step 3: 写 `spec/check-ratchet.mjs`**

```js
#!/usr/bin/env node
// spec/check-ratchet.mjs — 欠账棘轮：已知欠账只能还，不能借。
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { REPO_ROOT, walk, stripComments, parseDecisions, Reporter, rejectFix } from './lib.mjs';

rejectFix();

const BASELINE = join(REPO_ROOT, 'spec/.unguarded-baseline.json');
const HEX = /#[0-9a-fA-F]{6}\b/g;

function countHex(roots) {
  let n = 0;
  for (const root of roots) {
    for (const f of walk(root, { exts: ['.ts', '.tsx', '.js', '.jsx', '.css'] })) {
      const src = stripComments(readFileSync(join(REPO_ROOT, f), 'utf8'), extname(f));
      n += (src.match(HEX) ?? []).length;
    }
  }
  return n;
}

function countUnconfiguredAdr() {
  const { sections } = parseDecisions();
  return (sections['2'] ?? []).filter(
    (l) => /^\|\s*`ADR-\d+`/.test(l.trim()) && l.includes('未配'),
  ).length;
}

function countSoftTenantModels() {
  const s = readFileSync(join(REPO_ROOT, 'apps/api/prisma/schema.prisma'), 'utf8');
  let n = 0;
  for (const m of s.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = m;
    if (name === 'Tenant') continue;          // 租户表自身无需隔离键
    if (!/\btenantId\b/.test(body) && !/\bshopId\b/.test(body)) n++;
  }
  return n;
}

const METRICS = {
  unconfigured_adr: countUnconfiguredAdr,
  hex_literals_web: () => countHex(['apps/web/app', 'apps/web/components']),
  hex_literals_extension: () => countHex(['apps/web/extensions']),
  soft_tenant_models: countSoftTenantModels,
};

const current = Object.fromEntries(Object.entries(METRICS).map(([k, f]) => [k, f()]));

if (process.argv.includes('--print')) {
  process.stdout.write(JSON.stringify(current, null, 2) + '\n');
  process.exit(0);
}

const r = new Reporter('check-ratchet — 欠账棘轮');
if (!existsSync(BASELINE)) {
  r.fail('基线缺失。用 `node spec/check-ratchet.mjs --print > spec/.unguarded-baseline.json` 生成');
  r.done();
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
for (const [k, v] of Object.entries(current)) {
  const b = base[k];
  if (typeof b !== 'number') r.fail(`基线缺少键 ${k}`);
  else if (v > b) r.fail(`${k}: ${v} > 基线 ${b} — 欠账只能还不能借`);
  else if (v < b) r.warn(`${k}: ${v} < 基线 ${b} — 欠账已还，请更新基线`);
  else r.pass(`${k}: ${v}（持平）`);
}
r.done();
```

- [ ] **Step 4: 生成基线**

Run: `node spec/check-ratchet.mjs --print > spec/.unguarded-baseline.json && cat spec/.unguarded-baseline.json`

Expected: 四个键都是数字。健全性核对——不符则先查计数口径，不要直接改基线：

| 键 | 预期 | 依据 |
|---|---|---|
| `unconfigured_adr` | `3` | `ADR-2` / `ADR-3` / `ADR-5` |
| `soft_tenant_models` | `3` | `MailSubscriber` / `KnowledgeSyncJob` / `ChatStatDaily` |
| `hex_literals_web` | `≤ 11` | 未剥离注释时为 11，剥离后可能更少 |
| `hex_literals_extension` | `≤ 8` | 全部在 `drsell-chat.js` |

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm spec:negative && node spec/check-ratchet.mjs`
Expected: 用例 `✓`；`check-ratchet` 退出 0，四项全部「持平」。

- [ ] **Step 6: Commit**

```bash
git add spec/check-ratchet.mjs spec/.unguarded-baseline.json spec/negative-verify.mjs
git commit -m "feat(spec): check-ratchet — 欠账棘轮（只减不增）"
```

---

## Chunk 3：验收

### Task 9：全量验收

**Files:** 无新增，只验证。

- [ ] **Step 1: 正向**

Run: `pnpm spec`
Expected: 退出 0，`4/4 校验器通过`。

- [ ] **Step 2: 负向**

Run: `pnpm spec:negative`
Expected: 退出 0，7 条用例全 `✓`，且 `工作区已还原（git status 前后一致）`。

- [ ] **Step 3: 集成**

Run: `pnpm test`
Expected: 退出 0（spec 全绿后 `turbo run test` 跑 `apps/api` 的 `jest --passWithNoTests`）。

- [ ] **Step 4: `--fix` 被拒**

Run: `node spec/check-ids.mjs --fix; echo "exit=$?"`
Expected: 打印「治理只诊断、不自动改」，`exit=2`。

- [ ] **Step 5: 全仓 ID 可查册**

Run: `git grep -nE '\b(INV|ADR|B|DS)-[0-9]+\b' -- ':!docs' ':!spec/negative-verify.mjs'`
Expected: 每一处命中的 ID 都能在 `DECISIONS.md` 找到。

- [ ] **Step 6: 根目录整洁**

Run: `ls -1 *.md`
Expected: 恰好 `CLAUDE.md`、`DECISIONS.md`、`README.md` 三个。

- [ ] **Step 7: 无残留临时文件**

Run: `ls apps/storefront/src/__negverify.ts packages/shared/src/__negverify.ts 2>&1`
Expected: 两个都 `No such file or directory`。

- [ ] **Step 8: Commit**

```bash
git commit --allow-empty -m "chore: 元语地基验收通过（4 校验器 / 7 负向用例）"
```

---

## 完成判据

全部满足才算完成：

1. `pnpm spec` 退出 0，4/4 校验器通过
2. `pnpm spec:negative` 退出 0，7 条用例全过，工作区还原
3. `pnpm test` 退出 0
4. `DECISIONS.md` 解析出 `INV:1 ADR:6 B:3 DS:6`，§6/§7 各 ≥2 行
5. 根目录恰好 3 个 `.md`
6. 任一校验器传 `--fix` 退出 2

## 交接给子项目 2

子项目 2（`DESIGN.md` + 视觉回归）落地时需要：

- 从 `check-links.mjs` 的 `WHITELIST` 移除 `DESIGN.md`
- 往 `check-links.mjs` 的 `METALANG_FILES` 追加 `'DESIGN.md'`
- `scripts/check-stitch-gate.sh` 重写为 `spec/check-design.mjs`，把 `DS-1`…`DS-6` 写进代码注释——届时 `check-ids` 的 6 条 DS 零引用 WARN 会自动消失
- 视觉回归差异清单落 `DECISIONS.md` §6，每项判定 `已改主意` / `未实现`
- 视觉回归设计摘要见 spec 附录 B
