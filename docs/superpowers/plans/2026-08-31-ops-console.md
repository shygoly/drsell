# 运营台（管理端）实施计划

> **已完成，规矩见 `DECISIONS.md` / `DESIGN.md`。本文件为历史快照。**
>
> **For agentic workers:** REQUIRED: 用 superpowers:subagent-driven-development（有 subagent 时）或 superpowers:executing-plans 执行。步骤用 `- [ ]` 勾选跟踪。
>
> **本文件不是元语。** 完成后按 [[ai-factory-metalang-source]] 的规矩显式降为历史快照；
> 沉淀下来的规矩在 `DECISIONS.md` 与 `DESIGN.md`，不在这里。

**Goal:** 建成 drsell 的第三个面——运营台：一个独立域名、独立令牌、全操作留痕的内部控制台，用来看清每家店的钱与可用期并处置。

**Architecture:** 新增 Next 应用 `apps/ops`，独立 `server_name`，不复用商家端域名与令牌。数据仍走 `apps/api`，新增 `/api/ops/*` 模块，鉴权为 `superadmin` 会话且每个写操作强制审计。订阅状态只镜像 Shopify 的 `AppSubscriptionStatus`，不自造状态词。

**Tech Stack:** Next.js App Router（`apps/ops`）、NestJS 11 + Prisma 6（`apps/api`）、PostgreSQL、原生 CSS 令牌（不引 shadcn/Tailwind——见 `ADR-12`）、`spec/check-*.mjs` 零依赖校验器。

**设计稿：** `design/ops-console/index.html`（本轮产出，含到期队列、三道门、店铺详情、状态机）。

**元语纪律（贯穿全程）：**

- 本计划新增的每条规矩都必须落到 grep / 约定测试 / CI 门禁三选一。**写不出守护方式的条目不许进 `DECISIONS.md`**，只能作为叙述留在 `DESIGN.md` 正文。
- 入册与出处文档补论证必须**同一提交**。
- `DECISIONS.md` 只写代码现在的样子。想做还没做的进 §7 待定。

---

## 前置事实（执行前先读，别踩）

| 事实 | 影响 |
|---|---|
| `pnpm spec` **现在是红的**：`hex_literals_extension: 22 > 基线 8` | `pnpm test` 连带红，本计划任何提交都进不去。Chunk 0 必须先修 |
| `DESIGN.md` / `ARCHITECTURE.md` 尚不存在，在 `spec/check-links.mjs` 白名单里 | 本计划创建 `DESIGN.md` 并从白名单摘除；`ARCHITECTURE.md` 仍留白名单（属子项目 3） |
| 子项目 2 的视觉回归靠 `FALLBACK_*` 种子数据做确定性控制 | 该种子数据已在「接口鉴权」一轮中删除，**原方案失效**。本计划不承接视觉回归，但要把这条记进 §7，免得子项目 2 照着废方案开工 |
| `check-ids.mjs` 扫描面含 `apps/**/*.{ts,tsx}` 与 `spec/**/*.mjs` | `apps/ops` 一旦创建即自动纳入 ID 校验，代码里写 `ADR-11` 前必须先入册 |
| `pnpm-workspace.yaml` 是 `apps/*` | 新建 `apps/ops` 自动进 workspace，无需改配置 |

---

## Chunk 0：先把门禁修绿

红着的门禁等于没有门禁。这一步不属于运营台，但不做就没法开工。

### Task 0: 归还棘轮欠账

**Files:**
- Modify: `apps/web/extensions/chatbot/assets/drsell-chat.js`
- 或 Modify: `spec/.unguarded-baseline.json`（仅在证明确实还不了时）

`apps/web/extensions/chatbot/assets/drsell-chat.js` 现有 21 处 hex 字面量，基线是 8。
增量来自 widget 配置那一轮（`31bc608`）。`TBD-2`（扩展令牌唯一源）尚未决出，
所以**不能**顺手定一套令牌——那是预埋。

- [ ] **Step 1: 确认增量来源**

```bash
git log --oneline -3 -- apps/web/extensions/chatbot/assets/drsell-chat.js
grep -n '#[0-9A-Fa-f]\{6\}' apps/web/extensions/chatbot/assets/drsell-chat.js
```
Expected: 21 行命中，多数是新加的 widget 主题色回退值。

- [ ] **Step 2: 把新增的 hex 收敛回配置注入**

widget 的颜色本来就由 `BotSetting.widgetPrimaryColor` 等字段下发。
把散在 JS 里的字面量改成「从注入配置读，读不到用同一个常量对象兜底」，
常量对象集中在文件顶部一处。目标：命中数回到 **≤ 8**。

- [ ] **Step 3: 验证**

```bash
node spec/run-all.mjs
```
Expected: `check-ratchet` 由 ✗ 转 ✓，汇总 `4/4 校验器通过`。

- [ ] **Step 4: 如果确实还不了**

只有在证明「收敛需要先决出 `TBD-2`」时，才允许把基线抬到实际值，
并**同一提交**在 `DECISIONS.md` §7 的 `TBD-2` 行补一句「基线已于 2026-08-31 由 8 抬至 N，原因：…」。
默认路径是还账，不是抬基线。

- [ ] **Step 5: Commit**

```bash
git add apps/web/extensions/chatbot/assets/drsell-chat.js
git commit -m "fix(extension): collapse widget hex literals back to the ratchet baseline"
```

---

## Chunk 1：决策入册

先入册再写代码。顺序反了的话，`check-ids.mjs` 会在第一个提交就红。

