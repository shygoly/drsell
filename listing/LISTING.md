# Shopify App Store listing — Dr Sell

提交表单的**唯一事实来源**。改文案先改这里，再抄进表单，避免每次重新想一遍。

> **表单已于 2026-09-04 通过浏览器桥接填入并保存**，整页重载回读验证通过：
> 文案全部在限额内、中文残留 0、三张截图已上传、5 条 search terms 已加、
> 审核说明 1520/2800 已写入（密码位置留占位符）。校验错误 0。
>
> 定价曾是阻塞项（代码只有一档、listing 要写两档）。**已解决**：两档已实现
> 并有配额守护，见下方 Pricing 一节。

| | |
|---|---|
| App | Dr Sell |
| App ID | 264501002241 |
| client_id | `0b36b70772220b71b2fe296b3deba914` |
| handle | `drseller-alpha` |
| 提交表单 | https://apps.shopify.com/services/partner-app-submissions/0b36b70772220b71b2fe296b3deba914/en |
| 当前状态 | **Delisted — 由 Shopify 下架，原因在邮件里**（见下方「真正的阻塞点」） |
| 测试店铺 | `chatbotdomaintest.myshopify.com` |
| 最后核对 | 2026-09-05，对应扩展版本 `drseller-alpha-31` |
| 演示店 widget 配色 | `#008A57` / `#0A3D2E`（原为商家设的 `#8a5d0a`，为素材统一改绿） |

---

## 真正的阻塞点：应用处于 Delisted，Publish 被锁

2026-09-05 查到的实况。Partner 后台
`https://partners.shopify.com/3746733/apps/264501002241/distribution/app-store` 上写着：

> **Critical — Delisted。Check your email for details.**
> Your listing has been removed from the App Store in all languages.
> **You can't publish languages in a delisted status.**

`Publish` 按钮带 `aria-disabled="true"`，整个提交表单里也**没有** "Submit for review"
——只有 Save 和 Preview listing。

**结论：把表单填完不等于能提交。** 表单内容已经全部就绪（校验错误 0），但在
Delisted 解除之前，无论内容多完整都发不出去。下一步不是继续改文案，而是：

1. 找到 Shopify 发来的下架通知邮件，确认它列出的具体原因；
2. 按邮件指引整改并回复/申诉；
3. 状态恢复后，Publish 才会解锁。

本目录里的素材与文案在那之前保持可用，不需要重做。

## Basic app information

| 字段 | 值 | 限额 |
|---|---|---|
| App name | `Dr Sell` | 7/30 |
| Primary category | Store management › Support › Chat | — |
| Category details | Real-time messaging · AI chatbots · Automated responses · Customization · Chat window | 最少 1 个 |
| Languages | English | — |
| App icon | 在 Partner Dashboard 维护，表单只读 | — |

---

## App store listing content

### Introduction （96/100）

```
AI chat that answers product and order questions on your storefront, in each shopper's language.
```

### App details （499/500）

```
Dr Sell adds an AI support agent to your storefront via a theme app extension — one toggle, no code.

It answers from live Shopify data: product availability and pricing, and order status once a shopper gives an order number. It replies in the shopper's own language.

In your Shopify admin:
- Guided setup that syncs products, orders and customers
- An inbox with every conversation's transcript
- Widget colour, position and greeting, with live preview

Replies come from DeepSeek via our gateway.
```

### Features

| # | 值 |
|---|---|
| 1 | `AI chat widget that answers product and order questions` |
| 2 | `Replies in whatever language the shopper writes in` |
| 3 | `Customizable widget colors to match your storefront brand` |

### Demo store URL

**留空。** 测试店是开发店，前台强制密码保护，无法提供公开可访问的 demo URL。
审核用的店铺密码写在下面的 App testing information 里。

---

## Media

Feature image / video 一个槽位，desktop screenshots 三个起（可加）。
图片文件在 `listing/screenshots/`，全部 1600×900，已裁掉 Shopify 后台导航与浏览器边框。

**上传状态：首图 + 三张 desktop screenshot 全部就位**（1600×900，重载回读验证过）。

首图原是一张纯文字营销图（深色底 + 机器人图标 + "Shopping guide-style intelligent
customer service, more actively encourages customers to place orders"）。换掉它有三个
理由，不是审美偏好：alt 文本写的是 storefront 上回答商品问题，图里没有，**自相矛盾**；
文案里的「主动促单」是本应用做不到的能力，属**超范围声明**；Shopify 本页 DON'T 明写
「不要用大量文字的图」。现已换成 `09-storefront-chat.jpg`——真实前台 + widget 正在
用真实商品和价格回答 "Do you have any snowboards under $700?"。

