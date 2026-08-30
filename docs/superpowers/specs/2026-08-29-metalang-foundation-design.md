# 元语地基 — Design Spec

**Date:** 2026-08-29
**Status:** Approved
**Reference:** `~/projects/ai-factory/templates/{ARCHITECTURE,DESIGN,DECISIONS}.md`（元语模板）· `~/projects/ai-factory/spec/check-*.mjs`（校验器范式）
**子项目:** 全仓元语分解的第 1 项（共 4 项，见附录 A）

## Summary

为 drsell 建立元语（治理文档）体系的地基：ID 登记册 `DECISIONS.md` + 4 个校验器 + 欠账棘轮，挂进 `pnpm test`。

元语的核心规矩是**每条规矩必须有守护方式**——读完任一节要能回答「我违反了会怎么被抓住」，而不是「作者建议我怎么做」。因此本子项目的实质不是写文档，是**建校验器**：`DECISIONS.md` 是被解析的数据，`spec/*.mjs` 是兑现它的执行体。

本子项目必须最先做，因为「代码或元语文档中出现的 ID 必须在册」是后续所有元语文档的格式契约前提。没有它，子项目 2–4 写出的 `ADR-n` / `B-n` / `DS-n` 全是无守护的装饰。

## 锁定决策

| 议题 | 结论 | 依据 |
|---|---|---|
| 文件布局 | 元语 md 放仓库根（同 ai-factory），校验器放 `spec/*.mjs` | 两仓布局一致，校验器逻辑可复用 |
| 命名空间 | `INV-n` / `ADR-n` / `B-n` / `DS-n` 四件套，不加业务前缀 | 业务命名空间等子项目 3/4 真需要时按规矩递增 |
| 初始登记范围 | **全量**——含「未配」条目，配棘轮兜底 | 用户决策；风险已提示，对策见 §6 |
| 测试集成 | 根 `package.json` 的 `test` 改为 `node spec/run-all.mjs && turbo run test` | 元语规矩「已挂进默认测试命令」 |
| 历史文档 | 根目录 4 份历史报告迁入 `docs/archive/` | 元语规矩「阶段性执行计划不是元语，完成后降为历史快照」 |

## 目标

- `DECISIONS.md` 成为 ID 命名空间的唯一权威，代码与元语文档中出现的 ID 未在册即测试红
- 三条边界规矩（`B-1`/`B-2`/`B-3`）当天获得可执行守护，现状全部 0 违反
- 已知欠账（未配 ADR、hex 散点、软关联 model）被显式计数并上棘轮，只减不增
- 每个校验器配负向验证——校验器不能证明自己会红，等于没有守护

## 非目标（防镀金，违反会被拒绝合并）

1. **不写 `ARCHITECTURE.md` / `DESIGN.md` / `DOMAIN.md` / `FLOWS.md` / `DEPLOY.md`**：它们是子项目 2–4。本轮只建登记册与校验框架。越界写入这些文件的改动不予合并。
2. **不重写 `scripts/check-stitch-gate.sh`**：它现在能跑、6 项全 PASS。重写为 `spec/check-design.mjs` 是子项目 2 的交付物。本轮只把它的 6 条规矩**登记**为 `DS-1`…`DS-6`，脚本本身不动。
3. **不修复任何已知偏离**：`INV-1` 的 3 个软关联 model、`DS-2` 的 19 处 hex 散点，本轮只登记不修。修复是各自子项目的事——登记册只诊断，不自动改。
4. **校验器不提供 `--fix`**：治理只诊断。传 `--fix` 应以退出码 2 拒绝。

## 交付物

```
DECISIONS.md                    登记册（仓库根）
spec/run-all.mjs                汇总入口，串联全部校验器
spec/check-ids.mjs              ID 在册
spec/check-links.mjs            元语文档相对路径链接目标存在
spec/check-boundaries.mjs       B-1 / B-2 / B-3 的 grep 守护
spec/check-ratchet.mjs          欠账棘轮
spec/.unguarded-baseline.json   欠账基线
spec/negative-verify.mjs        负向验证：注入违规，断言每个校验器会红
docs/archive/                   根目录 4 份历史报告迁入
package.json                    test 串上 spec/run-all.mjs
```