### Task 1: 注册 INV-3 / ADR-11..13 / B-4..5 / TBD-4..5

**Files:**
- Modify: `DECISIONS.md`

- [ ] **Step 1: §1 追加 INV-3**

```markdown
| `INV-3` | 运营台的每一次写操作都必须留下审计记录（操作者、对象店铺、动作、时间） | `spec/check-ops-audit.mjs` |
```

- [ ] **Step 2: §2 追加 ADR-11 / ADR-12 / ADR-13**

```markdown
| `ADR-11` | 运营台是独立应用 `apps/ops`，独立 `server_name` `ops.drsell.szchada.top`；商家端不得存在 `/admin` 或 `/ops` 路由 | `infra/nginx/ops.drsell.szchada.top.conf` + `spec/check-ops-entry.mjs` | 已守护 |
| `ADR-12` | 运营台自持第三套设计令牌（`apps/ops/app/tokens.css`，原生 CSS），不引入 shadcn / radix / polaris | `apps/ops/app/tokens.css` + `spec/check-design.mjs` | 已守护 |
| `ADR-13` | 本地订阅状态只镜像 Shopify `AppSubscriptionStatus` 的六个取值，不自造状态词 | `apps/api/prisma/schema.prisma` + `spec/check-ops-status.mjs` | 已守护 |
```

`ADR-6` 现文为「双设计系统并存」。**不要改它的措辞**——它描述的是当时的事实。
`ADR-12` 是新增的第三套，两条并存即可；若认为 `ADR-6` 已过时，那是 §6 「已改主意」的活，不是就地改写。

- [ ] **Step 3: §3 追加 B-4 / B-5**

```markdown
| `B-4` | `apps/ops` 不得 import `apps/web` / `apps/storefront` | `spec/check-boundaries.mjs` |
| `B-5` | `apps/storefront` / `apps/web` 不得 import `apps/ops` | `spec/check-boundaries.mjs` |
```

两个方向分开登记，因为失败模式不同：`B-4` 防的是视觉混血，`B-5` 防的是运营代码进公网 bundle。

- [ ] **Step 4: §7 追加 TBD-4 / TBD-5**

```markdown
| `TBD-4` | 运营台的角色模型（支持 / 财务 / 只读的权限切分） | — | 决出前禁止在 `apps/ops` 里写任何 role 分支，一律按 superadmin 全权 |
| `TBD-5` | 子项目 2 视觉回归的确定性来源（原方案依赖的 `FALLBACK_*` 种子数据已删除） | — | 禁止为了回归测试把种子数据加回 `apps/storefront/src/lib/api.ts` |
```

`TBD-5` 是本轮发现的既有方案失效，必须落册，否则子项目 2 会照着废方案开工。

- [ ] **Step 5: §0 命名空间表更新数量列**

INV 2→3，ADR 10→13，B 3→5。DS 待 Chunk 2 再动。

- [ ] **Step 6: 验证入册格式**

```bash
node spec/check-ids.mjs
```
Expected: `INV 登记 3 条 / ADR 登记 13 条 / B 登记 5 条`，新 ID 因尚无引用而 WARN（不红）。

- [ ] **Step 7: Commit**

```bash
git add DECISIONS.md
git commit -m "docs(decisions): register ops console invariants, decisions and boundaries"
```

---

## Chunk 2：设计元语

`DESIGN.md` 是 `DS-n` 的出处文档，现在不存在，所以运营台的设计规矩无处安放。这一步创建它。

**范围诚实声明：** 本 Chunk 做子项目 2 的**前半**——令牌源登记、设计规矩、校验器，
外加把早已在册却论证悬空的商户端 `DS-1`..`DS-6` 一并补齐（Task 2 Step 4）。
后半（视觉回归两阶段）不做，原因见 `TBD-5`。
`check-links.mjs` 的 `DESIGN.md` 白名单在 Task 4 摘除——与论证锚点守护同一提交。

### Task 2: 写 DESIGN.md

**Files:**
- Create: `DESIGN.md`
- Modify: `DECISIONS.md`（§0 DS 数量、§4 追加 DS-7..10）

- [ ] **Step 1: 登记全部令牌源（写事实，不写理想）**

`DESIGN.md` 的第一张表是令牌源登记册。现在实际有 **5 个**源：

```markdown
## 1. 令牌源登记

| # | 源文件 | 服务对象 | 体系 | 状态 |
|---|---|---|---|---|
| 1 | `apps/storefront/src/app/globals.css` | 商家平台 + 内嵌 | shadcn / Tailwind v4 | 权威 |
| 2 | `apps/web`（Polaris 默认主题） | Shopify OAuth / webhook 服务 | Polaris 13 | 无自定义令牌 |
| 3 | `apps/web/app/globals.css` 自定义深色块 | `apps/web` 遗留页面 | 手写 | 待清理，见 `ADR-10` |
| 4 | `apps/web/extensions/chatbot/assets/drsell-chat.js` | 店面聊天窗 | 无源，hex 散点 | 见 `TBD-2` |
| 5 | `apps/ops/app/tokens.css` | 运营台 | 原生 CSS 变量 | 权威，见 `ADR-12` |
```

- [ ] **Step 2: 写运营台的令牌与设计意图（叙述段，不给 DS 编号）**

这一节写**为什么**，不写规矩——因为下面几条守不住：

```markdown
## 2. 运营台设计意图

**配色与商家端刻意分家。** 商家端是 Shopify 绿 `#006c49`；运营台是冷灰绿账本纸底
（`--stock #e6ebe7`）加三色信号集：试用靛蓝 `--trial #4b3fa8`、冻结赭黄 `--frozen #a66009`、
终态锈红 `--lost #8e3b2f`。理由：在运营台点下的按钮会影响真实商家的账单，
两个面绝不能被认错。这条由 `DS-8` 机器守护。

