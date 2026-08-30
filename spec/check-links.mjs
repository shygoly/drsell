#!/usr/bin/env node
// spec/check-links.mjs — 元语文档的相对路径链接目标必须存在。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { REPO_ROOT, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-links — 元语文档链接');

// 元语文件清单：子项目 2–4 各自追加
const METALANG_FILES = ['DECISIONS.md'];

// 尚未创建的出处文档白名单。移除时机绑定在 spec §5.2 的表里。
const WHITELIST = new Map([
  ['DESIGN.md', '子项目 2'],
  ['ARCHITECTURE.md', '子项目 3'],
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
r.done();
