#!/usr/bin/env node
// spec/run-all.mjs — 依次执行 spec/check-*.mjs，聚合退出码。
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.includes('--fix')) {
  console.error('✗ 治理只诊断、不自动改。');
  process.exit(2);
}

const SPEC_DIR = dirname(fileURLToPath(import.meta.url));
const checkers = readdirSync(SPEC_DIR).filter((f) => /^check-.*\.mjs$/.test(f)).sort();

let failed = 0;
for (const c of checkers) {
  try {
    execFileSync('node', [join(SPEC_DIR, c)], { stdio: 'inherit' });
  } catch {
    failed++;
  }
}
console.log(`\n== spec 汇总：${checkers.length - failed}/${checkers.length} 校验器通过 ==`);
process.exit(failed ? 1 : 0);
