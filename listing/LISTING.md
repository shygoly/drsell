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
| 当前状态 | Delisted（需重新过审） |
| 测试店铺 | `chatbotdomaintest.myshopify.com` |
| 最后核对 | 2026-09-04，对应扩展版本 `drseller-alpha-30` |
| 演示店 widget 配色 | `#008A57` / `#0A3D2E`（原为商家设的 `#8a5d0a`，为素材统一改绿） |

---

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

**上传状态：三张 desktop screenshot 已上传**（1600×900，Shopify 侧已接收）。
Feature image 槽位仍是旧素材，等你定用哪张。

> 教训：桥接的 `find` 按文案找 "Add" 会命中页面上多个同名按钮。我误点过两次，
> 给 Screenshots 区凭空加了两个空槽，导致 Save 被校验拦下（"1 issues to fix:
> Screenshots"）。已删除。**点 Add/Delete 这类按钮要按 DOM 邻近定位，不要按文案找。**

| 槽位 | file input id | 文件 | Alt text | 长度 |
|---|---|---|---|---|
| Feature image | `:r4o:` | 建议 `screenshots/09-storefront-chat.jpg`（待你确认） | `AI chat widget answering a product question on a storefront` | 59/64 |
| Screenshot 1 | `:r4q:` | `screenshots/01-dashboard.jpg` | `Dashboard with conversation volume and AI resolution rate` | 57/64 |
| Screenshot 2 | `:r4s:` | `screenshots/02-inbox.jpg` | `Inbox showing a customer conversation and visitor details` | 57/64 |
| Screenshot 3 | `:r4u:` | `screenshots/03-widget-config.jpg` | `Widget configuration with a live preview of the chat window` | 59/64 |

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

1. **Feature image 用哪张**：alt 文本已设为 `AI chat widget answering a product
   question on a storefront`，与 `09-storefront-chat.jpg` 正好对应，但首图是门面，
   由你拍板。
0. **开启 Chrome 的「Allow access to file URLs」**，否则截图传不上去（见 Media）。
2. **店铺密码是否写入 App testing information**：审核员必须能进前台，
   但这是凭据，由你决定填写方式。
3. ~~定价与代码实现不符~~ —— 已解决（两档已实现，见 Pricing 一节）。
   仍需人工在 Partner 后台把遗留的三档删成两档。

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

> **表单待办**：Partner 后台的 Pricing 里仍是遗留三档 `Pro` / `Basic` / `Plus`，
> 需删到只剩上表两档。

## 演示视频

`listing/video/dr-sell-demo.mp4` —— 72s / 1920x1080 / 30fps / 1.9MB。
由 `listing/video/build.sh` 从 `screenshots/` 合成，可随时重跑。

**它是静态图合成，不是录屏。** 画面本身是真实应用实拍，但没有光标移动、
打字过程与流式回复。若审核反馈要求真实操作录像，需要另行录屏——
本机终端没有屏幕录制权限，届时要人工授权后重录。
