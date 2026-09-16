# 科塞尔医疗 · 站点设计（设计轮产出）

> 输入：`catalog.json` + `research.md`（调研契约，事实唯一来源）
> 输出：本文件（人审）+ `sitecopy.json`(机读表达契约，逐槽位对应模板 `apps/shop-web/index.html`)
> 铁律：**表达不得超出事实**——文案与数字只允许引用 catalog 里 verified 的内容；
> 打架口径与未坐实资质一律不上站（它们在 needs_verification 里等客户拍板）。

## 1. 结论先行

科塞尔是**双受众** B2B：临床采购线（医院/配送/经销买器械）与器械企业委托线
（OEM/CDMO 受托生产 + CNAS 检测）。设计把模板的双 tab 询价分流改写为这两条通道，
信任层只上 6 条已坐实资质，hero 统计只用「2 款创新器械 / 6 款 CE-MDR / 20+ 国注册」
三个可溯源数字——官网自己打架的「注册证 80 余张 vs 三十余张」不上站。

## 2. 槽位映射（模板 → sitecopy.json → 依据）

| 模板槽位 | sitecopy 字段 | 内容策略 |
|---|---|---|
| `<title>`/meta | `seo` | 公司名 + 泛血管介入 + OEM/CDMO 双关键词 |
| 导航 | `nav` | 7 项，锚点与模板区块一一对应 |
| hero | `hero` | h1 = 定位 + 官方 slogan「让爱穿行于心」；lead 直接用 catalog `brand.positioning` |
| 统计块 | `hero.stats` | 每条带 `basis` 溯源；产品数留 `auto` 由 Medusa 计数 |
| 应用场景 8 格 | `apps.cards` | 6 格临床场景（每格背后有在售产品）+ 2 格企业服务场景 |
| 资质 6 卡 | `creds.cards` | 全部 `type:certification`，`cert_ref` 逐字等于 catalog 里的资质名 |
| 服务矩阵 4 卡 | `services.cards` | 院线采购 / 海外合作 / OEM/CDMO / CNAS 检测 |
| 资源列表 | `resources.items` | 1 条 existing（官网产品资料入口）+ 4 条 planned（客户提供后上线） |
| FAQ | —（数据驱动） | 直接渲染 catalog `faq`，与 AI 客服共用 |
| 询价分流 | `inquiry` | 双 tab 语义改写 + 7 个需求类型选项 |
| 页脚 | `footer` | 官网载明的市场部联系方式 |

## 3. 关键设计决策

1. **询价分流三 tab，且逐项锚定后端枚举**：`/store/inquiries` 的 zod 把
   `contactRole` 锁为 purchaser/distributor/institution/other、`inquiryType` 锁为
   purchase/cooperation/sample/doc/after_sales（`apps/shop/apps/backend/src/api/store/inquiries/route.ts:12`）。
   三 tab = 经销·海外代理(distributor) / 医院·临床机构(institution) /
   器械企业 OEM·CDMO(purchaser)，**零后端改动**；需求类型 7 个标签映射 5 个合法值
   （经销/OEM/检测共用 cooperation），不设后端没有的「其他」。另启用后端已支持而
   模板未用的 `expectedVolume`（预计年用量）。
2. **hero 统计三选一原则**：只上「2 / 6 / 20+」三个可溯源数字。
   「注册证 80 余张」与「三十余张」同页打架（needs_verification #2），不上站。
3. **信任墙 6 卡全部实证**：两款创新器械（No.116/No.008）、CE-MDR、受托生产许可、
   CNAS、专精特新。**ISO 13485 缺席是有意的**——官网全站无证书号
   （needs_verification #1），拿到证书扫描件后再补第 7 卡或替换「高新技术企业」。
4. **品牌名双轨暂并列**：约束型球囊在站内写「Sugacoated®（糖葫芦®）」，
   以 detail 页 Sugacoated® 为主、CE-MDR 新闻的 Tanghulu® 为辅，待客户拍板后统一。
5. **不替客户编板块**：官网导航有「神经介入」「原材料」解决方案入口，但本次调研
   未获得任何产品内容——**不进应用场景格、不建空板块**，列入客户拍板项。
6. **resources 的 planned 机制**：4 条资料是「客户提供后才上线」的占位规划，
   `type:"planned"` 标记；build 时若客户未交付，渲染为「预约索取」而非假装已有。
   杜绝模板里「白皮书获客钩子」被复制成不存在的资料。
7. **模板数字与承诺默认全部作废**：模板统计块的「48h 询价首次响应」是 Drsell
   自家承诺，科塞尔从未做过（事实源里的「48」只是 ISO 134**8**5 的巧合子串）——
   一切时限/数量承诺必须逐字见于 catalog，否则不上站。设计基线测试实测此项翻车
   4 处，故列为铁律。
8. **资质措辞不得拔高**：No.008 注册证为苏械注准（省局），认定通道级别未核，
   故全站写「创新医疗器械」不加「国家」定语（needs_verification #11）。

## 4. 客户拍板项（上线前必须回答）

来自 needs_verification 的设计影响项，逐条可直接照问：

1. ISO 13485 证书号与扫描件——决定信任墙第 7 卡是否可上。
2. 注册证总数对外口径（80 余张 / 三十余张 / 40 余张三选一，含统计时点）——决定
   hero 是否增加第 4 个手填数字。
3. 约束型球囊主品牌名：Sugacoated® 还是糖葫芦®/Tanghulu®。
4. Octoparms® Ⅱ 与初代的关系（迭代替代还是并行）——决定产品排序与导购话术。
5. 神经介入、原材料两个板块是否要在新站建内容（需客户提供产品资料）。
6. 「合作医院近 2,000 家」「肺栓塞市占率第二」是否授权对外引用（含出处）。
7. MiStent® 参考血管直径笔误（2.5mm 与 3?mm）——以注册证为准修正后才能上产品页。
8. Cathlink™ No.008 创新通道级别（国家/江苏省）——确认前措辞不加「国家」定语。

## 5. 语言策略

中文主站先行。**英文站必须从中文主站重译**——现 kosselmed.com/en/ 为 2017–2020
旧站（新闻停更、页脚还是 CFDA），与 CE-MDR/出海战略严重脱节，内容不可迁移
（research.md 结论）。日文入口待专项核对后再决定是否提供日文版。

## 6. 给 b2b-site-build 的偏差清单

模板需按 sitecopy.json 替换的 patch 点：`<title>`/meta、nav 文案、hero 全块、
stats（statProducts 保持动态）、apps 8 格、creds 6 卡、services 4 卡、resources
列表（planned 项渲染「预约索取」）、FAQ 数据源切到本客户、inquiry 区**双 tab 扩为
三 tab**（`f-role` 取 tabs[].value）、`f-type` 选项改为 {label,value} 映射（提交
value）、新增 `f-volume` 年用量字段（expectedVolume）、`f-timeline` 选项 value 对齐
purchaseTimeline 枚举（immediate/quarter/half_year/planning）、`f-company`
placeholder、提交按钮文案、**提交成功提示 JS**（index.html:663，含 48h 承诺，
用 sitecopy.success_toast 替换）、**products 区节头**（sitecopy.products_head）、
hero 侧卡与 inquiry aside 卡（涂层叙事全部按客户改写）、页脚联系方式。
模板自带的一切数字与承诺（如 48h）随文案整体替换，不得残留；build 收尾全文
grep 模板残留文案核对。挂件接入（`data-shop`）与 ingest 属 b2b-cs-attach，不在本清单。
