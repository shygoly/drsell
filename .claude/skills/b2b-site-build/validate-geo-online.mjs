#!/usr/bin/env node
// b2b-site-build 可选联网发布门（GEO 调研的「联网、可选」层）：对已上线的公网 URL 做
//   1) 公网内容断言（陷阱 3：走公网、断言内容特征，不是本地 curl 127.0.0.1）——200 + <title>
//      +（给了 --client 则）产品事实在原始 HTML（证明 <noscript> 快照真被服务、AI 爬虫可读）；
//   2) schema.org 官方验证器零致命错误（结构化数据权威合法性）。
// 需联网。任一失败 exit 1，可作部署脚本的发布门。离线确定性守护仍由 validate-build.mjs 负责。
//
// 用法：node validate-geo-online.mjs --url https://<域名>/ [--client clients/<slug>]

import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const url = args.url;
if (!url) { console.error('用法: node validate-geo-online.mjs --url https://<域名>/ [--client clients/<slug>]'); process.exit(2); }
const UA = 'Mozilla/5.0 (compatible; drsell-geo-gate/1.0)';
const fail = [];

// ---- 1) 公网内容断言 ----
let html = '';
try {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (r.status !== 200) fail.push(`公网状态码 ${r.status}（非 200）`);
  html = await r.text();
} catch (e) { fail.push(`公网抓取失败：${e.message}`); }

if (html) {
  if (!/<title>[^<]+<\/title>/.test(html)) fail.push('公网页面无非空 <title>');
  if (!html.includes('application/ld+json')) fail.push('公网页面原始 HTML 无 JSON-LD');
  if (!/<div class="seo-products">/.test(html)) fail.push('公网页面无 <noscript> 产品事实快照（AI 爬虫看不到产品）');
  if (args.client) {
    try {
      const cat = JSON.parse(fs.readFileSync(path.join(args.client, 'catalog.json'), 'utf8'));
      const missing = (cat.products || []).filter((p) => p.title && !html.includes(p.title)).map((p) => p.handle);
      if (missing.length) fail.push(`公网原始 HTML 缺产品事实（${missing.length} 个未出现，如 ${missing.slice(0, 3)}）`);
    } catch (e) { console.error(`  ⚠ 跳过产品事实交叉断言：${e.message}`); }
  }
}

// ---- 2) schema.org 官方验证器 ----
try {
  const r = await fetch('https://validator.schema.org/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({ url }),
  });
  let text = await r.text();
  if (text.startsWith(")]}'")) text = text.slice(text.indexOf('\n') + 1);
  const d = JSON.parse(text);
  // 递归收集所有非空 errors
  const errs = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === 'object') {
      if (Array.isArray(n.errors)) for (const e of n.errors) errs.push(e.errorCode || e.args || JSON.stringify(e));
      for (const v of Object.values(n)) walk(v);
    }
  };
  for (const g of d.tripleGroups || []) walk(g.nodes || []);
  walk(d.errors || []);
  // 类型清单（itemtype 声明）
  const types = {};
  for (const m of text.matchAll(/"pred":"itemtype","value":"(\w+)"/g)) types[m[1]] = (types[m[1]] || 0) + 1;
  if (errs.length) { fail.push(`schema.org 验证器 ${errs.length} 个 error：${[...new Set(errs)].slice(0, 5).join('; ')}`); }
  else console.log(`  ✓ schema.org 验证器零 error；识别类型：${JSON.stringify(types)}`);
} catch (e) { fail.push(`schema.org 验证器调用失败：${e.message}`); }

if (fail.length) {
  console.error(`✗ ${url} GEO 联网发布门未过 ${fail.length} 处：`);
  for (const m of fail) console.error(`  - ${m}`);
  process.exit(1);
}
console.log(`✓ ${url} GEO 联网发布门通过：公网 200 + 产品事实在原始 HTML + schema.org 结构化数据合法`);
