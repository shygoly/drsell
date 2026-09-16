#!/usr/bin/env node
// 【测试专用】同源 store stub：让 b2b 站在没有真实 Medusa 实例时也能演示——
// 把 catalog.json 按 Medusa Store API 形状供给 /store/products，并接住 POST /store/inquiries。
// 生产不用它：生产是每客户独立 Medusa 实例（ADR-26）。故意标注 test-only，别混入真实链路。
//
// 用法：ROOT=<site 目录> CATALOG=<catalog.json> PORT=5021 node test-store-stub.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.ROOT || process.cwd();
const CATALOG = process.env.CATALOG || path.join(ROOT, '..', 'catalog.json');
const PORT = Number(process.env.PORT || 5021);
const cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const catName = Object.fromEntries((cat.categories || []).map((c) => [c.id, c.name]));
const PRODUCTS = (cat.products || []).map((p) => ({
  id: `prod_${p.handle}`, title: p.title, handle: p.handle, subtitle: null,
  description: p.description,
  metadata: { specs: p.metadata.specs, specsOrder: p.metadata.specsOrder },
  categories: [{ name: catName[p.category] || p.category }],
}));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u.startsWith('/store/products')) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ products: PRODUCTS, count: PRODUCTS.length }));
  }
  if (u === '/store/inquiries' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => (b += c)); return req.on('end', () => {
      console.log('[stub] inquiry:', b.slice(0, 200));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, id: 'stub_' + Date.now() }));
    });
  }
  let p = u === '/' || u.endsWith('/') ? u + 'index.html' : u;
  let fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(fp).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`[TEST stub] serving ${ROOT} + /store/* from ${PRODUCTS.length} products on 127.0.0.1:${PORT}`));
