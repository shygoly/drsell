# Stitch（Google）设计 → shadcn/ui + Tailwind + React 转化规划

> 版本：v1.0 · 2026-08-30 · 适用于 drsell 及后续新 Web 项目

## 1. 结论（先看这里）

1. **Stitch 官方不支持 React 导出**（截至 2026 年中，路线图中）。它导出的是 **HTML + Tailwind CSS**（静态、mock 数据）。因此转化不是"导出即用"，而是**「Stitch 代码当高保真参照物 → 令牌映射 → 组件映射 → React 组件化」**的流水线。
2. **推荐路线：A 为主、C 为辅的混合策略**——布局与视觉结构走"代码直转"（路线 A），复杂交互组件直接让 AI 用 shadcn 重写（路线 C），不强行翻译 Stitch 代码。
3. 转化成败的关键不在编码，而在**两张映射表**：设计令牌映射表（M3 → shadcn CSS 变量）和组件映射表（M3 组件 → shadcn/ui 组件）。先建表，后转码，一次建表全程复用。
4. 针对 drsell 现状：`apps/web` 是 **Shopify Polaris 技术栈，不要混入 shadcn**（两套设计系统会冲突）。应新建独立 app（如 `apps/storefront` 或全新项目）承载 shadcn。

---

## 2. 关键事实（影响决策的 Stitch 现状，2026-08 核验）

| # | 事实 | 对转化的影响 |
|---|------|--------------|
| 1 | 代码导出格式为 HTML/CSS（基于 Tailwind），有报道称支持 Vue/Angular/Flutter/SwiftUI，**React 尚未官方支持** | 必须自行完成 HTML → React 组件化 |
| 2 | 导出代码为**静态 mock 数据**，无状态、无交互逻辑、无 API | 转化时必须补数据层和三态（loading/empty/error） |
| 3 | Stitch 视觉默认基于 **Material Design 3**（M3） | 令牌与组件词汇和 shadcn 不对齐，需要映射层 |
| 4 | **Figma 导出仅标准模式（Gemini Flash）可用**，保留 Auto Layout | 需要设计精修的页面必须用标准模式生成 |
| 5 | Stitch 提供**官方 MCP 服务器 + SDK**，可接入 Gemini CLI / Claude Code / Cursor | 可把设计直接拉进编码环境，减少手工复制 |
| 6 | 免费额度：标准 ~350 次/月 + 实验 ~200 次/月；无设计系统/令牌管理、无多人协作 | 每次生成是"孤立"的，一致性靠全局主题和多选批量改 |

---

## 3. 三条转化路线对比与推荐

| 维度 | 路线 A：代码直转 | 路线 B：Figma 中转 | 路线 C：视觉重绘（AI 重写） |
|------|------------------|---------------------|------------------------------|
| 链路 | Stitch → 导出 HTML/Tailwind → 令牌/组件映射 → React | Stitch → Copy to Figma → 精修 → Figma-to-code 工具或人工实现 | Stitch 截图 → 交给 AI（v0 / Claude）直接用 shadcn 重写 |
| 还原度 | 高（布局/间距精确） | 最高（像素级可控） | 中（结构对、细节漂移） |
| 速度 | 中 | 慢（多一道 Figma 工序） | 快 |
| 代码质量 | 取决于清洗纪律 | 取决于转换工具 | 最高（直接产出 shadcn 习惯写法） |
| 适用 | 展示型页面、布局复杂页 | 有设计师参与、要交付设计稿 | 交互密集页（表单、弹窗、仪表盘） |
| 门槛 | 需建两张映射表 | 需 Figma 技能 + 标准模式生成 | 需写好 prompt 上下文 |

**推荐：混合策略**
- 布局骨架、视觉层级 → 路线 A（Stitch 代码是精确的间距/结构参照）；
- 表单、弹窗、导航、数据表格等强交互组件 → 路线 C（直接让 AI 按 shadcn 惯例重写，不逐字翻译 Stitch 的 DOM）；
- 仅当需要正式设计交付物时走路线 B。

---

## 4. 总体流水线（8 个阶段）

```
P0 目标工程初始化
   ↓
P1 Stitch 侧产出规范（prompt 约束 + 主题预对齐）
   ↓
P2 导出与资产收集（代码 / Figma / 截图三件套）
   ↓
P3 令牌映射（M3 → shadcn CSS 变量，一次建表全程复用）
   ↓
P4 组件映射（M3 组件 → shadcn/ui，替换 DOM 结构）
   ↓
P5 HTML → React 组件化（拆分、className 清洗、数据抽离）
   ↓
P6 响应式 + 无障碍（移动优先 + WCAG 2.2）
   ↓
P7 数据接入与状态补全（mock → props/API + 三态）
   ↓
P8 质量门禁（grep 检查 + 视觉回归 + checklist）
```