**健康状态不给颜色。** `ACTIVE` 用墨色 `--ink`，只有需要处理的状态才拿到信号色，
让眼睛只被该处理的行拽走。**这条守不住**——写不出稳定的 grep，故不给 DS 编号，
仅作为评审时的口径。

**主元件是跑道条，不是状态点。** 驱动运营动作的三件事全是时间：试用剩余、
计费周期结束、欠费后的 30 天解冻窗口。所以行的主体是「还剩多少路」，状态签退到旁边做注解。

**字体三角色。** 显示 Bricolage Grotesque / 正文 Instrument Sans / 数据 Martian Mono，
中文统一回落 `PingFang SC, Hiragino Sans GB, Microsoft YaHei`。
```

- [ ] **Step 3: 写 DS-7..10（每条都能 grep）**

```markdown
## 3. DS — UI 反模式（运营台部分）

| ID | 内容 | 守护 |
|---|---|---|
| `DS-7` | `apps/ops` 源码禁止 hex 字面量，颜色只能来自 `tokens.css` | `spec/check-design.mjs` |
| `DS-8` | ops 令牌的 hex 值集合与 storefront 令牌的 hex 值集合交集必须为空 | `spec/check-design.mjs` |
| `DS-9` | `tokens.css` 须在 `:root`、`@media (prefers-color-scheme: dark)`、`:root[data-theme="dark"]` 三处定义**同一套**令牌名 | `spec/check-design.mjs` |
| `DS-10` | `apps/ops` 不得引入 shadcn / radix / polaris / tailwind | `spec/check-boundaries.mjs` |
```

`DS-9` 守的是三态主题不塌成两态——未加 `data-theme` 的系统默认态是最容易漏的一态。

- [ ] **Step 4: 补商户端 DS-1..DS-6 的论证（本计划的补洞项）**

`DS-1`..`DS-6` 早已在册、`scripts/check-stitch-gate.sh` 也早在跑，但 `DECISIONS.md` §0 声明的
出处是 `DESIGN.md` —— 一个不存在的文件。**规矩在跑，论证无处可查。**
`DESIGN.md` 一旦创建就必须把这个洞一起补上，否则只是把悬空的链接变成了一个查不到东西的文件。

每条一个可定位锚点（格式见 Step 5），论证素材现成：`docs/stitch-to-shadcn-plan.md` 第 10 章
就是这六条的来源，`scripts/check-stitch-gate.sh` 顶部注释也指着它。

```markdown
## 4. DS — UI 反模式（商家端部分）

> 六条全部源自同一件事：Stitch 导出的 HTML 是**绝对像素 + 色值字面量 + 外部 CDN**，
> 照搬进 React 就会在项目里长出第二套设计事实来源。守护面是
> `apps/storefront/src/components/{business,layout}`，守护方 `scripts/check-stitch-gate.sh`。

### `DS-1` 禁硬编码尺寸

Stitch 导出里布局尺寸全是绝对像素（`max-w-[360px]` / `rounded-[28px]` / `p-[17px]`）。
留着有两个后果：组件换断点就裂；`rounded-[28px]` 绕开 `--radius`，改令牌改不动它。
**怎么被抓住**：`grep -rn -- '--\[[0-9]\+px\]'` 命中即红。

### `DS-2` 禁硬编码十六进制颜色

同源问题，Stitch 用 `bg-[#FEF7FF]` 这类字面量。留着等于第二套配色事实来源。
**怎么被抓住**：`grep -rn -- '#[0-9A-Fa-f]\{6\}'`（剥注释后）命中即红。
**已知偏离**：守护面不含 `apps/web` 与 `apps/web/extensions/chatbot`，见 `DECISIONS.md` §6。

### `DS-3` 禁 Material Symbols 残留

Stitch 用 Material Symbols 图标字体，项目定的是 `lucide-react`（P4 组件映射表）。
残留会多拉一个外部字体请求，且在 Shopify Admin iframe 的 CSP 下可能直接被拦。
**怎么被抓住**：`grep -rni 'material-symbols'` 命中即红。

### `DS-4` 禁 Tailwind CDN 引用

Stitch 的 HTML 靠 `cdn.tailwindcss.com` 起效。进生产等于运行时编译 CSS 加一个外部依赖，
同样撞 CSP。
**怎么被抓住**：`grep -rn 'cdn.tailwindcss.com'` 命中即红。

### `DS-5` globals.css 必须含 `--primary` / `--ring` / `--border`

这三个是 shadcn 组件库的必需令牌，缺任一则 Button / Input / Card 回落到未定义色。
这条守的不是「写得好不好」，是「令牌文件被误删或改名」。
**怎么被抓住**：`grep -q` 任一缺失即红。

### `DS-6` 业务组件语义令牌引用次数 ≥ 10

反向指标，不是独立规矩：如果业务组件几乎不引用 `bg-primary` / `text-muted-foreground` 这类
语义令牌，说明转化时又退回了任意值——它是 `DS-1` / `DS-2` 的漏网检测。
**怎么被抓住**：计数 < 10 时门禁 WARN。
```

- [ ] **Step 5: 写附录格式契约**

照 `DECISIONS.md` 附录的写法，声明：

```markdown
## 附录：格式契约（校验器解析规则）

