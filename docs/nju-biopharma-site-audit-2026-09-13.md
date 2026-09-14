# 南大生物医药校友企业官网体检 + Medusa/drsell 价值评估

> 调研日期：2026-09-13　调研对象：南大生物医药校友会名录（飞书 Base「yocsef合作管理」第 18 张表，44 条）去重后的 **20 个企业域名**
> 调研口径：**只记录实测可复现的证据**，不外推。凡属境外 IP / 非浏览器 UA 触发的拦截，一律标注为「地域/WAF 干扰，不计入网站缺点」。
> 复现脚本：`/tmp/probe-sites.sh`（可达性）、`/tmp/tlsprobe.py`（证书）、`/tmp/ai-ready.sh`（AI 可读性）

---

## 0. 结论先行

**三句话：**

1. **这批企业 90% 不是 DTC 电商客户。** 20 家里只有 **5 家**拥有真正意义上的「标准化目录产品」（药石科技、集萃药康、安图生物、汉欣医药、纳肽得），其余是创新药企 / CRO / 医院 / 券商，官网本来就是「可信度铜牌」而非「销售渠道」。**给它们推 Medusa 电商是错配。**
2. **真正的空白在「服务层」，不在「交易层」。** 12 个实测站点中：**0 家部署在线客服挂件、0 家输出商品结构化数据（JSON-LD Product）**。交互模型清一色是「400 电话 + 表单 + 微信二维码」——异步、非工作时间失联、线索不可追踪、问答数据零沉淀。
3. **Medusa + drsell 的正确定位不是「帮你开网店」，而是「把已经写好但没人读得到的产品知识，变成可自助的售前售后通道」。** 对上述 5 家有目录产品的企业是刚需；对创新药企只值一个「AI 接待台」（不该卖电商栈）；对医院/券商不适用。

**关于交付成熟度（2026-09-13 实测更正）**：Medusa 这条路径**已可对外服务**——线上 `https://medusa.szchada.top/` 展示 6 款真实 Medusa 商品（医疗器械功能涂层系列），Store API 正常供给，drsell 挂件已接入，B2B 询盘模块带管理端线索分级。**缺的是「在线交易闭环」（购物车/结算/Stripe/顾客登录）与「治理验收」，不是整个店面。**详见 §6。

---

## 1. 硬伤清单（客观可验证，非主观印象）

以下每一条都有复现命令与原始输出，**与 HTTP 层 WAF 无关**（证书/TLS 层证据，绕过应用层）。

| # | 企业 | 域名 | 实测现象 | 证据 | 定性 |
|---|---|---|---|---|---|
| 1 | 艾码生物 | `exornabio.com` | **HTTPS 完全无法建立** | TLS 握手 `UNEXPECTED_EOF_WHILE_READING`；curl `SSL_ERROR_SYSCALL`；HTTP:80 返 200 | 硬伤 |
| 2 | 三江资本 | `tririvercapital.com` | **HTTPS 完全无法建立** | apex 与 www 双双握手失败 | 硬伤 |
| 3 | 药捷安康 | `transtherabio.com` | **裸域无 DNS；www 的 HTTPS 握手失败、HTTP 陷入重定向死循环** | apex `gaierror`（NXDOMAIN）；`Maximum (50) redirects followed`；港股公告披露的 `transthera.com` 同样循环 | 硬伤 |
| 4 | 嘉逸医药 | `joyglory.com` | **证书链不完整 + HTTPS 空响应** | `unable to get local issuer certificate` + `Empty reply from server` | 硬伤 |
| 5 | 康宁杰瑞 | `alphamabonc.com` | 裸域 HTTPS 无法建立；www 返 403 | apex TLS 握手失败；www 走阿里云 WAF 返回 403 | 硬伤 + WAF |
| 6 | 和誉医药 | `abbisko.com` | **证书链不完整（未下发中间证书）** | Python `ssl` → `unable to get local issuer certificate` | 中危 |
| 7 | 明捷医药 | `mstonepharma.com` | **裸域证书主机名不匹配** | `Hostname mismatch, certificate is not valid for 'mstonepharma.com'`（www 正常） | 中危 |
| 8 | 集萃药康 | `gempharmatech.com` | **裸域无 A 记录** | apex NXDOMAIN，仅 `www` 解析到阿里云 WAF | 中危 |
| 9 | 汉欣医药 | `hanxinpharm.com` | 裸域无 A 记录；`robots.txt` 404；无 sitemap | 同左；站点本体正常（JSP 老式 CMS，`col.jsp?id=311`） | 中危 |
| 10 | 南京鼓楼医院 | `njglyy.cn` | **院名域名指向 GitHub Pages 个人站** | `www.njglyy.cn → lonerabbits.github.io` | 品牌风险 |
| 11 | 纳肽得 | `uwpeptide.com` | **工商登记官网域名现指向体育直播站** | 页面 title = `球帝直播 - 高清体育赛事直播平台` | 品牌/资产风险 |
| 12 | 金斯瑞 | `genscript.com` | 对非浏览器 UA 返 **468**（SafeLine WAF） | Tengine + 468 + `sl-session` cookie；证书本身正常（Sectigo，2026-12-11 到期） | AI 可读性阻断 |

