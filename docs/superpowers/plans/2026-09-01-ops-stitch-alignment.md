# 运营台对齐 Stitch 稿 实施计划

> **For agentic workers:** REQUIRED: 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 执行。步骤用 `- [ ]` 勾选跟踪。
>
> **方法论：** `stitch-to-shadcn-pro`（引擎装在 `~/.cursor/skills/stitch-to-shadcn-pro`，依赖在 `~/stitch-deps`）。
> 本文件不是元语；完成后降为历史快照，规矩在 `DECISIONS.md` / `DESIGN.md`。

**Goal:** 把线上 `ops.szchada.top` 对齐 `design/stitch-export/drsell_ops_console/` 四屏，达到 skill 的 **A 级**保真，且不推翻任何已入册治理决策。

**Architecture:** 走 skill 的三阶段——**A 静态锁定**（Stitch HTML → 等价静态 HTML，像素在此收敛）→ **B 零漂移移植**（静态 HTML → React 组件，DOM 与 class 逐字不变，只换语法）→ **C 项目复核**（截 dev server 与 baseline 做像素 diff）。令牌权威仍是 `apps/ops/app/tokens.css`（`ADR-12`），Stitch 编造的业务内容一律丢弃。

**Tech Stack:** Next 15 App Router + Tailwind v4 + 手写 shadcn（`apps/ops`）；引擎 measure/render/verify/diff（Playwright + pixelmatch + pngjs）。

---

## 执行状态（2026-09-01 二次更新）

> **计划的设计源在执行期间被换掉了。** 本计划对齐的是旧四屏
> `design/stitch-export/drsell_ops_console/`（亮色）；执行途中团队把权威源换成
> Stitch 项目 `11226504772808429506` 的九屏双主题项目，运营台改为 superadmin-dark
> （见 `.stitch/README.md` 与提交 `25a57f6`..`70d595f`）。
> 旧四屏的目标图因此作废 —— **继续拿它们量等于对着已被取代的设计做对齐**，故停止。

### 对旧四屏（本计划原定目标）的最终结果

先纠正计划自身的一个错误：原文写的门槛「mismatch ≤ 阶段 A 的 0.36%」是我把
「阶段 A 的偏离幅度」误当成了保真下限。skill 的评级表（`fidelity-rubric` §4 阶梯 B）
实际是 **A 级 = 轴1 全过 且 fullPage ≤5% 且 masked ≤1% 且 structural ≤0.3%**。

| 屏 | fullPage | masked | structural | 判定 |
|---|---|---|---|---|
| expiry_queue | 0.69% | 0.10% | 0.09% | **✅ A** |
| audit_log | 1.28% | 0.29% | 0.21% | **✅ A** |
| shop_detail | 1.59% | 0.89% | 0.82% | masked 达标，structural 未达 |
| account_detail | 2.28% | 1.37% | 1.21% | 未达 |

起点是 6.86% / 13.61% / 6.81% / 17.76%。四屏 **红=0**（无结构漂移）全程成立。

### 新源的现状（下一轮的起点）

阶段 A 已跑（`scripts/stitch-ops-integrate-v2.sh`，157–163 元素/屏），
阶段 C 首次基线（`scripts/stitch-ops-shoot-v2.mjs`）：

| 屏 | 路由 | masked | 红 |
|---|---|---|---|
| 02 accounts | `/accounts` | 34.62% | 0 |
| 05 system | `/system` | 65.56% | 0 |
| 07 impersonation | `/impersonation` | 21.59% | 0 |
| 08 shop_detail | `/shops/[domain]` | 17.05% | 0 |

**已定位的两个系统性差异**（下一轮的高杠杆项）：
1. 页面底色不统一 —— 稿子 `system` 用 `#020617`，其余用 `#131315`；我们 `shop_detail`
   用了 `#0f172a`。这是新源版本的「四屏互相矛盾」，需先定一个规范值。
2. 内容量差距大 —— `system` 稿延伸到 y=2375 而我们只到 963（缺整块内容）；
   `shop_detail` 相反（我们 2368、稿 807）。

### 这一轮沉淀下来、与设计源无关的东西

- 阶段 C 的确定性来源（`TBD-5` 的候选 a）已跑通：Playwright 路由拦截 + 冻结时钟 +
  cookie 注入，fixture 在 `.stitch/fixtures.json`，**没有**把种子数据放回 `lib/api.ts`