1. §1 令牌源登记表首列是序号，第二列是仓库相对路径，路径必须存在。
2. §3 / §4 的 DS 论证锚点格式固定为 `### \`DS-n\``（三级标题 + 反引号包裹 ID）。
3. §1 解析为 0 行 = 格式契约破坏 = 红。
4. `DECISIONS.md` §4 在册的每个 `DS-n`，本文件必须有对应锚点——见 `DECISIONS.md` 附录第 7 条。
```

- [ ] **Step 6: `DECISIONS.md` 追加格式契约 7（根因补丁）**

现有五条格式契约里没有「出处文档必须包含该 ID 的论证」。所以 `DESIGN.md` 一创建、
白名单一摘，`check-links` 只会查「文件存在吗」——存在就绿，论证缺不缺它不知道。
补这一条，一次堵两个洞：现在逼着补 `DS-1`..`DS-6`；子项目 3 建 `ARCHITECTURE.md` 时
`INV-*` / `ADR-*` / `B-*` 共 20 条也躲不掉。

```markdown
7. §0 声明的出处文档一旦存在，必须为该命名空间**每个在册 ID** 提供可定位论证锚点
   （形如 `### \`DS-3\``）。缺任一 = 红。出处文档仍在 `check-links.mjs` 白名单内时跳过。
```

- [ ] **Step 7: 同步 DECISIONS.md 其余部分**

- §4 追加 `DS-7`..`DS-10` 四行（内容与 `DESIGN.md` §3 一致）
- §0 的 DS 数量 6→10
- §0 的 DS 行删掉「（子项目 2 创建）」——文件已经存在，这句话变成假事实
- §0 下方那段「出处文档在子项目 1 尚不存在，`check-links.mjs` 对其放行并打印 WARN」
  改为只描述 `ARCHITECTURE.md` 等剩余四份

- [ ] **Step 8: Commit**

```bash
git add DESIGN.md DECISIONS.md
git commit -m "docs(design): create DESIGN.md with merchant + ops rules, require provenance anchors"
```

### Task 3: 写 spec/check-design.mjs

**Files:**
- Create: `spec/check-design.mjs`
- Modify: `spec/check-links.mjs`（摘 `DESIGN.md` 白名单）
- Modify: `spec/check-boundaries.mjs`（加 `B-4` / `B-5` / `DS-10`）

- [ ] **Step 1: 先写失败用例**

往 `spec/negative-verify.mjs` 的 `CASES` 数组里追加，用它已有的 `tempFile` / `patchFile` 助手
（该文件已在 `check-ids.mjs` 的 `EXCLUDE_FILES` 里，用例中可以安全出现 ID 字面量）：

```js
{
  name: 'check-design DS-7 抓 ops 源码 hex',
  checker: 'check-design.mjs',
  inject: () => tempFile('apps/ops/app/__negverify.tsx', 'export const c = "#ff0000";\n'),
  expect: 1,
  expectMatch: /DS-7 违反/,
},
{
  name: 'check-design DS-7 注释里的 hex 必须不红',
  checker: 'check-design.mjs',
  inject: () => tempFile('apps/ops/app/__negverify.tsx', '// 原稿是 #ff0000\nexport {};\n'),
  expect: 0,
},
{
  name: 'check-design DS-8 抓两套令牌撞色',
  checker: 'check-design.mjs',
  inject: () => patchFile('apps/ops/app/tokens.css', '--ink:     #14211e', '--ink:     #006c49'),
  expect: 1,
  expectMatch: /共用色值/,
},
{
  name: 'check-design DS-9 抓暗色块缺令牌',
  checker: 'check-design.mjs',
  inject: () => patchFile('apps/ops/app/tokens.css', '  --lost:    #e08878;\n', ''),
  expect: 1,
  expectMatch: /暗色块缺令牌/,
},
```

注意第二条：注释里提 hex **必须不红**。只验证「能红」的负向测试会漏掉误报，
`check-boundaries` 的 `B-2` 就配了这么一条正向对照，照做。

- [ ] **Step 2: 实现 check-design.mjs**

复用 `spec/lib.mjs` 的 `walk` / `matchLines` / `Reporter` / `rejectFix`，零依赖，与既有校验器同构：

```js
#!/usr/bin/env node
// spec/check-design.mjs — DS-7 / DS-8 / DS-9 设计令牌守护。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, walk, matchLines, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-design — 设计令牌');

const OPS_TOKENS = 'apps/ops/app/tokens.css';
const SF_TOKENS = 'apps/storefront/src/app/globals.css';

/** 取 `--name: #hex` 的令牌名→hex 映射 */
function tokens(rel) {
  let src;
  try { src = readFileSync(join(REPO_ROOT, rel), 'utf8'); } catch { return null; }
  const map = new Map();
  for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
    map.set(m[1], m[2].toLowerCase());
  }
  return map;
}

// DS-7：ops 源码禁止 hex（tokens.css 是唯一豁免）
const opsFiles = walk('apps/ops', { exts: ['.ts', '.tsx', '.css'] })
  .filter((f) => f !== OPS_TOKENS);
