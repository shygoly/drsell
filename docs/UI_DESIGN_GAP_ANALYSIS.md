# drsell.szchada.top UI 设计落地差距分析

> 基线：`design/stitch-export/stitch_shopify_ai_chat_dashboard/`（Google Stitch 高保真稿，5 屏）
> 实测：2026-08-30，drsell.szchada.top 线上页面 + Shopify Admin embedded app
> 证据截图：`/tmp/drsell-live-*.png`、`/tmp/drsell-admin-*.png`（浏览器视口截图）

## 总览

| 页面 | 设计还原度 | 关键差距 | 优先级 |
|---|---|---|---|
| `/` Home Dashboard | 高（约 90%） | 知识库建议文案与稿不一致；图表无轴标签 | P1 |
| `/ai-assistant` | 中（约 60%） | 缺右侧 Test your AI 面板；Persona 字段（Tone/Language）与稿不同；Behavior 控件（checkbox vs toggle）与稿不同；Permissions 行样式不同；系统提示卡片缺 Expert Mode 徽标/Save 布局 | P0 |
| `/inbox` | 中低（约 45%） | 缺右侧 Customer Context 面板；Thread 空（无消息）；Take over/Resolve 禁用；Filter 标签与稿不同；Composer 禁用 | P0 |
| `/onboarding` | 中高（约 80%） | 被 AppShell 包裹，稿为独立全屏欢迎页；进度条与卡片宽度不一致；无步骤标签 | P1 |
| `/widget-config` | 低（未登录时 20%；登录后 50%） | 未登录只显示 Connect 卡；登录后仍缺 Deployment Live/Appearance 多选项/Content & AI Identity/完整 Live Preview；Admin embedded 路径偶发空白 | P0 |

## 页面级差距明细

### 1. Home Dashboard
- 已还原：Sidebar/TopBar/StatusBanner/Overview/4 KPI/Chart/Live Conversations 与稿基本一致。
- 差距：
  - 知识库建议卡文案：稿 = “Your knowledge base lacks a returns policy answer — add it to resolve ~15% more questions automatically.”；线上 = “Add missing shipping articles…”。
  - 图表无日期刻度/网格（稿同样无刻度，可不改）。
- 结论：改 FALLBACK_SUGGESTION 与 API suggestion 文案即可。

### 2. AI Assistant Settings
- 已还原：AI Status、Persona 基础、Behavior & Handoff、AI Permissions、System Prompt 卡片存在。
- 差距：
  - 右侧 Test your AI 沙箱面板完全缺失（线上只有底部按钮卡）。
  - Persona：稿 = 头像 + Change Avatar + AI Name + Conversational Tone 下拉 + Primary Language 下拉；线上 = 头像 + Assistant name + Tone 分段按钮。
  - Behavior & Handoff：稿 = 3 个 checkbox（Customer explicitly asks for human / Complaint detected / High-value order query）；线上 = 3 个 switch（Detect customer full name / Suggest only mode / Escalate after N turns）。
  - AI Permissions：稿 = 3 行（View Orders/Track Shipping 已启用圆点、Issue Discounts Enable、Process Refunds Enable）；线上 = 4 个 switch。
  - System Prompt：稿 = Expert Mode 徽标 + 等宽 textarea + Save Settings；线上 = 普通 textarea + 无徽标。
  - 副标题文案与稿不同。

### 3. Inbox Conversations
- 已还原：左导航、顶部条、AI Service Active 横幅、会话列表、聊天主区基本结构。
- 差距：
  - 右侧 320px Customer Context 面板缺失（profile/orders/cart/quick actions）。
  - 选中会话 Thread 为空（“No messages in this thread.”），稿中有完整对话 + AI 订单卡片 + typing indicator。
  - Take over / Resolve 按钮 disabled，稿为可操作。
  - Filter 稿为 Open / Mine / Resolved；线上为 All / AI Handling / Pending / Human。
  - Composer 稿为可输入 + attach/bolt/emoji 工具栏 + Press Enter to send；线上禁用。
  - 列表数据与稿不一致（稿为 Sarah M./Michael T./Jessica R.），但线上数据来自 API/fallback，可接受。

### 4. Onboarding Welcome
- 已还原：5 段进度条、Welcome 标题、3 个 feature 卡、权限说明、Skip/Get started。
- 差距：
  - 稿为独立欢迎屏（无 Sidebar/TopBar）；线上被 AppShell 包裹。
  - 稿中 feature 图标为 forum / local_shipping / question_answer；线上为 MessagesSquare / Package / Bot，语义基本一致但图标不同。
  - 进度条宽度与卡片不一致。

### 5. Widget Configuration
- 已还原（登录后）：Appearance、Conversion Tools、Deployment、Live Preview 的基础形态。
- 差距：
  - 未登录只显示 “Connect your Shopify store” 单卡，无法看到设计稿。
  - 稿的 Deployment 有 “Theme app embed ● Live” + Open theme editor + Show widget to visitors toggle；线上无 Live 徽标，只有 Open theme editor 按钮 + Save。
  - 稿的 Appearance 有 Primary Color 5 色板、Header Color、Widget Position、Window Size 三段、Launcher Icon Style 三卡；线上只有 color input + position tabs。
  - 稿的 Content & AI Identity 有 AI Assistant Name、Avatar/Change Avatar、quick-reply chips 编辑；线上为 Conversion Tools（disabled switch）+ Welcome message。
  - Live Preview 稿有 desktop/mobile toggle、浏览器 mockup、聊天 widget 消息/quick chips/input；线上只有简单气泡。
  - Admin embedded `/widget-config` 偶发空白/骨架不渲染。