迁入 `docs/archive/` 的 4 份：`BACKEND_STARTUP_TEST_REPORT.md`、`COZE_API_TEST_RESULTS.md`、
`FINAL_SUMMARY.md`、`README_COZE_API_TESTING.md`。`README.md` 与 `CLAUDE.md` 留在根。

## `DECISIONS.md` 内容规范

结构照搬 `~/projects/ai-factory/templates/DECISIONS.md`。初始内容全部由实测得来，逐条如下。

### §0 命名空间

| 前缀 | 含义 | 出处 |
|---|---|---|
| `INV-n` | 不变量：任何实现都不得违反的硬约束 | `ARCHITECTURE.md`（子项目 3） |
| `ADR-n` | 架构决策：工程层不可逆选择 | `ARCHITECTURE.md`（子项目 3） |
| `B-n` | 边界规矩：模块/包之间的硬边界 | `ARCHITECTURE.md`（子项目 3） |
| `DS-n` | UI 反模式：呈现层禁止事项 | `DESIGN.md`（子项目 2） |

出处文档在子项目 1 尚不存在。**这是格式契约的已知临时状态**：`check-links.mjs` 对尚未创建的出处文档放行（白名单见 §5.2），子项目 2/3 创建对应文件时移出白名单。

### §1 INV

| ID | 内容 | 守护层 |
|---|---|---|
| `INV-1` | 所有租户数据必须经 `Shop` 外键可达（`tenantId` 或 `shopId`） | DB 外键约束；**未配** |

### §2 ADR

| ID | 内容 | 锁定依据 | 状态 |
|---|---|---|---|
| `ADR-1` | pnpm 8.15.4 + turbo 2.5 workspace，包在 `apps/*` 与 `packages/*` | `pnpm-workspace.yaml` | 已守护 |
| `ADR-2` | api 监听 3001，全局前缀 `api` | `apps/api/src/main.ts` | 未配 |
| `ADR-3` | web 监听 3000，storefront 监听 3100 | `apps/web/package.json`、`apps/storefront/package.json` | 未配 |
| `ADR-4` | 持久化用 Prisma 6 + PostgreSQL | `apps/api/prisma/schema.prisma` | 已守护（`prisma validate`） |
| `ADR-5` | api 全局 ValidationPipe：`whitelist` + `forbidNonWhitelisted` | `apps/api/src/main.ts` | 未配 |
| `ADR-6` | 双设计系统并存：web = Polaris 13，storefront = shadcn/Tailwind v4 | 各自 `package.json` | 已守护（`B-2`/`B-3`） |

### §3 B — 边界规矩

| ID | 内容 | 守护 | 现状 |
|---|---|---|---|
| `B-1` | `packages/*` 不得 import `apps/*` | `check-boundaries.mjs` | 0 命中 |
| `B-2` | `apps/storefront` 不得引入 `@shopify/polaris` | `check-boundaries.mjs`（**须剥离注释后匹配**） | 0 命中（1 处注释误报，见 §9） |
| `B-3` | `apps/web` 不得引入 tailwind / shadcn / radix | `check-boundaries.mjs` | 0 命中 |

### §4 DS — UI 反模式

原样登记 `scripts/check-stitch-gate.sh` 现有 6 项，守护方式一律填该脚本路径。

| ID | 内容 |
|---|---|
| `DS-1` | 业务/布局组件禁止硬编码尺寸（`-[Npx]` 任意值） |
| `DS-2` | 业务/布局组件禁止硬编码十六进制颜色 |
| `DS-3` | 禁止 Material Symbols 图标字体残留（应为 lucide-react） |
| `DS-4` | 禁止 Tailwind CDN 引用 |
| `DS-5` | `apps/storefront/src/app/globals.css` 须含 `--primary` / `--ring` / `--border` 令牌 |
| `DS-6` | 业务组件语义令牌引用次数 ≥ 10 |

### §6 决策 ↔ 实现的已知偏离

`性质` 列不可省略——*已改主意* 意味着代码是对的、登记册待更新；*未实现* 意味着登记册是对的、代码待补。两者修复方向相反。

