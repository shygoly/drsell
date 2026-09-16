#!/usr/bin/env node
// b2b-cs-attach 校验器：站点的客服挂件接线正确、data-shop 已回填真实 shopDomain（非占位），
// 且与 site.config 一致。零依赖。用法：node validate-attach.mjs clients/<slug>
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('用法: node validate-attach.mjs clients/<slug>'); process.exit(2); }
const html = fs.readFileSync(path.join(dir, 'site', 'index.html'), 'utf8');
const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'site.config.json'), 'utf8'));
const errors = [];
const w = cfg.widget || {};

const m = html.match(/id="drsell-chat-root" data-shop="([^"]*)"/);
if (!m) errors.push('缺挂件 drsell-chat-root');
else {
  if (m[1].includes('__')) errors.push(`data-shop 仍是占位「${m[1]}」——须回填真实 shopDomain`);
  if (w.shopDomain && !w.shopDomain.includes('__') && m[1] !== w.shopDomain) errors.push(`data-shop「${m[1]}」与 site.config.widget.shopDomain「${w.shopDomain}」不一致`);
}
if (w.apiBase && !html.includes(JSON.stringify(w.apiBase))) errors.push(`DRSELL_API_BASE 未接入或与 site.config 不一致（应含 ${w.apiBase}）`);
if (w.scriptSrc && !html.includes(w.scriptSrc)) errors.push(`挂件脚本 src 未接入（应含 ${w.scriptSrc}）`);
if (!/window\.DRSELL_API_BASE/.test(html)) errors.push('缺 window.DRSELL_API_BASE 注入');

if (errors.length) { console.error(`✗ ${dir} 客服挂件未接线 ${errors.length} 处:`); errors.forEach((e) => console.error(`  - ${e}`)); process.exit(1); }
console.log(`✓ ${dir} 客服挂件已接线：data-shop=${m[1]}，apiBase=${w.apiBase}`);
