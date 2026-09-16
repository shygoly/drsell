#!/usr/bin/env node
// b2b-site-build 产物校验器：断言 clients/<slug>/site/index.html 忠实承载三份契约、
// 正确接线 Medusa/后端，且零工厂模板残留。零依赖，风格同 spec/check-*.mjs。
//
// 分工：内容事实由 b2b-research 校验器守、表达由 b2b-site-design 校验器守；
// 本校验器只守 build 独有的三件事——
//   1) 工厂残留清零（Drsell 自家文案/承诺/2-tab 标签不得漏进客户站）
//   2) 结构齐全（三份契约的每个区块都落进了 HTML）
//   3) 接线正确（产品拉 Medusa、询价发后端、tab/type 对齐后端枚举、挂件占位可识别）
//
// 用法：node validate-build.mjs clients/<slug>

import fs from 'node:fs';
import path from 'node:path';

const clientDir = process.argv[2];
if (!clientDir) { console.error('用法: node validate-build.mjs clients/<slug>'); process.exit(2); }

const errors = [], warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

const htmlPath = path.join(clientDir, 'site', 'index.html');
let html, sc, cat;
try { html = fs.readFileSync(htmlPath, 'utf8'); }
catch { console.error(`✗ 读不到 ${htmlPath}——先跑 render.mjs`); process.exit(1); }
try { sc = JSON.parse(fs.readFileSync(path.join(clientDir, 'sitecopy.json'), 'utf8')); } catch (e) { console.error(`✗ sitecopy.json: ${e.message}`); process.exit(1); }
try { cat = JSON.parse(fs.readFileSync(path.join(clientDir, 'catalog.json'), 'utf8')); } catch (e) { console.error(`✗ catalog.json: ${e.message}`); process.exit(1); }

