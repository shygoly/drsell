#!/usr/bin/env node
// b2b-site-design 表达契约校验器（零依赖，风格同 spec/check-*.mjs）。
// 用法：node .claude/skills/b2b-site-design/validate.mjs clients/<slug>/sitecopy.json
// catalog.json 从同目录读取；询价枚举从后端路由源码现读，防止两边漂移。
//
// 每条检查对应一次真实翻车（2026-09-15 双基线实测）：
// - 模板自带承诺渗漏：「48h 询价首次响应」被原样端给新客户（客户从未承诺）
//   → 一切「数字+时限/数量单位」必须逐字见于 catalog。
// - 资质措辞拔高：「国家创新医疗器械」而 No.008 实为省局注册证
//   → 资质卡 cert_ref 必须逐字等于 catalog 里某条 verified 资质名。
// - 询价选项与后端 zod 枚举脱节（7 个自由选项 vs 锁死 5 值 + 不存在的「其他」）
//   → tabs/types 的 value 必须 ∈ 路由源码现读的枚举。

const fs = await import('node:fs');
const path = await import('node:path');

const scPath = process.argv[2];
if (!scPath) { console.error('用法: node validate.mjs <sitecopy.json>'); process.exit(2); }

const errors = [];
const err = (m) => errors.push(m);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isUrl = (v) => typeof v === 'string' && /^https?:\/\/\S+$/.test(v);
const isArr = (v, min, max) => Array.isArray(v) && v.length >= min && v.length <= (max ?? 1e9);

let sc, cat, catRaw;
try { sc = JSON.parse(fs.readFileSync(scPath, 'utf8')); }
catch (e) { console.error(`✗ 无法解析 ${scPath}: ${e.message}`); process.exit(1); }
const catPath = path.join(path.dirname(scPath), 'catalog.json');
try { catRaw = fs.readFileSync(catPath, 'utf8'); cat = JSON.parse(catRaw); }
catch (e) { console.error(`✗ 设计不许脱离调研契约：读不到同目录 catalog.json（${e.message}）`); process.exit(1); }

// ---- 事实锚点集 ----
const certNames = new Set([
  ...(cat.brand?.certifications ?? []).map((c) => c?.name),
  ...(cat.products ?? []).flatMap((p) => (p.certifications ?? []).map((c) => c?.name)),
].filter(Boolean));

// ---- 后端枚举现读（找不到就红，守护器不许静默放行）----
const ROUTE = 'apps/shop/apps/backend/src/api/store/inquiries/route.ts';
let contactRoles = [], inquiryTypes = [];
try {
  const src = fs.readFileSync(ROUTE, 'utf8');
  const pick = (field) => {
    const m = src.match(new RegExp(`${field}:\\s*z\\.enum\\(\\[([^\\]]+)\\]`));
    if (!m) throw new Error(`路由里找不到 ${field} 的 z.enum`);
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  };
  contactRoles = pick('contactRole');
  inquiryTypes = pick('inquiryType');
} catch (e) {
  console.error(`✗ 无法从 ${ROUTE} 现读询价枚举：${e.message}`);
  process.exit(1);
}

// ---- 通用扫描：含糊词 + 承诺数字 ----
const HEDGE = /(typical|行业典型|待验证|待定|未验证|unverified|TBD|估计|guess|假设|possibly)/i;
// 时限/数量承诺单位表。placeholder 与 basis 等注释位豁免。
// H 与 h 同加边界回避（NH2HCl 里的「2H」不该命中）；单位面按复测反馈扩过一轮。
const PROMISE = /(\d+(?:\.\d+)?)\s*(小时|h(?![a-zA-Z0-9])|H(?![a-zA-Z0-9])|个?工作日|天|日内|周|个?月|万根|万套|万支|平方米|㎡|倍|篇|款|家|吨|kg(?![a-zA-Z])|(?<![a-zA-Zμ])g(?![a-zA-Z0-9]))/g;
const SKIP_KEYS = /^(basis|cert_ref|source_url|href|value|id|icon|template|consumes|client|date)$|placeholder/i;

