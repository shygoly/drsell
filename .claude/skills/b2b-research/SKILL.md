---
name: b2b-research
description: Use when 要为某家 B2B 公司（医疗器械、生物医药原材料、工业耗材等）做建站前调研并产出 clients/<slug>/ 档案，或用户提到 b2b-research、客户调研建站、为 b2b-site-build 准备输入。不用于无建站目标的泛行业研究。
---

# b2b-research：B2B 客户建站调研

## Overview

产出的是**契约，不是报告**：`catalog.json` 会被 b2b-site-build 直接 seed 进 Medusa、
经 /api/ingest 进入客服的 tool calling 数据源，最终以公司口吻答复真实买家。
核心原则：**数据位只放可溯源事实；未验证的进 `needs_verification`，不进数据位。**

## 输出契约

```
clients/<slug>/            # slug: 小写短横线，如 jenkem
  research.md              # 人审报告（给拍板者）
  catalog.json             # 机读契约（给 b2b-site-build）
```

**交付前必须跑，红了改到绿：**

```bash
node .claude/skills/b2b-research/validate.mjs clients/<slug>/catalog.json
```

`catalog.json` 形状（校验器是权威，这里是示意）：

```json
{
  "brand": { "name": "…", "tagline": "…", "positioning": "…(2-3 句，站点 hero 可直接用)",
             "certifications": [{ "name": "ISO 13485", "status": "verified", "source": "https://…" }] },
  "categories": [{ "id": "linear-mpeg", "name": "线性甲氧基PEG衍生物" }],
  "products": [{
    "handle": "mpeg-succinimidyl-carbonate",
    "title": "甲氧基聚乙二醇琥珀酰亚胺碳酸酯",
    "description": "…(≥40 字，产品页正文素材)",
    "category": "linear-mpeg",
    "metadata": {
      "specs": { "官能团": "琥珀酰亚胺碳酸酯", "取代率": "≥95%", "等级": "研究级 / GMP (ICH Q7)" },
      "specsOrder": ["官能团", "取代率", "等级"]
    },
    "certifications": [{ "name": "FDA DMF", "status": "verified", "source": "https://…" }],
    "source_urls": ["https://…"]
  }],
  "faq": [{ "q": "…", "a": "…" }],
  "needs_verification": ["mPEG-SC 的分子量档位官网未列全，仅确认 20000；其余档位需向厂家核实"]
}
```

要点（每条都对应一次真实翻车）：

- **specs 是中文「标签→值」**，是站点规格矩阵卡的直接内容；`specsOrder` 必须与键集一致
  （Medusa metadata 是 jsonb 不保序，见 ADR-24）。
- **资质分两层，且只收 verified**：公司级放 `brand.certifications`，产品级（如某产品的
  DMF/登记号）才放产品里；禁止把页脚的公司证书盖章式复制进每个产品。没坐实的资质
  **不允许以 unverified 状态占位**——整条挪进 `needs_verification`。
- **`needs_verification` 就是移交客户核实的问题清单**：写成客户经理能直接照着问的句子
  （缺什么、去哪核、为什么要核），不是给自己看的备忘。
- **description 是正文素材**不是一句话；`faq` ≥5 条，兼作站点 FAQ 区与客服语料。

## 铁律：verified 的定义

**`status: "verified"` 当且仅当你用 webReader 打开过载明该事实的页面，并把该 URL 写进 source。**
搜索结果摘要不算验证。二手信源（券商研报、百科、新闻稿转载）可入 research.md 并标明二手，
不得作为 catalog.json 里资质与规格的唯一依据。

| 想法 | 现实 |
|---|---|
| 「标了 typical/待定 就尽责了」 | seed 脚本不读你的标注，只读数据位。含糊值必须**离开数据位**，进 needs_verification |
| 「行业典型值八九不离十」 | 客服会拿它答复真实买家。医疗行业里编造规格/资质是法律事故，比缺数据糟得多 |
| 「页脚有证书，全线产品都算」 | 那是公司级资质，写 brand 一处。产品级声明（DMF 等）逐条找到出处才写 |
| 「搜索摘要里明确写了」 | 摘要是压缩转述。webReader 打开原页，眼见为实 |
| 「标成 unverified 放进 certifications 总行了吧」 | 站点会原样渲染每一条 certifications。没坐实的资质端给买家，标注救不了它——整条挪 needs_verification |

**红线自查**：写下任何数字（分子量档位、纯度、批量范围、专利数）前问一句
——「这是我在哪个打开过的页面上看到的？」答不上来就进 needs_verification。

**诚实登记**：校验器拦得住结构错误、含糊措辞和无 source 的 verified，
拦不住**不带含糊词的编造数字**——那一半只靠上面这句自查和 DoD 抽查，没有检查器能替你。

## 过程

1. **定盘**：web_search_prime（query ≤70 字；中国公司 `location: cn`；可用
   `search_domain_filter` 锁官网）确认官方域名、公司全称、主营。
2. **读原文**：webReader 读 ≥5 页——产品/目录页、关于页，以及资质载明处
   （没有独立资质/质量页很常见：证书多散在 About、页脚、新闻页，source 指向实际载明的那页即可）。
   外加 ≥2 个竞品站：同品类、面向同客群的厂商站（从该公司官网提到的同行、行业目录或搜索结果里挑），
   记录其信息架构里值得抄的点与一句挑选理由。中英文站口径不一致要记录。
3. **写 catalog.json** → 跑校验器 → 红了改到绿。
4. **写 research.md**，必含 8 节：
   结论先行（一段：这家公司适不适合内容获客+询价制、为什么）／公司概况／产品线／
   资质（逐条带出处）／目标客群与购买旅程／竞品站信息架构启示／
   **未验证清单**（与 needs_verification 同步）／来源与方法（可复现：查询词、打开过的页面清单、
   二手信源单列）。行文风格可参考 `docs/nju-biopharma-site-audit-2026-09-13.md`（非必读）。

## Definition of done

- [ ] 校验器绿
- [ ] research.md 含全部 8 节，资质逐条有出处或标未验证
- [ ] 抽查 3 个 verified：source 页面确实载明该事实

下游：`b2b-site-build`（待建）只消费 `clients/<slug>/catalog.json`，不回读对话；
实例拓扑遵 `ADR-26`（每客户独立 Medusa 实例 + 独立库）。
