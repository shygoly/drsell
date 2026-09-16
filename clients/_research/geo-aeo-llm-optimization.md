# GEO / AEO / LLM 收录优化：B2B 医疗器械内容站生成器可落地做法（2025–2026）

> 调研日期 2026-09-15。目的：把可实施做法纳入 `b2b-site-build` 生成器（静态 HTML 产物 +
> `validate-build.mjs` 校验器），让站点能被 AI 答案引擎（ChatGPT/OAI-SearchBot、Perplexity、
> Google AI Overviews & AI Mode、Claude、Gemini、Bing Copilot）抓到、正确提取事实、并被引用。
> 一手/官方与实证来源见文末「来源」。营销博客的断言一律不作为结论依据。

---

## 结论先行

1. **把工程量押在"清洁语义 HTML + JSON-LD 结构化数据 + 可爬性"三件事上**——这是同时对 Google AI
   Overviews（RAG grounding）、Bing/Copilot、Perplexity 和通用 LLM 抽取都成立的**唯一有官方与实证背书**的杠杆。生成器已产静态 HTML（原始 HTML 里就有事实），这是最大先天优势，别浪费。
2. **schema.org JSON-LD = 事实标准，做**；但要诚实：Google 官方明说结构化数据**不是** AI 功能的
   *必需项*，它的直接价值是经典搜索的 rich results 与实体消歧，对 LLM 抽取是**间接**帮助。所以做它是因为"低成本、多引擎通吃、且是实体可信度信号"，不是因为它能单独换来 AI 引用。
3. **llms.txt = 提案，不是标准，别当 AI 可见性功能做。** 实证（Ahrefs 13.7 万站）显示 97% 的
   llms.txt 从未被抓取，真正会引用你的检索类 AI bot 抓取量约等于 0；Google 官方"辟谣"章节点名它无用。**仅**作为近零成本的默认产物保留（面向未来的 agent/编码工具），且必须防注入。
4. **AI 爬虫默认 ALLOW 检索/搜索类 bot**（OAI-SearchBot、PerplexityBot、Claude-SearchBot、
   Googlebot、Bingbot、Google-Extended）——被抓取是被引用的前提；训练类 bot（GPTBot、ClaudeBot）做成配置开关。robots.txt 只是"意愿声明"、非强制，用户触发的抓取器直接无视它。
5. **别做**：给 AI 单独"切块/改写"内容、堆砌关键词、刷不实提及、为营销站上公开 MCP/自建 agent API、
   依赖 FAQ rich result（Google 已于 2026-05 下线）。这些要么被官方辟谣、要么被实证证伪、要么是过度设计。

---

## 结构化数据

### 用哪些类型（医疗器械 B2B）

| schema.org 类型 | 放在哪 | 用途 / 引擎是否真用 | 优先级 |
|---|---|---|---|
| `Organization` | 首页 / 关于页（全站一次） | **实体消歧 + 可信度信号**。无必填字段，填 `name/url/logo/sameAs/address/contactPoint/description/foundingDate` + 商业标识符（`vatID`/`iso6523Code`/`duns`/`naics`）。LLM 与 Google 都用它确认"你是谁"。 | **P0** |
| `Product` | 每个产品页 | **商业上唯一有用的类型**：`brand/manufacturer/sku/mpn/gtin/image/description` + 可选 `offers`。这是 Google 产品富结果与 LLM 提取产品事实的载体。B2B 不在线成交→用 **Product snippet** 类（不需要 `offers`/价格），非 Merchant listing。 | **P0** |
| `MedicalDevice` | 作为 `Product` 的 `additionalType`，或 `@graph` 里单独节点 | ⚠️ **关键坑**：`MedicalDevice` 是 `MedicalEntity` 子类、**不是 `Product` 子类**，**没有价格/品牌/offers，Google 也没有对应富结果**。它承载临床语义：`contraindication`（禁忌）、`procedure`、`adverseOutcome`、`relevantSpecialty`、`code`（SNOMED/ICD）。用它给 LLM 补"临床含义"，但**别拿它替换 Product、别指望富结果**。 | P1 |
| `BreadcrumbList` | 每个深层页 | Google 仍支持的富结果；帮所有解析器理解层级；成本极低。 | **P0** |
| `FAQPage`/`Question`/`Answer` | 有 FAQ 的页 | ⚠️ **Google 自 2026-05-07 起不再展示 FAQ 富结果**（工具 6–8 月陆续下线）。JSON-LD 本身无害但富结果价值≈0。**真正有价值的是页面上可见的 Q&A 文本**（见下节）。JSON-LD 设为可选。 | P2（可选） |
| `WebSite` | 首页 | 可选，`publisher` 指回 Organization，轻量。 | P2 |