- 一套可复用的定位手法：行段差异率 → 80px 网格聚类 → 横线位置互比 → 2x 并排裁剪
- 反复验证有效的一条原则：**目标图是我们的设计，不是 Stitch 的输出**。
  稿子编造的状态词、错的语义（超额标黑/未超额标红）、暗色模式误开、
  撞 `DS-8` 的色值，都该修目标，而不是跟着错

**本文件不降为历史快照** —— 原定目标已被取代，新源的对齐是新一轮的工作。

---

## 前置事实

### 事实 1 — 管线已就位，但阶段 A 从没跑过

`~/.cursor/skills/stitch-to-shadcn-pro`、`~/stitch-deps`、`scripts/stitch-ops-integrate.sh`、
`pnpm --filter @drsell/ops stitch:integrate` 全部存在；`.stitch/designs/` 四份 HTML 已原样落盘。
但 `.stitch/spec/`、`.stitch/reports/`、`.stitch/rebuild/` **都是空的**——没有 spec，就没有度量基准。

### 事实 2 — 这条管线部分解开了 `TBD-5`

`TBD-5` 卡的是「视觉回归的确定性来源」，原方案依赖已删除的 `FALLBACK_*` 种子数据。

skill 的阶段 A/B **完全不需要运行时数据**——它比的是静态 HTML 与 spec.json，确定性天然成立。
所以四屏的还原度可以在无数据的前提下做到 A 级并量化。

**但阶段 C 仍需数据**：它截的是 dev server，而 ops 页面要过 `AuthGate` 和真实 API。
解法**不是**把种子数据加回 `lib/api.ts`（那正是 `TBD-5` 明令禁止的），而是给阶段 C 单开 fixture 通道。
本计划把阶段 C 列为可选（Chunk 4），阶段 A/B 是必做。

### 事实 3 — skill 有三条建议与本仓治理冲突

| skill 的说法 | 冲突 | 本计划怎么办 |
|---|---|---|
| 「凡过 `cn()`/twMerge 的元素，字号/颜色一律改 arbitrary」并给例 `text-[#ffffff]` | ⚠️ **硬冲突**：`DS-7` 禁 `apps/ops` 源码出现 hex 字面量，`check-design.mjs` 正则 `/#[0-9a-fA-F]{6}\b/` 会直接抓到 | 用 `text-[var(--ink)]` / `bg-[var(--sheet)]` 形式。既保住 arbitrary 的零歧义（长度与颜色分属不同 twMerge 组），又不出现 hex |
| 「spacing 一律 arbitrary」（`pt-[13px]`） | `DS-1` 禁 arbitrary px，但守护面只覆盖 `apps/storefront/src/components/{business,layout}`，ops 不在内 | 跟 skill。**在 `DESIGN.md` 记一句**，否则将来有人扩 `DS-1` 守护面会突然红一片 |
| 「图标用 Material Symbols，layout 里保留 Google Fonts link」 | `DS-3` 禁 Material Symbols，守护面同样只覆盖 storefront | **不跟**。ops 已用 `lucide-react`，继续用。这是对 skill 的明确偏离，理由：多一个外部字体请求，且与商户端图标语言分裂 |

### 事实 4 — 四个色值照抄即 `DS-8` 红

Stitch 四屏共用同一套 42 色，其中只有 5 个是我们的令牌（`#14211e` `#4b3fa8` `#a66009` `#e6ebe7` `#fafcfa`），
其余 37 个是 M3 自动扩的色阶。这四个在 storefront 令牌集里：

| 色值 | storefront 里的身份 |
|---|---|
| `#ffffff` | 纯白卡片底 |
| `#ba1a1a` | `--destructive` |
| `#93000a` | `--on-error-container` |
| `#ffdad6` | `--error-container` |

**一个都不能进 `tokens.css`。** 错误态继续 `--lost #8e3b2f`，卡片底继续 `--sheet #fafcfa`。

### 事实 5 — Stitch 把试用靛蓝当成了 primary

`#4b3fa8` 是我们的 `--trial`（试用中，需关注）。Stitch 拿它做了整套 M3 主色阶
（`#160066` `#30208d` `#42359f` `#5a4fb8` `#9b90fe` `#c6bfff` `#e4dfff`），于是主按钮全成紫色。
**这反转了「健康不给颜色」。** 阶段 A 重建时主按钮改回 `--ink`，紫色只留给试用态的签与跑道条。

