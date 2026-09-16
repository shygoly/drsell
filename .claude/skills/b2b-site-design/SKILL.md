---
name: b2b-site-design
description: Use when clients/<slug>/ 已有通过校验的调研档案（catalog.json），要为该客户产出站点设计与文案（sitecopy.json + design.md），或用户提到设计轮、b2b-site-design、把调研档案落成站点内容。不用于调研本身（b2b-research）或建站部署（b2b-site-build）。
---

# b2b-site-design：把调研契约落成表达契约

## Overview

调研管**事实**（catalog.json），设计管**表达**（sitecopy.json）。核心原则：
**表达不得超出事实**——文案、数字、资质、承诺，每一条都要能指回 catalog 里
verified 的内容；模板里剩下的一切都是 Drsell 自家的，换客户即作废。

## 输出契约

```
clients/<slug>/
  sitecopy.json   # 机读表达契约：逐槽位对应模板 apps/shop-web/index.html
  design.md       # 人审：结论先行／槽位映射／关键决策／客户拍板项／语言策略／给 build 的偏差清单
```

**交付前必须跑，红了改到绿：**

```bash
node .claude/skills/b2b-site-design/validate.mjs clients/<slug>/sitecopy.json
```

校验器是字段与数量的权威（同目录 catalog.json 会被交叉校验）；完整成例见
`clients/kossel-medtech/sitecopy.json` + `design.md`（首个实例，槽位齐全）。
槽位：seo / nav / hero(+stats) / **products_head**（产品区节头）/ apps 6-8 格 /
creds 4-6 卡 / services 3-5 卡 / resources ≥3 条 / inquiry(tabs+types) /
**success_toast**（提交成功提示）/ footer。产品卡与 FAQ 数据驱动，不在此列。

**已知渗漏点**（复测实测：模板硬编码文案超出槽位面，逐槽替换仍会把 Drsell 自家
内容端给客户）：`index.html:663` 提交成功提示 JS（「工程师将在 48 小时内与您联系」，
已强制为 success_toast 槽位）、products 区节头（已强制为 products_head）、
hero 侧卡/hero-note、inquiry aside 卡。收尾时全文 grep 模板残留：凡 sitecopy
未覆盖的中文文案，要么进偏差清单点名替换，要么写明保留理由。

## 铁律（每条都有 2026-09-15 双基线实测翻车记录，且已机器守护）

1. **模板数字与承诺默认全作废**。基线实测把模板自家的「48h 询价首次响应」端给新客户
   4 处——客户从未承诺过。一切「数字+时限/数量单位」必须逐字见于 catalog。
2. **资质只许逐字引用，不许拔高**。资质卡 `cert_ref` 必须逐字等于 catalog 某条
   verified 资质名（实测翻车：省局注册证被写成「国家创新医疗器械」），卡片
   title/text 同守此律（「国家」定语机器拦截，其余措辞靠自查）；能力卡
   （type:capability）不得夹带认证/注册词。同类多条资质（如多个辅料登记号）：
   一卡锚定其中一条 cert_ref，正文把其余逐字列全。
3. **询价选项对齐后端枚举**。tabs/types 的 `value` 必须属于
   `apps/shop/apps/backend/src/api/store/inquiries/route.ts` 现读的
   contactRole/inquiryType 枚举（实测翻车：7 个自由选项 + 后端不存在的「其他」）。
   语义并入最近的合法值，不造后端没有的选项。
4. **统计必须带依据，资料必须分真假**。每条 hero 统计带 `basis`——写 catalog
   字段路径，或 research.md「来源与方法」节列出的已打开页面 URL（设计轮自己
   不开新页面，事实一律回溯调研契约）；不存在的资料标 `type:"planned"`
   （渲染成「预约索取」），已有资料标 existing 并给 source_url。

| 想法 | 现实 |
|---|---|
| 「模板里本来就有这句」 | 那是 Drsell 自家的文案与承诺，换客户即作废 |
| 「加个『国家』定语更有分量」 | 拔高措辞=编造资质。逐字引用，拿不准的定语去掉并进拍板项 |
| 「选项多几个用户好选」 | 后端 zod 锁死枚举，非法值直接 400。标签可多，value 必须合法 |
| 「白皮书先列上，回头总会有的」 | 不存在的资料就是不存在。标 planned，客户交付后才上线 |
| 「官网口径打架，取大的那个」 | 打架数字不上站。进 design.md 拍板项让客户定 |

## 过程

1. **读输入**：`catalog.json`（事实）、`research.md`（**未验证清单就是雷区图**——
   每条都对应一个「不能写」）、模板 `apps/shop-web/index.html`（槽位与现有机制）。
   设计取舍参考 `references/meddevice-ia.md`（全球器械站 IA 精髓：双入口、量化背书条、
   意图分流、可溯源信任层、法规市场可用性声明；及产品详情页区块顺序与国产出海站通病）。
2. **先读后端**：打开询价路由拿 contactRole/inquiryType/purchaseTimeline 枚举，
   以及模板未用但后端支持的字段（如 expectedVolume）——设计受实现约束，先看约束。
3. **逐槽位写 sitecopy.json**：只用 verified 事实。调研里有、目录里没有的产品线
   （如某条线仅一款未入册产品）：要么不进应用格，要么明示注明并列入拍板项，
   不许默默替客户展开。
4. 跑校验器，红了改到绿。
5. **写 design.md** 六节：结论先行／槽位映射／关键决策（含与 catalog 的任何有意
   分歧及理由）／客户拍板项（needs_verification 中影响表达的每一条都要有着落）／
   语言策略／给 b2b-site-build 的偏差清单（模板要动的每个点）。

## Definition of done

- [ ] 校验器绿
- [ ] design.md 六节齐，拍板项覆盖 needs_verification 里每条影响表达的项
- [ ] 抽查 3 条文案里的数字：都能指回 catalog 原文

上游：`b2b-research`（产出 catalog.json）。下游：`b2b-site-build`（待建）消费
catalog.json + sitecopy.json 实例化模板，实例拓扑遵 `ADR-26`。