### 哪些字段 LLM / 答案引擎真会用

- **实体身份**：`name`、`legalName`、`url`、`logo`、`sameAs`（LinkedIn/维基数据/权威目录）、
  `address`、`identifier`/`vatID`/`iso6523Code`——用于消歧和"这家公司真实存在"的信任判断。
- **产品事实**：`name`、`sku/mpn/gtin`（唯一标识，利于跨源对齐）、`description`（把关键事实写进去）、
  `image`、`brand`、`manufacturer`、`category`。
- **医疗合规/可信**：把认证与法规号写成**文本事实**放进 `description` 和可见正文
  （ISO 13485、IEC 60601-1、CE/MDR + 公告机构号、FDA 510(k) 号）。schema 里可用 `MedicalDevice.code`
  或 `hasCertification` 承载，但**引擎最可靠读取的是自然语言里的原子事实句**，不是罕见字段。
- Google 官方原话：结构化数据对生成式 AI **非必需**、"没有你必须加的特殊 schema.org 标记"——所以
  **不要过度堆字段**，覆盖上面这些高价值字段即可，把省下的精力投到内容与可爬性。

### 最小可用 JSON-LD 模板（Organization + Product + FAQPage）

单个 `<script>`、用 `@graph` + `@id` 交叉引用，放进每页 `<head>`（生成器从 `catalog.json`/
`sitecopy.json` 契约渲染，值全部来自契约、不硬编码）。以下是**合法可直接校验**的 JSON（注意：JSON 不能写注释，说明见块外）：

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.example-med.com/#org",
      "name": "Example Medtech Co., Ltd.",
      "legalName": "Example Medtech Co., Ltd.",
      "url": "https://www.example-med.com/",
      "logo": "https://www.example-med.com/assets/logo.png",
      "description": "ISO 13485 认证的 II 类诊断超声设备制造商，成立于 2009 年。",
      "foundingDate": "2009",
      "email": "sales@example-med.com",
      "telephone": "+86-755-0000-0000",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "科技园路 88 号",
        "addressLocality": "Shenzhen",
        "addressRegion": "Guangdong",
        "postalCode": "518000",
        "addressCountry": "CN"
      },
      "sameAs": [
        "https://www.linkedin.com/company/example-med",
        "https://www.wikidata.org/wiki/Q000000"
      ]
    },
    {
      "@type": "WebSite",
      "@id": "https://www.example-med.com/#website",
      "url": "https://www.example-med.com/",
      "name": "Example Medtech",
      "publisher": { "@id": "https://www.example-med.com/#org" }
    },
    {
      "@type": "Product",
      "@id": "https://www.example-med.com/products/xr-200#product",
      "additionalType": "https://schema.org/MedicalDevice",
      "name": "XR-200 便携式彩色多普勒超声诊断仪",
      "sku": "XR-200",
      "mpn": "XR200-CN",
      "gtin13": "6900000000000",
      "category": "Diagnostic ultrasound system",
      "image": "https://www.example-med.com/assets/xr-200.jpg",
      "description": "XR-200 为 2.1 kg 手持式彩超，探头频率 2–15 MHz，已获 FDA 510(k) 许可（K220000）并符合欧盟 MDR（公告机构 0123），符合 IEC 60601-1。",
      "brand": { "@type": "Brand", "name": "Example" },
      "manufacturer": { "@id": "https://www.example-med.com/#org" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "首页", "item": "https://www.example-med.com/" },
        { "@type": "ListItem", "position": 2, "name": "产品", "item": "https://www.example-med.com/products/" },
        { "@type": "ListItem", "position": 3, "name": "XR-200 便携式彩超" }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "XR-200 是否通过 FDA 认证？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "是。XR-200 于 2022 年获得 FDA 510(k) 许可（编号 K220000），并符合欧盟 MDR（公告机构 0123）。"
          }
        }
      ]
    }
  ]
}
</script>
```

模板落地要点（块外说明）：
- **B2B 不在线成交 → Product 不放 `offers`/`price`**。硬填 `price: "0"` 会误导且过校验器。若客户有
  刊例价或"询价"流程，再加 `offers`（`availability` + `businessFunction: https://purl.org/goodrelations/v1#Sell`
  + `seller` 指回 `#org`），仍可不写 price。