function scan(node, trail) {
  if (typeof node === 'string') {
    const key = trail[trail.length - 1] ?? '';
    if (SKIP_KEYS.test(key)) return;
    const at = trail.join('.');
    if (HEDGE.test(node))
      err(`${at} 含未验证措辞「${node.match(HEDGE)[0]}」——未坐实内容不进表达位`);
    for (const m of node.matchAll(PROMISE)) {
      const re = new RegExp(`${m[1]}\\s*${m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      if (!re.test(catRaw))
        err(`${at} 含承诺数字「${m[0]}」但 catalog 里找不到——模板/臆造的数字不得端给客户`);
    }
  } else if (Array.isArray(node)) node.forEach((v, i) => scan(v, [...trail, String(i)]));
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) scan(v, [...trail, k]);
}

// ---- 结构 ----
if (!isStr(sc.seo?.title) || !isStr(sc.seo?.description)) err('seo.title/description 缺失');
if (!isArr(sc.nav, 5)) err('nav 需 ≥5 项');
else sc.nav.forEach((n, i) => { if (!isStr(n?.href) || !n.href.startsWith('#') || !isStr(n?.label)) err(`nav[${i}] 需 {href:"#…", label}`); });

const h = sc.hero;
if (!h || !isStr(h.h1) || !isStr(h.lead)) err('hero.h1/lead 缺失');
if (!isArr(h?.ctas, 1)) err('hero.ctas 需 ≥1');
if (!isArr(h?.stats, 2, 4)) err('hero.stats 需 2-4 条');
else h.stats.forEach((s, i) => {
  if (!isStr(s?.value) || !isStr(s?.label)) err(`hero.stats[${i}] 需 {value,label}`);
  if (!isStr(s?.basis) || s.basis.trim().length < 15)
    err(`hero.stats[${i}].basis 缺失或 <15 字——每个统计数字必须写清依据(catalog 路径或已打开的来源)`);
});

if (!isArr(sc.apps?.cards, 6, 8)) err('apps.cards 需 6-8 格');
else sc.apps.cards.forEach((c, i) => { if (!isStr(c?.name) || !isStr(c?.small)) err(`apps.cards[${i}] 需 {name,small}`); });

const CRED_WORDS = /(ISO\s*\d|认证|注册证|许可证|CE(?![A-Za-z])|MDR|NMPA|FDA|GMP|CNAS|专精特新|小巨人|DMF|创新医疗器械)/;
if (!isArr(sc.creds?.cards, 4, 6)) err('creds.cards 需 4-6 卡');
else sc.creds.cards.forEach((c, i) => {
  const t = `creds.cards[${i}]`;
  if (!isStr(c?.title) || !isStr(c?.text)) err(`${t} 需 {title,text}`);
  if (c?.type === 'certification') {
    if (!isStr(c?.cert_ref)) err(`${t} 资质卡缺 cert_ref`);
    else if (!certNames.has(c.cert_ref))
      err(`${t}.cert_ref 在 catalog 资质里找不到逐字匹配：「${c.cert_ref}」——资质卡不许改写/拔高措辞`);
    else if (/国家/.test(`${c.title}${c.text}`) && !/国家/.test(c.cert_ref))
      err(`${t} 的 title/text 出现「国家」但 cert_ref 里没有——资质卡正文同样不许拔高（省局证写成国家级的实测教训）`);
  } else if (c?.type === 'capability') {
    if (CRED_WORDS.test(`${c.title}${c.text}`))
      err(`${t} 能力卡夹带资质词——涉及认证/注册的表述必须用 certification 卡并锚定 cert_ref`);
  } else err(`${t}.type 需为 certification|capability`);
});

if (!isArr(sc.services?.cards, 3, 5)) err('services.cards 需 3-5 卡');
else sc.services.cards.forEach((c, i) => { if (!isStr(c?.title) || !isStr(c?.text)) err(`services.cards[${i}] 需 {title,text}`); });

if (!isArr(sc.resources?.items, 3)) err('resources.items 需 ≥3');
else sc.resources.items.forEach((r, i) => {
  const t = `resources.items[${i}]`;
  if (!isStr(r?.title)) err(`${t}.title 缺失`);
  if (r?.type === 'existing') { if (!isUrl(r?.source_url)) err(`${t} 标 existing 但无 http(s) source_url——已有资料要能指出载明处`); }
  else if (r?.type !== 'planned') err(`${t}.type 需为 existing|planned——不存在的资料必须标 planned，由客户提供后才上线`);
});

const inq = sc.inquiry;
if (!inq) err('缺 inquiry');
else {
  if (!isArr(inq.tabs, 2, 3)) err('inquiry.tabs 需 2-3 个');
  else inq.tabs.forEach((tab, i) => {
    if (!isStr(tab?.label) || !isStr(tab?.body)) err(`inquiry.tabs[${i}] 需 {label,body}`);
    if (!contactRoles.includes(tab?.value))
      err(`inquiry.tabs[${i}].value「${tab?.value}」不在后端 contactRole 枚举 [${contactRoles}] 中`);
  });
  if (!isArr(inq.types, 4)) err('inquiry.types 需 ≥4 项');
  else inq.types.forEach((tp, i) => {
    if (!isStr(tp?.label)) err(`inquiry.types[${i}].label 缺失`);
    if (!inquiryTypes.includes(tp?.value))
      err(`inquiry.types[${i}].value「${tp?.value}」不在后端 inquiryType 枚举 [${inquiryTypes}] 中——选项必须映射合法值，没有的语义并入最近值`);
  });
}

if (!isStr(sc.footer?.company)) err('footer.company 缺失');

// 复测揪出的模板渗漏面：这两处不在旧槽位清单里，却硬编码着 Drsell 自家承诺
// （index.html:663 提交成功提示 JS 里的「工程师将在 48 小时内与您联系」、products 区节头）。
// 强制成为必填槽位，其字符串自动进入承诺/含糊扫描。
if (!isStr(sc.products_head?.h2)) err('缺 products_head.h2（产品区节头是模板硬编码文案，必须按客户重写）');
if (!isStr(sc.success_toast)) err('缺 success_toast（模板 JS 里硬编码「工程师将在 48 小时内与您联系」，必须按客户重写，时限承诺须见于 catalog）');

scan(sc, ['sitecopy']);

if (errors.length) {
  console.error(`✗ ${scPath} 违反表达契约 ${errors.length} 处:`);
  for (const m of errors) console.error(`  - ${m}`);
  process.exit(1);
}
console.log(
  `✓ ${scPath} 表达契约通过: stats ${sc.hero.stats.length} / apps ${sc.apps.cards.length} / creds ${sc.creds.cards.length} / services ${sc.services.cards.length} / resources ${sc.resources.items.length} / tabs ${sc.inquiry.tabs.length}（资质锚点 ${certNames.size} 条，枚举现读自 route.ts）`
);