> **口径说明（避免冤枉）**
> - 康宁杰瑞 www 的 403、金斯瑞的 468，**大概率是地域/WAF 拦截**（境外 IP + 非浏览器 UA），中国大陆真实浏览器用户可能无感 → 只作为「机器/AI 访问受阻」记录，**不计入网站设计缺点**。
> - 药捷安康的「重定向死循环」在境外搜索服务商侧可正常取到内容 → 结论写作「**对外部 IP 不稳定**」而非「网站挂了」。
> - 第 1–5 条是 TLS 层事实，与 WAF 无关，判断为**真硬伤**。

---

## 2. AI 可读性实测（12 站）

这一节是本次调研**最有商业价值**的发现。判定口径：AI 客服的上限 = 商品/服务数据的结构化程度。

| 站点 | robots.txt | 声明 sitemap | sitemap 条数 | JSON-LD | Product 标记 | 在线客服挂件 |
|---|---|---|---|---|---|---|
| 艾迪药业 | 200 | 有 | 15 | 0 | 0 | **无** |
| 安图生物 | 200 | 有 | 94 | 1（非商品） | 0 | **无** |
| 药石科技 | 200 | 无 | 404 | 0 | 0 | **无** |
| 集萃药康 | 200 | 有 | 500 | 0 | 0 | **无** |
| 明捷医药 | 200 | 无 | 35 | 0 | 0 | **无** |
| 和誉医药 | 404 | 无 | 404 | 0 | 0 | **无** |
| 歌礼制药 | 404 | 无 | 404 | 0 | 0 | **无** |
| 传奇生物 | 200 | 无 | 301 | 1（非商品） | 0 | **无** |
| 克睿基因 | 200 | 有 | 107 | 0 | 0 | **无** |
| 汉欣医药 | 404 | 无 | 302 | 0 | 0 | **无** |
| 南京鼓楼医院 | 200 | 无 | 404 | 0 | 0 | **无** |
| Baxter/Hillrom | 200 | 有 | 715 | 0 | 1 | **无** |

**三条汇总结论：**

- **在线客服覆盖率 = 0/12。** 检测了 tawk.to / 53kf / 美洽 / Zendesk / Intercom / 七鱼 / 智齿 / 环信 / 企业微信等 18 种主流挂件签名，**全部未命中**。
- **商品结构化数据 = 0/12。** 没有一家用 `schema.org/Product` 或 `Offer` 标记产品。这意味着**通用 AI 搜索（豆包/元宝/ChatGPT/Perplexity）读到这些站时，拿不到可用的产品实体**——只能拿到散文。
- **sitemap 缺失 = 6/12**，其中 4 家连 `robots.txt` 都没有。爬虫友好度普遍偏低。

> **这直接推出 drsell 的结构性优势**：通用 AI 检索依赖爬虫 + 结构化数据，而这两样恰好是这批企业最缺的；drsell 走的是「**直接读你的 Postgres**」（`adp_reader` 三个只读函数，`ADR-7`），**不依赖爬虫、不依赖 schema 标记、不依赖 WAF 放行**。金斯瑞那种 WAF 直接对机器返 468 的站，通用 AI 读不到，drsell 照样读得到。

---

## 3. 逐站信息架构缺点

### A 类｜有标准化目录产品 —— 电商化必要性最高（5 家）

