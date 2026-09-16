# 中文 GEO：中文大模型 / AI 答案引擎「收录并引用网站」机制与要求（2025–2026）

> 调研日期 2026-09-16。目的：把**中文侧** GEO 纳入 `b2b-site-build` 生成器，作为已落地的西方侧
> （ChatGPT/OAI-SearchBot、Gemini、Perplexity、Google AIO、Bing Copilot，见
> `clients/_research/geo-aeo-llm-optimization.md`）的补充。对象：**Kimi（月之暗面）、通义千问/Qwen
> （阿里）、DeepSeek、智谱 GLM / Z.ai、豆包 Doubao（字节）**。
> 一手/官方优先；营销/GEO 博客的断言一律不作结论依据，仅用于找线索。**中文 AI 这块公开文档普遍稀薄**，
> 查不到的一律明写「未公开/待核」，不编 UA 名、不编提交入口。

---

## 结论先行

1. **中文 AI 的「联网」几乎都是调用一个搜索 API，而不是 LLM 自己爬你的站。** 因此「被中文 AI 引用」的真杠杆
   **不是直接对 LLM，而是被这些 API 背后的检索底座收录**——底座就那几家：**百度（Baiduspider 自有索引）、
   Bing（bingbot）、博查 Bocha（独立中文 AI 搜索，对标必应、承接国内 60% AI 应用含 DeepSeek）、夸克/神马
   （阿里 IQS，喂 Qwen）、搜狗（腾讯，喂智谱等）、字节自有（喂豆包）**。
2. **最高杠杆动作排序（证据支撑，详见末节）**：① 事实写进**原始 HTML**（AI 抓取器不跑 JS，和西方同）→
   ② **百度收录**（最大中文索引 + 百度自有 AI 底座 + 信任基线，走百度搜索资源平台「普通收录」+ sitemap）→
   ③ **Bing 收录**（Bing Webmaster + IndexNow；因博查对标必应且覆盖 60% 应用，Bing 的**AI 触达面被放大**，
   且比百度更快更易进）→ ④ **夸克/神马 + 搜狗站长提交**（覆盖阿里系 Qwen/智谱、腾讯系）→
   ⑤ **点名喂 URL**（把链接粘进 Kimi/豆包/千问/智谱，用户触发直读、即时可引，绕过索引与 robots——B2B 演示利器）。
3. **与西方最大的结构性差异**：西方是「Google/Bing 索引≈其自家 AI 的检索底座」（两家、强耦合）；
   中文是**AI 答案层碎片化在多家搜索 API 上**，没有「一个索引=所有 AI」。要覆盖多个底座；但**博查（≈Bing 对齐）
   一家就覆盖 60% 应用**，所以 Bing 的性价比在中文侧反而更高；而**百度是西方 GEO 根本不涉及的一整个底座**。
4. **结构化数据差异**：schema.org 富结果对**百度基本无效**；百度**唯一在用的 JSON-LD 是「落地页时间因子」**
   （`pubDate/upDate/lrDate`，是收录/排序的重要依据，官方明说「仅支持 JSON-LD 格式」）。百度那套 schema.org 式
   「结构化数据工具」是 2013 年的邀请制老古董、只 4 种窄类型。**移动适配 + 加载速度**权重更高（神马/夸克/百度
   移动优先），**ICP 备案**是中文侧独有的收录/信任门槛。
5. **robots 在中文侧更没约束力**：Bytespider、YisouSpider 被多方实证**无视 robots**。所以问题不在「会不会被抓」，
   而在「有没有进底座索引、可信不可信」。llms.txt 在中文侧消费端≈0（比西方更彻底），沿用西方结论：近零成本默认产物、别当卖点。

---

## 逐模型

**读表前提**：多数中文 LLM **没有自己的收录爬虫**，它「引用你」= 它调的搜索 API 的底座（见下一节）先把你**索引**了。
「爬虫 UA」列填的是**实际会来抓你、可写进 robots.txt** 的那个爬虫；LLM 用户触发直读 URL 时的抓取 UA 另说（多未公开）。

