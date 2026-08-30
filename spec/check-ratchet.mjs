#!/usr/bin/env node
// spec/check-ratchet.mjs — 欠账棘轮：已知欠账只能还，不能借。
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { REPO_ROOT, walk, stripComments, parseDecisions, Reporter, rejectFix } from './lib.mjs';

rejectFix();

const BASELINE = join(REPO_ROOT, 'spec/.unguarded-baseline.json');
const HEX = /#[0-9a-fA-F]{6}\b/g;

function countHex(roots) {
  let n = 0;
  for (const root of roots) {
    for (const f of walk(root, { exts: ['.ts', '.tsx', '.js', '.jsx', '.css'] })) {
      const src = stripComments(readFileSync(join(REPO_ROOT, f), 'utf8'), extname(f));
      n += (src.match(HEX) ?? []).length;
    }
  }
  return n;
}

function countUnconfiguredAdr() {
  const { sections } = parseDecisions();
  return (sections['2'] ?? []).filter(
    (l) => /^\|\s*`ADR-\d+`/.test(l.trim()) && l.includes('未配'),
  ).length;
}

function countSoftTenantModels() {
  const s = readFileSync(join(REPO_ROOT, 'apps/api/prisma/schema.prisma'), 'utf8');
  let n = 0;
  for (const m of s.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = m;
    if (name === 'Tenant') continue;          // 租户表自身无需隔离键
    if (!/\btenantId\b/.test(body) && !/\bshopId\b/.test(body)) n++;
  }
  return n;
}

const METRICS = {
  unconfigured_adr: countUnconfiguredAdr,
  hex_literals_web: () => countHex(['apps/web/app', 'apps/web/components']),
  hex_literals_extension: () => countHex(['apps/web/extensions']),
  soft_tenant_models: countSoftTenantModels,
};

const current = Object.fromEntries(Object.entries(METRICS).map(([k, f]) => [k, f()]));

if (process.argv.includes('--print')) {
  process.stdout.write(JSON.stringify(current, null, 2) + '\n');
  process.exit(0);
}

const r = new Reporter('check-ratchet — 欠账棘轮');
if (!existsSync(BASELINE)) {
  r.fail('基线缺失。用 `node spec/check-ratchet.mjs --print > spec/.unguarded-baseline.json` 生成');
  r.done();
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
for (const [k, v] of Object.entries(current)) {
  const b = base[k];
  if (typeof b !== 'number') r.fail(`基线缺少键 ${k}`);
  else if (v > b) r.fail(`${k}: ${v} > 基线 ${b} — 欠账只能还不能借`);
  else if (v < b) r.warn(`${k}: ${v} < 基线 ${b} — 欠账已还，请更新基线`);
  else r.pass(`${k}: ${v}（持平）`);
}
r.done();