| ID | 在册结论 | 代码现状 | 性质 |
|---|---|---|---|
| `INV-1` | 租户数据经 `Shop` 外键可达 | `MailSubscriber` / `KnowledgeSyncJob` / `ChatStatDaily` 用 `shopDomain: String` 软关联，无外键；`MailSubscriber.shopDomain` 且可空 | 部分实现 |
| `DS-2` | UI 源码禁止 hex 字面量 | 守护面仅覆盖 `apps/storefront/src/components/{business,layout}`；`apps/web` 11 处、`apps/web/extensions/chatbot` 8 处未纳入 | 部分实现 |

### §7 待定

每条必须写明「决出前禁止做什么」——倾向本身会诱导预埋，故 `倾向` 列一律填 `—`。

| # | 事项 | 倾向 | 决出前禁止 |
|---|---|---|---|
| `TBD-1` | `apps/storefront` 与 `apps/web` 谁是权威商家 UI | — | 禁止在 web 引入 shadcn（`B-3`）；禁止在 storefront 引入 Polaris（`B-2`）；禁止把 storefront 接进 Shopify OAuth |
| `TBD-2` | `apps/web/extensions/chatbot` 的令牌唯一源 | — | 禁止扩大 hex 散点，现 8 处为棘轮上限 |

### 附录：格式契约

1. §1–§4 表格首列是 ID，须用反引号包裹（使 grep 可区分 ID 与普通文本）。
2. 代码与元语文档中出现的 ID（词边界匹配）必须在册 —— 硬失败。
3. `INV-n.m` 按父编号 `INV-n` 查册。
4. 在册但全仓零引用 → WARN，不红。
5. 相对路径链接目标必须存在（§5.2 白名单除外）。
6. 任一登记表解析为 0 行 = 格式契约破坏 = 红。

## 校验器设计

### 通用约定

- Node ESM（`.mjs`），零运行时依赖，只用 `node:fs` / `node:path`。
- 退出码：`0` = PASS（可含 WARN）· `1` = FAIL · `2` = 用法错误。
- 传 `--fix` 一律以退出码 2 拒绝，并打印「治理只诊断、不自动改」。
- 输出分三段：`✓` 通过项 · `!` WARN · `✗` FAIL，末尾打印计数摘要。
- 每个校验器是独立可执行文件，可单独 `node spec/check-xxx.mjs` 运行。

### §5.1 `check-ids.mjs`

**输入**：`DECISIONS.md`

**解析**：按 §附录 1，从 §1–§4 各表提取首列反引号包裹的 ID。任一表解析为 0 行 → FAIL。

**扫描面**

```
根目录 *.md（元语文档）
apps/*/src/**/*.{ts,tsx}
apps/web/{app,components,hooks,lib}/**/*.{ts,tsx}
packages/*/src/**/*.ts
spec/**/*.mjs
```

**排除**：`node_modules` · `.next` · `dist` · `build` · `.pnpm-store` · `docs/archive/` · `spec/check-ids.mjs` 自身（它字面提及各前缀）

**匹配**：`/\b(INV|ADR|B|DS)-\d+(\.\d+)?\b/g`，`INV-n.m` 按父编号 `INV-n` 查册。

**判据**
- 扫描面命中但不在册 → FAIL，打印 `文件:行` 与 ID
- 在册但全仓零引用 → WARN
- 登记表解析为 0 行 → FAIL

### §5.2 `check-links.mjs`

**扫描面**：元语文件清单常量 `METALANG_FILES`，本轮 = `['DECISIONS.md']`。子项目 2–4 各自追加。

**判据**：每个 markdown 相对路径链接的目标文件须存在 → 否则 FAIL。

**白名单**（尚未创建的出处文档，随子项目推进逐条移除）

| 路径 | 移除时机 |
|---|---|
| `DESIGN.md` | 子项目 2 |
| `ARCHITECTURE.md` | 子项目 3 |
| `DOMAIN.md` / `FLOWS.md` / `DEPLOY.md` | 子项目 4 |

白名单本身须在校验器输出中显式打印为 WARN，避免它变成永久豁免。

### §5.3 `check-boundaries.mjs`

三条规矩硬编码为规则表，每条含：ID、扫描面、禁用模式、是否剥离注释。