let ds7 = 0;
for (const f of opsFiles) {
  for (const h of matchLines(f, /#[0-9a-fA-F]{6}\b/, { strip: true })) {
    r.fail(`DS-7 违反：${h.file}:${h.line}  ${h.text}`);
    ds7++;
  }
}
if (!ds7) r.pass(`DS-7 ops 源码无 hex 字面量 — 扫描 ${opsFiles.length} 个文件`);

// DS-8：两套令牌 hex 值不得相交
const ops = tokens(OPS_TOKENS);
const sf = tokens(SF_TOKENS);
if (!ops) r.fail(`DS-8 无法读取 ${OPS_TOKENS}`);
else if (!sf) r.fail(`DS-8 无法读取 ${SF_TOKENS}`);
else {
  const shared = [...new Set(ops.values())].filter((v) => new Set(sf.values()).has(v));
  if (shared.length) r.fail(`DS-8 违反：两套令牌共用色值 ${shared.join(', ')}`);
  else r.pass(`DS-8 ops(${ops.size}) 与 storefront(${sf.size}) 令牌色值零交集`);
}

// DS-9：三态主题必须定义同一套令牌名
if (ops) {
  const src = readFileSync(join(REPO_ROOT, OPS_TOKENS), 'utf8');
  const blocks = {
    light: src.match(/:root\s*\{([^}]*)\}/),
    media: src.match(/@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*?\{[\s\S]*?:root[^{]*\{([^}]*)\}/),
    stamp: src.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/),
  };
  const names = (m) => new Set([...(m?.[1] ?? '').matchAll(/(--[a-z0-9-]+)\s*:/g)].map((x) => x[1]));
  const [L, M, S] = [names(blocks.light), names(blocks.media), names(blocks.stamp)];
  const missing = [...L].filter((n) => !M.has(n) || !S.has(n));
  if (!L.size) r.fail('DS-9 违反：tokens.css 缺 :root 亮色定义');
  else if (!M.size || !S.size) r.fail('DS-9 违反：缺 prefers-color-scheme 或 data-theme="dark" 块');
  else if (missing.length) r.fail(`DS-9 违反：暗色块缺令牌 ${missing.join(', ')}`);
  else r.pass(`DS-9 三态主题令牌名一致（${L.size} 个）`);
}

r.done();
```

- [ ] **Step 3: 扩 check-boundaries.mjs**

按既有 `RULES` 数组的形状追加三条：

```js
{
  id: 'B-4',
  desc: 'apps/ops 不得 import apps/web / apps/storefront',
  roots: [{ dir: 'apps/ops', exts: ['.ts', '.tsx'] }],
  files: ['apps/ops/package.json'],
  patterns: [/@drsell\/(?:web|storefront)/, /\.\.\/\.\.\/(?:web|storefront)/],
},
{
  id: 'B-5',
  desc: 'apps/storefront / apps/web 不得 import apps/ops',
  roots: [
    { dir: 'apps/storefront/src', exts: ['.ts', '.tsx'] },
    { dir: 'apps/web/app', exts: ['.ts', '.tsx'] },
  ],
  patterns: [/@drsell\/ops/, /\.\.\/\.\.\/ops/],
},
{
  id: 'DS-10',
  desc: 'apps/ops 不得引入 shadcn / radix / polaris / tailwind',
  roots: [{ dir: 'apps/ops', exts: ['.ts', '.tsx', '.css'] }],
  files: ['apps/ops/package.json'],
  patterns: [/@radix-ui/, /polaris/i, /tailwind/i, /class-variance-authority/],
},
```

- [ ] **Step 4: 全量验证**

```bash
node spec/run-all.mjs && node spec/negative-verify.mjs
```
Expected: 5/5 校验器通过；负向验证确认新校验器能红。
`DESIGN.md` 白名单**先不摘**——摘除与论证锚点守护必须同一提交（Task 4），
否则中间会出现「文件已存在但论证不受守护」的窗口。

- [ ] **Step 5: Commit**

```bash
git add spec/
git commit -m "test(spec): guard ops design tokens and app boundaries"
```

### Task 4: 论证锚点守护（格式契约 7）

**Files:**
- Modify: `spec/check-links.mjs`
- Modify: `spec/negative-verify.mjs`

规矩已经写进 `DECISIONS.md` 附录第 7 条（Task 2 Step 6），这一步给它装守护。
**没有守护的格式契约就是一句建议**——按元语规矩，守不住的条目本该被删，所以这两步必须同一提交。

- [ ] **Step 1: 先写负向用例**

往 `spec/negative-verify.mjs` 的 `CASES` 追加：

```js
{
  name: '格式契约 7：DESIGN.md 缺 DS 论证锚点应红',
  checker: 'check-links.mjs',
  inject: () => patchFile('DESIGN.md', '### `DS-3`', '### DS-3 缺反引号'),
  expect: 1,
  expectMatch: /缺论证锚点：DS-3/,
},
{
  name: '格式契约 7：正文提及 ID 不算论证锚点',
  checker: 'check-links.mjs',
  inject: () => patchFile('DESIGN.md', '### `DS-3`', '这里提一句 `DS-3`\n\n### DS-3'),
  expect: 1,
  expectMatch: /缺论证锚点：DS-3/,
},
```

第二条是关键：`expectMatch` 让「红了」和「因为对的原因红了」区分开。
既有 CASES 每条都带 `expectMatch`，照做。

锚点少一个就必须红。先跑一次确认它**现在是绿的**（因为守护还没写），
这一步的意义就是把「还没守护」这件事变成可见的失败。

- [ ] **Step 2: 扩 check-links.mjs**

`check-links.mjs` 现在只做链接存在性。加第二段：从 `parseDecisions()` 拿 §0 的
前缀 → 出处文件映射，逐前缀检查论证锚点。

既有 import 追加 `parseDecisions`（`readFileSync` / `existsSync` / `join` 已在文件里）：

```js
import { REPO_ROOT, parseDecisions, Reporter, rejectFix } from './lib.mjs';

// ── 格式契约 7：出处文档必须为每个在册 ID 提供论证锚点 ──
const { sections, byPrefix } = parseDecisions();