## 修复顺序（本目标循环）
1. P0：AI Assistant 补齐 Test your AI 右栏 + Persona/Behavior/Permissions 对齐。
2. P0：Inbox 补齐 Customer Context 右栏 + fallback 消息 + 交互按钮。
3. P0：Widget Config 未登录演示模式渲染完整设计 + 补齐配置项。
4. P1：Onboarding 独立全屏布局。
5. P1：Home 知识库文案。
6. 部署并重新截图验证，继续循环。

## 本轮修复进展（Round 1 后）
- [x] Home 知识库文案：API suggestion 已改为稿文案，线上验证 hasReturns=true。
- [x] AI Assistant：补齐右侧 Test your AI 沙箱；Persona 下拉（Tone/Language）；Behavior 三 checkbox；Permissions 三行；System Prompt Expert Mode；已部署线上验证。
- [x] Inbox：补齐右侧 Customer Context 面板；fallback 线程消息（本地/线上 DOM 验证 hasFallback=true）；Open/Mine/Resolved 筛选；Take over/Resolve 可点；composer 可输入。
- [x] Onboarding：改为独立全屏欢迎页（无 AppShell），线上截图验证。
- [x] Widget Config（公开页）：未登录也渲染完整设计（Deployment/Appearance/Content & AI Identity/Live Preview），线上验证。
- [x] Widget Config Live 徽标未登录时改为 “Not connected”。
- [ ] **Admin embedded /widget-config 仍空白**（iframe 已创建但内容不渲染；AI Assistant embedded 正常）。下一步需要检查 iframe 控制台/网络或改用 apps/web 路由承载该页。
- [ ] Inbox 右侧 Quick Actions 在视口底部被截断（需滚动/布局调整）。
- [ ] AI Assistant 初始 typing indicator 已消除；交互发送后可正常出现。

## Round 2 进展（Admin embedded 修复）
- [x] 定位 Admin embedded 所有页面空白根因：`app/loading.tsx` 让 Next.js 输出 streaming skeleton + hidden content；在 Shopify iframe 中水合未完成时永远停留 skeleton。移除全局 `loading.tsx` 后，服务端直接输出完整 UI。
- [x] `app-bridge.js` 脚本在 iframe 中会导致页面卡在 Shopify 自带 loading 层；当前 storefront 已移除该脚本（保留 `shopify-api-key` meta）。Admin embedded 各页已可渲染完整 UI。
- [x] Admin `/widget-config`：PDF 实测渲染完整配置 UI（Deployment/Appearance/Content & AI Identity/Live Preview），显示 “Preview mode — showing default settings.”。
- [x] Admin `/inbox`：完整三栏 UI 渲染；线程消息改为服务端初始 fallback（`Hi John...`），不再依赖客户端水合。
- [x] Admin `/ai-assistant`：完整设置页 + Test your AI 面板渲染。
- [ ] 待办：确认移除 App Bridge 对生产环境功能的影响（OAuth/App Bridge 导航），后续可换用 `@shopify/app-bridge-react` 正确初始化而非裸 CDN。

## Round 3 进展（App Bridge 异步化 + 生产就绪）
- [x] 将 App Bridge 改为 `async` 加载：Admin embedded 页面既保持完整渲染，又保留桥接脚本（不再空白）。
- [x] 最终配置：移除全局 `loading.tsx` + App Bridge async + 服务端直出完整 UI。
- [x] Admin `/ai-assistant`、`/inbox`、`/widget-config` 均确认渲染完整设计。
- [x] 远程 API 验证：`/api/shopify/auth/login` 与 `/api/shopify/botSettings/shop/:shop` 均返回 200；说明接口本身可用。
- [ ] 仍待生产链路：Admin iframe 内 `fetchBotSettings` 偶发失败显示 “Preview mode — showing default settings”，需进一步排查 iframe 内 fetch/Authorization 行为；以及 App Bridge session token 正式接入。
- [ ] “Coming soon” 页面（Customers/Analytics/Settings/Support/Documentation/History）仍是占位，非 Stitch 五屏设计范围，可后续按需补全。

## Round 4 进展（关键根因修复）
- [x] **根因确认：客户端构建未内联 `NEXT_PUBLIC_API_URL`**。此前 targeted 部署使用本地无 env 的 `next build`，导致浏览器里 API 地址回退为 `http://localhost:3001/api`，所有前端 fetch 都 `TypeError: Failed to fetch`。
- [x] 已用 `NEXT_PUBLIC_API_URL=https://drsell.szchada.top/api` 重新构建并部署。
- [x] Admin `/widget-config` 的 “Preview mode — showing default settings.” 消失，改为加载真实 store 配置；Deployment/Appearance/Window Size/Launcher/Live Preview 完整渲染。
- [x] 前端与后端 API 链路在 Admin iframe 内打通（login + botSettings GET）。
- [ ] 剩余：Customers/Analytics/Settings/Support/Documentation/History 占位页；App Bridge session token 的正式接入可继续优化。
