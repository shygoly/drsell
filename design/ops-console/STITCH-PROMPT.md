# Stitch 提示词 — drsell 运营台

> 用途：在 [Stitch](https://stitch.withgoogle.com) 生成运营台（`apps/ops`）的高保真设计稿。
> 规范依据：`docs/stitch-to-shadcn-plan.md` §6（P1 产出规范）。
> 视觉依据：`design/ops-console/index.html`（已成稿，Stitch 稿以它为准，不是反过来）。
> 治理约束：`ADR-12` / `DS-7`–`DS-10`，见 `DECISIONS.md`。

---

## 0. 使用顺序（照做，别跳）

按 `docs/stitch-to-shadcn-plan.md` §6.2：**先改全局主题，再生成页面。先生成再换色会留一堆改不干净的字面量。**

1. 新建项目，名字填 `Drsell Ops Console`
2. 进全局主题设置，把 §1 的值逐项填进去
3. 用 §2 的总纲 prompt 生成第一屏
4. 用 §3 的四段分屏 prompt 依次生成（**一次会话内连续生成**，多屏一致性靠这个，不靠事后统一）
5. 微调用对话式追加，不要重新生成（省额度、保一致）
6. 导出：每屏一套 `code.html` + `screen.png`，落到 `design/stitch-export/drsell_ops_console/<screen>/`

---

## 1. 全局主题预设（先填这个）

| 项 | 值 |
|---|---|
| Theme | **Light**（暗色不在 Stitch 生成，见 §4） |
| Primary color | `#14211e` |
| Background | `#e6ebe7` |
| Surface / Card | `#fafcfa` |
| Font | `Instrument Sans`（不可选时填 `Inter`，导出后按 §4 替换） |
| Corner radius | `4px` |
| Spacing base | `4px` |

**两个红线，填主题时就要守住：**

- **不要用纯白 `#ffffff` 做卡片底。** 商家端令牌集合里有 `#ffffff`，运营台再用就撞了——`DS-8` 要求两套令牌 hex 交集为空，撞了直接门禁红。卡片底一律 `#fafcfa`。
- **一丁点 Shopify 绿都不要。** 商家端是 `#006c49` / `#12a875` 系。运营台跟它同色就等于把两个面混为一谈，而在运营台点下的按钮会影响真实商家的账单。

---

## 2. 总纲 Prompt（英文，贴在第一次生成）

> 按 §6.1「英文生成更稳」。UI 文案给的是中文字面量，直接照抄，不要翻译。

```
Design an internal operations console for a SaaS team who run an AI customer-service
app for Shopify merchants. The users are NOT merchants — they are the vendor's own
support and finance staff. Every screen answers one question: which merchant's
subscription or grace period runs out next.

STYLE

Ledger-stock aesthetic: a dense, quiet, back-office instrument. Think of a paper
accounts ledger rendered as software, not a marketing dashboard.

Palette — use these exact values, do not substitute:
  page background   #e6ebe7   (cool grey-green ledger stock)
  card surface      #fafcfa   (NEVER pure #ffffff)
  inset / track     #f1f4f1
  ink / body text   #14211e
  secondary text    #55635d
  hairline rules    #c4cdc7
  signal: trial     #4b3fa8   (indigo)
  signal: frozen    #a66009   (ochre)
  signal: terminal  #8e3b2f   (rust)

THE ONE RULE THAT DRIVES THE WHOLE DESIGN: healthy states get NO colour.
A subscription that is ACTIVE and paid renders in plain ink #14211e with a grey
hairline border — it must look boring. Only states that need human action take a
signal colour. Do not add green success pills, do not colour-code every row, do not
use a status-dot legend. The operator's eye should be pulled only to rows that need
work.

Typography:
  display / headings — Bricolage Grotesque, bold, tight tracking
  body               — Instrument Sans
  data               — Martian Mono, for domains, IDs, money, dates, day counts
  numbers in columns must use tabular figures

Corners 4px. Borders 1px solid #c4cdc7. Shadows almost invisible.

SIGNATURE ELEMENT — the "runway bar". Every shop row shows a horizontal time track
instead of a status dot:
  - the track is the shop's current window (trial period, billing cycle, or the
    30-day unfreeze grace period after a failed payment)
  - elapsed time fills from the left in #c4cdc7 at 55% opacity
  - the REMAINING time is the coloured part, in that state's signal colour
  - a 1px vertical tick in ink marks "today" at the boundary
  - days remaining printed to the right in Martian Mono
  - frozen rows use diagonal hatching on the remaining segment
Rows are always sorted by days remaining, ascending. Never group by status.

UI COPY — Simplified Chinese, use these strings verbatim:
  运营台 · 到期队列 · 店铺 · 账号 · 审计日志 · 套餐配置
  归属账号 · 状态 · 窗口 · 剩余 · 计费 · 本周期用量 · 可用期
  试用 · 解冻期 · 计费周期 · 天后订阅终止
Subscription state labels stay in English uppercase, exactly these six and no others:
  PENDING  ACTIVE  FROZEN  DECLINED  EXPIRED  CANCELLED

DO NOT
  - no Shopify green (#006c49, #12a875) anywhere
  - no pure white surfaces
  - no purple-blue gradients, no glassmorphism, no hero banners
  - no emoji as icons; icons are 16px linear strokes, 1.5px weight
  - no alternating grey row stripes
  - no rounded pill buttons; buttons are 4px radius rectangles
  - no illustrations, no avatars with photos, no marketing copy
  - no revenue/MRR chart — this console is about time, not growth
```

---

## 3. 分屏 Prompt

### 屏 1 · `expiry_queue` 到期队列（首页）

```
Screen 1 of 4: the expiry queue, the console's home.

Left sidebar, 200px fixed, surface #fafcfa, right hairline border. Nav items, Chinese,
16px linear icons: 到期队列 (active) · 店铺 · 账号 · 审计日志 · 套餐配置. Sidebar footer
shows the signed-in operator's email in Martian Mono 11px, secondary colour.

Main area: a single card. Card header holds the title 到期队列, a one-line subtitle
按剩余天数升序。先看最上面那行。 and, right-aligned in Martian Mono, 2026-08-31 · 6 家待处理 / 共 148 家.

Below it a dense table, 5 columns:
  店铺       — shop handle in Martian Mono 12px
  归属账号   — owner email, secondary colour
  状态       — a small uppercase state chip, Martian Mono 9.5px, letter-spaced,
               1px border in the state colour, 12% tint fill. ACTIVE uses grey
               hairline + secondary text, NOT a colour.
  窗口       — the runway bar described in the style brief
  剩余       — window type, e.g. 14 天试用 / 30 天解冻期 / 计费周期

Six rows, sorted by days remaining ascending, with these exact values:
  kettle-coffee      ops@kettle.co             试用/TRIAL   2 天   14 天试用
  nordic-cycles      mia@nordiccycles.se       FROZEN       4 天   30 天解冻期
  studio-mano        hello@studiomano.jp       ACTIVE       6 天   计费周期
  atlas-outfitters   mia@nordiccycles.se       试用/TRIAL   9 天   14 天试用
  verdant-home       team@verdant.home         FROZEN      18 天   30 天解冻期
  maison-perle       contact@maisonperle.fr    CANCELLED   已结束  8 月 24 日卸载

The CANCELLED row's chip has a strikethrough and its runway track is fully spent grey.
Row height 44px. Hairline between rows, none after the last.
```

### 屏 2 · `shop_detail` 店铺详情

```
Screen 2 of 4: shop detail, reached by clicking a queue row. Same sidebar.

Card header: the shop domain nordic-cycles.myshopify.com in Martian Mono 15px semibold,
underneath in secondary text 归属 mia@nordiccycles.se · 名下 2 家店 · 安装于 2026-03-12,
and top-right a FROZEN · 欠费 chip in ochre.

Below the header, three equal panels separated by vertical hairlines:

Panel 1, eyebrow 计费 — a definition list, label left in secondary text, value right in
Martian Mono tabular figures:
  套餐 Growth · $79/月 · Shopify 状态 FROZEN · 组内计费店 是 ·
  Charge ID gid://…/28451903 · 上次成功扣费 2026-07-28

Panel 2, eyebrow 本周期用量 — three meters. Each is a label + "used / included" in
Martian Mono, above a 9px track:
  对话 2,840 / 3,000       (fill in secondary ink)
  AI 解决 1,206 / 1,000    (OVER QUOTA — fill uses rust diagonal hatching, the number
                            turns rust)
  坐席 3 / 5
Then a small note: 超出 206 次 AI 解决，按 $0.90 计约 $185.40，欠费解决前不出账。

Panel 3, eyebrow 可用期 — this panel is the focus of the screen. It leads with a huge
number: 4 set in Bricolage Grotesque bold 52px in ochre, with 天后订阅终止 beside it in
small secondary text. Under it a full-width 12px runway bar with ochre hatching. Then a
definition list: 转冻结 2026-08-05 · 解冻截止 2026-09-04 · 逾期后果 订阅终止. Then a
note: 商家补缴即自动恢复，无需我们操作。逾期后只能重新走一次订阅。

Card footer, above a hairline, a single row of 4px-radius buttons:
  发催缴提醒 · 延长解冻期 · 改指定计费店 · 重跑同步 · 代登录
and rightmost, in rust with a 10% rust fill, 停用聊天窗.
```

### 屏 3 · `account_detail` 账号详情

```
Screen 3 of 4: account detail. Same sidebar, 账号 active.

Header: the account email mia@nordiccycles.se in Martian Mono 15px, under it
Google 登录 · 注册于 2026-02-02 · 最近登录 3h ago in secondary text. Top-right a
plain-bordered button 代登录 and beside it in small secondary text
进入即写审计，30 分钟后失效.

Section 名下店铺 — a table, 5 columns:
  店铺 · 角色 · 订阅 · 计费店 · 安装时间
Two rows:
  nordic-cycles     安装者   FROZEN   是（收全额）   2026-03-12
  atlas-outfitters  安装者   试用     否（$0）       2026-08-22
The 计费店 column is the one that must read at a glance — Shopify bills per shop and
cannot merge invoices across stores, so exactly one shop in an account carries the
full charge. Mark it plainly in ink, not with a coloured badge.

Section 最近操作 — a compact 4-row list of audit entries for this account, each line:
timestamp in Martian Mono, then operator, then action in Chinese, then result. Keep it
quiet; this is a preview that links to the full log.
```

### 屏 4 · `audit_log` 审计日志

```
Screen 4 of 4: the audit log. Same sidebar, 审计日志 active.

A filter bar above the table: a search input placeholder 搜索店铺或操作者, and three
plain dropdowns 动作 / 操作者 / 时间范围. All 4px radius, hairline borders, no fills.

Table, 6 columns, dense, 40px rows:
  时间 · 操作者 · 动作 · 对象店铺 · 结果 · IP
Eight rows of realistic entries, times in Martian Mono, actions in Chinese
(延长解冻期 / 代登录 / 改指定计费店 / 发催缴提醒 / 停用聊天窗 / 重跑同步).
The 结果 column shows 成功 in plain ink, and one row shows 失败 in rust — again, only
the failure gets colour.

Below the table, a plain pagination row: 共 2,481 条 and page controls.

This screen must look the most boring of the four. It is a record, not a dashboard —
no cards, no metrics, no charts.
```

---

## 4. 已知会跑偏的地方（导出后必须清洗）

Stitch 默认走 Material Design 3，下面几条它多半不会听，**别在 Stitch 里反复较劲，导出后按 `docs/stitch-to-shadcn-plan.md` P3–P5 清洗更快**：

| 现象 | 撞哪条规矩 | 处理 |
|---|---|---|
| 图标出成 Material Symbols 字体 | `DS-3` | 转化时换掉；运营台不用 lucide（`DS-10` 禁 shadcn 生态），改用内联 SVG |
| HTML 里挂 `cdn.tailwindcss.com` | `DS-4` | 转化时删；`apps/ops` 是原生 CSS，本来也不用 Tailwind |
| 色值以字面量散在 class 里 | `DS-7` | 全部收敛进 `apps/ops/app/tokens.css` |
| 只出亮色，没有暗色 | `DS-9` | Stitch 不产三态主题。暗色按 `design/ops-console/index.html` 里已写好的那套补，三处（`:root` / `@media (prefers-color-scheme: dark)` / `:root[data-theme="dark"]`）令牌名必须完全一致 |
| 字体回落成 Inter | — | 换回 Bricolage Grotesque / Instrument Sans / Martian Mono，中文回落栈 `PingFang SC, Hiragino Sans GB, Microsoft YaHei` |
| 卡片底自动变纯白 | `DS-8` | 必须改回 `#fafcfa`，否则与商家端令牌撞色，门禁直接红 |

清洗完跑一遍：

```bash
node spec/run-all.mjs
```

---

## 5. 这份稿子跟 `index.html` 的关系

`design/ops-console/index.html` 是**已经定稿的视觉依据**，Stitch 稿是它的高保真补充（多出账号详情与审计日志两屏）。两者冲突时以 `index.html` 为准。

Stitch 出的 `DESIGN.md` 只当**令牌导出物**用，不是元语——元语是仓库根的 `DESIGN.md`，`design/` 整个目录在 `spec/lib.mjs` 的 `DEFAULT_EXCLUDE` 里，校验器根本不读。
