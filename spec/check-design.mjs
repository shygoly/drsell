#!/usr/bin/env node
// spec/check-design.mjs — DS-7 / DS-8 / DS-9 设计令牌守护。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, walk, matchLines, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-design — 设计令牌');

const OPS_TOKENS = 'apps/ops/app/tokens.css';
const SF_TOKENS = 'apps/storefront/src/app/globals.css';

/** 取文件中所有 `--name: #hex` 的 hex 值集合 */
function tokenHexValues(rel) {
  let src;
  try { src = readFileSync(join(REPO_ROOT, rel), 'utf8'); } catch { return null; }
  const vals = new Set();
  for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
    vals.add(m[2].toLowerCase());
  }
  return vals;
}

/** 取 `--name: #hex` 的令牌名→hex 映射（同名取最后一次，供 DS-9） */
function tokens(rel) {
  let src;
  try { src = readFileSync(join(REPO_ROOT, rel), 'utf8'); } catch { return null; }
  const map = new Map();
  for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
    map.set(m[1], m[2].toLowerCase());
  }
  return map;
}

// DS-7：ops 源码禁止 hex（tokens.css 是唯一豁免）
const opsFiles = walk('apps/ops', { exts: ['.ts', '.tsx', '.css'] })
  .filter((f) => f !== OPS_TOKENS);
let ds7 = 0;
for (const f of opsFiles) {
  for (const h of matchLines(f, /#[0-9a-fA-F]{6}\b/, { strip: true })) {
    r.fail(`DS-7 违反：${h.file}:${h.line}  ${h.text}`);
    ds7++;
  }
}
if (!ds7) r.pass(`DS-7 ops 源码无 hex 字面量 — 扫描 ${opsFiles.length} 个文件`);

// DS-8：两套令牌 hex 值不得相交
const opsHex = tokenHexValues(OPS_TOKENS);
const sfHex = tokenHexValues(SF_TOKENS);
if (!opsHex) r.fail(`DS-8 无法读取 ${OPS_TOKENS}`);
else if (!sfHex) r.fail(`DS-8 无法读取 ${SF_TOKENS}`);
else {
  const shared = [...opsHex].filter((v) => sfHex.has(v));
  if (shared.length) r.fail(`DS-8 违反：两套令牌共用色值 ${shared.join(', ')}`);
  else r.pass(`DS-8 ops(${opsHex.size}) 与 storefront(${sfHex.size}) 令牌色值零交集`);
}

// DS-9：三态主题必须定义同一套令牌名
const ops = tokens(OPS_TOKENS);
if (ops) {
  const src = readFileSync(join(REPO_ROOT, OPS_TOKENS), 'utf8');
  const blocks = {
    light: src.match(/:root\s*\{([^}]*)\}/),
    media: src.match(/@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*?\{[\s\S]*?:root[^{]*\{([^}]*)\}/),
    stamp: src.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/),
  };
  const names = (m) => new Set([...(m?.[1] ?? '').matchAll(/(--[a-z0-9-]+)\s*:/g)].map((x) => x[1]));
  const [L, M, S] = [names(blocks.light), names(blocks.media), names(blocks.stamp)];
  const all = new Set([...L, ...M, ...S]);
  const missing = [...all].filter((n) => !L.has(n) || !M.has(n) || !S.has(n));
  if (!L.size) r.fail('DS-9 违反：tokens.css 缺 :root 亮色定义');
  else if (!M.size || !S.size) r.fail('DS-9 违反：缺 prefers-color-scheme 或 data-theme="dark" 块');
  else if (missing.length) r.fail(`DS-9 违反：暗色块缺令牌 ${missing.join(', ')}`);
  else r.pass(`DS-9 三态主题令牌名一致（${all.size} 个）`);
}

r.done();