| 企业 | 现状 | 核心缺点 |
|---|---|---|
| **集萃药康** `www.gempharmatech.com` | 英文站质量高，有 Insights/Webinar/博客；称拥有近 **30,000 个基因工程小鼠品系**、800+ 药筛模型 | **全球最大品系库却没有在线品系检索与订购**。所有 CTA 都是 `Contact Us` / `Discuss Your Project`。科研人员查一个品系要发邮件、等回复。**这是整批企业里最大的价值缺口。** 另：裸域无 A 记录，输 `gempharmatech.com` 打不开 |
| **安图生物** `autobio.com.cn` | 产品页信息极深（如 AutoLumo A9000 写了通量/双备份/RFID/注册证数等数千字），有 400-056-9995 热线 | **深度内容锁死在散文里**。226 项化学发光菜单、515 项免疫注册证，全靠人工翻页 + 打电话；无价格、无购物车、无在线询价、无资料自助下载。800+ 服务团队的产能被"查参数"这类低价值问答吃掉 |
| **药石科技** `pharmablock.com` | 首页聚焦 CDMO/砌块服务；`/catalog`、`/product`、`/cn` 全部 404 | **核心资产「砌块化合物目录」未在线化**。首页无 CAS 号检索、无结构式检索、无询价车、无客户登录入口。对全球 700 家合作方来说，查一个砌块要发邮件 |
| **汉欣医药** `www.hanxinpharm.com` | 真实站点（非停放页），JSP 老式 CMS；原料药/成品药两个栏目 | 产品区只有两个链接（`col.jsp?id=311/312`）；`robots.txt` 404、无 sitemap、无检索、无询盘表单、裸域无 A 记录 |
| **纳肽得** `uwpeptide.com` | 工商登记官网 | **域名已被他人占用，现为体育直播站**。公司（青岛国际院士港，陈璞院士发起）实际处于「官网失联」状态——这条应作为待核事项回写原表 |

### B 类｜无目录产品的创新药企 —— 不适用电商（9 家）

| 企业 | 站点实况 | 缺点性质 |
|---|---|---|
| **艾迪药业** `www.aidea.com.cn` | 静态 `.htm` 官网模板，含管线/新闻/投资者专区（实时股价 688488.SH） | 无任何在线服务入口。作为上市公司，IR 咨询靠邮箱/电话 |
| **和誉医药** `abbisko.com` | 管线表格扎实（10+ 小分子项目、临床阶段标注清晰），有 Bilibili 视频 | 证书链不完整（缺中间证书）→ 严格客户端/移动端可能告警；无在线接待 |
| **歌礼制药** `www.ascletis.com` | 英文单页型，代谢/免疫管线介绍详尽 | `robots.txt` 404、无 sitemap；招聘只留 `hr@ascletis.com` 邮箱 |
| **传奇生物** `legendbiotech.com` | WordPress，患者故事/管线/投资者关系齐全，有 `elite` 资助申请入口 | 站点质量在批内最好；**缺的是「药物可及性/患者支持」的即时问答入口**（CAR-T 患者家属问题极多，且合规敏感） |
| **克睿基因** `curegenetics.com` | 新闻流形式，学术合作与融资动态为主 | 信息架构近乎「新闻列表站」，无技术平台/管线结构化导航 |
| **药捷安康** `transtherabio.com` | 港股 2617.HK，官网内容正常 | **HTTPS 握手失败 + HTTP 重定向死循环**（硬伤，见 §1.3） |
| **康宁杰瑞** `alphamabonc.com` | 站点存在 | 裸域 HTTPS 无法建立（硬伤） |
| **嘉逸医药** `joyglory.com` | 站点存在 | 证书链不完整 + HTTPS 空响应（硬伤） |
| **艾码生物** `exornabio.com` | 站点存在（HTTP 可访问，200） | **HTTPS 完全无法建立**——浏览器会直接告警或降级 |

> 对这 9 家，Medusa 的商品/购物车/结算/售后模型**基本无处安放**。可兑现的价值只有三块：**IR/BD 咨询智能接待、招聘答疑、临床试验/患者教育问答**（后者合规敏感，须法务前置）。不足以支撑一套电商栈——**应当卖「AI 接待台 SaaS」，不该卖「独立站」。**

### C 类｜特殊主体 —— 不适用（3 家）

| 主体 | 说明 |
|---|---|
| **南京鼓楼医院** `www.njglyy.com` | 医院门户（公众版/员工版/英文版三入口）。需求是挂号/报告查询/导诊，与电商无关。另：`njglyy.cn` 被个人 GitHub Pages 占用，属院方品牌风险 |
| **广发证券** `gf.com.cn` | 券商官网，受金融监管约束，独立站+第三方 AI 客服的合规路径完全不同 |
| **Baxter/Hillrom** `hillrom.com` → `pro.baxter.com` | 跨国器械巨头，`sitemap` 715 条、唯一有 Product 标记的站点。已有成熟全球电商/服务栈，**不是目标客户** |