| 规则 | 扫描面 | 禁用模式 | 剥离注释 |
|---|---|---|---|
| `B-1` | `packages/*/src/**/*.ts` + `packages/*/package.json` | `@drsell/(api\|web\|storefront)`、`../../apps` | 是 |
| `B-2` | `apps/storefront/src/**` + `apps/storefront/package.json` | `polaris`（大小写不敏感） | **是** |
| `B-3` | `apps/web/{app,components,hooks,lib}/**` + `apps/web/package.json` | `tailwind`、`@radix-ui`、`class-variance-authority` | 是 |

**注释剥离**：对 `.ts`/`.tsx`，匹配前先剥离 `//` 行注释与 `/* */` 块注释。不实现完整 parser——正则剥离足够，且比 `check-stitch-gate.sh` 现用的「grep -v 行首注释」更可靠（现有脚本漏掉行尾注释，`stat-card.tsx:15` 那类块注释靠第二道 `grep -vE` 兜底，脆弱）。JSON 文件不剥离。

**判据**：任一规则命中 → FAIL，打印规则 ID + `文件:行`。

### §5.4 `check-ratchet.mjs`

**输入**：`spec/.unguarded-baseline.json`

```json
{
  "unconfigured_adr": 3,
  "hex_literals_web": 11,
  "hex_literals_extension": 8,
  "soft_tenant_models": 3
}
```

**实测口径**（每项须与基线用同一段代码计数，避免口径漂移）

| 键 | 口径 |
|---|---|
| `unconfigured_adr` | `DECISIONS.md` §2 状态列为「未配」的行数 |
| `hex_literals_web` | `apps/web/{app,components}` 剥离注释后 `#[0-9a-fA-F]{6}` 命中数 |
| `hex_literals_extension` | `apps/web/extensions` 同上 |
| `soft_tenant_models` | `apps/api/prisma/schema.prisma` 中既无 `tenantId` 也无 `shopId` 的 model 数（`Tenant` 自身除外） |

**判据**：实测值 > 基线 → FAIL（「欠账只能还不能借」）；实测值 < 基线 → PASS 并提示更新基线。

### §5.5 `run-all.mjs`

顺序执行四个校验器，聚合退出码（任一 FAIL 则整体 1），打印总摘要。

## 测试策略

### 负向验证 —— `spec/negative-verify.mjs`

校验器不能证明自己会红，等于没有守护。对每个校验器注入一处违规、断言退出码为 1、然后还原：

| 校验器 | 注入 | 期望 |
|---|---|---|
| `check-ids` | 在临时文件写入未登记的 `DS-99` | 退出 1 |
| `check-ids` | 从 `DECISIONS.md` 删空 §3 B 表 | 退出 1（0 行 = 格式契约破坏） |
| `check-links` | 在 `DECISIONS.md` 加一条指向不存在文件的链接 | 退出 1 |
| `check-boundaries` | 在 `packages/shared/src` 加一行 `import '@drsell/api'` | 退出 1（`B-1`） |
| `check-boundaries` | 在 `apps/storefront/src` 加一行**代码**引用 polaris | 退出 1（`B-2`） |
| `check-boundaries` | 在 `apps/storefront/src` 加一行**注释**提及 polaris | 退出 **0**（注释豁免必须成立） |
| `check-ratchet` | 把某项基线值减 1 | 退出 1 |

注入走临时文件或写后即还原，**不得留下未还原的工作区改动**——负向验证自身须在失败时也能还原（`try/finally`）。

### 正向验证

`node spec/run-all.mjs` 在干净工作区退出 0。

## 集成点

根 `package.json`：

```json
"scripts": {
  "spec": "node spec/run-all.mjs",
  "spec:negative": "node spec/negative-verify.mjs",
  "test": "node spec/run-all.mjs && turbo run test"
}
```

`turbo run test` 现有行为不变（`apps/api` 的 `jest --passWithNoTests`，web/storefront 无 test）。

## 验收标准

1. `pnpm spec` 退出 0。
2. `pnpm spec:negative` 退出 0（即全部注入都如期变红，且工作区还原干净——用 `git status --porcelain` 断言为空）。
3. `pnpm test` 退出 0。
4. `DECISIONS.md` 四张登记表各自解析行数 > 0，且 §6 / §7 各 ≥ 2 行。
5. 根目录除 `README.md` / `CLAUDE.md` / `DECISIONS.md` 外无其他 `.md`；迁移的 4 份在 `docs/archive/`。
6. `git grep -nE '\b(INV|ADR|B|DS)-[0-9]+\b'` 的每一处命中都能在 `DECISIONS.md` 查到。

