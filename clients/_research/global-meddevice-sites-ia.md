# 全球医疗器械公司官网 内容与信息架构（IA）调研

> 目的：为 drsell 的「B2B 内容式官网生成器」（内容获客 + 询价 RFQ、不做在线结账）提炼可复用精髓。
> 方法：webReader 实开 11 个真实页面（3 类档型：原料/OEM 供应商、西方中大型器械厂产品线、中国出海英文站），覆盖产品列表页 / 产品详情页 / 资质·关于 / 询价·联系四类。搜索仅用于定位 URL 与流量定性，结论一律以实开页面为准。
> 日期：2026-09-15。流量数据一律**定性**（见文末说明），不编造数字。

---

## 逐站速写

**JenKem（jenkemusa.com）— 档型：器械/药用 PEG 原料 + 定制合成 OEM**
- IA 双轴：`PEGs by Application`（Thiol PEGylation / ADC / LNP / PROTAC / 3D 打印 / 水凝胶）与 `PEGs by Structure`（Y 型 / 线性甲氧基 / 同/异双官能 / 多臂 / 单分散 / Raw Materials）并列。买家既可从「我要做什么」进，也可从「我要哪种分子」进。
- 首页 = GMP 工厂大图 + 量化数据条（27 个已上市药械、90+ 临床、33 份 DMF、1000+ 文献、158 专利、600+ 产品）+ Featured Products + News + Events（展会）。
- 值得抄：**用一条量化数据条把"被多少上市产品选用/多少文献引用"做成硬背书**；`Reference Publications` 用第三方文献撑信任。

**Medtronic（medtronic.com HCP 产品枢纽）— 档型：巨头产品线站（HCP 侧，非投资者形象页）**
- IA 受众优先（Healthcare professionals / Patients / Career）→ Products 按 ~20 个临床大类（心律与诊断 / 心血管 / 糖尿病 / 外科能量 / 手术机器人…）+ **平行的 Specialties 轴**（按医生专科）+ 三级细目（冠脉支架/球囊/心脏瓣膜…上百项）。
- 联系入口是**意图路由对话**："您是谁"（HCP/患者/供应商/媒体）→"要做什么"（下单/询价/演示/说明书）+ Job Role + Specialty 下拉。不是一个大表单。
- 值得抄：**RFQ/联系按「你是谁 × 你要什么」分流**，把线索预分类交给对应团队。

**Boston Scientific — SYNERGY MEGATRON 冠脉支架详情页 — 档型：器械详情页黄金模板**
- 结构：面包屑 → Hero（产品名 + 规范学名"Everolimus-Eluting Platinum Chromium…" + 价值标签 Mega Strength/Optimal Healing/Clinical Overview + 视频）→ 特性·收益块×N（每块=主张+收益+图+**带脚注的台架数据** 43% more axial strength…）→ **法规徽标**（FDA STEMI 批准、High Bleeding Risk 适应证）→ **具名临床证据块**（CLEAR SYNERGY 注册研究 n=733；4.8% MACE / 0.8% TLR / 1.1% ST；带 JACC 期刊引用）→ 文档下载（DFU/IFU、Indications Safety & Warnings）→ **Ordering Information 货号矩阵**（直径 × 长度 → UPN 货号）→ Explore 相关深读。
- 值得抄：**规格用「直径×长度→货号」矩阵表**；信任用**具名试验+端点+引用**而非形容词。

**B.Braun（bbraun.com Products & Therapies）— 档型：西欧巨头（按治疗领域）**
- IA 单轴：~16 个治疗/术科（腹部外科 / 心胸 / 介入血管 / 输注 / 骨科 / 伤口管理…）+ 顶部 **Product Quick Finder**（品类/子品类 faceted 自助查找）。
- Services：Aesculap Academy（教育）/ Customized Kits / **eIFU 电子说明书**；页脚市场可用性免责声明；"5000 产品、95% 自产"讲规模与垂直整合。
- 值得抄：**Product Quick Finder 自助漏斗** + **eIFU 独立入口**（法规文档产品化）。