// 后端枚举现读，防漂移
const ROUTE = 'apps/shop/apps/backend/src/api/store/inquiries/route.ts';
let contactRoles = [], inquiryTypes = [];
try {
  const src = fs.readFileSync(ROUTE, 'utf8');
  const pick = (f) => [...(src.match(new RegExp(`${f}:\\s*z\\.enum\\(\\[([^\\]]+)\\]`))[1]).matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  contactRoles = pick('contactRole'); inquiryTypes = pick('inquiryType');
} catch (e) { console.error(`✗ 读不到后端询价枚举（${ROUTE}）：${e.message}`); process.exit(1); }

// ---- 1) 工厂残留清零 ----
const RESIDUE = [
  ['Drsell 医疗', '模板品牌名'],
  ['亲水润滑、抗凝、抗菌', 'DTC 涂层站硬编码文案'],
  ['48 小时', '模板自家 48h 承诺（渗漏重灾区，含 663 行 toast）'],
  ['演示数据', '模板演示占位文案'],
  ['🏥 采购 / 机构', '模板 2-tab 硬编码标签'],
  ['🤝 经销商 / 代理', '模板 2-tab 硬编码标签'],
  ['id="b-purchaser"', '模板 2-tab 结构（应被 N-tab 单 blurb 取代）'],
  ['id="b-distributor"', '模板 2-tab 结构'],
];
for (const [needle, why] of RESIDUE)
  if (html.includes(needle)) err(`工厂残留：出现「${needle}」（${why}）`);

// ---- 2) 结构齐全 ----
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const hasText = (s) => s && html.includes(s.length > 60 ? s.slice(0, 60) : s) || (s && decode(html).includes(s));
if (!hasText(sc.seo?.title)) err('SEO title 未落进 <title>');
if (!hasText(sc.seo?.description)) err('SEO description 未落进 meta');
for (const id of ['products', 'apps', 'creds', 'services', 'resources', 'faq', 'inquiry'])
  if (!html.includes(`id="${id}"`)) err(`缺 <section id="${id}">`);

// 各区块条目数与契约一致（抽样：apps/creds/services/resources/faq）
const countOccur = (re) => (html.match(re) || []).length;
const expect = (label, got, want) => { if (got !== want) err(`${label} 渲染 ${got} 个，契约要求 ${want} 个`); };
expect('apps 卡', countOccur(/class="app"/g), (sc.apps?.cards || []).length);
expect('creds 卡', countOccur(/class="cred"/g), (sc.creds?.cards || []).length);
expect('services 卡', countOccur(/class="svc"/g), (sc.services?.cards || []).length);
expect('resources 条', countOccur(/<li><span class="tt">/g), (sc.resources?.items || []).length);
expect('faq 条', countOccur(/<details class="faq"/g), (cat.faq || []).length);

// 资质卡标题必须逐字出现（build 不得吞掉资质）
for (const c of sc.creds?.cards || [])
  if (c.title && !decode(html).includes(c.title)) err(`资质/能力卡标题未落进 HTML：「${c.title}」`);

// ---- 3) 接线正确 ----
// 产品拉 Medusa（ADR-24：不得硬编码产品）
if (!html.includes('/store/products')) err('产品未接 Medusa Store API（/store/products 缺失）');
if (!html.includes('x-publishable-api-key')) err('缺 publishable key 请求头');
if (!html.includes('id="statProducts"')) err('缺 statProducts（产品数动态计数锚点）');
if (!html.includes('__PUBLISHABLE_KEY__') || !html.includes('__REGION_ID__')) warn('Medusa 密钥占位符不在——若已回填真实值属正常，否则 render 有误');
// 硬编码产品检测（ADR-24）：产品卡运行时才渲染，故静态 HTML 里产品网格必须为空、
// 且没有烘焙进任何 data-cat 产品卡。不能按「产品名是否出现」判——FAQ 正文正当提及产品名。
if (!/<div class="prod-grid" id="prodGrid">\s*<\/div>/.test(html))
  err('产品网格 prodGrid 非空——产品被硬编码进 HTML，违反 ADR-24（必须运行时从 Medusa 渲染）');
if (/<div class="prod" data-cat=/.test(html))
  err('检测到烘焙的产品卡（<div class="prod" data-cat>）——产品必须运行时渲染，不得写死');

// 询价接线
if (!html.includes('/store/inquiries')) err('询价未接后端（/store/inquiries 缺失）');
if (!html.includes('id="inqForm"') || !html.includes('submitInquiry')) err('询价表单/提交函数缺失');
const roles = [...html.matchAll(/data-role="([a-z_]+)"/g)].map((m) => m[1]);
const scTabRoles = (sc.inquiry?.tabs || []).map((t) => t.value);
if (roles.join(',') !== scTabRoles.join(',')) err(`询价 tab 的 data-role [${roles}] 与 sitecopy tabs [${scTabRoles}] 不一致`);
for (const r of roles) if (!contactRoles.includes(r)) err(`tab role「${r}」不在后端 contactRole 枚举 [${contactRoles}]`);
const typeVals = [...html.matchAll(/<option value="([a-z_]+)">/g)].map((m) => m[1]).filter((v) => inquiryTypes.includes(v) || contactRoles.includes(v) || ['immediate', 'quarter', 'half_year', 'planning'].includes(v));
const scTypeVals = (sc.inquiry?.types || []).map((t) => t.value);
for (const v of scTypeVals) if (!html.includes(`<option value="${v}">`)) err(`需求类型 value「${v}」未渲染进 select`);
for (const v of scTypeVals) if (!inquiryTypes.includes(v)) err(`需求类型 value「${v}」不在后端 inquiryType 枚举 [${inquiryTypes}]`);
if (sc.inquiry?.expected_volume && !html.includes('id="f-volume"')) err('sitecopy 声明了 expected_volume 但 HTML 无 f-volume 字段');
if (sc.inquiry?.expected_volume && !html.includes('expectedVolume:')) err('f-volume 未接入提交 payload（expectedVolume 缺失）');

// success_toast 必须是 sitecopy 的，且不得夹带 catalog 里没有的时限承诺
if (sc.success_toast && !decode(html).includes(sc.success_toast)) err('success_toast 未落进提交成功提示');
// 时限承诺扫描：只查 prose，剔除表单控件（<option>/<select> 里的「1 个月内」等是
// 后端枚举对齐的通用选项，非客户承诺）与 f-timeline 块。承诺=hero/卡片/toast 里的断言。
const prose = decode(html).replace(/<select[\s\S]*?<\/select>/g, '').replace(/<option[\s\S]*?<\/option>/g, '');
const catRaw = JSON.stringify(cat);
for (const m of prose.matchAll(/(\d+(?:\.\d+)?)\s*(小时|个?工作日|日内|周)/g))
  if (!catRaw.includes(m[0].replace(/\s/g, '')) && !catRaw.includes(m[0])) err(`站点出现时限承诺「${m[0]}」但 catalog 无据——不得端给客户`);

// 挂件
const shopMatch = html.match(/id="drsell-chat-root" data-shop="([^"]*)"/);
if (!shopMatch) err('缺客服挂件 drsell-chat-root');
else if (shopMatch[1].includes('__')) warn(`挂件 data-shop 仍为占位「${shopMatch[1]}」——上线前须由 b2b-cs-attach 回填真实 shopDomain`);

// ---- GEO/AEO：让 AI 答案引擎抓到、正确提取、被引用（依据 clients/_research/geo-aeo-*）----
// 语义 meta（离线确定性）
if ((html.match(/<h1[ >]/g) || []).length !== 1) err(`应恰有 1 个 <h1>（AI 解析靠标题层级），实际 ${(html.match(/<h1[ >]/g) || []).length} 个`);
if (!/<link rel="canonical"/.test(html)) err('缺 <link rel="canonical">');
if (!/<meta name="robots"/.test(html)) err('缺 robots meta');
for (const og of ['og:title', 'og:description', 'og:url']) if (!html.includes(`property="${og}"`)) err(`缺 OpenGraph ${og}`);