## 已知风险

| # | 风险 | 处置 |
|---|---|---|
| 1 | `B-n` 单字母前缀，`\bB-\d+\b` 词边界匹配可能误伤普通文本 | 先靠扫描面限定落地，实际误伤再加豁免——不提前造机制。ai-factory 模板自身也警告命名空间须「视觉可区分」，若误伤频发则改前缀（改动仅限登记册 + 校验器常量） |
| 2 | 「未配」在全量登记下累积成愿望清单 | 棘轮（§5.4）。这是本设计对用户所选「全量登记」的对价 |
| 3 | §0 出处文档（`ARCHITECTURE.md` 等）本轮不存在，链接白名单可能变成永久豁免 | 白名单强制打印为 WARN，且在本 spec §5.2 表中绑定移除时机 |
| 4 | 注释剥离用正则而非 parser，含 `//` 的字符串字面量（如 URL）可能被误剥 | 可接受：误剥只会**减少**匹配面，方向是漏报不是误报；漏报由负向验证的「代码引用 polaris 必须红」用例兜住 |
| 5 | 迁移根目录历史报告会改变已有相对链接 | 迁移后跑一次全仓 `grep` 检查指向这 6 份文件的链接并修正 |

## 附录 A：全仓元语分解

本子项目是 4 项中的第 1 项。后续各自走 spec → plan → implement。

| # | 子项目 | 产出 | 依赖 |
|---|---|---|---|
| 1 | **元语地基**（本 spec） | `DECISIONS.md` + 4 校验器 + 棘轮 | — |
| 2 | `DESIGN.md` + 视觉回归 | 4 个令牌源如实登记 · `check-stitch-gate.sh` → `spec/check-design.mjs` · 视觉回归两阶段 | 1 |
| 3 | `ARCHITECTURE.md` | §0 决策摘要 · §2 限界上下文 · §3 硬边界 · §5 不变量 · `check-architecture.mjs` | 1 |
| 4 | `DOMAIN.md` / `DEPLOY.md` / `FLOWS.md` | 13 个 Prisma model 数据契约 · 端口与 env 键位 · Shopify OAuth / 订阅 / 知识库同步流程契约 | 1、3 |

子项目 2 的视觉回归设计已在本轮 brainstorming 中确认，摘要留存于附录 B 以免丢失。

## 附录 B：子项目 2 视觉回归设计摘要（已确认，待子项目 2 展开）

- **参考基准用 `code.html` 实时渲染，不用 `screen.png`**。已实测：`code.html` 在 1280×1024 下渲染与 `screen.png` 一致。两侧同浏览器同视口同 DPR，消除截图工具渲染差异，pixel diff 噪声地板降至仅剩图标区域。
- **视口统一 1280×1024 / DPR 1 / fullPage**。由 PNG 反推得出：4 屏为 1600×1280 @1.25x（sidebar 边缘 318px ÷ `w-64` 256px），onboarding 为 2560×1276 @2x（卡片 1436px ÷ `max-w-[720px]`）；5 屏 CSS 宽度统一为 1280。
- **工具**：`@playwright/test` + `pixelmatch` + `pngjs` 进 `apps/storefront` devDependencies。阶段一手写 pixelmatch 出三联图定制报告；阶段二用内建 `toHaveScreenshot` 做门禁。
- **两阶段**：① 还原度验收 → 差异清单落 `DECISIONS.md` §6，每项判定 `已改主意`（= 故意偏离）或 `未实现`（= 未还原）；② 定稿后冻结自身截图为基线，`maxDiffPixelRatio: 0.001` 进门禁。
- **确定性控制**：`NEXT_PUBLIC_API_URL` 指向不可达地址强制走 `FALLBACK_*`（已确认无 `new Date` / `Math.random` / `toLocale`）· `document.fonts.ready` + `networkidle` · `animations: 'disabled'` · 仓库内固定 chromium 版本。
- **第一轮不建 mask**：图标差异在热力图上是小方块，与「整块错位」易区分；先建 mask 等于提前假设哪里会差。
