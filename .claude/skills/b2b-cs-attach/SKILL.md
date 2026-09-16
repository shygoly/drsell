---
name: b2b-cs-attach
description: Use when 某客户站已由 b2b-site-build 生成、要接上 drsell 智能客服（回填 data-shop、把该客户产品接进 AI 数据源、部署站点并验证），或用户提到 b2b-cs-attach、接客服、挂件、部署客户站到某域名。这是建站流水线最后一环。
---

# b2b-cs-attach：接上 drsell 智能客服 + 上线

## Overview

挂件（`drsell-chat.js`，`data-shop=<shopDomain>`）POST 到 `drsell.szchada.top/api/public/chat`；
后端按 `shopDomain` 查 Shop → 用 adp 工具从 **drsell PG** 查该店产品作答。所以「接客服」=
让该客户的 **Shop + 产品 + BotSetting** 存在于 drsell PG，且站点 `data-shop` 指向它。
核心纪律：**data-shop 必须等于 drsell 侧真实 Shop.shopDomain**，AI 只答该 shop 自己的数据（D8 隔离）。

## 两条数据接线路径

| | 生产正道 | 测试桥（当前默认） |
|---|---|---|
| 产品进 drsell PG | 每客户独立 Medusa 实例（ADR-26）→ 其 connector 调 `/api/ingest`（`source=medusa`） | `cs-seed.mjs` 用 drsell prisma 直接建 Tenant+Shop+BotSetting+Products |
| 站点 /store/* | 真实 Medusa Store API（同源） | `test-store-stub.mjs`（catalog→Medusa 形状，test-only） |
| ingest 多店 | **需改 drsell-api：ingest 现按单个 `INGEST_STORE_DOMAIN` 解析店铺，多客户要改成按验证过的 `x-store-domain` 头解析（back-compat 回落 env）**。属受治理的生产代码变更，单独 TDD + 部署 | 不涉及 |

测试桥只碰**数据**（隔离租户、可回滚），不改 live 商户 API 代码、不重启 drsell-api。

## 流程

1. **回填 data-shop**：`clients/<slug>/site.config.json` 的 `widget.shopDomain` 设为该客户
   shopDomain（= 站点公网域，如 `test-ksl.szchada.top`）→ `render.mjs` 重生成 →
   `validate-build.mjs` + `validate-attach.mjs` 双绿。
2. **DNS**（Cloudflare，需 Zone 级 token）：`test-ksl.szchada.top` 橙云 A → 163.7.7.160
   （`Zone.DNS:Edit` on szchada.top；`infra/cloudflare/upsert-dns.sh`）。SNI 分流是
   `default → :8443`，故新子域无需改边缘，只需 DNS + 本域 vhost。
3. **部署站点**（server-side，additive/可逆）：自签证书入 `webrtc-ws-proxy:/etc/nginx/certs/`、
   `:8443` vhost（serve 静态站 + 同源 store 后端）、pm2 起静态服务/stub。容器内 `nginx -t` 再 reload。
4. **接 AI 数据**：测试桥跑 `cs-seed.mjs`（服务器上、drsell prisma、DATABASE_URL）建
   Shop+产品+BotSetting；回滚用 `--purge`。
5. **验证**（家规陷阱 3：走公网 + 断言内容）：
   - 站点：`curl https://<域名>` 断言 `<title>` 与客户名；
   - 挂件配置：`curl https://drsell.szchada.top/api/botSettings/shop/<shopDomain>` 返回非空、aiEnabled；
   - AI 应答：`POST /api/public/chat {shopDomain,text:"你们有<某产品>吗",visitorId}`，断言应答命中真实产品；
   - D8 隔离：问另一 shop 的产品应答「不属于本店」/查不到。
   - GEO 发布门（可选）：`node .claude/skills/b2b-site-build/validate-geo-online.mjs --url https://<域名>/ --client clients/<slug>`。

6. **上线后：收录 + 分发**（决定多久进 AI 答案的**不是代码，是这步**——见下）。

## 上线后收录与分发（进 ChatGPT/Gemini 的真实杠杆）

站点合规只是「够格被抓、被正确提取」的入场券，不制造「被引用」所需的权威度。真实时间线：
**点名让 AI 现场读 URL = 今天就能**；**被搜索引擎收录 = 主动推几小时~几天 / 不推几天~几周**；
**在泛化提问里被 AI 主动引用 = 几周~几个月且不保证**（靠相关性 + 权威度，非一次性开关）。
进模型训练权重（模型「天生知道」你）= 数月到一年+、不可控，**别规划它**。

**收录动作（人工，需客户/我方的 Google/Bing 账号——脚本代不了）：**
1. **Google Search Console**（→ Gemini grounding / AI Overviews 的前提）：加站点 → 提交
   `sitemap.xml`（生成器已产）→ 对首页「请求编入索引」。最快的一步（几小时~几天）。
2. **Bing Webmaster Tools**（→ Copilot、部分 ChatGPT 搜索）：加站点 + 提交 sitemap；
   可用 **IndexNow**（提交 URL 变更，可脚本化 ping）加速。
3. 确认 `robots.txt` 放行搜索/检索类 AI bot（生成器默认已放行）。

**分发/被提及（「被引用」的真杠杆，非收录能替代）：** 行业目录挂公司/产品拿反外链、
LinkedIn 公司页与行业 group 经营、行业新闻/PR 争取被报道——**具体渠道清单见
`references/distribution-channels.md`**（国外器械行业目录 / LinkedIn / 新闻媒体，附优先级）。

> 对测试站的实话：冷僻测试子域 + 零外链的新域名，权威度≈0，泛化提问不会被引；
> 用「点名让 AI 打开该 URL」验证 GEO 管道即可，别拿它等泛化引用。

## 铁律

| 想法 | 现实 |
|---|---|
| 「data-shop 随便填个域名」 | 它是 drsell 查 Shop 的键，填错=AI 查不到该店数据或串到别店 |
| 「seed 直接写生产库没事」 | 只可写**隔离租户**、可回滚；碰别的 shop 数据是事故。测试桥仅此边界 |
| 「本地 curl 通就算上线」 | 陷阱 3：直连绕过 nginx/CF。必须公网域名 + 内容断言 + AI 实答 |
| 「stub 就是后端」 | stub 是 test-only。生产是独立 Medusa 实例（ADR-26），别混 |
| 「多客户共用一套 ingest」 | ingest 现单店。多店要改 drsell-api（受治理变更），别让第二个店的产品串进 DTC 店 |

## Definition of done

- `validate-attach.mjs` 绿（data-shop=真实 shopDomain）。
- 公网站点 200 + 内容断言；`botSettings` 返回 aiEnabled；AI 实答命中该客户产品；D8 隔离成立。
- 测试桥所加数据记录在案、`--purge` 可回滚；生产上线走独立实例 + ingest 多店（受治理）。

上游：`b2b-site-build`（site/index.html + site.config.json）。流水线到此闭环。
