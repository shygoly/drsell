#!/usr/bin/env node
/**
 * 构建 theme app extension 的 widget 资产。
 *
 * 为什么要有这一步：Shopify 对 app block 的 JS 有 10KB 硬阈值
 * （theme check 的 AssetSizeAppBlockJavaScript）。可读源码是 14.7KB，直接提交
 * 会让每次 `shopify app deploy` 都报 error，上架审核也看得到。
 *
 * 于是把可读源码放在 apps/web/widget-src/，构建产物写进扩展的 assets/。
 * 源码不能放在 extensions/chatbot/ 里面——Shopify 只允许该目录下存在
 * assets/blocks/locales/snippets，多一个 src/ 会让 `shopify app deploy` 直接报错。
 * 产物**必须提交**：`shopify app deploy` 是从工作区打包的，不跑本仓的构建。
 *
 * 超阈值直接以非零码退出——这是这条规矩的守护方式，不能只靠人记得。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'apps/web/widget-src/drsell-chat.js');
const OUT = join(root, 'apps/web/extensions/chatbot/assets/drsell-chat.js');
const LIMIT = 10000; // Shopify AssetSizeAppBlockJavaScript

const pnpmDir = join(root, 'node_modules/.pnpm');
const esbuildPkg = readdirSync(pnpmDir).find((d) => d.startsWith('esbuild@'));
if (!esbuildPkg) {
  console.error('build-widget: 找不到 esbuild（node_modules/.pnpm/esbuild@*）');
  process.exit(1);
}
const esbuild = join(pnpmDir, esbuildPkg, 'node_modules/esbuild/bin/esbuild');

execFileSync(esbuild, [SRC, '--minify', '--target=es2017', `--outfile=${OUT}`], {
  stdio: ['ignore', 'ignore', 'inherit'],
});

// esbuild 的 minify 会剥掉注释，产物里补一行来源说明，避免有人误改产物。
const built = readFileSync(OUT, 'utf8');
writeFileSync(OUT, `/* 由 scripts/build-widget.mjs 从 apps/web/widget-src/drsell-chat.js 生成，勿直接编辑 */\n${built}`);

const srcBytes = statSync(SRC).size;
const outBytes = statSync(OUT).size;
const pct = Math.round((outBytes / LIMIT) * 100);
console.log(`build-widget: ${srcBytes} B -> ${outBytes} B (阈值 ${LIMIT} B 的 ${pct}%)`);

if (outBytes >= LIMIT) {
  console.error(
    `build-widget: 产物 ${outBytes} B 已达到/超过 Shopify 的 ${LIMIT} B 上限。` +
      ' 请精简 src/drsell-chat.js，不要提高这个阈值——它是 Shopify 定的。',
  );
  process.exit(1);
}
