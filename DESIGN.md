# DESIGN.md — Stitch 设计源与 UI 反模式

> 本文件是 `DS-n` 的**出处文档**（论证锚点）。
> 登记册见 [`DECISIONS.md`](DECISIONS.md)；架构决策见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。
> 机器校验：`pnpm spec`（`spec/check-design.mjs` 守护 DS-7/8/9，`spec/check-boundaries.mjs` 守护 DS-10）。

## 0. Stitch 源：项目 `11226504772808429506`（9 屏）

API key 拉取方式：`scripts/stitch-mcp.sh`（JSON-RPC over `https://stitch.googleapis.com/mcp`，
header `X-Goog-Api-Key`）。原始返回与落盘：

| 路径 | 内容 |
|---|---|
| `.stitch/mcp/screens-11226504772808429506.json` | MCP `list_screens` 原样返回 |
| `.stitch/project-11226504772808429506/designs/*.html` | 9 屏 HTML 原样落盘 |
| `.stitch/project-11226504772808429506/shots/*.png` | 9 屏缩略图（512px 宽） |
| `.stitch/project-11226504772808429506/tokens-merchant-light.json` | 商户浅色主题 47 令牌 |
| `.stitch/project-11226504772808429506/tokens-superadmin-dark.json` | 超管深色主题 51 令牌 |

### 0.1 九屏 ↔ 主题 ↔ 路由

| # | 屏 | 主题 | 实现位置 |
|---|---|---|---|
| 00 | Onboarding: Welcome | merchant-light | `apps/storefront/app/onboarding` |
| 01 | Home Dashboard | merchant-light | `apps/storefront/app/page` |
| 02 | Accounts & Membership Overview | superadmin-dark | `apps/ops/app/accounts`（重建） |
| 03 | AI Assistant: Settings | merchant-light | `apps/storefront/app/ai-assistant` |
| 04 | Inbox: Conversations | merchant-light | `apps/storefront/app/inbox` |
| 05 | System Health & Global Config | superadmin-dark | `apps/ops/app/system`（新建） |
| 06 | Widget Configuration | merchant-light | `apps/storefront/app/widget-config` |
| 07 | Active Support Session (Impersonation) | superadmin-dark | `apps/ops/app/impersonation`（新建） |
| 08 | Store & Subscription Details | superadmin-dark | `apps/ops/app/shops/[domain]`（重建） |

不在 9 屏里但保留的运营台功能：`/` 到期队列、`/shops` 店铺列表、`/audit` 审计日志、
`/plans` 套餐目录、`/login`。它们**按 superadmin-dark 令牌体系重排**，不得保留旧浅色账本底。
`apps/storefront` 的 customers / analytics / history / support / documentation 同理，不在 9 屏里，
按 merchant-light 令牌体系排。

### 0.2 两套主题的 Stitch 实测令牌（节选）

**merchant-light**（5 屏一致，权威值）：
`primary #006c49`、`background #f6fafe`、`surface #f6fafe`、
`on-surface #181c1f`、`on-surface-variant #3d4a42`、`outline #6d7a71`、
`outline-variant #bccac0`、`error #ba1a1a`、`error-container #ffdad6`。

**superadmin-dark**（4 屏一致，权威值）：
`primary #bec6e0`、`background #131315`、`surface #131315`、
`primary-container #0f172a`、`secondary-container #3c4a5e`、
`on-surface #e4e2e4`、`on-surface-variant #c6c6cd`、`outline #909097`、
`outline-variant #45464d`、`error #ffb4ab`、`error-container #93000a`。

两套主题在 Stitch 内是**不同项目段**：00/01/03/04/06 用浅色绿（商家面），
02/05/07/08 用深色蓝灰（超管面）。同一个 Stitch 项目里两套壳并存，实现时按路由隔离，
不得混用令牌。`DS-8` 机器守护两套令牌 hex 值零交集（跨 app 的碰撞）。

### 0.3 超管壳的取舍

四屏超管稿的壳互不一致：05 有 `h-8` 全局审计条且侧栏 `top-8 w-[240px]`；
02 侧栏 `top-[80px]`；07 侧栏 `top-[96px] w-sidebar`；08 侧栏 `top-0 w-[240px]`。
单一实现无法同时对齐四份互相矛盾的稿，**以 05（System Health）为准**：
全局审计条 + 240px 侧栏 + 主画布 `bg-background`。其余三屏只取内容区，不取壳。

### 0.4 对 Stitch 稿的明确偏离