- `additionalType: "https://schema.org/MedicalDevice"` 是给 Product 叠加临床语义的**务实做法**（一个节点
  同时表达商品与器械两种含义），比新建 MedicalDevice 节点简单；需要禁忌/操作等临床字段时再拆独立节点。
- `sameAs` 尽量指**权威且你能控制或已存在**的实体页（LinkedIn、Wikidata、行业目录），这是实体消歧的强信号。
- 每类实体给稳定 `@id`（含 URL 锚点），生成器跨页复用 `#org`，避免重复与漂移。
- 生成后用 Google Rich Results Test / Schema.org Validator 复验一次（可入 CI，但需联网；离线守护见校验清单）。

---

## llms.txt 诚实评估

**它是什么**：Jeremy Howard 2024 年提的**提案**（现为 v2，2026-08 更新），一个放在站点根/子路径的
Markdown 索引文件（`# 站名 > 摘要`，再列指向 Markdown 版页面的链接），让 agent 不必爬全站就能定位内容。
它**不是** robots.txt 式指令（不控制、不拦截），也**不等于**"给每页出 .md 版本"（那是另一个独立做法）。

**是提案还是事实标准？——是提案，且消费端几乎为零。** 证据链：

- **发布侧热、消费侧冷**：Ahrefs 分析 13.7 万个真实域名（2026-05）——28%（技术型样本，属上限）发布了
  llms.txt，但 **97% 的文件当月零抓取**；被抓的 3% 里，真正能带来引用的**检索类 AI bot
  （PerplexityBot、OAI-SearchBot、Claude 搜索）合计仅占约 1.1%**——比 Slackbot 链接预览还少。
- **AI 从不主动找它**：对不存在的 `/llms.txt`，AI bot 请求数为 **0**——发布一个并不会让你"进 AI 雷达"。
- **Google 官方点名无用**：其《优化生成式 AI》指南在"辟谣（mythbusting）"里明写：**无需创建 llms.txt
  等机器可读文件，Google 搜索（含生成式能力）不使用它们**。John Mueller 称其为编码工具解析开发文档的
  "临时拐杖（temporary crutch）"，非普通站点该操心的事。
- **唯一真实（且很窄）的用途**：agentic/编码工具（如 Claude-Code）抓**开发文档**——这与医疗器械营销站无关。
- **安全成本**：已有研究爬虫（`prompt-injection-survey`）把 llms.txt 当**提示注入**入口研究——因为 agent
  被设计成"读取并信任"它。

**值不值得做？——值得做，但仅作为近零成本的默认产物，且严禁包装成"AI 可见性"卖点。**
- 生成器已从契约烘焙静态产物，顺手多吐一个几十行的 llms.txt 成本极低，可作为面向"未来 agent 网络"的默认项
  （类比 Wix 已默认生成）。**若实现成本超过几十行/需要额外维护，就先不做**——ROI 目前不成立。
- **怎么写（若做）**：`# 客户公司名` + `> 一句话摘要` + 若干 `## 分区` 列 `[页名](绝对URL): 说明`；
  只列**同源、你控制**的链接；**内容只放链接与客观描述，不写任何"指令形状"的句子**（防注入）；
  纳入版本管理、限制可编辑者；把它当代码而非文案。
- 期望值校准：**它几乎不会给你带来 ChatGPT/Perplexity 引用**。真要提升 AI 可见性，靠的是下面的内容与可爬性。

---

## AI 爬虫策略

**总原则（B2B 获客场景）**：你要的是被**引用/展示**，所以**默认放行"搜索/检索类" bot**（它们决定你是否出现在
AI 答案里）；"训练类" bot 是商业判断题，公开营销素材通常也放行（可能利于品牌记忆），但做成**配置开关**留给有
IP 顾虑的客户。**训练 ≠ 检索**是这一节的核心：屏蔽训练 bot 不影响、也不换来检索引用。