**Mindray（mindray.com/en）— 档型：中国出海标杆（设备）**
- IA 双轴且极深且干净：`Solutions`（按临床场景/科室：院内整体/急诊/重症/围术期/微创/检验/影像）与 `Products`（按产品线：监护/麻醉/呼吸机/超声/检验/骨科/微创…）。另有 `Community`（用户俱乐部、全球临床学院）。
- 显著的地区·语言选择器（40+ 区域）+ 地理自动识别（"It looks like you are located in Holland"）。首页故事驱动（Mercy Ships、客户故事）而非产品堆砌。
- 信任：**法规可用性免责声明**（"内容/产品可能在您所在国不获批"）+ 授权渠道声明（反窜货）。
- 值得抄：**Solutions 与 Products 双入口**；**地区法规免责声明**既合规又显专业——这是多数出海站漏掉的成熟信号。

**biochempeg / Biopharma PEG（biochempeg.com）— 档型：PEG 原料供应商（与科塞尔上游档最近的正面样本）**
- IA 三级 faceted：按结构（单分散/多分散/多臂）→ 按官能团（甲氧基/叠氮/氨基/巯基/马来酰亚胺…数十种）+ `PEGs by Application`（ADC/PROTAC/药物递送/水凝胶/3D 生物打印）。左侧**持久 faceted 产品树**贯穿全站。
- 信任：Worldwide Distributors **logo 墙** + GMP + "grams to 100 kg"规模话术 + 4000+ linkers；News→**分类技术 Blog**（PEG & ADCs / Nanomedicine / Click Chemistry…）。
- 询价 modal 字段：产品名 + **数量** + 公司 + 联系人 + 邮箱 + 备注（**数量中心**）。
- 值得抄：**左侧持久 faceted 产品树** + **数量中心 RFQ**。

**biochempeg 产品详情页（mPEG-NH2）— 档型：供应商详情页解剖样本**
- 面包屑 → 左侧 faceted 树 → 产品头（名 + 纯度徽标 ≥95% + CatalogID + CAS 号）→ 结构式图 → Tab（Properties/MSDS/Reviews/Image）→ **规格定义表**（CAS/同义名/纯度/储存条件/用途）→ 描述段 → **Cited Publications**（逐条列出引用本产品的同行评议文献）→ **MSDS 下载** → Hot Products 相关交叉 → 询价/收藏/购物车。
- 值得抄：**规格定义表 + Cited Publications + MSDS/COA 文档下载**三件套。

**MicroPort（microport.com）— 档型：中国出海（投资者形象型首页 = 反面样本）**
- 首页几乎全是情绪化品牌文案（"Life is made up of little moments"、"Mastering the details"），导航 About/HCP/Patients/Reshaping Health/Careers/IR/News——**产品被埋在"Healthcare Professionals"闸门后**。
- 通病：B2B 买家**无法从首页自助定位任何产品**；受众分流（HCP/Patient）反而成了第一道摩擦。

**United Imaging（united-imaging.com/en）— 档型：中国出海（影像/放疗）= 技术型通病样本**
- 实开英文页出现大量**未渲染模板占位符**：`{{item.name}}`、`{{pageData[1].BigTitle}}`、`{{dir=='/CN'?'探索更多':'Discover more'}}`；并有**中文泄漏**（"探索更多/活动/上海联影医疗科技…/ICP 备案"）。产品仅 4 类挂在页脚。
- 通病：**JS 水合失败——无完整浏览器即近乎空白**（对 SEO/可爬性/AI 抓取是灾难），且 i18n 未做干净。

**Lepu（en.lepumedical.com）— 档型：中国出海（心血管介入，与科塞尔同域最近）**
- 标题"Cardiovascular Medical Device Innovation"，1999 成立，介入心脏病学定位清晰；但静态 HTML 内容稀薄、重度依赖 JS 渲染。联系仅 marketing@ 邮箱。
- 通病：定位对但**内容与产品结构藏在 JS 后**，首屏对机器不可读。