---

## 5. P0：目标工程初始化（drsell 落点）

1. **不要**在 `apps/web`（Polaris）里装 shadcn。新建前台应用：
   ```bash
   # 在 drsell 根目录
   pnpm create next-app@latest apps/storefront --typescript --tailwind --eslint --app --src-dir=false
   cd apps/storefront
   pnpm dlx shadcn@latest init
   pnpm dlx shadcn@latest add button card input label badge dialog sheet tabs \
     switch checkbox radio-group slider progress dropdown-menu tooltip \
     table form toast sonner skeleton separator avatar calendar popover
   ```
2. Tailwind v4 注意：shadcn 新版 CLI 已支持 v4（`@theme inline` 写法）；Stitch 导出的 class 大多 v3/v4 兼容，个别废弃 utility 需人工替换。
3. 目录约定：
   ```
   apps/storefront/
     app/(marketing)/...      # 路由
     components/ui/           # shadcn 生成组件（不手改）
     components/business/     # 业务组件（转化产物放这里）
     lib/stitch-tokens.md     # 令牌映射表（团队共享）
     lib/stitch-components.md # 组件映射表
   ```

---

## 6. P1：Stitch 侧产出规范（把偏差消灭在生成端）

### 6.1 Prompt 模板（英文生成更稳）

```
Design a [screen type] for [product/audience].
Include: [组件清单，逐条列出].
Style: light theme, brand color #XXXXXX, 8px spacing grid,
rounded corners (16px cards, full-radius buttons), sans-serif,
no purple-blue gradients, no emoji icons, varied icon styles.
```

**反 AI 味清单**（写进 prompt）：不要紫蓝渐变背景 / 避免全部同风格线性图标 / 不要区块交替灰底 / 禁止 emoji 当图标。

### 6.2 主题预对齐（关键）

在 Stitch **全局主题设置**里先改：主题色 → 品牌色 hex、字体、圆角。这样导出的颜色就接近目标 token，后期映射偏差最小。**先改主题再生成页面，不要先生成再全局换色。**

### 6.3 生成纪律

- 多屏 flow 一次生成（多屏一致性靠同一次生成 + 多选批量修改维护）；
- 用**标准模式（Flash）**生成需要 Figma 导出的页面；
- 对话式微调优于重新生成（省额度、保一致性）。

---

## 7. P2：导出与资产收集（每屏三件套）

| 资产 | 用途 | 获取方式 |
|------|------|----------|
| HTML+Tailwind 代码 | 布局/间距/颜色的精确参照 | 点击设计稿 → Code 标签 → 复制 |
| 高清截图 | AI 重写（路线 C）的输入 + 视觉回归基线 | 浏览器截图（可自动化） |
| Figma 帧（可选） | 设计精修与交付 | Copy to Figma（仅标准模式） |

---

## 8. P3：令牌映射表（M3 → shadcn CSS 变量）

> 一次建好写入 `globals.css` / `lib/stitch-tokens.md`，之后所有 `bg-[#6750A4]` 类硬编码按此表替换。

| M3 令牌 | 典型值（M3 默认紫） | shadcn CSS 变量 | Tailwind class |
|---------|--------------------|-----------------|----------------|
| primary | #6750A4 | `--primary` | `bg-primary` |
| on-primary | #FFFFFF | `--primary-foreground` | `text-primary-foreground` |
| secondary-container | #E8DEF8 | `--secondary` / `--muted` | `bg-secondary` / `bg-muted` |
| surface | #FEF7FF | `--background` | `bg-background` |
| surface-container | #F3EDF7 | `--card` / `--muted` | `bg-card` |
| on-surface | #1D1B20 | `--foreground` | `text-foreground` |
| on-surface-variant | #49454F | `--muted-foreground` | `text-muted-foreground` |
| outline | #79747E | `--border` | `border-border` |
| error | #B3261E | `--destructive` | `bg-destructive` |

**非颜色令牌：**

| 类别 | M3 值 | shadcn/Tailwind 约定 |
|------|-------|----------------------|
| 圆角 | 4 / 8 / 16 / 28px | `--radius` 基准；`rounded-md(6)` `rounded-lg(8)` `rounded-xl(12)` `rounded-2xl(16)` `rounded-3xl(24)`；28px → 定为 `rounded-3xl` 或调 `--radius` |
| 字体刻度 | display / headline / title / body / label | `text-4xl~5xl` / `text-2xl~3xl` / `text-lg font-medium` / `text-base` / `text-sm font-medium` |
| 间距 | 4 的倍数为主 | 对齐 8px 基线（`p-2/4/6/8`），杜绝 `p-[17px]` |
| 阴影 | elevation 0–5 | **决策点**：推荐 shadcn 扁平风（`border` + `shadow-sm`），M3 高阴影统一降为 `shadow-sm`；确需层次用 `shadow-md` 封顶 |

