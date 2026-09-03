#!/usr/bin/env node
// spec/check-ops-audit.mjs — INV-3 运营台写操作强制审计。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, walk, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-ops-audit — 运营审计');

const WRITE_DECORATORS = ['@Post', '@Put', '@Patch', '@Delete'];
const controllers = walk('apps/api/src/ops', { exts: ['.ts'] })
  .filter((f) => f.endsWith('.controller.ts'));

let violations = 0;
for (const rel of controllers) {
  const lines = readFileSync(join(REPO_ROOT, rel), 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!WRITE_DECORATORS.some((d) => trimmed.startsWith(d))) continue;
    let j = i - 1;
    while (j >= 0 && !lines[j].trim()) j--;
    if (j < 0 || !lines[j].trim().startsWith('@Audit(')) {
      r.fail(`INV-3 违反：${rel}:${i + 1} 写 handler 缺 @Audit`);
      violations++;
    }
  }
}

if (!violations) {
  r.pass(`INV-3 全部写 handler 已标注 @Audit — 扫描 ${controllers.length} 个 controller`);
}

r.done();
