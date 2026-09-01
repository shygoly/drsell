#!/usr/bin/env node
// stitch-to-shadcn-pro 阶段 C：截 dev server 四屏，与 target.png 做像素复核。
//
// 确定性来源 = Playwright 路由拦截 + 冻结时钟（TBD-5 的候选 a）。
// 明确不做的事：把种子数据放回 apps/ops/lib/api.ts —— TBD-5 禁止。
//
// 用法：
//   pnpm --filter @drsell/ops dev          # 另开一个终端
//   STITCH_DEPS_DIR=$HOME/stitch-deps node scripts/stitch-ops-shoot.mjs
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEPS = process.env.STITCH_DEPS_DIR;
if (!DEPS) {
  console.error('STITCH_DEPS_DIR 未设置（playwright + pixelmatch + pngjs）。见 PORTING.md');
  process.exit(1);
}
const require = createRequire(join(DEPS, 'node_modules', 'x.js'));
const { chromium } = require('playwright');

const BASE = process.env.OPS_URL ?? 'http://127.0.0.1:5013';
// 与 baseline/target 同视口，否则 pixelmatch 报 size mismatch
const VIEWPORT = { width: 1440, height: 2400 };
// 冻结时钟：倒计时每天都在变，不冻结就无法复现
const FROZEN_NOW = Date.parse('2026-09-01T00:00:00.000Z');

const fixtures = JSON.parse(readFileSync(join(ROOT, '.stitch/fixtures.json'), 'utf8'));

const PAGES = [
  { name: 'expiry_queue', path: '/' },
  { name: 'shop_detail', path: '/shops/nordic-cycles.myshopify.com' },
  { name: 'account_detail', path: '/accounts/usr_8849a01f' },
  { name: 'audit_log', path: '/audit' },
];

/** 把请求 URL 归一成 fixtures 的键：去掉 /api 前缀与查询串 */
function fixtureFor(url) {
  const path = decodeURIComponent(new URL(url).pathname.replace(/^\/api/, ''));
  if (fixtures[path] !== undefined) return fixtures[path];
  const noQuery = path.split('?')[0];
  return fixtures[noQuery];
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });

// 冻结 Date.now / new Date()，让倒计时可复现
await ctx.addInitScript(`(() => {
  const FROZEN = ${FROZEN_NOW};
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [FROZEN])); }
    static now() { return FROZEN; }
  }
  window.Date = FrozenDate;
  try { localStorage.setItem('ops_token', 'stitch-phase-c-fixture-token'); } catch {}
})()`);

await ctx.route('**/api/ops/**', async (route) => {
  const body = fixtureFor(route.request().url());
  if (body === undefined) {
    console.warn('  ! 无 fixture:', route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
});

let failed = 0;
for (const { name, path } of PAGES) {
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    if (new URL(page.url()).pathname === '/login') {
      console.error(`  ✗ ${name} 被重定向到 /login —— token 注入失败`);
      failed++;
      await page.close();
      continue;
    }
    // dev server 的错误浮层会顶掉页面内容，但 HTTP 仍是 200 —— 必须显式检测，
    // 否则截到一张报错图还当成功（实测踩过：build 与 dev 共用 .next 导致 chunk 丢失）
    // nextjs-portal 在 dev 模式下始终存在（开发工具指示器），不能当错误标志；
    // 只认错误对话框本身，以及页面正文里的报错文案。
    const overlay = await page
      .locator('nextjs-portal [data-nextjs-dialog], [data-nextjs-error-overlay]')
      .count()
      .catch(() => 0);
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
    if (overlay > 0 || /Runtime Error|Cannot find module|Unhandled Runtime|Application error/i.test(bodyText)) {
      console.error(`  ✗ ${name} 页面有运行时错误浮层：${bodyText.replace(/\s+/g, ' ').slice(0, 120)}`);
      failed++;
      await page.close();
      continue;
    }
    // dev 工具徽标压在侧栏尾部，会污染 diff —— 截前藏掉。
    await page.addStyleTag({
      content: 'nextjs-portal, [data-nextjs-dev-tools-button], #__next-build-watcher { display: none !important; }',
    });
    // Chromium 截高于视口的图时按块重绘，position:sticky 的元素会在页尾被再画一遍
    // （DOM 里只有一份，实测 querySelectorAll 计数为 1）。只改 sticky，不动其它定位 ——
    // 曾试过全局 position:static，打乱了绝对定位元素。
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (getComputedStyle(el).position === 'sticky') {
          el.style.position = 'relative';
        }
      }
    });
    await page.waitForTimeout(200);

    const out = join(ROOT, '.stitch/reports', name);
    mkdirSync(out, { recursive: true });
    // 布局是 h-screen + 内部滚动，fullPage 会把 sticky 顶栏在页尾重复画一遍
    await page.screenshot({ path: join(out, 'project.png'), fullPage: false });
    console.log(`  ✓ ${name} → .stitch/reports/${name}/project.png`);
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
  await page.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