---

## 9. P4：组件映射表（M3 → shadcn/ui）

| Stitch/M3 组件 | shadcn/ui 对应 | 转换要点 |
|----------------|----------------|----------|
| Top App Bar | 自建 sticky header + `border-b` | M3 无组件，shadcn 也没有现成 Navbar |
| Filled Button | `Button`（default） | 直接替换 DOM |
| Tonal Button | `Button`（secondary） | |
| Outlined Button | `Button`（outline） | |
| Text Button | `Button`（ghost） | |
| FAB | `Button size="icon" className="rounded-full"` | |
| Extended FAB | `Button size="lg"` + lucide 图标 | |
| Text Field | `Input` + `Label`（表单内用 `Form`） | M3 floating label 不复刻，用静态 Label |
| Chips（assist/filter/input） | `Badge`；filter → `Toggle`；input → 自建 | |
| Card（elevated/filled/outlined） | `Card` + Header/Content/Footer | 三种变体统一为 Card + border |
| Dialog | `Dialog` | |
| Bottom Sheet | `Sheet` | 移动端抽屉首选 |
| Snackbar | `sonner`（toast） | 全局 Toaster 挂根布局 |
| Navigation Bar（底部） | 自建 BottomNav（shadcn 无） | 参考 next-shadcn-dashboard-starter |
| Navigation Rail / Drawer | `Sidebar` / `Sheet side="left"` | |
| Tabs | `Tabs` | |
| Segmented Button | `Tabs` 或 `ToggleGroup` | |
| Switch / Checkbox / Radio / Slider | 同名组件 | |
| List / List Item | 自建（`div` + `flex` + `gap`） | |
| Linear Progress | `Progress` | |
| Circular Progress | `Spinner`（lucide `Loader2` + `animate-spin`） | |
| Menu | `DropdownMenu` | |
| Search Bar | `Input` 前置 `Search` 图标 | |
| Date Picker | `Calendar` + `Popover` | |
| Data Table | `Table`（复杂场景配 TanStack） | |
| Tooltip | `Tooltip` | |

---

## 10. P5：HTML → React 组件化规则

**六条硬规则：**

1. `class` → `className`；内联 `style` 一律提取为 Tailwind class。
2. 三级拆分：**页面（page）→ 区块（section）→ 组件（component）**；一个文件一个组件，业务组件放 `components/business/`。
3. **className 清洗**（对照 P3/P4 两张表）：
   - `bg-[#FEF7FF]` → `bg-background`
   - `text-[#1D1B20]` → `text-foreground`
   - `text-[#49454F]` → `text-muted-foreground`
   - `bg-[#6750A4]` → `bg-primary`（或直接交给 `Button` default 变体）
   - `rounded-[28px]` → `rounded-3xl`（或调 `--radius`）
   - `p-[17px]` → `p-4`
4. 重复结构 → `.map()` + 数据数组；文案进数据，不硬编码在 JSX。
5. 图标 → `lucide-react`；图片 → `next/image`。
6. `'use client'` 只加在含状态/事件的组件；纯展示组件保持 Server Component。

**转化前后对照示例：**

Stitch 导出（原始）：
```html
<div class="flex flex-col items-center p-6 bg-[#FEF7FF]">
  <div class="w-full max-w-[360px] rounded-[28px] bg-white shadow-lg p-6">
    <h1 class="text-[#1D1B20] text-2xl font-bold">今日步数</h1>
    <p class="text-[#49454F] text-sm">8,432 步</p>
    <button class="mt-4 w-full h-14 rounded-full bg-[#6750A4] text-white">查看详情</button>
  </div>
</div>
```