---

## 4. Medusa + drsell 的价值映射

### 4.1 drsell 今天真实具备什么（读代码得出，非宣传语）

| 能力 | 出处（仓库锚点） |
|---|---|
| 一行 script 挂件 `drsell-chat.js`，靠 `data-shop` 认店 | `apps/web/widget-src/` |
| AI 经 `adp_reader` 直连 PG，只能调 4 个只读函数：`adp_shop_summary` / `adp_search_products` / `adp_get_order` / `adp_get_after_sales` | `apps/api/prisma/sql/adp-reader.sql` |
| `adp_reader` 零表权限，能力边界靠数据库角色锁死 | `INV-2` / `ADR-7` |
| 多租户以 `Shop` 为根强隔离 | `INV-1` |
| 会话状态机 `ai/pending/human/closed` → **可人工接管** | `ADR-16` |
| 上下文存本地库，网关重启不丢记忆 | `ADR-17` |
| 主备双模型，key 欠费自动切换不中断 | `ADR-15` |
| 运营台写操作全审计 | `INV-3` |
| 配额计量与订阅闸门 | `ADR-14` / `ADR-18` |

### 4.2 Medusa v2 带来什么

product/variant、cart、checkout、order、fulfillment、**return/exchange/claim（售后）**、Stripe、Admin UI，独立 PG + Redis（`openspec/changes/dtc-store-medusa/design.md`）。

### 4.3 价值分层（按可兑现程度排序）

**L1 — 售前技术问答（立刻可兑现，价值最高）**
把已写好的产品文档（安图的数千字参数页、集萃的品系数据、药石的砌块属性）灌进 PG，AI 直接答：「A1800 和 A6000 的差别」「你们有没有针对 FGFR4 的品系」「这个砌块的 CAS 和纯度」。**替代今天只能打电话这一条路。**
> 证据支撑：安图一个产品页含注册证数、通量、温控精度、双备份设计等 10+ 技术维度——这些正是客户反复问的，而站点没有任何检索手段。

**L2 — 询报价在线化（已实现，可直接演示）**
`apps/shop` 里有一个**独立的 B2B 询盘（RFQ）模块**，不是 Medusa 标准能力，是本仓手写的：
- 公开端点 `POST /store/inquiries`：Zod 严格校验 + 按 IP 限流（5 次/分钟）
- **身份分流** `contactRole`：采购 / 渠道代理 / 医院机构 / 其他 → 决定线索归谁跟
- **需求分级** `inquiryType`：采购 / 渠道合作 / 样品打样 / 资料索取 / 售后 → 决定优先级与响应 SLA
- 需求正文带**意向产品、应用场景、预计用量、采购时间线**（immediate / quarter / half_year / planning）
- **线索状态机** `new → qualified → quoted → won → closed`，`source` 区分「官网表单」与「AI 客服转人工」，并带 `conversationId` 把会话与线索串起来
- 管理端 `GET /admin/inquiries`、`PATCH /admin/inquiries/:id`（挂在 Medusa 后台前缀下，复用后台鉴权）
- **刻意不含价格字段**——设计取舍是「隐藏价 → 询价 → 人工报价 → 草稿订单」，避免未审核的报价外流

> 这比「用购物车承载询价单」的通用做法更贴合医药 B2B 的采购惯例。可现场演示：`https://medusa.szchada.top/`


**L3 — 售后自助（已实现并公网复验）**
批号/效期查询、说明书与 SDS 下载、退换货状态。`adp_get_after_sales` 已建成并 GRANT，**公网复验通过**（medusa 店问售后 → AI 调该函数作答）。按登录顾客隔离订单/售后（D8 签名令牌）亦已验：登录顾客只见本人订单，窥探他人订单被拒，匿名一律引导登录。
> 残留：未验签的旧式 `adp_get_order` / `adp_get_after_sales` 仍 GRANT 给共享 `adp_reader`，需为 DTC 建独立 role/agent 才结构性杜绝。

**L4 — 在线交易（唯一真正未实现的一层）**
真正的下单 + 支付（购物车、结算、Stripe、顾客登录 + `account/orders`）**尚未实现**。而且对安图（走经销商体系）、集萃（走销售合同）**可能反而不符合其渠道政策**，需逐家确认是否要做。

### 4.4 适配度矩阵