// JSON-LD 结构化数据
const ld = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
if (!ld) err('缺 JSON-LD 结构化数据（<script type="application/ld+json">）');
else {
  let g;
  try { g = JSON.parse(ld[1]); } catch (e) { err(`JSON-LD 解析失败：${e.message}`); }
  if (g) {
    if (g['@context'] !== 'https://schema.org') err('JSON-LD @context 应为 https://schema.org');
    const nodes = g['@graph'] || [g];
    const types = nodes.map((n) => n['@type']);
    if (!types.includes('Organization')) err('JSON-LD 缺 Organization（实体消歧/可信度信号）');
    const prodNodes = nodes.filter((n) => n['@type'] === 'Product');
    if (prodNodes.length !== (cat.products || []).length) err(`JSON-LD Product 节点 ${prodNodes.length} 个，catalog 有 ${(cat.products || []).length} 产品`);
    if (!types.includes('BreadcrumbList')) err('JSON-LD 缺 BreadcrumbList');
    // MedicalDevice 只作 additionalType 叠加，不得当独立 @type 替换 Product
    if (types.includes('MedicalDevice')) err('MedicalDevice 不是 Product 子类、无富结果——应作 Product 的 additionalType 叠加，不得作独立节点替换 Product');
    // @id 交叉引用不悬空（manufacturer/publisher 指向的 @id 必须有定义）
    const ids = new Set(nodes.filter((n) => n['@id']).map((n) => n['@id']));
    const refIds = [...ld[1].matchAll(/(?:manufacturer|publisher)"?:\s*\{\s*"@id":\s*"([^"]+)"/g)].map((m) => m[1]);
    for (const rid of refIds) if (!ids.has(rid)) err(`JSON-LD @id 引用悬空：${rid}`);
  }
}

// AI 爬虫无 JS → 产品事实必须在原始 HTML（noscript 快照）。这是 AI 可见性的硬门槛。
if (!/<div class="seo-products">/.test(html)) err('缺 <noscript> 产品事实快照——AI 检索抓取器不跑 JS，产品名/规格必须在原始 HTML 中才可能被引用');
for (const p of (cat.products || []).slice(0, 3))
  if (p.title && !html.includes(p.title)) err(`产品「${p.title}」不在原始 HTML——AI 爬虫看不到，GEO 失效`);

// robots.txt / sitemap.xml（同目录产物）
const siteDir = path.join(clientDir, 'site');
const robotsP = path.join(siteDir, 'robots.txt');
if (!fs.existsSync(robotsP)) err('缺 robots.txt');
else {
  const r = fs.readFileSync(robotsP, 'utf8').split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  if (/User-agent:\s*(Googlebot|OAI-SearchBot|PerplexityBot)[\s\S]*?Disallow:\s*\/\s*$/m.test(r)) err('robots.txt 屏蔽了搜索/检索类 AI bot——被抓是被引的前提，应放行');
  if (!/^Sitemap:\s*https?:\/\//m.test(r)) err('robots.txt 缺 Sitemap: 行');
}
const smP = path.join(siteDir, 'sitemap.xml');
if (!fs.existsSync(smP)) err('缺 sitemap.xml');
else { const s = fs.readFileSync(smP, 'utf8'); if (!/<urlset/.test(s) || !/<loc>https?:\/\//.test(s)) err('sitemap.xml 不是合法 urlset 或无 <loc>'); }

// 中文 delta（依据 references/geo-china.md）：robots 放行中文检索底座 + 百度时间因子
if (fs.existsSync(robotsP)) {
  const r0 = fs.readFileSync(robotsP, 'utf8');
  if (!/User-agent:\s*Baiduspider/.test(r0)) warn('robots.txt 未列 Baiduspider——中文侧最大底座（百度→文心/AI 搜索），建议放行');
}
// 百度落地页时间因子（百度唯一在用的 JSON-LD）：应有 cambrian 词表 + 合法 pubDate
if (!/ziyuan\.baidu\.com\/contexts\/cambrian/.test(html)) warn('无百度落地页时间因子 JSON-LD（cambrian）——中文收录/排序依据，建议补');
else {
  const tf = html.match(/cambrian[\s\S]*?"pubDate":\s*"([^"]+)"/);
  if (!tf || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(tf[1])) err(`百度时间因子 pubDate 格式应为 YYYY-MM-DDThh:mm:ss，实际「${tf ? tf[1] : '缺失'}」`);
}

// ---- 汇总 ----
for (const w of warns) console.error(`  ⚠ ${w}`);
if (errors.length) {
  console.error(`✗ ${htmlPath} 未通过 build 校验 ${errors.length} 处:`);
  for (const m of errors) console.error(`  - ${m}`);
  process.exit(1);
}
console.log(`✓ ${htmlPath} build 校验通过：零工厂残留，${(sc.creds?.cards || []).length} 资质卡 / ${(cat.faq || []).length} FAQ / ${roles.length} 询价 tab 均落位，产品接 Medusa、询价接后端、枚举对齐；GEO：JSON-LD + 语义 meta + noscript 产品事实 + robots/sitemap 均在位${warns.length ? `（${warns.length} 条提醒见上）` : ''}`);