> 这是本计划唯一允许「不 1:1 还原」的地方，属于 skill 说的**刻意偏离**，
> 必须在 `.stitch/reports/<page>/` 的交付说明里逐处注明，不能混在噪声里蒙过去。

### 事实 6 — `audit_log` 那屏的壳是另一套

英文侧栏 + 深蓝 `New Request` 按钮 + 右上 `Docs`/`Deploy`。Stitch 孤立生成的产物
（`docs/stitch-to-shadcn-plan.md` §2 事实 6）。**壳以 `expiry_queue` 为准**，那屏只取正文区。

### 事实 7 — Stitch 编造的业务内容一律丢弃

| 产出 | 为什么丢 |
|---|---|
| 状态 `PAID` | 不在 Shopify 六个取值里。`ADR-13` + `spec/check-ops-status.mjs` 现在绿着且挡这个 |
| `API CALLS` / `STORAGE (GB)` / `BANDWIDTH` | 通用 SaaS 指标，本产品是 对话 / AI 解决 / 坐席 |
| `MRR $149.00` | 这个台子关心时间，不关心增长 |
| `RISK SCORE 0.05` | 无数据源，凭空造的字段 |
| 2023 年日期、英文公司名 | mock 数据，用真实 API |

### 事实 8 — 顶栏与侧栏已对齐

`apps/ops/app/components/shell.tsx`（搜索 + 通知 + 设置）与 `nav.tsx`（图标 + 品牌块 + 底部头像块）
已完成，构建通过，`spec` 8/8 绿。阶段 A 重建时以这两个组件的现状为起点。

---

## Chunk 0：跑阶段 A，拿到度量基准

**没有 spec.json 就没有「对齐」这回事**——所有判定都建立在它上面。

### Task 0: 生成 spec 与 baseline

**Files:** 产出到 `.stitch/spec/`、`.stitch/reports/<page>/`、`.stitch/rebuild/`

- [ ] **Step 1: 补 `.stitch/rebuild/` 目录**

`scripts/stitch-ops-integrate.sh` 末尾会 `cp` 到 `$ROOT/.stitch/rebuild/`，但脚本只 `mkdir` 了
`spec` 和 `reports`。目录不存在时 `cp` 会失败并因 `set -e` 中断。

```bash
mkdir -p .stitch/rebuild
```

顺手把 `mkdir -p "$ROOT/.stitch/rebuild"` 补进脚本的 `mkdir` 那行，免得下次再踩。

- [ ] **Step 2: 跑阶段 A**

```bash
STITCH_DEPS_DIR=$HOME/stitch-deps ENGINE=$HOME/.cursor/skills/stitch-to-shadcn-pro pnpm --filter @drsell/ops stitch:integrate
```

Expected: 四屏各产出 `.stitch/spec/<page>.spec.json` 与 `.stitch/reports/<page>/baseline.png`（1440×2400）。

- [ ] **Step 3: 处理失效图链**

skill 阶段0 规则 3：Stitch 的 `lh3.googleusercontent.com/aida-public/...` 图链会过期，404 是链接失效不是网络问题。
若 baseline 出现空白图位，把 `<page>.html` 复制为 `<page>.baseline.html`，用占位 SVG data URI 替换失效 `src`，
**两侧用同一占位**。运营台四屏基本无图，大概率不触发，触发了按此处理。

- [ ] **Step 4: 记下基线数值**

每屏的 `maskedDiff` / `layoutDiff` / `structuralDiff` 初值写进本 Task 备注。
后面每一步都要能回答「比基线好了还是差了」。

- [ ] **Step 5: Commit**

```bash
git add .stitch scripts/stitch-ops-integrate.sh
git commit -m "chore(ops): run stitch phase A, lock measurement baseline for four screens"
```

> `.stitch/reports/*.png` 体积可观，提交前确认 `.gitignore` 策略——
> baseline 必须入库（它是判定基准），中间 diff 图不必。

---

## Chunk 1：令牌扩充

### Task 1: 按 spec 收编色阶

**Files:** `apps/ops/app/tokens.css`、`apps/ops/app/globals.css`

现有 18 个令牌不够画 Stitch 稿的层次（5 级表面、3 级边框）。**按 spec.json 实测值扩，不是照 M3 全收 37 个。**

- [ ] **Step 1: 从 spec 抽实际用到的色**

```bash
node -e "const s=require('./.stitch/spec/expiry_queue.spec.json');/* 汇总 decoration.backgroundColor 与 typography.color 的去重集合 */"
```