shadcn 转化后：
```tsx
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function StepCard({ steps }: { steps: number }) {
  return (
    <div className="flex flex-col items-center bg-background p-6">
      <Card className="w-full max-w-sm rounded-3xl">
        <CardHeader>
          <CardTitle>今日步数</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {steps.toLocaleString()} 步
          </p>
          <Button size="lg" className="h-14 w-full rounded-full">
            查看详情
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

**路线 C 的 AI 重写 prompt 模板**（强交互页面直接用这个，不翻译 Stitch DOM）：

```
这是 Stitch 生成的页面设计（截图 + HTML/Tailwind 代码附后）。
请用 shadcn/ui + Tailwind + React 重写为组件：
1. 只参考视觉结构与布局，不要照抄它的 DOM 和任意值 class；
2. 颜色/圆角/间距全部走 shadcn 设计令牌（附令牌映射表）；
3. 组件对照表：[附 P4 映射表相关行]；
4. mock 数据抽为 props，补充 loading/empty/error 三态；
5. 移动优先，断点 576/768/992/1200。
```

---

## 11. P6：响应式 + 无障碍

### 响应式（移动优先）

- Stitch **移动端画布**生成的稿天然适配移动优先基线（320px 起步）；
- 桌面端布局**不要靠拉伸移动稿**：重要产品页建议在 Stitch 用 **web 画布再生成一版**，转码时移动稿定结构、web 稿定增强；
- 卡片网格用免媒体查询方案：`grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))]` 或 `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`。

### WCAG 2.2 检查点

- [ ] 正文对比度 ≥ 4.5:1，大字号/UI 组件 ≥ 3:1（自定义品牌色后必须复验，M3 默认调色板一般达标）；
- [ ] 所有交互元素有可见焦点环（shadcn 自带 `focus-visible:ring-2`，Stitch 代码里通常缺失，替换组件后自动获得）；
- [ ] 图标按钮补 `aria-label` / `sr-only` 文本；
- [ ] 禁止仅用颜色传达状态（错误态同时有图标/文案）；
- [ ] 语义化 HTML 优先（`nav`/`main`/`button`），ARIA 只做兜底。

---

## 12. P7：数据接入与状态补全

Stitch 代码全是静态 mock，转化时每屏补齐：

1. **数据抽离**：文案/列表 → props 或 API 类型定义（对接 `@drsell/api` / `@drsell/shared`）；
2. **三态补全**：
   - loading → `Skeleton` 骨架屏（结构与内容区同构）；
   - empty → 空态插画 + 引导操作；
   - error → `Alert` / toast + 重试；
3. **微交互**：按钮 hover 放大 1.05x、按压 0.95x（0.2–0.3s，只动画 `transform`/`opacity`）；提交中 loading 转圈 + 禁用。

---

## 13. P8：质量门禁（合并前 checklist）

```bash
# 门禁 1：无任意值 px class（允许 rounded-full 等具名值）
grep -rn "\-\[[0-9]\+px\]" apps/storefront/components/business/ && echo "FAIL: 存在硬编码尺寸"

# 门禁 2：业务组件里无硬编码 hex 颜色（globals.css 令牌定义处除外）
grep -rn "#[0-9A-Fa-f]\{6\}" apps/storefront/components/business/ && echo "FAIL: 存在硬编码颜色"
```

- [ ] 上述两个 grep 零命中
- [ ] 320px 视口无横向滚动
- [ ] 键盘可走完全部交互路径，焦点可见
- [ ] 每个数据区有三态
- [ ] Playwright 截图与 Stitch 基线截图对比（视觉回归，容差 2–3%）
- [ ] `pnpm build` + `pnpm lint` 通过

---

## 14. 工具链

| 环节 | 工具 |
|------|------|
| 设计生成 | stitch.withgoogle.com（标准模式为主） |
| 设计 → 编码环境 | Stitch 官方 MCP 服务器（支持 Claude Code / Cursor / Gemini CLI） |
| 自动截图/对照 | agent-browser / Playwright（批量截 Stitch 画布做基线） |
| AI 组件化 | Claude Code + 本文档 P3/P4 映射表作为上下文 |
| 视觉回归 | Playwright screenshot 对比 |
| 组件基线 | next-shadcn-dashboard-starter（后台类页面起步模板） |

---

## 15. 工作量参考与风险对策

**工作量（每屏）**：简单展示页 0.5–1.5h；含表单/弹窗页 2–4h；仪表盘类 4–8h（含三态）。建表成本约半天，一次投入全程复用。

| 风险 | 对策 |
|------|------|
| Stitch 生成质量波动（同 prompt 不同结果） | 固定 prompt 模板 + 生成多变体挑选，不反复重roll |
| M3 默认风格与品牌不符 | P1 先在 Stitch 全局主题改色，再生成 |
| 需要 Figma 导出但用了实验模式 | 规则：要进 Figma 的页面一律标准模式生成 |
| Tailwind v3/v4 差异导致 class 失效 | 转化时统一走 shadcn 令牌 class，不搬 Stitch 原始 class |
| Stitch 未来收费/改版（预计 2026 Q4 退出 Labs） | 每屏留存"三件套"（代码/截图/Figma），离线资产不依赖工具存活 |
| React 官方导出将来上线 | 届时路线 A 可提速，但令牌/组件两张映射表仍然需要（风格对齐不变） |