> 换图的操作坑：填满的槽位 Polaris DropZone 会带 `--isDisabled`，直接塞 file input
> 或派发 drop 事件都没反应（页面零网络请求）。删除按钮 `_DeleteAction_*` 只在 hover
> 时可见，得先删掉旧图腾空槽位，DropZone 才恢复可用。旧图已下载留底再动手。

> 教训：桥接的 `find` 按文案找 "Add" 会命中页面上多个同名按钮。我误点过两次，
> 给 Screenshots 区凭空加了两个空槽，导致 Save 被校验拦下（"1 issues to fix:
> Screenshots"）。已删除。**点 Add/Delete 这类按钮要按 DOM 邻近定位，不要按文案找。**

| 槽位 | 文件 | Alt text | 长度 |
|---|---|---|---|
| Feature image | `screenshots/09-storefront-chat.jpg` ✅ 2026-09-05 已换 | `AI chat widget answering a product question on a storefront` | 59/64 |
| Screenshot 1 | `screenshots/01-dashboard.jpg` | `Dashboard with conversation volume and AI resolution rate` | 57/64 |
| Screenshot 2 | `screenshots/02-inbox.jpg` | `Inbox showing a customer conversation and visitor details` | 57/64 |
| Screenshot 3 | `screenshots/03-widget-config.jpg` | `Widget configuration with a live preview of the chat window` | 59/64 |

> file input 的 id 是 React 生成的，页面重载后会变。上传前重新读一遍，别照抄。

备用（可加为 Screenshot 4-7）：

| 文件 | 建议 alt text |
|---|---|
| `screenshots/04-setup-welcome.jpg` | `Guided setup explaining what the assistant can access` |
| `screenshots/05-setup-widget.jpg` | `Setup step for widget appearance and store data sync` |
| `screenshots/06-setup-done.jpg` | `Setup complete with the AI agent live on the storefront` |
| `screenshots/07-settings.jpg` | `App settings showing the connected Shopify store` |
| `screenshots/08-storefront-widget.jpg` | `Chat button in the corner of a live Shopify storefront` |

> Shopify 明确要求：截图不得含浏览器 UI 或桌面背景，不得出现任何可识别个人信息。
> 现有截图已满足——访客只显示 `41.` / `05.` 这类编号，客户面板如实说明未关联 Shopify 客户。

---

## Support / contact

| 字段 | 值 |
|---|---|
| Support email | `guoliang@szchada.com` |
| Privacy policy URL | https://drsell.szchada.top/privacy |
| Developer website | https://github.com/shygoly/drsell |
| Changelog | https://github.com/shygoly/drsell/commits/main |
| Additional documentation | https://github.com/shygoly/drsell#readme |
| Support portal / FAQ / Tutorial | 留空 |

---

## App discovery content

| 字段 | 值 | 限额 |
|---|---|---|
| Subtitle | `AI chat answering product and order questions in any language` | 60/62 |
| Title tag | `Dr Sell \| AI Chat Widget for Product and Order Questions` | 56/60 |
| Meta description | `Add an AI chat widget to your storefront that answers product and order questions. Track chats and AI-resolved conversations from one dashboard.` | 143/160 |
| Search terms | `Smart Customer Service` · `Shopping Guidance` · `Intelligent Chatbot` · `AI customer support` · `live chat`（上限 5 条，已满） |

---

## App testing information

审核员需要的完整信息。**店铺前台有密码保护**（开发店无法关闭），这条必须写进去，
否则审核员打不开前台、看不到 widget。

**已写入表单（1520/2800）**，其中密码位置是占位符 `<<< ENTER STOREFRONT PASSWORD
HERE >>>`，需人工替换——把密码填进输入框不是我能做的操作。

```
Test store: chatbotdomaintest.myshopify.com
Storefront password: <<< ENTER STOREFRONT PASSWORD HERE >>>

1. Install Dr Sell and approve the standard authorization for your store.
2. The app opens in your Shopify admin. Complete the guided setup.
3. Open Widget Config and set the widget colour, then Save.
4. Open the storefront (enter the storefront password above), and click the
   chat button in the bottom-right corner.
5. Ask "What products do you sell?" or "Do you have any snowboards under $700?".
   The assistant answers from the store's live catalogue.
6. Ask "Where is my order?" — it asks for an order number, then looks it up.
7. Back in the admin, open Inbox to see the conversation and its transcript.
```