// §0 的表：| `INV-n` | 含义 | [`ARCHITECTURE.md`](ARCHITECTURE.md)（…） | 2 |
const PROVENANCE = new Map();
for (const line of sections['0'] ?? []) {
  const m = line.match(/^\|\s*`([A-Z]+)-n`\s*\|[^|]*\|\s*\[`([^`]+)`\]/);
  if (m) PROVENANCE.set(m[1], m[2]);
}
if (!PROVENANCE.size) r.fail('格式契约 7：§0 命名空间表解析为 0 行');

for (const [prefix, file] of PROVENANCE) {
  if (WHITELIST.has(file)) continue;            // 尚未创建，Task 2 之前的状态
  const abs = join(REPO_ROOT, file);
  if (!existsSync(abs)) { r.fail(`${prefix} 出处 ${file} 不存在且不在白名单`); continue; }
  const md = readFileSync(abs, 'utf8');
  const missing = [...byPrefix[prefix]].filter(
    (id) => !new RegExp(`^#{2,4}\\s+\`${id}\`\\s*$`, 'm').test(md),
  );
  if (missing.length) r.fail(`${file} 缺论证锚点：${missing.sort().join(', ')}`);
  else r.pass(`${file} 为 ${byPrefix[prefix].size} 个 ${prefix} 提供了论证锚点`);
}
```

锚点用**正则整行匹配**而非 `includes`，否则正文里随手提一句 `` `DS-3` `` 就能骗过守护。

- [ ] **Step 3: 摘 DESIGN.md 白名单**

`WHITELIST` 删掉 `['DESIGN.md', '子项目 2']`，保留其余四条
（`ARCHITECTURE.md` / `DOMAIN.md` / `FLOWS.md` / `DEPLOY.md`）。
摘掉的瞬间，`DESIGN.md` 就要为在册的 10 个 `DS-n` 全部提供锚点，缺一个就红。

- [ ] **Step 4: 验证**

```bash
node spec/run-all.mjs && node spec/negative-verify.mjs
```
Expected:
- `check-links` 报 `DESIGN.md 为 10 个 DS 提供了论证锚点`；
- `ARCHITECTURE.md` 等仍在白名单，跳过不红；
- 负向用例现在**能红**了。

- [ ] **Step 5: Commit**

```bash
git add spec/check-links.mjs spec/negative-verify.mjs
git commit -m "test(spec): enforce provenance anchors for every registered ID"
```

---

## Chunk 3：骨架与入口隔离

### Task 5: 建 apps/ops

**Files:**
- Create: `apps/ops/package.json`、`apps/ops/next.config.ts`、`apps/ops/tsconfig.json`
- Create: `apps/ops/app/tokens.css`、`apps/ops/app/layout.tsx`、`apps/ops/app/page.tsx`

- [ ] **Step 1: 令牌先落地**

从 `design/ops-console/index.html` 的 `:root` / 暗色两块抽出 `tokens.css`，
三态结构照抄（`:root` + `@media (prefers-color-scheme: dark)` 下的 `:root:not([data-theme="light"])` + `:root[data-theme="dark"]`）。
**先跑一次 `node spec/check-design.mjs`**，确认 `DS-8` / `DS-9` 绿了再往下写组件——
令牌是这套 UI 的地基，地基不合规后面全要返工。

- [ ] **Step 2: 最小页面**

`app/page.tsx` 只渲染一句「未登录」。不要一上来搬设计稿——先让边界与门禁跑通。

- [ ] **Step 3: 验证**

```bash
pnpm --filter @drsell/ops build && node spec/run-all.mjs
```
Expected: build 通过；`check-boundaries` 报 `B-4` / `B-5` / `DS-10` 扫描到文件且 0 命中。

- [ ] **Step 4: Commit**

```bash
git add apps/ops pnpm-lock.yaml
git commit -m "feat(ops): scaffold the ops console app with its own token source"
```

### Task 6: 独立域名与端口

**Files:**
- Create: `infra/nginx/ops.drsell.szchada.top.conf`
- Modify: `scripts/deploy-mvp.sh`
- Create: `spec/check-ops-entry.mjs`

- [ ] **Step 1: nginx**

照 `drsell.szchada.top.conf` 的结构写新 vhost，upstream 指 `127.0.0.1:5013`。
**不要**在 `drsell.szchada.top.conf` 里加 `/ops` location——那正是 `ADR-11` 禁止的。
`/admin` 现在指向 web:5012 的那段一并删除。

- [ ] **Step 2: deploy 脚本**

新增 `drsell-ops` 的 pm2 条目，`PORT=5013 HOSTNAME=127.0.0.1`。

- [ ] **Step 3: 写 check-ops-entry.mjs**

守 `ADR-11` 的两个方向：

```js
// 正向：ops vhost 必须存在且声明 ops.drsell.szchada.top
// 反向：商家端 vhost 不得出现 location ^~ /ops 或 ^~ /admin
```

- [ ] **Step 4: 验证 + Commit**

```bash
node spec/run-all.mjs   # 累计 6 个校验器
git add infra/nginx scripts/deploy-mvp.sh spec/check-ops-entry.mjs
git commit -m "feat(infra): serve the ops console from its own server_name"
```

### Task 7: 鉴权与审计骨架

**Files:**
- Create: `apps/api/src/ops/ops.module.ts`、`ops.controller.ts`、`ops.service.ts`
- Create: `apps/api/src/ops/audit.decorator.ts`、`audit.interceptor.ts`
- Modify: `apps/api/prisma/schema.prisma`（`AuditLog`）
- Create: `apps/api/prisma/migrations/20260902090000_audit_log/migration.sql`
- Create: `spec/check-ops-audit.mjs`
- Create: `apps/api/src/ops/ops.controller.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('非 superadmin 访问 /api/ops/* 一律 403', async () => { /* ... */ });
it('每个非 @Get handler 都带 @Audit()', () => { /* 反射元数据遍历，见 Step 4 */ });
it('写操作成功后落一条 AuditLog', async () => { /* ... */ });
it('写操作抛错时也落一条 AuditLog（结果为 failed）', async () => { /* ... */ });
```

第四条是关键：只在成功路径记账的审计等于没有审计。

- [ ] **Step 2: AuditLog 模型**

```prisma
/// 运营台操作留痕。INV-3 的落地载体。
model AuditLog {
  id         String   @id @default(cuid())
  actorId    String
  actorEmail String
  action     String
  shopDomain String?
  targetId   String?
  payload    Json?
  result     String   @default("ok")
  ip         String?
  createdAt  DateTime @default(now())

  @@index([shopDomain, createdAt])
  @@index([actorId, createdAt])
}
```

- [ ] **Step 3: 拦截器**

`@Audit('shop.extend_freeze')` 标注动作名，拦截器在 handler 前后各写一次（`pending` → `ok` / `failed`）。

- [ ] **Step 4: 写 check-ops-audit.mjs（守 INV-3）**

grep `apps/api/src/ops/*.controller.ts`：每个 `@Post` / `@Put` / `@Patch` / `@Delete` 装饰器
的**前一个非空行**必须是 `@Audit(`。这是约定测试而非类型检查，但它能抓住「新加了个写接口忘了标注」——
这正是 `INV-3` 最可能被违反的方式。

- [ ] **Step 5: 验证 + Commit**

```bash
pnpm --filter @drsell/api test && node spec/run-all.mjs   # 累计 7 个校验器
git add apps/api/src/ops apps/api/prisma spec/check-ops-audit.mjs
git commit -m "feat(api): ops module with superadmin guard and mandatory audit trail"
```

---

## Chunk 4：账号与店铺（只读）

### Task 8: 账号检索与店铺反查

**Files:**
- Modify: `apps/api/src/ops/ops.service.ts`、`ops.controller.ts`
- Create: `apps/ops/app/accounts/page.tsx`、`apps/ops/app/accounts/[id]/page.tsx`

- [ ] **Step 1: 写失败测试**

```ts
it('按邮箱前缀检索账号', async () => { /* ... */ });
it('按店铺域名反查所属账号', async () => { /* 支持工单进来时只有域名 */ });
it('账号详情返回名下店铺、角色、哪家是计费店', async () => { /* ... */ });
```

- [ ] **Step 2: 实现 `GET /api/ops/accounts` 与 `GET /api/ops/accounts/:id`**

名下店铺依赖 `Membership` 表。**若多店计划（`2026-08-31-multi-store-membership.md`）尚未执行**，
这里退化为「按 `Shop.tenantId` 聚合」，并在 `DECISIONS.md` §6 记一条偏离，
性质为 *未实现*。不要在 ops 里另建一套归属关系——那会制造第二个事实来源。

- [ ] **Step 3: 前端两屏**

照设计稿的表格密度：Martian Mono 放域名与数字，`tabular-nums` 全程。

- [ ] **Step 4: 验证 + Commit**

```bash
pnpm --filter @drsell/api test && pnpm --filter @drsell/ops build && node spec/run-all.mjs
git add apps/api/src/ops apps/ops/app/accounts
git commit -m "feat(ops): account search and shop-to-account lookup"
```

### Task 9: 店铺列表与详情

**Files:**
- Create: `apps/ops/app/shops/page.tsx`、`apps/ops/app/shops/[domain]/page.tsx`
- Create: `apps/ops/app/components/runway.tsx`

- [ ] **Step 1: 跑道条组件**

设计稿里的签名元件。入参 `{ windowStart, windowEnd, now, state }`，
内部只算百分比，**不做日期文案格式化**（那是调用方的事，避免组件长成两个职责）。

- [ ] **Step 2: 店铺详情三栏**

计费 / 本周期用量 / 可用期，照设计稿。用量数据这一步先接 `ChatStatDaily`（只有对话数），
AI 解决数与坐席数留空并显示「未计量」——**不要编数**。计量在 Chunk 5 补。

- [ ] **Step 3: 验证 + Commit**

---

## Chunk 5：订阅镜像与可用期

### Task 10: 状态镜像（ADR-13）

**Files:**
- Modify: `apps/api/prisma/schema.prisma`（`Subscription`）
- Create: `apps/api/src/ops/subscription-mirror.service.ts`
- Create: `spec/check-ops-status.mjs`
- Create: `apps/api/src/ops/subscription-mirror.service.spec.ts`

Shopify 的六个取值：`PENDING` / `ACTIVE` / `FROZEN` / `DECLINED` / `EXPIRED` / `CANCELLED`。
三个终态：`DECLINED` / `EXPIRED` / `CANCELLED`。

- [ ] **Step 1: 写失败测试**

```ts
it('镜像写入的 status 只能是六个取值之一', async () => { /* ... */ });
it('从终态不允许再迁出', async () => { /* CANCELLED → ACTIVE 应抛错 */ });
it('ACTIVE → FROZEN 记录转冻结时刻，解冻截止 = 转冻结 + 30 天', async () => { /* ... */ });
it('FROZEN → ACTIVE 清空解冻截止', async () => { /* ... */ });
```

- [ ] **Step 2: schema 加字段**

```prisma
  /// 镜像 Shopify AppSubscriptionStatus：PENDING ACTIVE FROZEN DECLINED EXPIRED CANCELLED
  status        String
  frozenAt      DateTime?
  /// frozenAt + 30 天。Shopify 在此之前恢复付款可自动解冻，逾期进终态。
  unfreezeBy    DateTime?
  currentPeriodEnd DateTime?
