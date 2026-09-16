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

// ---- 汇总 ----
for (const w of warns) console.error(`  ⚠ ${w}`);
if (errors.length) {
  console.error(`✗ ${htmlPath} 未通过 build 校验 ${errors.length} 处:`);
  for (const m of errors) console.error(`  - ${m}`);
  process.exit(1);
}
console.log(`✓ ${htmlPath} build 校验通过：零工厂残留，${(sc.creds?.cards || []).length} 资质卡 / ${(cat.faq || []).length} FAQ / ${roles.length} 询价 tab 均落位，产品接 Medusa、询价接后端、枚举对齐${warns.length ? `（${warns.length} 条提醒见上）` : ''}`);