**Wego / Weigao（en.weigaogroup.com）— 档型：中国出海（耗材/介入/血液管理）= 机翻通病样本**
- IA 双轴：Product Center 按临床科室（**70+ 扁平科室大列表**）+ 5 个产品域（器械耗材/骨科/药包/介入/血液管理）。
- 通病集大成：**中文泄漏**（"麻醉与围术期医学"未翻）+ **机翻科室名荒谬**（"Onychogalactidae"、"Department of acupuncture and moxibustion"、"Proctology of traditional Chinese medicine"）+ 70+ 科室扁平无分组无优先级 + 投资者框架（把 HK 上市年份做头部数据）。等于**把国内科室表直接机翻堆给海外买家**。

---

## 提炼的 IA 原则（可直接指导建站）

1. **产品定位给双入口**：至少提供「按产品线/品类」+「按临床场景/科室/应用」两条并行导航（Mindray Solutions×Products、Medtronic Products×Specialties、JenKem/biochempeg 结构×应用）。B2B 买家有的知道要哪类器械，有的只知道要解决哪个术式——单轴必漏一半人。
2. **首页服务自助定位，别用情绪文案挡路**：正面样本（Mindray/B.Braun）首页 3 秒内能进产品；反面样本（MicroPort）首页全是形容词、产品埋在闸门后。品牌故事可有，但不能占据买家找货的主路径。
3. **给一个 faceted / Quick Finder 自助漏斗**：左侧持久产品树（biochempeg）或顶部 Quick Finder（B.Braun），支持按品类/规格/科室收窄。器械 SKU 多，靠 faceted 过滤而非靠翻页。
4. **受众/意图分流放在转化入口，而非首页闸门**：把"你是谁×你要什么"做进 RFQ/联系（Medtronic 意图路由；drsell 现有 distributor/hospital/OEM 分 tab 即此思路），而不是一进站就逼用户选 HCP/Patient 造成摩擦。
5. **科室/品类分类要为海外买家重排并翻译到位**：不要把国内医院科室表原样机翻（Wego 反例）。分类命名用目标市场术语，扁平长列表要分组 + 给优先级。
6. **量化背书条紧跟 Hero**：一行数据（认证数/注册国数/被引文献数/服役年限/产能）比一段介绍更有效（JenKem、Wego 都用，drsell hero.stats 已有雏形）。
7. **法规市场可用性声明是成熟标志**：出海站应有"并非所有产品在所有国家注册，具体询当地代表"（Mindray/B.Braun）。既合规，又向专业买家传递"我们懂全球注册"。
8. **内容获客要真内容 + 分类**：技术 Blog / 选型指南 / 应用案例 / 白皮书按主题分类（biochempeg Blog、Medtronic Academy、Mindray 客户故事/临床学院），而非只放"资料按需索取"占位。

---

## 优秀产品详情页的区块清单与顺序

综合 Boston Scientific（器械）与 biochempeg（原料）两档，一个高转化器械产品页的区块与顺序：

1. **面包屑 + 持久侧栏产品树**（定位感 + 便于横向跳品类）。
2. **Hero**：产品名 + **规范学名/技术定语**（材料+机理，如"依维莫司洗脱铂铬合金冠脉支架系统"）+ 3 个价值标签 + 主图/视频。
3. **规格区**——两种形态按档选用：
   - 器械成品：**「直径 × 长度 → 货号」变体矩阵表**（BSC Ordering Information）。
   - 原料/部件：**规格定义表**（CAS/牌号、纯度、分子量、储存条件、用途）(biochempeg)。
4. **特性·收益块 ×N**：每块 = 一句主张 + 收益 + 图 + **带脚注的证据**（台架数据/对比，附"data on file"免责）。避免无出处的形容词。
5. **适应证 / 合规徽标**：适用范围 + **法规批准徽标**（FDA/CE/NMPA、特殊适应证如 STEMI/高出血风险）。
6. **临床与文献证据**：**具名临床试验 + 样本量 + 硬端点 + 期刊引用**（BSC）；原料侧用 **Cited Publications 文献清单**（biochempeg）。这是器械页区别于普通 B2B 页的关键区块。
7. **文档下载**：IFU/DFU、说明书、**MSDS/COA**、注册证、规格单（PDF，按产品挂载；B.Braun 甚至做成 eIFU 独立入口）。
8. **相关/交叉产品**（同系列或配套，带货号）。
9. **转化 CTA**：**询价（数量/年用量中心）** + 索取文档 + 联系代表；贯穿全页可随时触达。