1. 图标用 `lucide-react`，不用 Material Symbols —— 少一个外部字体请求（`DS-3` 精神）。
2. 颜色一律走 `tokens.css` 注册的具名 utility，Stitch 的 `bg-[#020617]` /
   `border-[#1E293B]` 这类 arbitrary hex 照搬即撞 `DS-7`，必须映射成令牌。
3. Stitch 编造的状态词、指标口径（API CALLS / STORAGE / BANDWIDTH、RISK SCORE、
   `MRR` 等）一律不采纳，以 `ADR-13` 与真实数据源为准。
4. `error-container #93000a`、`on-error-container #ffdad6` 与 storefront 令牌集相交，
   照收即撞 `DS-8`；在 ops tokens 中重映射后再进 `globals.css`。

## 1. 令牌源登记

| # | 源文件 | 服务对象 | 体系 | 状态 |
|---|---|---|---|---|
| 1 | `apps/storefront/src/app/globals.css` | 商家平台 + 内嵌 | shadcn / Tailwind v4 | 权威（merchant-light） |
| 2 | `apps/web`（Polaris 默认主题） | Shopify OAuth / webhook 服务 | Polaris 13 | 无自定义令牌 |
| 3 | `apps/web/app/globals.css` 自定义深色块 | `apps/web` 遗留页面 | 手写 | 待清理，见 `ADR-10` |
| 4 | `apps/web/extensions/chatbot/assets/drsell-chat.js` | 店面聊天窗 | 无源，hex 散点 | 见 `TBD-2` |
| 5 | `apps/ops/app/tokens.css` + `globals.css` | 运营台 | shadcn CSS 变量 + Tailwind v4 | 权威（superadmin-dark） |
| 6 | `.stitch/project-11226504772808429506/designs/*.html` | Stitch 原始设计源 | Stitch HTML | 参照物，不直接 import |

## 2. 设计意图

### 2.1 两面必须分家

商家面（storefront）是 Shopify 绿 `#006c49` + 冷白 `#f6fafe`；
超管面（ops）是深色蓝灰 `primary #bec6e0` + `background #131315`。
理由：在运营台点下的按钮会影响真实商家的账单，两个面绝不能被认错。
`DS-8` 机器守护两套令牌 hex 值交集必须为空。

### 2.2 超管面（ops）用深色

Stitch 02/05/07/08 四屏全部是深色蓝灰主题，不是旧四屏的浅色账本纸底。
旧 tokens（`--stock #e6ebe7` 那套）由 `superadmin-dark` 令牌替换；
`/` 到期队列、`/audit` 等保留功能也随壳换成深色。**健康状态不给颜色**的原则继续保留：
只有 `FROZEN` / `PENDING` / 失败 才拿信号色。

### 2.3 商家面（storefront）的参照物切换

商家面此前参照 `design/stitch-export/stitch_shopify_ai_chat_dashboard/`；
该导出与 Stitch 项目 01/03/04/06 同源（merchant-light 47 令牌一致）。
后续像素复核以 `.stitch/project-11226504772808429506/` 的 5 屏为准。

### 2.4 字体三角色

显示 Bricolage Grotesque / 正文 Instrument Sans / 数据 Martian Mono，
中文统一回落 `PingFang SC, Hiragino Sans GB, Microsoft YaHei`。两套主题共用字体，不共用色。

### 2.5 像素复核的确定性来源

「稿子与实现是否一致」的守护是阶段 C 像素复核。本项目 Stitch 源已切换到
项目 `11226504772808429506`，阶段 C 的 `target.png` 应从该项目 screenshots 生成。
旧 `.stitch/reports/*` 对应旧四屏，保留到新复核通过后归档。

## 3. DS — UI 反模式（运营台部分）

| ID | 内容 | 守护 |
|---|---|---|
| `DS-7` | `apps/ops` 源码禁止 hex 字面量，颜色只能来自 `tokens.css` | `spec/check-design.mjs` |
| `DS-8` | ops 令牌的 hex 值集合与 storefront 令牌的 hex 值集合交集必须为空 | `spec/check-design.mjs` |
| `DS-9` | `tokens.css` 须在 `:root`、`@media (prefers-color-scheme: dark)`、`:root[data-theme="dark"]` 三处定义**同一套**令牌名 | `spec/check-design.mjs` |
| `DS-10` | `apps/ops` 不得引入 `@shopify/polaris`（shadcn / tailwind 允许，见 ADR-12） | `spec/check-boundaries.mjs` |

### `DS-7`