| 模型 | 是否联网检索 | 索引来源 / 合作方 | 爬虫 UA（可写 robots） | 提交/收录入口 | 可信度 |
|---|---|---|---|---|---|
| **Kimi（月之暗面）** | 是，主打搜索。API 内置 `$web_search`（`builtin_function`），**搜索+抓取+清洗全由 Kimi 侧执行**；网页版可直接粘 URL 让它读 | **未公开**底层用哪个搜索引擎/自建索引 | Kimi/Moonshot 收录爬虫 UA **未公开**；粘 URL 属用户触发直读 | 无公开站长提交入口（**待核**） | 联网=官方文档；底座=**待核** |
| **通义千问 / Qwen（阿里）** | 是（千问 App / 百炼 / AI 网关「联网搜索」开关） | **夸克搜索引擎（阿里云信息查询服务 IQS）**——官方明列「目前仅支持夸克」。夸克与神马（YisouSpider）阿里同源 | 抓取由**夸克/神马 `YisouSpider`** 完成；Qwen 无自有营销站爬虫 | 走**神马站长平台** `zhanzhang.sm.cn`（阿里同源）；夸克无独立站长入口（**待核**） | 官方（阿里云文档） |
| **DeepSeek** | 是，但仅**网页端**（`chat.deepseek.com` 开关）；早期 API 不支持，新版 Responses API 已上服务端联网搜索 | **网页端=博查 Bocha**（官方联网搜索供应商，2025 实证）；新版 API 服务端搜索的底座**未明确公开**（**待核**） | DeepSeek **无自有收录爬虫**（靠博查）；用户触发抓取 UA 未公开 | 无站长入口——**你进博查=靠被 Bing/全网广泛收录**（博查无公开提交入口，**待核**） | web=官方+权威媒体；新 API 底座=待核 |
| **智谱 GLM / Z.ai** | 是（Web Search API / 清言联网） | **多引擎可选**：`search_std`/`search_pro`（智谱自研，pro 多引擎协作）、`search_pro_sogou`（**搜狗**）、`search_pro_quark`（**夸克**） | 抓取由所选底座（搜狗 `Sogou web spider` / 夸克 `YisouSpider`）完成；自研引擎爬虫 UA 未公开（**待核**） | 无面向站长的提交口；被引=进搜狗/夸克索引 | 官方（智谱开放文档 API 参考） |
| **豆包 Doubao（字节）** | 是（火山方舟 Web Search） | **字节自有**为主：`sources:["doubao"]`（豆包搜索 Custom 版，字节系独家信源，不可与其他源混用）+ 「联网内容插件」默认 `search_engine` 全网 + 头条图文/抖音百科/墨迹 | **`Bytespider`**（今日头条/字节搜索爬虫，**被实证无视 robots**、抓取激进） | 头条搜索侧有时间因子/资源提交，但资料稀薄（**待核**）；`Bytespider`→豆包收录的直接因果**难以单 UA 证明** | 官方（火山方舟文档）+ 待核 |

补充事实（均一手/官方）：
- **Kimi `$web_search`**：官方文档明确「模型只负责生成搜索参数，**搜索本身由 Kimi 大模型定义并执行**」，开发者的
  `search_impl` 原样返回参数即可——即 Kimi 侧黑箱完成 search+crawl+清洗。切自实现时才需自己接搜索引擎。**底座未点名**。
- **Qwen/夸克**：阿里云 AI 网关「联网搜索」官方页写死「搜索引擎：目前仅支持**夸克**（阿里云信息查询服务）」，
  含**行业筛选（金融/法律/医疗/…）**、查询时间范围、返回条数、引用来源渲染。医疗行业可筛——对医疗器械 B2B 有利。
