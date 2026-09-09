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

/**
 * 真正无租户维度的表 —— 不是欠账，加隔离键反而是错的。
 *
 * 判据很窄：**这张表记录的事实在全平台只有一份**。放宽一点点，这个白名单
 * 就会变成绕过棘轮的后门，所以每加一行都要能回答「它按哪个租户分会得到
 * 什么荒谬结论」。白名单写在校验器里而不是基线数字里，是为了让例外必须以
 * 一次可审的 diff 出现——抬基线只会看到一个数字变大，看不出为什么。
 *
 * - WebhookSecretUse：一个 Shopify app 只有一对签名密钥，"哪一代密钥签了
 *   哪个 topic" 是 app 级事实。按店分会得出「A 店已切新密钥、B 店没切」——
 *   而密钥根本不按店发。
 */
const GLOBAL_MODELS = new Set(['WebhookSecretUse']);

function countSoftTenantModels() {
  const s = readFileSync(join(REPO_ROOT, 'apps/api/prisma/schema.prisma'), 'utf8');
  let n = 0;
  for (const m of s.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = m;
    if (name === 'Tenant') continue;          // 租户表自身无需隔离键
    if (GLOBAL_MODELS.has(name)) continue;    // 无租户维度，见上方判据
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
