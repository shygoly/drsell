#!/usr/bin/env node
// spec/check-widget-asset.mjs — theme app extension widget 资产的体积与新鲜度守护。
//
// Shopify 对 app block 的 JS 有 10KB 硬阈值（theme check 的
// AssetSizeAppBlockJavaScript）。可读源码在 apps/web/widget-src/（不能放进
// extensions/chatbot/，那里只允许 assets/blocks/locales/snippets），产物必须提交
// ——`shopify app deploy` 从工作区打包，不会跑本仓的构建。
//
// 于是有两种失败方式，这里都要守住：
//   1. 产物超过 10KB —— deploy 报 error，上架审核也看得到；
//   2. 改了 src 忘了重新构建 —— 产物悄悄变旧，线上跑的还是老代码。
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-widget-asset — widget 资产');

const SRC = 'apps/web/widget-src/drsell-chat.js';
const OUT = 'apps/web/extensions/chatbot/assets/drsell-chat.js';
const LIMIT = 10000;

const srcPath = join(REPO_ROOT, SRC);
const outPath = join(REPO_ROOT, OUT);

if (!existsSync(srcPath)) {
  r.fail(`缺少可读源码 ${SRC}`);
  r.done();
} else if (!existsSync(outPath)) {
  r.fail(`缺少构建产物 ${OUT}（跑 node scripts/build-widget.mjs）`);
  r.done();
} else {
  const bytes = statSync(outPath).size;
  if (bytes >= LIMIT) {
    r.fail(`${OUT} 为 ${bytes} B，达到/超过 Shopify 的 ${LIMIT} B 上限——精简 src，勿抬阈值`);
  } else {
    r.pass(`${OUT} ${bytes} B < ${LIMIT} B（Shopify app block JS 上限）`);
  }

  // 新鲜度：把 src 重新压一遍，和已提交的产物逐字节比对。
  let esbuild = null;
  try {
    const pnpmDir = join(REPO_ROOT, 'node_modules/.pnpm');
    const { readdirSync } = await import('node:fs');
    const pkg = readdirSync(pnpmDir).find((d) => d.startsWith('esbuild@'));
    if (pkg) esbuild = join(pnpmDir, pkg, 'node_modules/esbuild/bin/esbuild');
  } catch {
    esbuild = null;
  }

  if (!esbuild || !existsSync(esbuild)) {
    r.warn('未装 esbuild，跳过新鲜度比对（体积仍已校验）');
  } else {
    const tmp = join(mkdtempSync(join(tmpdir(), 'drsell-widget-')), 'out.js');
    execFileSync(esbuild, [srcPath, '--minify', '--target=es2017', `--outfile=${tmp}`], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const fresh = readFileSync(tmp, 'utf8');
    // 产物首行是 build-widget.mjs 加的来源说明，比对时剥掉。
    const committed = readFileSync(outPath, 'utf8').replace(/^\/\*[^\n]*\*\/\n/, '');
    if (fresh === committed) {
      r.pass('产物与 src 一致');
    } else {
      r.fail(`${OUT} 与 ${SRC} 不一致——改完源码要跑 node scripts/build-widget.mjs 并提交产物`);
    }
  }
  r.done();
}