---

## 与应用实际能力的对照（每次改文案都要重新核对）

审核员会拿描述逐条点。以下是**已核实**的能力边界：

| 能写 | 不能写 |
|---|---|
| 商品可用性、价格、库存（经 MCP 实时查 Shopify 数据） | 退货政策、配送政策——AI 拿不到政策页 |
| 订单状态（顾客提供订单号后） | 深度分析报表——Analytics 页仍是 Coming soon，已从导航移除 |
| 跟随顾客语言回复 | 多店管理——嵌入态 Settings 只显示当前店铺 |
| Inbox 完整会话记录 | 客户档案/终身价值——会话未关联 Shopify 客户 |
| widget 颜色、位置、欢迎语、实时预览 | |

2026-09-04 已据此删掉旧文案里的 Analytics 与多店声明。

---

## 未决（需要人决定，勿擅自填）

1. ~~Feature image 用哪张~~ —— 已换成 `09-storefront-chat.jpg`（见 Media 一节的三条理由）。
2. **店铺密码是否写入 App testing information**：审核员必须能进前台，
   但这是凭据，由你决定填写方式。
3. ~~定价与代码实现不符~~ —— **已全部解决**：两档已实现、已在 Partner 后台建好、
   遗留三档已删、表单 Display name 与 top features 已填并重载验证。

---

## Pricing

**这张表由 `spec/check-pricing.mjs` 与 `@drsell/shared` 的 `PLANS` 逐行对账**（`ADR-14`）。
改价格先改 `PLANS`，再抄到这里和表单——反过来会红。

| Display name | Price (USD/月) | AI answers / 30 天 |
|---|---|---|
| Basic | 15 | 1500 |
| Pro | 30 | 5000 |

两档的差别**只有额度**，没有功能门禁：同样的实时商品/订单问答、同样的 Inbox、
同样的 widget 定制。这是刻意的——按功能切分需要在代码里到处加门禁，
而额度切分只有一个闸门，审核员也一眼能验证。

超额行为（`apps/api/src/quota/quota.service.ts`）：

- 计数单位是**一次成功的 AI 回答**。请求失败、被闸门拦下、商家人工回复都不计。
- 闸门在调模型**之前**，超额不产生任何上游成本。
- 顾客看到：`I'm not able to answer right now. Please leave your question here and
  the store team will follow up.` 会话转 `pending` 并计未读，商家在 Inbox 里能接手。
  提示里不含套餐与用量——那是商家的商业信息，不该给顾客看。
- 周期跟随订阅 `currentPeriodEnd` 倒推 30 天，配额随扣费重置。

两档都带 **7 天免费试用**（沿用本 app 原有三档的一致做法，未改变）。

### 计费实况（不是文案，是线上事实）

Partner 后台开着 **Shopify 托管计费（App Pricing）**——「新订阅走已发布的
App Pricing 方案」。也就是说商家是在 **Shopify 自己的界面**选套餐，
不经过 `billing.service.ts` 的 `createCharge`。

| 方案 handle | Plan name | 价格 | 状态 |
|---|---|---|---|
| `basic` | Basic | $15/月，7 天试用 | 2026-09-05 新建 |
| `pro` | Pro | $30/月，7 天试用 | 2026-09-05 新建 |

handle **刻意等于**代码里的 `PlanCode`，`app_subscriptions/update` webhook
回查 Shopify 后按 plan name 映射写回 `Subscription.planCode`，配额据此发放。

遗留的三档 `drseller-usd126`($126) / `drseller-usd14`($14) / `drseller-usd42`($42)
已于 2026-09-05 删除。它们是 **public** 方案，留着商家就能选到与 listing 不符的价格
——正是驳回项。删除前确认零活跃订阅；Shopify 确认框也写明已订阅商家不受影响
（dev store 上那条历史 $14 订阅仍在，属正常）。

## 演示视频

`listing/video/dr-sell-demo.mp4` —— 72s / 1920x1080 / 30fps / 1.9MB。
由 `listing/video/build.sh` 从 `screenshots/` 合成，可随时重跑。

**它是静态图合成，不是录屏。** 画面本身是真实应用实拍，但没有光标移动、
打字过程与流式回复。若审核反馈要求真实操作录像，需要另行录屏——
本机终端没有屏幕录制权限，届时要人工授权后重录。
