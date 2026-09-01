# DESIGN.md — 设计令牌与 UI 反模式论证

## 1. 令牌源登记

| # | 源文件 | 服务对象 | 体系 | 状态 |
|---|---|---|---|---|
| 1 | `apps/storefront/src/app/globals.css` | 商家平台 + 内嵌 | shadcn / Tailwind v4 | 权威 |
| 2 | `apps/web`（Polaris 默认主题） | Shopify OAuth / webhook 服务 | Polaris 13 | 无自定义令牌 |
| 3 | `apps/web/app/globals.css` 自定义深色块 | `apps/web` 遗留页面 | 手写 | 待清理，见 `ADR-10` |
| 4 | `apps/web/extensions/chatbot/assets/drsell-chat.js` | 店面聊天窗 | 无源，hex 散点 | 见 `TBD-2` |
| 5 | `apps/ops/app/tokens.css` + `globals.css` | 运营台 | shadcn CSS 变量 + Tailwind v4 | 权威 hex 在 tokens.css，见 `ADR-12` |

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

**视觉参照物是 `design/stitch-export/drsell_ops_console/` 四屏**，方法论走
`stitch-to-shadcn-pro`（引擎 `~/.cursor/skills/stitch-to-shadcn-pro`，产物在 `.stitch/`）。
Stitch 稿只作结构与尺度的参照：它编造的状态词（`PAID`）、指标口径（API CALLS / STORAGE /
BANDWIDTH）、字段（RISK SCORE）、`MRR` 一律不采纳，与 `ADR-13` 冲突处以 `ADR-13` 为准。
Stitch 自动扩出的 M3 色阶里有四个值撞 storefront 令牌（`#ffffff` `#ba1a1a` `#93000a`
`#ffdad6`），已重映射；`DS-8` 守着这条。

**对 `stitch-to-shadcn-pro` 的三处明确偏离：**

1. 图标用 `lucide-react`，不用 skill 建议的 Material Symbols —— 少一个外部字体请求，
   且与商家端图标语言一致（`DS-3` 的精神，虽然它的守护面不覆盖 `apps/ops`）。
2. 颜色一律走注册好的具名 utility（`text-ink-3` / `bg-surface-container`），不用 skill
   建议的 arbitrary hex（`text-[#ffffff]`）—— 那会直接撞 `DS-7`。
3. 跑道条的填充语义与 Stitch 相反：Stitch 从左填**已用**时间，我们填**剩余**时间。
   驱动运营动作的是「还剩多少路」。

**spacing 用 arbitrary px 是刻意的**（skill 的强制门禁第 5 条：token 只迁
colors/fontSize/fontFamily/borderRadius，spacing 一律 arbitrary）。将来若把 `DS-1`
（禁 arbitrary 尺寸）的守护面扩到 `apps/ops`，这里会整片变红 —— 先记在这。

**四屏 Stitch 稿的壳互不一致**：侧栏底色 `expiry_queue`/`audit_log` 是 `#f6fbf6`、
`account_detail` 是 `#d6dbd7`；宽度三屏 200px、`audit_log` 256px；`audit_log` 还多一条
深色顶栏与英文导航。单一实现不可能同时对齐四份互相矛盾的稿，**以 `expiry_queue` 为准**。

**「稿子与实现是否一致」这条守不住** —— 它的守护是阶段 C 像素复核，而阶段 C 当前未达标
（遮罩后 6.81%–17.76%，计划的门是 ≤0.36%；红=0，即无结构漂移，差异是布局尺度）。
逐屏数字与已定位原因见 `.stitch/deviations.json`。按元语规矩，**守不住的条目不进登记册**，
故本节全段留在叙述层，不给 ADR/DS 编号。

## 3. DS — UI 反模式（运营台部分）

| ID | 内容 | 守护 |
|---|---|---|
| `DS-7` | `apps/ops` 源码禁止 hex 字面量，颜色只能来自 `tokens.css` | `spec/check-design.mjs` |
| `DS-8` | ops 令牌的 hex 值集合与 storefront 令牌的 hex 值集合交集必须为空 | `spec/check-design.mjs` |
| `DS-9` | `tokens.css` 须在 `:root`、`@media (prefers-color-scheme: dark)`、`:root[data-theme="dark"]` 三处定义**同一套**令牌名 | `spec/check-design.mjs` |
| `DS-10` | `apps/ops` 不得引入 `@shopify/polaris`（shadcn / tailwind 允许） | `spec/check-boundaries.mjs` |

### `DS-7`

运营台颜色只能来自 `apps/ops/app/tokens.css`，源码里散落 hex 会绕过三态主题与 DS-8 撞色检测。
**怎么被抓住**：`spec/check-design.mjs` 扫描 `apps/ops` 除 `tokens.css` 外的 `.ts/.tsx/.css`，剥注释后命中 `#RRGGBB` 即红。

### `DS-8`

ops 与 storefront 两套面绝不能共用色值，否则运营动作与商家 UI 会被认错。
**怎么被抓住**：解析两套令牌文件的 `--name: #hex` 映射，值集合求交，非空即红。

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

Stitch 用 Material Symbols 图标字体，项目定的是 `lucide-react`（P4 组件映射表）。
残留会多拉一个外部字体请求，且在 Shopify Admin iframe 的 CSP 下可能直接被拦。
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
