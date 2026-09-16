#!/usr/bin/env node
// b2b-site-build 商品 seeder：把 clients/<slug>/catalog.json 的分类与产品写入该客户
// 独立 Medusa 实例（ADR-26），规格进 metadata.specs/specsOrder（ADR-24）。幂等：按
// handle upsert，按 name upsert 分类。
//
// ⚠ 需要活的 Medusa 实例 + admin 凭据——属 provision 之后的门后步骤，不在本机跑。
//   首次对新实例运行时，务必核对 Medusa v2 admin payload 形态（尤其 sales channel
//   关联：产品要落进 publishable key 绑定的 sales channel 才能被 Store API 读到），
//   现有可参照 scripts/seed-shop-specs.sh 的鉴权与回读断言写法。
//
// 用法：MEDUSA_URL=http://127.0.0.1:9000 ADMIN_EMAIL=.. ADMIN_PASSWORD=.. \
//       SALES_CHANNEL_ID=sc_.. node seed.mjs --client clients/<slug>
// 回读校验：PUBLISHABLE_KEY=pk_.. REGION_ID=reg_.. node seed.mjs --client .. --verify

import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const clientDir = args.client;
if (!clientDir) { console.error('用法: node seed.mjs --client clients/<slug> [--verify]'); process.exit(2); }
const cat = JSON.parse(fs.readFileSync(path.join(clientDir, 'catalog.json'), 'utf8'));
const BASE = process.env.MEDUSA_URL || 'http://127.0.0.1:9000';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { _raw: t }; } };

async function verify() {
  const PK = process.env.PUBLISHABLE_KEY, REG = process.env.REGION_ID;
  if (!PK || !REG) { console.error('✗ --verify 需 PUBLISHABLE_KEY 与 REGION_ID'); process.exit(2); }
  const url = `${BASE}/store/products?limit=100&region_id=${encodeURIComponent(REG)}&fields=title,handle,metadata,*categories`;
  const d = await j(await fetch(url, { headers: { 'x-publishable-api-key': PK } }));
  const byHandle = Object.fromEntries((d.products || []).map((p) => [p.handle, p]));
  let bad = 0;
  for (const p of cat.products) {
    const got = byHandle[p.handle];
    if (!got) { console.error(`  ✗ 缺产品 ${p.handle}`); bad++; continue; }
    const specs = got.metadata?.specs, order = got.metadata?.specsOrder;
    const wantKeys = Object.keys(p.metadata.specs).sort().join('|');
    const gotKeys = specs ? Object.keys(specs).sort().join('|') : '';
    if (wantKeys !== gotKeys) { console.error(`  ✗ ${p.handle} specs 键集不符`); bad++; }
    if (!Array.isArray(order) || order.slice().sort().join('|') !== wantKeys) { console.error(`  ✗ ${p.handle} specsOrder 缺失/不符（jsonb 不保序，必须显式存）`); bad++; }
  }
  if (bad) { console.error(`✗ 回读校验 ${bad} 处不符`); process.exit(1); }
  console.log(`✓ 回读校验通过：${cat.products.length} 产品的 specs 与 specsOrder 经 Store API 完好`);
}

async function seed() {
  const EMAIL = process.env.ADMIN_EMAIL, PW = process.env.ADMIN_PASSWORD;
  if (!EMAIL || !PW) { console.error('✗ 需 ADMIN_EMAIL 与 ADMIN_PASSWORD'); process.exit(2); }
  const scId = process.env.SALES_CHANNEL_ID;
  const auth = await j(await fetch(`${BASE}/auth/user/emailpass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PW }) }));
  const token = auth.token;
  if (!token) { console.error('✗ 鉴权失败'); process.exit(1); }
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 分类 upsert
  const catId = {};
  for (const c of cat.categories) {
    const found = await j(await fetch(`${BASE}/admin/product-categories?q=${encodeURIComponent(c.name)}`, { headers: H }));
    let id = (found.product_categories || []).find((x) => x.name === c.name)?.id;
    if (!id) {
      const created = await j(await fetch(`${BASE}/admin/product-categories`, { method: 'POST', headers: H, body: JSON.stringify({ name: c.name, is_active: true }) }));
      id = created.product_category?.id;
      console.log(`  + 分类 ${c.name}`);
    }
    if (!id) { console.error(`✗ 分类创建失败：${c.name}`); process.exit(1); }
    catId[c.id] = id;
  }

  // 产品 upsert（按 handle）
  for (const p of cat.products) {
    const body = {
      title: p.title, handle: p.handle, description: p.description, status: 'published',
      category_ids: catId[p.category] ? [catId[p.category]] : [],
      metadata: { specs: p.metadata.specs, specsOrder: p.metadata.specsOrder },
      ...(scId ? { sales_channels: [{ id: scId }] } : {}),
    };
    const ex = await j(await fetch(`${BASE}/admin/products?handle=${encodeURIComponent(p.handle)}`, { headers: H }));
    const pid = (ex.products || [])[0]?.id;
    const res = pid
      ? await j(await fetch(`${BASE}/admin/products/${pid}`, { method: 'POST', headers: H, body: JSON.stringify(body) }))
      : await j(await fetch(`${BASE}/admin/products`, { method: 'POST', headers: H, body: JSON.stringify(body) }));
    if (!res.product) { console.error(`✗ 写入失败 ${p.handle}: ${JSON.stringify(res).slice(0, 300)}`); process.exit(1); }
    console.log(`  ${pid ? '~' : '+'} ${p.handle}（${Object.keys(p.metadata.specs).length} 条规格）`);
  }
  console.log(`✓ seed 完成：${cat.categories.length} 分类 / ${cat.products.length} 产品。请再跑 --verify 经 Store API 断言 specsOrder。`);
}

await (args.verify ? verify() : seed());