> 医疗特有、且最常被国产站省略的是 **6（临床/文献证据）与 7（IFU/COA 文档）**——买家与审评正是靠这两块做决策。

---

## 医疗信任层要件（行业特有）

按"硬度"从高到低，一个可信医疗器械站应尽量覆盖：

1. **认证与注册（可溯源）**：ISO 13485 / ISO 9001 徽标、CE-MDR / FDA 510(k)·PMA / NMPA 注册证**编号**、创新医疗器械通道号。要能点到出处或凭询价索取证书，而非只写形容词。（JenKem ISO 徽标、BSC FDA 徽标、Kossel creds 已具此形。）
2. **临床证据**：**具名临床试验 + 样本量 + 硬端点（MACE/TLR/ST 等）+ 同行评议引用**（BSC SYNERGY 系列）。原料/部件用**被引文献清单**（biochempeg Cited Publications）。
3. **法规市场可用性声明**：明确"产品注册按国家/地区不同、具体询当地代表"（Mindray、B.Braun）。传递全球注册专业度。
4. **监管文档可得**：IFU/DFU、MSDS/COA、注册与技术资料 PDF（BSC 下载区、B.Braun eIFU、biochempeg MSDS）。
5. **质量/产能与规模**：DMF 备案（JenKem 33 份）、GMP、产能数字、"X% 自产"（B.Braun）、服役年限、被多少上市产品选用（JenKem 27）。
6. **社会证明**：全球经销商/合作方 logo 墙（biochempeg）、客户故事/临床案例（Mindray）、展会与学术出席（JenKem Events）。
7. **反窜货/授权渠道声明**（Mindray）：对高值器械与出海尤其重要。

---

## 中国厂出海英文站通病（= drsell 的差异化机会）

依据实开的 United Imaging / Wego / MicroPort / Lepu（Mindray 是少数反例）：

1. **i18n 不干净、中文泄漏**：英文页残留中文（Wego "麻醉与围术期医学"、United Imaging "探索更多/活动/ICP 备案"）。→ 生成器应**强制单语言产物 + 校验器扫非目标语言字符**（drsell 已有 validate-build 守零残留的范式，正好覆盖此项）。
2. **机翻分类词荒谬**：把国内医院科室名直译（Wego "Onychogalactidae"、"Department of acupuncture and moxibustion"、"Proctology of traditional Chinese medicine"）。→ 分类命名用**目标市场术语表**，而非逐字翻译；科室/应用轴要为海外重排。
3. **JS 水合失败 / 首屏对机器不可读**：United Imaging 英文页全是 `{{...}}` 占位符，Lepu 静态 HTML 近乎空。→ drsell 走**静态烘焙 HTML（render.mjs）本身就是解药**——首屏即完整内容，SEO/AI 可爬，这是结构性优势。
4. **首页情绪化、产品埋闸门后**：MicroPort 首页全是品牌形容词，产品要点两三次才够得到。→ 生成器**默认首页即产品/应用双入口**（drsell 模板 hero CTA 直指 #products/#inquiry，方向正确）。
5. **信任层空心**：多为"国家级/领先/创新"形容词，缺注册证号、临床端点、文献、可下载 IFU/COA。→ drsell 把 creds 做成**可溯源认证卡 + 询价索取证书**已领先多数国产站；下一步补**临床/文献块 + 文档下载**即拉开差距。
6. **转化路径粗糙**：常只留一个邮箱（Lepu）或通用表单。→ drsell 的**按身份分流 tab + 预计年用量字段**已优于绝大多数中国出海站，应固化为默认。
7. **法规成熟度信号缺失**：几乎没有市场可用性/授权渠道声明。→ 生成器可**内置一段可选的市场可用性免责模板**。

