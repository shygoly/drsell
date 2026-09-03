#!/usr/bin/env node
// spec/check-links.mjs — 元语文档的相对路径链接目标必须存在。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { REPO_ROOT, parseDecisions, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-links — 元语文档链接');

// 元语文件清单：子项目 2–4 各自追加
const METALANG_FILES = ['DECISIONS.md'];

// 尚未创建的出处文档白名单。移除时机绑定在 spec §5.2 的表里。
const WHITELIST = new Map([
  ['DOMAIN.md', '子项目 4'],
  ['FLOWS.md', '子项目 4'],
  ['DEPLOY.md', '子项目 4'],
]);

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
let bad = 0;

for (const f of METALANG_FILES) {
  const abs = join(REPO_ROOT, f);
  if (!existsSync(abs)) { r.fail(`元语文件缺失：${f}`); bad++; continue; }
  readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(LINK_RE)) {
      const target = m[1].split('#')[0].trim();
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      if (WHITELIST.has(target)) {
        r.warn(`${f}:${i + 1} → ${target} 尚未创建（白名单，${WHITELIST.get(target)} 移除）`);
        continue;
      }
      if (!existsSync(resolve(dirname(abs), target))) {
        r.fail(`${f}:${i + 1} → ${target} 目标不存在`);
        bad++;
      }
    }
  });
}
if (!bad) r.pass(`${METALANG_FILES.length} 个元语文件的链接目标全部存在`);

// ── 格式契约 7：出处文档必须为每个在册 ID 提供论证锚点 ──
const { sections, byPrefix } = parseDecisions();

const PROVENANCE = new Map();
for (const line of sections['0'] ?? []) {
  const m = line.match(/^\|\s*`([A-Z]+)-n`\s*\|[^|]*\|\s*\[`([^`]+)`\]/);
  if (m) PROVENANCE.set(m[1], m[2]);
}
if (!PROVENANCE.size) r.fail('格式契约 7：§0 命名空间表解析为 0 行');

for (const [prefix, file] of PROVENANCE) {
  if (WHITELIST.has(file)) continue;
  const abs = join(REPO_ROOT, file);
  if (!existsSync(abs)) { r.fail(`${prefix} 出处 ${file} 不存在且不在白名单`); continue; }
  const md = readFileSync(abs, 'utf8');
  const missing = [...byPrefix[prefix]].filter(
    (id) => !new RegExp(`^#{2,4}\\s+\`${id}\`\\s*$`, 'm').test(md),
  );
  if (missing.length) r.fail(`${file} 缺论证锚点：${missing.sort().join(', ')}`);
  else r.pass(`${file} 为 ${byPrefix[prefix].size} 个 ${prefix} 提供了论证锚点`);
}

r.done();
