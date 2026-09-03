#!/usr/bin/env node
// spec/check-boundaries.mjs — B-1 / B-2 / B-3 硬边界守护。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, walk, matchLines, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-boundaries — 边界规矩');

const RULES = [
  {
    id: 'B-1',
    desc: 'packages/* 不得 import apps/*',
    roots: [{ dir: 'packages', exts: ['.ts', '.json'] }],
    patterns: [/@drsell\/(?:api|web|storefront)/, /\.\.\/\.\.\/apps/],
  },
  {
    id: 'B-2',
    desc: 'apps/storefront 不得引入 @shopify/polaris',
    roots: [{ dir: 'apps/storefront/src', exts: ['.ts', '.tsx', '.css'] }],
    files: ['apps/storefront/package.json'],
    patterns: [/polaris/i],
  },
  {
    id: 'B-3',
    desc: 'apps/web 不得引入 tailwind / shadcn / radix',
    roots: [
      { dir: 'apps/web/app', exts: ['.ts', '.tsx', '.css'] },
      { dir: 'apps/web/components', exts: ['.ts', '.tsx'] },
      { dir: 'apps/web/hooks', exts: ['.ts', '.tsx'] },
      { dir: 'apps/web/lib', exts: ['.ts', '.tsx'] },
    ],
    files: ['apps/web/package.json'],
    patterns: [/tailwind/i, /@radix-ui/, /class-variance-authority/],
  },
  {
    id: 'B-4',
    desc: 'apps/ops 不得 import apps/web / apps/storefront',
    roots: [{ dir: 'apps/ops', exts: ['.ts', '.tsx'] }],
    files: ['apps/ops/package.json'],
    patterns: [/@drsell\/(?:web|storefront)/, /\.\.\/\.\.\/(?:web|storefront)/],
  },
  {
    id: 'B-5',
    desc: 'apps/storefront / apps/web 不得 import apps/ops',
    roots: [
      { dir: 'apps/storefront/src', exts: ['.ts', '.tsx'] },
      { dir: 'apps/web/app', exts: ['.ts', '.tsx'] },
    ],
    patterns: [/@drsell\/ops/, /\.\.\/\.\.\/ops/],
  },
  {
    id: 'DS-10',
    desc: 'apps/ops 不得引入 @shopify/polaris',
    roots: [{ dir: 'apps/ops', exts: ['.ts', '.tsx', '.css'] }],
    files: ['apps/ops/package.json'],
    patterns: [/polaris/i],
  },
];

for (const rule of RULES) {
  const files = [
    ...rule.roots.flatMap((x) => walk(x.dir, { exts: x.exts })),
    ...(rule.files ?? []).filter((f) => existsSync(join(REPO_ROOT, f))),
  ];
  let hits = 0;
  for (const f of files) {
    for (const p of rule.patterns) {
      // strip: true —— 注释里提及不算违反
      for (const h of matchLines(f, p, { strip: true })) {
        r.fail(`${rule.id} 违反：${h.file}:${h.line}  ${h.text}`);
        hits++;
      }
    }
  }
  if (!hits) r.pass(`${rule.id} ${rule.desc} — 扫描 ${files.length} 个文件，0 命中`);
}

r.done();
