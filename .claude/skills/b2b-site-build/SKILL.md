---
name: b2b-site-build
description: Use when clients/<slug>/ 已有通过校验的 catalog.json + sitecopy.json，要把它实例化成可部署的站点并（在客户拍板后）部署上线，或用户提到 b2b-site-build、建站、生成站点、部署客户站。不用于调研（b2b-research）、设计文案（b2b-site-design）或接客服（b2b-cs-attach）。
---

# b2b-site-build：把契约实例化成站点并部署

## Overview

工厂拥有 **runtime**（`apps/shop-web` 模板的 CSS/JS），客户拥有 **内容**（三份契约）。
build = 用生成器把契约烘焙成一份静态站，再（拍板后）провизион 独立 Medusa 实例、
seed 商品、部署验证。核心纪律：**生成器是唯一造站入口，禁止手改产物 HTML**——
手改即制造无法复现的雪花站，也绕过零残留守护。

## 四阶段（阶段门清晰：1 本地随时可跑；2-4 需生产访问 + 客户拍板，不得自主跑）

### 阶段 1 · 生成静态站（本地，可逆，随时跑）

```bash
node .claude/skills/b2b-site-build/render.mjs --client clients/<slug>
node .claude/skills/b2b-site-build/validate-build.mjs clients/<slug>   # 红了改契约或 render，不改产物
```

产出 `clients/<slug>/site/index.html`。可选 `clients/<slug>/site.config.json`
配 widget/主题/实例占位（见科塞尔成例）。**产品不烘焙进 HTML**（ADR-24），运行时
拉 Medusa。预览（产品需 Medusa，本地用 mock 注入 fetch 即可看到产品卡）。

### 阶段 2 · Provision 独立实例（生产基建，ADR-26，需人确认）

**每客户独立 Medusa 实例 + 独立库**，不共享 DTC 实例、不用多 sales channel。
以现有 DTC 实例（`apps/shop` + `scripts/deploy-shop.sh` + `infra/nginx/medusa.szchada.top.conf`）
为蓝本复制一套，逐项换名：PG 库（`<slug>_shop`）、Redis db 编号（drsell 占 db2，
新客户取未用编号）、pm2 进程（`<slug>-medusa` / `<slug>-web`）、nginx vhost、
publishable key + region。**Redis 四模块必须注册**（ADR-20）。
**前置阻塞**：域名（szchada.top 子域 vs 客户自有域）与 ICP 是客户拍板项
（见 `clients/<slug>/design.md`）——未定不 provision。

### 阶段 3 · Seed 商品（需阶段 2 的活实例）

```bash
MEDUSA_URL=.. ADMIN_EMAIL=.. ADMIN_PASSWORD=.. SALES_CHANNEL_ID=.. \
  node .claude/skills/b2b-site-build/seed.mjs --client clients/<slug>
PUBLISHABLE_KEY=.. REGION_ID=.. \
  node .claude/skills/b2b-site-build/seed.mjs --client clients/<slug> --verify
```

从 catalog.json 建分类 + 产品，规格进 metadata（ADR-24）；`--verify` 经 Store API
回读断言 specsOrder 完好。首次对新实例跑要核对 Medusa v2 admin payload（seed.mjs 头注）。

### 阶段 4 · 部署 + 公网验证（生产，家规）

回填 site.config.json 的 `widget.shopDomain`（= drsell 侧 Shop.shopDomain，属
b2b-cs-attach）与 Medusa 的 `__PUBLISHABLE_KEY__`/`__REGION_ID__`，rsync 站点、
pm2、nginx（容器内 `nginx -t` 再 reload）。**验证走公网域名 + 断言内容特征**
（陷阱 3：直连 127.0.0.1 会放过「200 但内容错」），断言产物指纹（首页 chunk 哈希变了才算部署上）。

## 铁律

| 想法 | 现实 |
|---|---|
| 「产物差一点，手改 HTML 快」 | 手改 = 雪花站、绕过零残留守护、下次 render 覆盖你。改契约或 render.mjs |
| 「产品先写死几个，Medusa 回头再接」 | 违反 ADR-24。产品运行时拉，写死会让后台改规格失效、校验器直接红 |
| 「共用 DTC 实例省事」 | 违反 ADR-26。客户目录/线索要硬隔离，共库=一个 admin 一个故障域 |
| 「本地 curl 200 就算部署好了」 | 陷阱 3：直连绕过 nginx/CF。必须公网域名 + 内容断言 + 产物指纹 |
| 「域名先用个子域顶上」 | 域名/ICP 是客户拍板项，未定不 provision——返工代价是整套实例改名 |

## Definition of done

- 阶段 1：`validate-build.mjs` 绿（仅剩 widget 占位提醒属正常，待 b2b-cs-attach 回填）；
  浏览器预览三处过目：hero+统计数、产品规格卡按 specsOrder、询价 N-tab 切换 + 提交 toast 无残留。
- 阶段 2-4：仅在客户拍板域名/ICP 且获生产访问授权后执行；每步留公网验证证据。

上游：`b2b-site-design`（sitecopy.json）。下游：`b2b-cs-attach`（回填 shopDomain + ingest + 客服知识源，消费 knowledge.md）。