---

## 来源（实际打开过的 URL 清单）

实开页面（webReader）：
1. https://jenkemusa.com/ — 供应商首页/IA
2. https://www.medtronic.com/en-us/healthcare-professionals/products.html — 巨头产品枢纽 + 意图路由联系表单
3. https://www.bostonscientific.com/en-US/products/stents--coronary/synergy-megatron.html — 器械产品**详情页**（黄金模板）
4. https://www.bbraun.com/en/products-and-therapies.html — 西欧巨头按治疗领域 IA + Quick Finder + eIFU
5. https://www.mindray.com/en — 中国出海标杆 首页/全量 IA
6. https://www.biochempeg.com/ — PEG 原料供应商 首页/faceted IA
7. https://www.biochempeg.com/product/mPEG-NH2.html — 供应商产品**详情页**（规格表+Cited Publications+MSDS）
8. https://www.microport.com/ — 中国出海（形象型首页，反面）
9. https://www.united-imaging.com/en/home/ — 中国出海（模板占位符/中文泄漏，反面）
10. https://en.lepumedical.com/ — 中国出海 心血管介入（JS 重）
11. https://en.weigaogroup.com/ — 中国出海 耗材/介入（机翻科室，反面）

搜索仅用于定位上述 URL 与流量定性（web_search_prime）：JenKem、Medtronic、BSC 冠脉、biochempeg mPEG-NH2、Weigao、Similarweb 对比页。

**流量/排名（定性，不编数字）**：精确 MAU 均在 Similarweb 付费墙后。可定性者：Similarweb 收录 medtronic.com、mindray.com 且流量可观，其一条对比页显示 2026-07 mindray.com 总访问量高于 abbott.com（提示中国出海龙头的 web 流量已可与西方巨头比肩）。供应商站（jenkem/biochempeg）为利基长尾（CAS/结构式/试剂名搜索导流），无可靠公开数值。Alexa 已于 2022 关停，不作依据。

---

## 附：对 drsell 生成器的映射（已有 vs 缺）

当前 drsell 模板区块：hero(+stats) / 产品规格卡 / 应用领域(apps) / 资质(creds) / 合作模式(services) / 技术资料(resources) / 采购 FAQ / 询价(按身份 tab + 年用量)。

**已对齐得好（保持）**：
- hero+stats 条 ↔ 量化背书条（JenKem/Wego）。
- apps 按临床场景 + products 按产品线 ↔ 双轴定位（Mindray/Medtronic）。
- creds 可溯源认证卡 + 询价索取证书 ↔ 信任层认证要件（已领先多数国产站）。
- services（采购/OEM/CDMO/检测分通道）↔ Services + 经销/OEM 分流。
- 询价按身份 tab + 预计年用量 ↔ Medtronic 意图路由 + biochempeg 数量中心（drsell 这块已优于绝大多数中国站）。
- 静态烘焙 HTML 首屏完整 ↔ 直接规避 United Imaging/Lepu 的 JS 水合通病。

**缺口 / 应补（按优先级）**：
1. **产品详情页缺"规格矩阵/货号表"**（直径×长度→货号，BSC 式）——器械选型强依赖，当前规格卡未见 SKU 变体矩阵。
2. **缺临床证据/文献层**——具名试验+端点+期刊引用 / Cited Publications。医疗特有信任要件，creds 只覆盖了认证。
3. **缺结构化文档下载**——IFU/DFU/MSDS/COA/注册证 PDF 按产品挂载；resources 现多为 planned/索取占位。
4. **缺市场可用性/法规免责模板**——Mindray/B.Braun 式声明，出海合规+专业信号。
5. **缺 faceted/Quick Finder 自助过滤**——按品类/科室/规格收窄；现有 products+apps 是入口但无过滤器。
6. **resources 需真内容**——选型指南/应用案例/技术博客分类库，而非"资料按需索取"占位。