- **DeepSeek/博查**：新浪财经/每经 2025-03 专访博查 CTO：「为 DeepSeek 联网搜索提供支持的正是博查」「DeepSeek 爆火前
  就已接入博查 API」，博查日均 3000 万次调用（≈必应 1/3）、**承接国内 AI 应用 60% 的联网搜索请求**，客户含字节扣子、
  腾讯元器、阿里云、三大运营商；博查**自建索引**（「索引入库时按 EEAT 过滤」）、**对标/欲替代必应**、**数据不出海**。
- **豆包/火山**：官方文档（2026-09 更新）证实两条联网通道——「豆包搜索 Custom 版」`sources:["doubao"]`（字节自有、
  低时延、`doubao` 不能与他源混用）与「联网内容插件」（默认全网 `search_engine`，可加 `douyin`/`toutiao`/`moji`），
  支持 `allowed_domains`/`blocked_domains`。

---

## 中文检索底座（谁的索引被哪些 AI 用）

**这是中文 GEO 的真正战场**：你要进的是这些**底座索引**，而不是去「优化 LLM」。

| 检索底座 | 归属 | 收录爬虫 UA | 谁在用它（AI 侧） | 站长/提交入口 | robots |
|---|---|---|---|---|---|
| **百度** | 百度 | `Baiduspider`（移动 `Baiduspider/2.0`） | 百度 AI 搜索 / 文心一言（自有索引）；中文最大网页索引，通用发现与信任基线 | **百度搜索资源平台** `ziyuan.baidu.com`：普通收录（`/linksubmit/index`）、sitemap、API 推送 | 遵守 |
| **Bing（必应）** | 微软 | `bingbot`（+`BingPreview`） | Bing/Copilot；**且博查对标必应**→间接触达 DeepSeek 及 60% 中文 AI 应用；秘塔等 | **Bing Webmaster Tools** + **IndexNow**（快速收录） | 遵守 |
| **博查 Bocha** | 独立创业（杭州，阿里系团队） | 自建索引，爬虫 UA **未公开（待核）** | **DeepSeek（网页端）、字节扣子 Coze、腾讯元器、阿里云/浪潮云** 等——约 **60% 国内 AI 应用** | **无公开站长提交入口（待核）**——只能靠被 Bing/全网广泛收录而被其抓入 | — |
| **夸克 / 神马** | 阿里（UC 同源） | `YisouSpider`（神马=夸克移动搜索底座） | **通义千问 / Qwen**（IQS）、**智谱**（`search_pro_quark`） | **神马站长平台** `zhanzhang.sm.cn`：sitemap/URL 提交、移动适配 | 官方称遵守，站长实证**有争议（待核）** |
| **搜狗** | 腾讯 | `Sogou web spider` | **智谱**（`search_pro_sogou`，「覆盖腾讯生态」）、腾讯元宝/微信搜一搜生态 | **搜狗站长平台** `zhanzhang.sogou.com` | 遵守 |
| **字节自有（头条搜索）** | 字节 | `Bytespider` | **豆包**（`doubao` 源 + 头条/抖音） | 头条搜索资源侧（资料稀薄，**待核**） | **被实证无视 robots** |

**读法**：
- 一个中文 B2B 站要被广泛引用，本质是**同时进入多个底座索引**。但注意两点杠杆放大器：
  **(a) 博查≈Bing 对齐且覆盖 60% 应用** → 把 Bing 收录做好，等于一次动作覆盖 DeepSeek + 大量 Agent 平台；
  **(b) 阿里系（夸克/神马）一套索引同时喂 Qwen 和智谱的一个可选引擎**。
- **DeepSeek 自身没有可提交的收录通道**（它不自建通用索引、靠博查），而**博查也没有公开站长入口**——所以「被 DeepSeek 引用」
  不能直接操作，只能通过**广泛可爬 + 进 Bing/全网**间接达成。这条务必写进客户预期。

---

## 与西方 GEO 的差异 + 生成器该补什么

### 关键差异（相对 `geo-aeo-llm-optimization.md`）