- [ ] **Step 2: 逐个对照事实 4 的禁用名单**，撞 storefront 的一律换成我们的等价令牌。

- [ ] **Step 3: 扩令牌**

```css
--sheet-3: #f0f5f1;   /* 表头底 */
--sheet-4: #eaefeb;   /* 悬停底 */
--rule-2:  #d6dbd7;   /* 表格内竖分隔线 */
--trial-2: #5a4fb8;   /* 试用签描边 */
```

暗色块与 `:root[data-theme="dark"]` 必须同步加同名令牌，否则 `DS-9` 红。

- [ ] **Step 4: 验证**

```bash
node spec/check-design.mjs
```
Expected: `DS-8` 仍报零交集；`DS-9 三态主题令牌名一致（N 个）`，N = 16 + 新增数。

- [ ] **Step 5: Commit**

---

## Chunk 2：阶段 A 重建（四屏，可并行）

每屏同一套循环：**按 spec 重建静态 HTML → verify → 未到 A 级就改 → 到 A 级才准进阶段 B。**

```bash
ENGINE=$HOME/.cursor/skills/stitch-to-shadcn-pro
STITCH_DEPS_DIR=$HOME/stitch-deps node $ENGINE/scripts/verify.js \
  --spec .stitch/spec/<page>.spec.json \
  --rebuilt .stitch/rebuild/<page>.html \
  --baseline .stitch/reports/<page>/baseline.png \
  --out .stitch/reports/<page> --viewport 1440
```

判定用 skill 的双轴：轴1 结构性逐属性比对（padding/margin ≤0.01px、字号字面、颜色 RGB 差 ≤2……），
轴2 像素 diff（threshold 0.02，`maskedDiff` 与 `layoutDiff` 为主判据）。**未到 A 级禁止进入阶段 B。**

### Task 2: `expiry_queue` → `/`
- [ ] 重建静态 HTML，主按钮色改回 `--ink`（事实 5），状态词只用六个（事实 7）
- [ ] verify 到 A 级，刻意偏离逐处记进交付说明
- [ ] Commit

### Task 3: `shop_detail` → `/shops/[domain]`
- [ ] 三栏面板重建；用量口径保持 对话 / AI 解决 / 坐席，**不要** API CALLS / STORAGE / BANDWIDTH
- [ ] `SHOP ID` 我们没有这个字段——用 `Shop.id` 短哈希或整块不做，**不要为了像稿子造字段**
- [ ] verify 到 A 级 + Commit

### Task 4: `account_detail` → `/accounts/[id]`
- [ ] 四格指标条只做「名下店铺数」「最近登录」两格；`RISK SCORE` 不做（无数据源），
      「累计已收」待口径决出（含不含退款、跨店如何加总）。**宁可少一格，不放假数**
- [ ] 「计费店」列改成不可点标记——切换计费店是带审计的写操作，不该做成随手能勾的 checkbox
- [ ] verify 到 A 级 + Commit

### Task 5: `audit_log` → `/audit`
- [ ] **只取正文区**（筛选条 / 表格 / 分页），壳沿用 `expiry_queue`（事实 6）
- [ ] 失败行整行 `--tint-lost`，成功行完全不给颜色——这屏是「健康不给颜色」最纯粹的体现
- [ ] verify 到 A 级 + Commit

---

## Chunk 3：阶段 B 零漂移移植

### Task 6: 静态 HTML → React 组件

**Files:** `apps/ops/app/{page,shops/[domain]/page,accounts/[id]/page,audit/page}.tsx`

**铁律：DOM 结构不变、class 字符串逐字不变，只换框架语法。**

- [ ] **Step 1: 按原稿注释块拆区块**，文本与列表数据解耦到 data 文件，组件不硬编码内容
- [ ] **Step 2: 只替换交互控件**（Button/Input/Select），纯展示容器保持原标签原 class
- [ ] **Step 3: 替换后用 arbitrary 覆写回实测值**——但**颜色必须写成 `text-[var(--ink)]` 而非 `text-[#14211e]`**（事实 3 的硬冲突）
- [ ] **Step 4: 每替换一个组件跑一次 `node spec/check-design.mjs`**，`DS-7` 一旦红说明又写了 hex
- [ ] **Step 5: `pnpm --filter @drsell/ops build` + `node spec/run-all.mjs` 8/8 + Commit**

---

## Chunk 4：阶段 C 项目复核（可选，需先解 `TBD-5`）

