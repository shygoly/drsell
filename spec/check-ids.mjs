#!/usr/bin/env node
// spec/check-ids.mjs — 代码与元语文档中的 ID 必须在 DECISIONS.md 在册。
import { walk, matchLines, parseDecisions, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-ids — ID 在册');

const { sections, byPrefix } = parseDecisions();

// 格式契约 6：§1–§4 任一登记表 0 行 = 红
for (const [prefix, set] of Object.entries(byPrefix)) {
  if (set.size === 0) r.fail(`${prefix} 登记表解析为 0 行 — 格式契约破坏`);
  else r.pass(`${prefix} 登记 ${set.size} 条`);
}

// 格式契约 6：§6 / §7 各须 ≥2 数据行
for (const [num, label] of [['6', '已知偏离'], ['7', '待定']]) {
  const rows = (sections[num] ?? []).filter((l) => /^\|\s*`/.test(l.trim()));
  if (rows.length < 2) r.fail(`§${num} ${label} 仅 ${rows.length} 行，须 ≥2`);
  else r.pass(`§${num} ${label} ${rows.length} 行`);
}

const REGISTERED = new Set([...byPrefix.INV, ...byPrefix.ADR, ...byPrefix.B, ...byPrefix.DS]);

// 这两个文件字面包含 ID 样本，排除以免自噬
const EXCLUDE_FILES = new Set(['spec/check-ids.mjs', 'spec/negative-verify.mjs']);
// DECISIONS.md 自身含全部 ID，计入引用会让「零引用 WARN」永远不触发
const REF_EXCLUDE = new Set(['DECISIONS.md']);

const files = [
  ...walk('.', { exts: ['.md'], depth: 1 }),
  ...walk('apps', { exts: ['.ts', '.tsx'] }),
  ...walk('packages', { exts: ['.ts'] }),
  ...walk('spec', { exts: ['.mjs'] }),
].filter((f) => !EXCLUDE_FILES.has(f));

const ID_RE = /\b(?:INV|ADR|B|DS)-\d+(?:\.\d+)?\b/;
const ID_RE_G = /\b(?:INV|ADR|B|DS)-\d+(?:\.\d+)?\b/g;

const referenced = new Set();
let bad = 0;
for (const f of files) {
  for (const hit of matchLines(f, ID_RE)) {
    for (const m of hit.text.matchAll(ID_RE_G)) {
      // 格式契约 3：INV-n.m 按父编号查册
      const parent = m[0].replace(/\.\d+$/, '');
      if (!REF_EXCLUDE.has(f)) referenced.add(parent);
      if (!REGISTERED.has(parent)) { r.fail(`${hit.file}:${hit.line} 未在册的 ${m[0]}`); bad++; }
    }
  }
}
if (!bad) r.pass(`扫描 ${files.length} 个文件，无未在册 ID`);

// 格式契约 4：在册但零引用 → WARN，不红
for (const id of [...REGISTERED].sort()) {
  if (!referenced.has(id)) r.warn(`${id} 在册但全仓零引用`);
}

r.done();