| 企业 | L1 售前问答 | L2 询报价 | L3 售后自助 | L4 在线交易 | 建议 |
|---|---|---|---|---|---|
| 集萃药康 | ●●● | ●●● | ●● | ●● | **首选标杆客户**（品系库越大收益越大） |
| 安图生物 | ●●● | ●●● | ●●● | ○ | 强需求，但交易需渠道确认 |
| 药石科技 | ●●● | ●●● | ●● | ●● | 全球客户 700 家，目录在线化收益直接 |
| 汉欣医药 | ●● | ●●● | ●● | ●● | 站点最弱，改造空间最大 |
| 明捷医药 | ●●● | ●●● | ●● | ○ | CRO 服务询价，无实物商品 |
| 纳肽得 | ○ | ○ | ○ | ○ | **官网失联，先解决域名** |
| 艾迪/和誉/歌礼/传奇/克睿/艾码/康宁杰瑞/药捷安康/嘉逸 | ●（仅 IR/BD 接待） | ○ | ○ | ○ | **不要推电商**，只推 AI 接待台 |
| 鼓楼医院 / 广发证券 / Baxter | ○ | ○ | ○ | ○ | 不适用 |

图例：●●● 强需求　●● 中等　○ 不适用

---

## 5. 差异化卖点（销售话术的事实底座）

1. **「你的产品文档已经写好了，只是没人读得到。」**
   安图一个产品页的技术细节足够支撑 20 轮问答，但今天只有一条读取路径：打电话。AI 客服是**零新增内容成本**的产能释放。
2. **「通用 AI 读不懂你的网站，我能。」**
   实测 0/12 有商品结构化数据、6/12 无 sitemap、金斯瑞直接对机器返 468。通用 AI 检索的上限被卡死在爬虫层；drsell 直连 PG，**不受 WAF、不受 schema、不受爬虫策略影响**。
3. **「非工作时间你的客户在流失，而且你看不到。」**
   0/12 有在线客服。400 热线 + 表单意味着：8 小时外失联、线索散在个人微信、问答数据零沉淀。drsell 有会话状态机与人工接管（`ADR-16`），**每一次咨询可追踪、可审计、可复盘**。
4. **「AI 说错话的代价，我们用数据库角色锁住了。」**
   `adp_reader` 零表权限（`INV-2`）——即使模型被 prompt injection 说服，它也只能调 4 个只读函数。对医药行业，「合规与可控」比「聪明」重要。

---

## 6. 风险与前置条件（诚实登记）

| 风险 | 说明 | 出处 |
|---|---|---|
| ~~能力尚未完工~~ **（已更正）** | ~~Medusa 路径仅到 Phase 3~~ —— **实测为已完成**：目录展示、店内挂件（含按顾客隔离）、生产部署（Redis + 独立 PG + pm2×2 + nginx vhost + 自签证书）均已上线。**剩余缺口见下** | `openspec/changes/dtc-store-medusa/tasks.md`、commit `98f2200` |
| **在线交易闭环未做** | 购物车、结算、Stripe 支付、顾客登录 + `account/orders` 售后入口（tasks 1.2 / 6.2 / 6.3）均未实现。当前商品价格为 0，属展示态 | tasks.md 6.2/6.3 |
| **可靠投递未做** | subscriber 现为 in-memory event bus，失败仅记日志；outbox / Redis 可靠投递（4.2）与库存、软删的真实事件校验（4.3）待补 | tasks.md 4.2/4.3 |
| **治理验收未做** | `DECISIONS.md` **未登记** Medusa 的 ADR（复用 `shopify*Id` 列）与 DEP（引入 Redis）；`pnpm spec` / `pnpm test` 未跑绿（9.1–9.3） | tasks.md 9.1–9.3；已验证 `DECISIONS.md` 无相关条目 |
| **Admin 后台公网可达** | `medusa.szchada.top/app` 返 200（登录页），访问保护（认证 / IP 限制）未加（8.3） | tasks.md 8.3 |
| **⚠️ 询盘模块源码未入版本库** | `apps/shop/apps/backend/src/{modules,api,admin}/` 在 `git status` 中为**未跟踪（`??`）**——即生产上正在运行的 B2B 询盘能力**不在 git 里**。`apps/shop/README.md` 的约定是「只提交手写源码、不提交 create-medusa-app 生成产物」，而询盘模块属**手写源码**，理应提交。**建议在提供演示链接给客户前先提交**，否则演示依赖一份无版本追溯的代码 | `git status` 实测 2026-09-13 |
| **生产 reader 残留边界** | 未验签的旧式 `adp_get_order` / `adp_get_after_sales`（按订单号、不看顾客）仍 GRANT 给共享 `adp_reader`；medusa prompt 不列它们，但结构性杜绝需为 DTC 建独立 role/agent | tasks.md 7.2 残留边界 |
| **生产 reader 改动** | `adp_get_after_sales` + `buildSupportSystemPrompt` 按 source 参数化属生产 AI 链路改动，须先隔离验 tool calling（含 GLM 兜底）再公网复验 | design.md D3、`ADR-15` |
| **库存同步** | stock 在 Medusa Inventory 模块，不随 product 事件变，不同步会导致 AI 报错库存 | design.md S3 |
| **事件顺序** | Redis 总线 at-least-once 且可能乱序，需按版本拒绝旧写 | design.md S5 |