运营台颜色只能来自 `apps/ops/app/tokens.css`，源码里散落 hex 会绕过三态主题与 DS-8 撞色检测。
**怎么被抓住**：`spec/check-design.mjs` 扫描 `apps/ops` 除 `tokens.css` 外的 `.ts/.tsx/.css`，剥注释后命中 `#RRGGBB` 即红。
**实现约束**：Stitch 超管稿的 `bg-[#020617]` / `border-[#1E293B]` / `text-[#4ade80]` 在移植时
必须映射为 tokens.css 中的具名 utility（如 `bg-background` / `border-outline-variant` / `text-trial-accent`）。

### `DS-8`

ops 与 storefront 两套面绝不能共用色值，否则运营动作与商家 UI 会被认错。
**怎么被抓住**：解析两套令牌文件的 `--name: #hex` 映射，值集合求交，非空即红。
**实现约束**：superadmin-dark 的 `error-container #93000a`、`on-error-container #ffdad6`
与 storefront 交集，tokens.css 里重映射后再映射进 `globals.css`。

### `DS-9`

三态主题（系统亮 / 系统暗 / 强制暗）必须定义同一套令牌名，漏一态会在切换时塌缩。
**怎么被抓住**：分别解析 `:root`、`prefers-color-scheme: dark` 块、`data-theme="dark"` 块的令牌名集合，求差即红。

### `DS-10`

运营台刻意不引入 shadcn / radix / polaris / tailwind，避免第三套面被组件库拖回商家绿。
**怎么被抓住**：`spec/check-boundaries.mjs` 扫描 `apps/ops` 源码与 `package.json` 依赖。

## 4. DS — UI 反模式（商家端部分）

> 六条全部源自同一件事：Stitch 导出的 HTML 是**绝对像素 + 色值字面量 + 外部 CDN**，
> 照搬进 React 就会在项目里长出第二套设计事实来源。守护面是
> `apps/storefront/src/components/{business,layout}`，守护方 `scripts/check-stitch-gate.sh`。

### `DS-1`

Stitch 导出里布局尺寸全是绝对像素（`max-w-[360px]` / `rounded-[28px]` / `p-[17px]`）。
留着有两个后果：组件换断点就裂；`rounded-[28px]` 绕开 `--radius`，改令牌改不动它。
**怎么被抓住**：`grep -rn -- '--\[[0-9]\+px\]'` 命中即红。

### `DS-2`

同源问题，Stitch 用 `bg-[#FEF7FF]` 这类字面量。留着等于第二套配色事实来源。
**怎么被抓住**：`grep -rn -- '#[0-9A-Fa-f]\{6\}'`（剥注释后）命中即红。
**已知偏离**：守护面不含 `apps/web` 与 `apps/web/extensions/chatbot`，见 `DECISIONS.md` §6。

### `DS-3`

Stitch 用 Material Symbols 图标字体，项目定的是 `lucide-react`（组件映射表见
`docs/stitch-to-shadcn-plan.md`）。残留会多拉一个外部字体请求，且在 Shopify Admin iframe 的 CSP 下可能直接被拦。
**怎么被抓住**：`grep -rni 'material-symbols'` 命中即红。

### `DS-4`

Stitch 的 HTML 靠 `cdn.tailwindcss.com` 起效。进生产等于运行时编译 CSS 加一个外部依赖，
同样撞 CSP。
**怎么被抓住**：`grep -rn 'cdn.tailwindcss.com'` 命中即红。

### `DS-5`

这三个是 shadcn 组件库的必需令牌，缺任一则 Button / Input / Card 回落到未定义色。
这条守的不是「写得好不好」，是「令牌文件被误删或改名」。
**怎么被抓住**：`grep -q` 任一缺失即红。

### `DS-6`

反向指标，不是独立规矩：如果业务组件几乎不引用 `bg-primary` / `text-muted-foreground` 这类
语义令牌，说明转化时又退回了任意值——它是 `DS-1` / `DS-2` 的漏网检测。
**怎么被抓住**：计数 < 10 时门禁 WARN。

## 附录：格式契约（校验器解析规则）

1. §1 令牌源登记表首列是序号，第二列是仓库相对路径，路径必须存在。
2. §3 / §4 的 DS 论证锚点格式固定为 `### \`DS-n\``（三级标题 + 反引号包裹 ID）。
3. §1 解析为 0 行 = 格式契约破坏 = 红。
4. `DECISIONS.md` §4 在册的每个 `DS-n`，本文件必须有对应锚点——见 `DECISIONS.md` 附录第 7 条。