```

- [ ] **Step 3: 写 check-ops-status.mjs（守 ADR-13）**

解析 schema 注释里那行枚举清单，与 `apps/api/src/ops/**` 里出现的大写状态字面量求差集。
出现清单外的状态字面量 → 红。这守的是「有人顺手加了个 `SUSPENDED`」。

- [ ] **Step 4: 迁移 + 验证 + Commit**

### Task 11: 到期队列

**Files:**
- Modify: `apps/api/src/ops/ops.service.ts`
- Create: `apps/ops/app/page.tsx`（首页即队列）

- [ ] **Step 1: 写失败测试**

```ts
it('队列按剩余天数升序，不分状态混排', async () => { /* ... */ });
it('试用最后 3 天、解冻期内、计费周期 7 天内 —— 三类都进队列', async () => { /* ... */ });
it('终态店铺不进队列', async () => { /* ... */ });
```

「不分状态混排」是设计稿的核心主张：运营关心的是先后，不是分类。

- [ ] **Step 2: 实现 + 前端**

- [ ] **Step 3: 验证 + Commit**

---

## Chunk 6：处置动作

每个动作都是写操作，因此每个都要 `@Audit()`，由 `check-ops-audit.mjs` 兜底。

### Task 12: 六个动作

**Files:**
- Modify: `apps/api/src/ops/ops.controller.ts`、`ops.service.ts`
- Create: `apps/ops/app/shops/[domain]/actions.tsx`

| 动作 | 端点 | 备注 |
|---|---|---|
| 发催缴提醒 | `POST /api/ops/shops/:domain/dunning` | 外发动作，需二次确认 |
| 延长解冻期 | `POST /api/ops/shops/:domain/extend-freeze` | 只延我方宽限，不改 Shopify 侧 |
| 改指定计费店 | `POST /api/ops/shops/:domain/billing-shop` | 依赖多店计划的 `isBillingShop` |
| 重跑同步 | `POST /api/ops/shops/:domain/resync` | 幂等 |
| 代登录 | `POST /api/ops/shops/:domain/impersonate` | 限时 token + 顶部常驻横幅 |
| 停用聊天窗 | `POST /api/ops/shops/:domain/disable-widget` | 唯一危险动作，可撤销 |

- [ ] **Step 1: 逐个 TDD**

每个动作三条测试：成功路径、失败路径也落审计、非 superadmin 403。

- [ ] **Step 2: 文案纪律**

按钮说的就是按下去会发生的事。「发催缴提醒」的成功提示是「已发送催缴提醒」，不是「操作成功」。
危险动作不做二次确认弹窗，做可撤销。

- [ ] **Step 3: 代登录的额外约束**

- token 有效期 ≤ 30 分钟且单店铺范围
- 进入与退出各写一条审计
- 商家端顶部常驻横幅，横幅本身不可关闭

- [ ] **Step 4: 验证 + Commit**

---

## 收尾检查

- [ ] `pnpm test` 全绿（`spec` 8 个校验器 + 各包测试）

  既有 4：`check-boundaries` / `check-ids` / `check-links` / `check-ratchet`
  新增 4：`check-design`（Task 3）/ `check-ops-entry`（Task 6）/ `check-ops-audit`（Task 7）/ `check-ops-status`（Task 10）
- [ ] `node spec/negative-verify.mjs` 确认新增校验器**能红**——只会通过的校验器是装饰
- [ ] `apps/ops` / `apps/api` / `apps/storefront` / `apps/web` 四个 build 全过
- [ ] `DECISIONS.md` §0 数量列与各节实际行数一致
- [ ] `check-links.mjs` 白名单只剩 `ARCHITECTURE.md` / `DOMAIN.md` / `FLOWS.md` / `DEPLOY.md`，且 `DESIGN.md` 的 10 个 `DS-n` 论证锚点全在
- [ ] 手测四条路径：①按域名反查账号 ②队列点进店铺详情 ③延长解冻期后审计有记录 ④代登录进出各一条审计
- [ ] 更新 `docs/MVP_SCOPE.md`：「Yudao 式 `/admin` 运营后台」从「明确不做」移出，改为「已由 `apps/ops` 实现」
- [ ] **把本文件降为历史快照**：顶部加一行「已完成，规矩见 `DECISIONS.md` / `DESIGN.md`」

---

## 与其他计划的关系

| 计划 | 关系 |
|---|---|
| `2026-08-31-multi-store-membership.md` | Chunk 4 的「名下店铺」与 Chunk 6 的「改指定计费店」依赖它的 `Membership` 与 `isBillingShop`。**建议先执行多店计划**；若先做运营台，按 Task 8 Step 2 的退化方案并记 §6 偏离 |
| 子项目 2（视觉回归） | 本计划完成其前半（`DESIGN.md` + 令牌校验器）。后半因 `TBD-5` 阻塞 |
| 子项目 3（`ARCHITECTURE.md`） | 本计划新增的 `ADR-11..13` / `B-4..5` / `INV-3` 的论证暂留本文件，子项目 3 创建 `ARCHITECTURE.md` 时迁入并从 `check-links.mjs` 白名单摘除 `ARCHITECTURE.md` |