| 厂商 | 搜索/检索 bot（→ 引用，**建议 ALLOW**） | 训练 bot（可选开关） | 用户触发抓取（**无视 robots.txt**） | 备注 |
|---|---|---|---|---|
| OpenAI | `OAI-SearchBot`（出现在 ChatGPT 搜索答案；opt-out 就不再展示） | `GPTBot` | `ChatGPT-User` | 三者**相互独立**，可只放 OAI-SearchBot、屏蔽 GPTBot |
| Anthropic | `Claude-SearchBot` | `ClaudeBot` | `Claude-User`（`anthropic-ai`） | 屏蔽 `ClaudeBot` **不等于**屏蔽 `Claude-SearchBot`，要分别设 |
| Perplexity | `PerplexityBot`（搜索引用，非训练） | （不用于训练） | `Perplexity-User`（用户触发，**明说一般忽略 robots.txt**） | ⚠️ Cloudflare 曾实证 Perplexity 用**隐身/未声明爬虫**绕过 robots——robots 是意愿声明非强制 |
| Google | `Googlebot`（**必须放行**：AI Overviews / AI Mode 靠核心搜索索引做 RAG grounding） | `Google-Extended`（控 Gemini 训练**与** Gemini Apps/Vertex 的 grounding） | — | `Google-Extended` **不影响**普通搜索收录与排名；要进 Gemini grounding 就放行它。**Gemini 没有独立爬虫**，靠 Googlebot |
| Microsoft | `Bingbot`（驱动 Copilot；建议放行；可配合 IndexNow 快速收录） | — | — | Copilot 依赖 Bing 索引 |

**生成器应产出的 robots.txt（默认放行、显式列名 + 指向 sitemap）**：

```
# 搜索/检索类 AI bot——默认放行以获得引用
User-agent: Googlebot
User-agent: Bingbot
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
User-agent: Google-Extended
Allow: /

# 训练类——配置开关（下面为"放行"示例；客户要屏蔽则改 Disallow: /）
User-agent: GPTBot
User-agent: ClaudeBot
Allow: /

User-agent: *
Allow: /

Sitemap: https://www.example-med.com/sitemap.xml
```

**可爬性要点**（对静态站生成器尤其关键）：
- **服务端渲染 / 静态 HTML 是硬门槛**：Googlebot 能执行 JS，但**多数 AI 检索抓取器只取原始 HTML、不跑 JS**。
  关键事实（产品名、规格、认证号）**必须出现在初始 HTML**里。本生成器产静态 `index.html`，天然满足——务必守住。
- **sitemap.xml**：全站页面、合法 XML、URL 均 200、robots 里引用。
- robots.txt **只控抓取、不控是否被引用、更非安全边界**；用户触发抓取器（ChatGPT-User/Perplexity-User）无视它。
  别用 robots 保护敏感内容——它本就是公开营销站。

---

## 内容与 HTML 结构

这是**有官方 + 学术双背书**、性价比最高的部分。目标：让答案引擎"切片"你的页面时，每个切片都是**自带主语、可直接
引用的事实**。

**语义结构**
- **清洁语义 HTML、主内容可与导航/广告区分**。Google 原话：重人类可读性，别纠结"完美 HTML"，但主内容要能被无 JS 抓取。
- **标题层级**：每页一个 `<h1>`，`<h2>/<h3>` 分区，结构清晰便于解析与导航。
- **事实原子化 + 自带主语**：写"XR-200 重 2.1 kg"，**别写**"它重 2.1 kg"——检索切片会丢上下文，代词化的事实无法被正确引用。把答案紧挨问题放。
- **规格用表格/定义列表**：尺寸、频率、认证、材质等结构化事实用 `<table>`/`<dl>`，机器易抽取；**同时**保留一句
  概括性散文（部分抽取器对散文切片更友好）。表格 vs 散文不是二选一，是"表格给机器 + 一句话给切片"。
- **可见 FAQ 块**：把"客户真会问的问题 + 单一权威答案"以可见 Q&A 呈现——这直接对应答案引擎的检索方式，
  **即便 Google FAQ 富结果已下线，可见 Q&A 文本本身仍是高价值 AEO 资产**。

**事实与可信度（YMYL 医疗，权重更高）**
- **引用权威来源、专家引语、具体数字/统计**：普林斯顿 GEO 研究（GEO-bench 实证）显示，加入**引用、引述、统计数据**
  可把内容在生成式引擎答案中的可见度**提升最高约 40%**，且**关键词堆砌无效**、效果**因领域而异**。
  医疗器械对应动作：正文明确写出 ISO 13485 / IEC 60601 / FDA 510(k) 编号 / CE-MDR 公告机构号、临床/性能数字、引用标准原文。
