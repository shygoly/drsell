#!/usr/bin/env node
// spec/check-ops-status.mjs — ADR-13 订阅状态镜像守护。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, walk, stripComments, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-ops-status — 订阅状态');

const schema = readFileSync(join(REPO_ROOT, 'apps/api/prisma/schema.prisma'), 'utf8');
const enumLine = schema.match(/镜像 Shopify AppSubscriptionStatus[：:]\s*([A-Z\s]+)/);
if (!enumLine) {
  r.fail('ADR-13 违反：schema 缺 AppSubscriptionStatus 枚举注释');
} else {
  const allowed = new Set(enumLine[1].trim().split(/\s+/).filter(Boolean));
  const forbiddenUpper = ['SUSPENDED', 'PAUSED', 'TRIAL'];
  const forbiddenLower = ['active', 'cancelled', 'frozen', 'pending'];
  const opsFiles = walk('apps/api/src/ops', { exts: ['.ts'] })
    .filter((f) => !f.endsWith('.spec.ts'));

  let bad = 0;
  for (const rel of opsFiles) {
    const src = stripComments(readFileSync(join(REPO_ROOT, rel), 'utf8'), '.ts');
    for (const line of src.split('\n')) {
      const trimmed = line.trim();
      if (/result:\s*['"]/.test(trimmed)) continue;
      for (const word of forbiddenUpper) {
        if (new RegExp(`['"]${word}['"]`).test(trimmed)) {
          r.fail(`ADR-13 违反：${rel} 非镜像状态词 ${word}`);
          bad++;
        }
      }
      for (const word of forbiddenLower) {
        if (new RegExp(`['"]${word}['"]`).test(trimmed)) {
          r.fail(`ADR-13 违反：${rel} 非镜像状态词 ${word}`);
          bad++;
        }
      }
      for (const m of trimmed.matchAll(/['"]([A-Z]{4,12})['"]/g)) {
        const tok = m[1];
        if (allowed.has(tok)) continue;
        if (forbiddenUpper.includes(tok)) {
          r.fail(`ADR-13 违反：${rel} 非镜像状态词 ${tok}`);
          bad++;
        }
      }
    }
  }
  if (!bad) r.pass(`ADR-13 ops 模块未使用清单外状态词（允许 ${[...allowed].join(' ')}）`);
}

r.done();