阶段 C 要截 dev server，而 ops 页面要过 `AuthGate` + 真实 API。**这是 `TBD-5` 剩下的那一半。**

### Task 7: 给阶段 C 开 fixture 通道

- [ ] **Step 1: 定确定性来源**

候选（择一，决出后写进 `DECISIONS.md` §7 销 `TBD-5`）：
  - a) 截图时用 Playwright 路由拦截 `/api/ops/*` 返回固定 JSON（不碰产品代码，推荐）
  - b) 起一个只在测试环境挂载的 fixture API
  - **禁止**：把种子数据加回 `apps/ops/lib/api.ts`——那正是 `TBD-5` 明令禁止的

- [ ] **Step 2: 截图脚本**

视口必须 1440×2400（与 baseline 一致，否则 pixelmatch 报 size mismatch）；
等 `document.fonts.ready` + hydration；产物 `.stitch/reports/<page>/project.png`。
**后台跑、以产物文件判定完成**（skill 实测记录：前台跑会被 SIGTERM）。

- [ ] **Step 3: 像素复核**

```bash
node $ENGINE/scripts/diff.js --baseline .stitch/reports/<page>/baseline.png \
  --rebuilt .stitch/reports/<page>/project.png \
  --out .stitch/reports/<page>/project-diff.png --threshold 0.02
```

判定：mismatch > 阶段 A 锁定值 ⇒ 移植引入漂移，回 Chunk 3 修（通常是组件默认类覆盖或字体没加载）。
**禁止直接在项目里调像素数值凑合。**

噪声裁量：红（结构漂移）= 0 且 layout = 0，全页超标 ≤ 0.05% 时判为字形抗锯齿噪声，可放行但须注明位置与成因。

---

## Chunk 5：收尾

### Task 8: 登录页

Stitch 四屏没画登录页，无参照物。现状是灰底裸卡片，太薄。按侧栏品牌块的语言补：
图标块 + `运营台` + `INTERNAL ONLY` + `需要 superadmin 账号`。不加插图、不加渐变。

### Task 9: DESIGN.md 记录参照关系与对 skill 的偏离

在 §2「运营台设计意图」追加（**叙述，不给 DS 编号**）：

- 视觉参照物是 `design/stitch-export/drsell_ops_console/` 四屏，方法论走 `stitch-to-shadcn-pro`
- Stitch 编造的状态词/指标/字段一律不采纳，与 `ADR-13` 冲突处以 `ADR-13` 为准
- **对 skill 的两处明确偏离**：图标用 `lucide-react` 不用 Material Symbols（`DS-3` 的精神）；
  arbitrary 颜色写 `var(--token)` 不写 hex（`DS-7` 的硬要求）
- **spacing 用 arbitrary px 是刻意的**——将来若扩 `DS-1` 守护面到 `apps/ops`，这里会整片变红，先记下

> 「稿子与实现是否一致」的守护 = 阶段 C，而阶段 C 待 `TBD-5` 决出。
> 按元语规矩，**守不住的条目不进登记册**，故全段留在叙述层，不给 ADR/DS 编号。

- [ ] 写入 + `node spec/run-all.mjs` 8/8 + Commit

---

## 收尾检查

- [ ] `.stitch/spec/` 四份 spec.json、`.stitch/reports/<page>/baseline.png` 四份均已入库
- [ ] 四屏阶段 A verify 均达 **A 级**，刻意偏离逐处有记录
- [ ] `pnpm --filter @drsell/ops build` 通过
- [ ] `node spec/run-all.mjs` 8/8、`node spec/negative-verify.mjs` 全绿
- [ ] `tokens.css` 新增令牌可解释，`DS-8` 仍零交集，`DS-9` 三态令牌名一致
- [ ] 源码零 hex（`DS-7`）——arbitrary 颜色全部走 `var(--token)`
- [ ] 事实 7 那五项编造内容，一项都没进代码
- [ ] 本文件降为历史快照

---

## 未决

| # | 事项 | 阻塞了什么 |
|---|---|---|
| `TBD-5` | 阶段 C 的确定性数据来源（Playwright 路由拦截 vs fixture API） | Chunk 4 整块；「对齐」进不了门禁 |
| — | 「累计已收」口径（含不含退款、跨店如何加总） | Task 4 的第三格指标 |
| — | 店铺是否需要对外展示 ID | Task 3 的 `SHOP ID` |
| — | `.stitch/reports/*.png` 的入库策略 | Task 0 Step 5 |