- **E-E-A-T 信号**：署名制造商/作者、成立与更新日期、资质、地址与联系方式、认证证书——AI 引擎对医疗内容更看重权威性。
- **非商品化、独有内容**（Google 列为第一要务）：第一手专业内容，别复述人人都有的"通用知识"，别产 AI 一键可生成的内容。
- **新鲜度**：给出/更新日期，内容保持时效。

**别做**（Google 官方辟谣 + GEO 研究证伪）：为 AI 把内容切成碎页（chunking）、为 AI 专门改写/堆长尾词、
刷不实"提及"。这些无效甚至违反垃圾内容政策。

---

## AI / MCP 访问的未来（证据支撑的判断）

**"网页未来主要被 AI/agent 访问"这个判断成立到什么程度？——方向真、在加速，但对"今天的 B2B 医疗器械营销站"被显著高估。**

- **绝对量仍很小**：Ahrefs 实证与 Google 的 John Mueller 都指出，站长查日志会发现 **AI agent 流量极少**。
  检索类 AI bot 对真实站点的抓取量目前是零头。
- **Google 官方的姿态**：其指南新增"agentic experiences"章节——浏览器 agent 会读你的 **DOM、截图、无障碍树（accessibility tree）**
  来完成任务，并提到 UCP 等新协议——但明确框定为"**若与你业务相关且有余力**"再看，不是当务之急。
- **由此得出的务实结论**：值得**为 agent 设计**，但方式是**投资清洁语义 HTML + 结构化数据**——因为 agent 解析的正是
  原始 HTML 与无障碍树，这与"对人友好、对 SEO 友好"是**同一件事**。这是唯一在"人类网"和"agent 网"两种未来里都赢的下注。

**给站点开放机器可读端点（feed / JSON-LD / MCP）有没有现实价值，还是过度设计？**

| 端点 | 判断 | 理由 |
|---|---|---|
| `sitemap.xml` | **做**（P0） | 通用、所有爬虫都认，收录前提 |
| JSON-LD 结构化数据 | **做**（P0） | 通用解析目标，人/机/agent 通吃 |
| 清洁 SSR/静态 HTML | **做**（P0） | agent 与 AI 检索器主要就吃这个 |
| 产品数据 feed（Merchant Center） | 视情况 | 仅当客户在线售卖才有 ROI；B2B 询价场景多数不需要 |
| `llms.txt` / 每页 `.md` 版本 | **可选 / 近零成本才做**（P3） | 消费端≈0（见上节），仅作未来 agent/编码工具的默认插保 |
| **公开 MCP server / 自建 agent API** | **不做**（过度设计） | 答案引擎目前**无标准去发现/调用**某营销站的 MCP；徒增攻击面与维护，无消费者。MCP 属于**站内嵌入式 AI 助手**（本仓 `apps/api`→`adp_search_products` 那类交互场景），不属于公开营销站表面 |

一句话：**面向未来的"投资"是语义 HTML + JSON-LD，不是 llms.txt、更不是给营销站架 MCP。**

---

## 可自动校验清单

供 `validate-build.mjs` 扩展。分**离线确定性守护**（构建即可跑、必须绿）与**联网校验**（可选 CI 步）。

**离线、确定性（生成器必须内建）**
- [ ] 每页恰有可解析的 `<script type="application/ld+json">`，`JSON.parse` 成功、无语法错误。
- [ ] `@context` == `https://schema.org`；`@type` 在允许集内（Organization/Product/BreadcrumbList/FAQPage/WebSite）。
- [ ] 必需实体在位：首页有 `Organization`（含 `name`+`url`+`logo`）；每个产品页有 `Product`（含 `name`+`description`+`image`+`brand`）；深层页有 `BreadcrumbList`。
- [ ] `@graph` 内 `@id` 引用不悬空（被引用的 `@id` 存在）。
- [ ] 每页：唯一 `<title>`（约 10–60 字符）、`meta description`（约 50–160）、**恰一个** `<h1>`、
      `<link rel="canonical">`、`<html lang>`、`viewport`。
- [ ] OpenGraph 基础项：`og:title`/`og:description`/`og:image` 存在。
- [ ] 正文内容图片有非空 `alt`。
- [ ] **事实存在于服务端渲染的原始 HTML**：对产物 HTML（不跑 JS）断言产品名与关键规格/认证号出现——
      与本仓既有铁律"验证必须断言内容特征"一致，是 AI 可爬性的硬校验。