---

## 7. 建议的下一步

1. **先把「官网硬伤」当敲门砖**（不要以售前身份说，以"校友企业互检"的名义）——12 条硬伤里有 5 条是 TLS 层事实，任何 IT 负责人一看就认。
2. **标杆客户锁定集萃药康**：品系库规模（近 30,000）与站点自助能力的落差最大，ROI 最好讲故事。
3. **药石科技做第二单**：全球化客户 700 家，砌块目录在线化是行业标配（对比 Sigma-Aldrich / Enamine 的自助检索）。
4. **创新药企改卖「AI 接待台」**：轻量交付、按会话计费，不要上 Medusa。
5. **回写飞书原表**：新增「官网」与「官网体检结论」两列（含纳肽得域名失联、鼓楼医院 `.cn` 域名被占两条）。**变更 Base 属写操作，待确认后再执行。**

---

## 更正记录（2026-09-13 当日复核）

本报告初版把「Medusa 路径只到 Phase 3」写进了 §0 与 §6，**该结论错误**。错误来源与更正依据：

| 项 | 初版（错误） | 实测更正 | 依据 |
|---|---|---|---|
| 店面（Phase 6） | 「未做」 | **目录展示已做**（静态页 client-side 调 Store API）；购物车/结算/登录未做 | tasks.md 6.1 `[~]`；线上实测 6 款商品可查 |
| 店内挂件（Phase 7） | 「未做」 | **已完成并线上验证**，含按登录顾客隔离订单/售后 | tasks.md 7.2 `[x]`；线上挂件 `drsell-chat.js?v=20260913c` 已加载 |
| 正式部署（Phase 8） | 「未做」 | **已完成**：Redis + 独立 PG + pm2 `drsell-shop-web`/`drsell-shop-medusa` + nginx vhost + 自签证书 | tasks.md 8.1–8.3 `[x]`；`/health` 200、`/app` 200 |
| L2 询报价 | 「1–2 个月可交付」 | **已实现**（独立 RFQ 模块 + 管理端线索分级），且**未记录在 tasks.md** | `apps/shop/apps/backend/src/modules/inquiry/`、`api/{store,admin}/inquiries/` |
| L3 售后自助 | 「需先过隔离验证」 | **已实现并公网复验** | tasks.md 5.4 `[x]` |

**根因**：`apps/shop/README.md` 的「待续」小节是**过期文本**（写于 Phase 6/7/8 完成之前），而它比 `tasks.md` 更醒目，被当成了事实来源。同一问题也存在于 `apps/shop-web/README.md`（其「待续」仍称 7.2 顾客隔离待做）。**两份 README 的过期段落已在本次一并修正**，避免后续再被误导。

> 教训与 `AGENTS.md` 的既有告诫同源：**文档漂移比没有文档更危险**。凡「某事做完没有」的判断，应以 `openspec/changes/*/tasks.md` 的勾选状态 + 线上实测为准，README 叙述仅作参考。

---

## 附：调研方法与可复现

```bash
# 1) 可达性 + 性能（20 域名，6 并发）
bash /tmp/probe-sites.sh && column -t -s $'\t' /tmp/probe-results.tsv

# 2) TLS 证书取证（绕开 HTTP 层，判定硬伤用）
/Users/mac/.workbuddy/binaries/python/versions/3.13.12/bin/python3 /tmp/tlsprobe.py

# 3) AI 可读性（robots / sitemap / JSON-LD / 客服挂件）
bash /tmp/ai-ready.sh && cat /tmp/ai-ready.tsv
```

**未覆盖项（本轮未做，如需可补）**：移动端响应式实测、Core Web Vitals 实测、SEO 关键词排位、微信生态（公众号/小程序）能力的实际可用度。