| 维度 | 西方侧（已做） | 中文侧（本次） |
|---|---|---|
| AI↔索引耦合 | Google/Bing 索引≈其自家 AI 底座，两家强耦合 | **碎片化多底座**（百度/Bing/博查/夸克·神马/搜狗/字节），无「一个索引=所有 AI」 |
| 单点最高杠杆 | 进 Google+Bing 索引 | 进**百度+Bing**；Bing 因博查(60%)被放大；百度是西方没有的独立底座 |
| 结构化数据 | schema.org JSON-LD（Organization/Product/Breadcrumb/FAQ），间接帮 LLM | 对百度 schema.org 富结果≈无效；**百度只吃 JSON-LD「时间因子」**`pubDate/upDate/lrDate` |
| 移动/性能 | 建议项 | **移动适配+速度是硬权重**（神马/夸克/百度移动优先） |
| 合规门槛 | 无 | **ICP 备案**影响中文收录/信任；内容需合规、数据不出海（博查卖点） |
| robots | 检索类默认放行；用户触发无视 | 同放行；但**国产爬虫无视 robots 更普遍**（Bytespider/YisouSpider） |
| 提交方式 | 多为自动（sitemap/IndexNow） | **多为手动+需站点验证+账号**（百度/神马/搜狗站长），难全自动 |

### 生成器该补什么（在现有 GEO 产物上做「中文 delta」）

**可自动、进 `render.mjs` / `validate-build.mjs`（离线确定性）**：
1. **robots.txt 增列中文检索底座 UA，默认 Allow**：`Baiduspider`、`bingbot`（已有）、`YisouSpider`（神马/夸克）、
   `Sogou web spider`、`Bytespider`。仍是「意愿声明」（部分国产爬虫无视），但避免误封、且是发现/意图信号。
2. **JSON-LD 落地页时间因子**（百度唯一在用的结构化数据）：按官方规范加 `pubDate`/`upDate`（首建=同 pubdate）；
   问答/论坛类才需 `lrDate`。格式 `YYYY-MM-DDThh:mm:ss`（注意 `T` 分隔，精确到分钟）。B2B 的**公司介绍页/产品页/供求页**
   正是百度官方列出的适用页型——从契约的 `updatedAt`/`publishedAt` 烘焙即可（值来自契约、不硬编码）。
   注：这与 schema.org 的 `datePublished/dateModified` 不冲突，字段名不同、并存即可。
3. **移动适配 + 速度**：`viewport`、响应式（西方清单已有）→ 对神马/夸克/百度移动优先复用，无需额外工作，但要**守住**。
4. **sitemap.xml**：已产出；中文侧价值更高（百度/神马/搜狗都靠它发现），保持合法 XML + robots 引用。

**不能自动、进部署门后手动清单（类比 provision/deploy，需客户账号 + 站点验证）**：
5. **百度搜索资源平台**：加站→验证→「普通收录」提交 URL / 提交 sitemap /（可选）API 推送。
6. **Bing Webmaster Tools**：加站→验证→提交 sitemap→开 **IndexNow**（最快、且经博查放大触达面）。
7. **神马站长平台**（阿里系，喂 Qwen/智谱）、**搜狗站长平台**（腾讯系，喂智谱/微信搜一搜）：提交 sitemap/URL + 移动适配。
8. **ICP 备案**：并入现有「域名/ICP 客户拍板项」（`b2b-site-build` 阶段 2 前置），补一句**它同时影响中文收录与信任**。
9. **点名喂 URL 话术**：交付时告诉客户——把站点 URL 粘进 Kimi/豆包/千问/智谱对话即时可读可引（用户触发、绕过索引与 robots），
   适合销售现场演示与「让 AI 认识新站」的冷启动，**不依赖任何收录**。