- [ ] `robots.txt` 存在；对拟放行的搜索/检索 bot **不是** `Disallow: /`；含 `Sitemap:` 行。
- [ ] `sitemap.xml` 存在、合法 XML、列出全部已构建页、URL 与产物一一对应。
- [ ] FAQ：每个 `Question` 有非空 `acceptedAnswer.text`，且问题与答案文本在**可见 HTML** 中都能找到（非仅存在于 JSON-LD）。
- [ ] 若生成 `llms.txt`：首行是 `# ` H1；含 `> ` 摘要；链接均**同源**且指向已构建页；**无指令形状文本**（防注入基本扫描）。

**联网、可选（CI/发布门）**
- [ ] Google Rich Results Test / Schema.org Validator 对样本页零致命错误。
- [ ] 公网抓取 sitemap 中样本 URL，断言 200 + `<title>`/关键事实（复用本仓 `verify_public` 思路，绕不过 nginx/CDN 的"200 但内容错")。

**最该立刻纳入生成器的 3 项**（按 ROI 排序）：
1. **JSON-LD `@graph`（Organization + 每设备 Product[+additionalType MedicalDevice] + BreadcrumbList）从契约烘焙进静态 HTML**，
   配套**原子化事实的 HTML 结构**（一个 H1、H2/H3、规格表、自带主语的事实句、正文写明 ISO/IEC/FDA/CE 编号与数字）。
2. **默认放行检索/搜索 AI bot 的 robots.txt（显式列名 + 训练 bot 开关）+ 合法 sitemap.xml**——被抓是被引的前提。
3. **`validate-build.mjs` 增补上面的离线确定性检查**（JSON-LD 合法+形状、必需 meta、robots/sitemap 合理、"事实在原始 HTML 中"断言）。

---

## 来源

一手/官方与实证优先；营销博客仅用于交叉印证非结论。

**官方 / 一手**
- Google Search Central，《Optimizing for Generative AI features》（含 llms.txt 与结构化数据"辟谣"章节，更新 2026-07-10）
  https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Google Search Central，Google 常见爬虫（`Google-Extended` 语义，更新 2025-04-25）
  https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers
- Google Search Central，Organization 结构化数据（推荐字段，更新 2026-09-08）
  https://developers.google.com/search/docs/appearance/structured-data/organization
- Google Search Central，Product 结构化数据（Product snippet vs Merchant listing，更新 2025-12-10）
  https://developers.google.com/search/docs/appearance/structured-data/product
- Google Search Central，FAQPage 结构化数据（**FAQ 富结果 2026-05-07 起下线**公告）
  https://developers.google.com/search/docs/appearance/structured-data/faqpage
- schema.org，`MedicalDevice` 类型定义（属 MedicalEntity、非 Product）
  https://schema.org/MedicalDevice
- OpenAI，Overview of OpenAI Crawlers（OAI-SearchBot / GPTBot / ChatGPT-User）
  https://platform.openai.com/docs/bots
- Anthropic Help Center，Anthropic 爬虫与如何屏蔽（ClaudeBot 等）
  https://support.anthropic.com/en/articles/8896518
- Perplexity Docs，Perplexity Crawlers（PerplexityBot / Perplexity-User；后者忽略 robots.txt）
  https://docs.perplexity.ai/docs/resources/perplexity-crawlers
- llmstxt.org，《The /llms.txt file, v2》（Jeremy Howard，提案原文，更新 2026-08-10）
  https://llmstxt.org/

**学术 / 实证**
- Aggarwal et al.，《GEO: Generative Engine Optimization》，arXiv:2311.09735（GEO-bench；引用/引述/统计最高 +40%，关键词堆砌无效，效果因域而异）
  https://arxiv.org/abs/2311.09735
- Ahrefs，《We Analyzed 137K Sites: 97% of llms.txt Files Never Get Read》（2026-06，13.7 万域名实证）
  https://ahrefs.com/blog/llmstxt-study/

**交叉印证（非结论依据）**
- Cloudflare Blog，Perplexity 使用隐身/未声明爬虫绕过 robots.txt（robots 非强制的实证）
  https://blog.cloudflare.com/perplexity-is-using-stealth-undeclared-crawlers-to-evade-website-no-crawl-directives/
- llms.txt 非采纳的多方独立印证：Index Lab（2026-10 更新）、SE Ranking、Limy.ai、Wix Studio AI Search Lab 等。