**不做 / 别承诺**：
- 别承诺「优化后 DeepSeek 就会引用你」——DeepSeek 靠博查、博查无提交口，只能间接（Bing+广爬）达成。
- 别给中文站堆 schema.org 富结果指望百度富摘要——百度那套是邀请制老工具、4 种窄类型，B2B 用不上。
- llms.txt：沿用西方结论，近零成本默认产物即可，中文侧消费端更接近 0，**别当卖点**。

---

## 来源

一手/官方优先；权威媒体次之；营销/GEO 博客仅用于找线索、不作结论依据。**「待核」项已在正文标注。**

**官方 / 一手（本次 webReader 逐条打开核实）**
- Kimi API 开放平台，《使用 Kimi API 的联网搜索功能》（`$web_search` builtin，搜索由 Kimi 侧执行；底座未点名）
  https://platform.kimi.com/docs/guide/use-web-search
- 智谱 AI 开放文档，《联网搜索》（Web Search API；`msearch`/`mclick` 浏览）
  https://docs.bigmodel.cn/cn/guide/tools/web-search ；API 参考「网络搜索」引擎码 `search_std`/`search_pro`/`search_pro_sogou`（搜狗）/`search_pro_quark`（夸克）
- 阿里云文档，《配置 Model API 的联网搜索策略》（**搜索引擎目前仅支持夸克/阿里云信息查询服务 IQS**；含行业筛选=医疗）
  https://help.aliyun.com/zh/api-gateway/ai-gateway/user-guide/networked-search
- DeepSeek API Docs，《DeepSeek V2 系列收官，联网搜索上线官网》（网页端联网搜索；API 当时不支持）
  https://api-docs.deepseek.com/zh-cn/news/news1210/
- 火山方舟（字节）文档，《Web Search（联网内容插件）》（豆包搜索 Custom `sources:["doubao"]`＋联网内容插件全网/头条/抖音/墨迹；2026-09 更新）
  https://docs.volcengine.com/docs/82379/1756990
- 百度搜索资源平台，《百度搜索落地页时间因子规范》（**PC 与移动端仅支持 JSON-LD 提交时间因子**；适用页型含商品/产品/供求/公司介绍页）
  https://ziyuan.baidu.com/college/articleinfo?id=2210
- 百度搜索资源平台，《结构化数据工具上线公告》（2013；仅通用问答/在线文档/资料下载/软件下载 4 类、邀请制）
  https://ziyuan.baidu.com/wiki/689
- 百度搜索资源平台，普通收录/链接提交入口 https://ziyuan.baidu.com/linksubmit/index
- 神马站长平台 https://zhanzhang.sm.cn/ ；搜狗站长帮助（遵守 robots）https://help.sogou.com/guide.html

**权威媒体 / 一手访谈**
- 新浪财经·每日经济新闻，《日均 3000 万次调用，AI 搜索黑马如何撑起 DeepSeek 的「实时大脑」》（专访博查 CTO：为 DeepSeek 供联网搜索、承接国内 60% AI 应用、≈必应 1/3、对标必应、数据不出海）
  https://finance.sina.com.cn/roll/2025-03-08/doc-inenxqvk8805652.shtml
- 36氪，《为 DeepSeek 提供「联网搜索」功能的这家公司，把价格打到了 Bing 的 1/3》
  https://m.36kr.com/p/3254160451907584

**交叉印证 / 待核线索（非结论依据）**
- 百度百科《Yisouspider》：神马搜索网页抓取程序，UC/阿里移动搜索 https://baike.baidu.com/item/Yisouspider/17630310
- 多方（知乎/腾讯云/阿里云开发者/Cloudflare/AmICited）报道 `Bytespider`、`YisouSpider` 无视 robots、抓取激进——robots 非强制的中文实证（**故 robots 只作意愿声明**）
- 阿里云 AstrBot Issue #2811、腾讯云选型文等对智谱引擎码 `search_pro_sogou`/`search_pro_quark` 的二手印证
- ICP 备案影响中文收录/信任：**站长共识 + 实践经验，非搜索引擎官方硬性规定（待核）**
