// spec/lib.mjs — 校验器共享工具。零运行时依赖。
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_EXCLUDE = new Set([
  'node_modules', '.next', 'dist', 'build', '.pnpm-store',
  '.git', '.turbo', '.serena', '.workbuddy', 'docs', 'design', 'test-results',
]);

/** 递归收集文件。dir 相对 REPO_ROOT；depth=1 表示只看该层。返回相对路径。 */
export function walk(dir, { exts = null, exclude = DEFAULT_EXCLUDE, depth = Infinity } = {}) {
  const out = [];
  let entries;
  try { entries = readdirSync(join(REPO_ROOT, dir)); } catch { return out; }
  for (const name of entries) {
    if (exclude.has(name)) continue;
    const rel = dir === '.' ? name : join(dir, name);
    let st;
    try { st = statSync(join(REPO_ROOT, rel)); } catch { continue; }
    if (st.isDirectory()) {
      if (depth > 1) out.push(...walk(rel, { exts, exclude, depth: depth - 1 }));
    } else if (!exts || exts.includes(extname(name))) {
      out.push(rel);
    }
  }
  return out;
}

const JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

/**
 * 剥离注释，用等长空格替换以保持行号与列号。
 * 只处理已知语言；未知扩展名原样返回（宁可漏报，不可误报）。
 */
export function stripComments(src, ext) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  if (ext === '.css') return src.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (!JS_EXTS.has(ext)) return src;
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

/** 逐行匹配。regex 的 g 标志会被剥掉以避免 lastIndex 状态污染。 */
export function matchLines(relPath, regex, { strip = false } = {}) {
  const ext = extname(relPath);
  let src;
  try { src = readFileSync(join(REPO_ROOT, relPath), 'utf8'); } catch { return []; }
  if (strip) src = stripComments(src, ext);
  const re = new RegExp(regex.source, regex.flags.replace('g', ''));
  const hits = [];
  src.split('\n').forEach((text, i) => {
    if (re.test(text)) hits.push({ file: relPath, line: i + 1, text: text.trim() });
  });
  return hits;
}

/**
 * 解析 DECISIONS.md。
 * sections: 章节号 → 该节的原始表格行数组
 * byPrefix: 仅 §1–§4 为登记表，§6/§7 引用已登记 ID，不计入注册
 */
export function parseDecisions() {
  const md = readFileSync(join(REPO_ROOT, 'DECISIONS.md'), 'utf8');
  const sections = {};
  let cur = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(\d+)\./);
    if (h) { cur = h[1]; sections[cur] ??= []; continue; }
    if (cur && line.trimStart().startsWith('|')) sections[cur].push(line);
  }
  const SECTION_PREFIX = { 1: 'INV', 2: 'ADR', 3: 'B', 4: 'DS' };
  const byPrefix = { INV: new Set(), ADR: new Set(), B: new Set(), DS: new Set() };
  for (const [num, prefix] of Object.entries(SECTION_PREFIX)) {
    for (const line of sections[num] ?? []) {
      const m = line.match(/^\|\s*`([A-Z]+-\d+)`\s*\|/);
      if (m && m[1].startsWith(`${prefix}-`)) byPrefix[prefix].add(m[1]);
    }
  }
  return { md, sections, byPrefix };
}

/** 统一输出与退出码。0 = PASS（可含 WARN），1 = FAIL。 */
export class Reporter {
  constructor(name) { this.name = name; this.passes = []; this.warns = []; this.fails = []; }
  pass(m) { this.passes.push(m); }
  warn(m) { this.warns.push(m); }
  fail(m) { this.fails.push(m); }
  done() {
    console.log(`== ${this.name} ==`);
    for (const m of this.passes) console.log(`  ✓ ${m}`);
    for (const m of this.warns) console.log(`  ! ${m}`);
    for (const m of this.fails) console.log(`  ✗ ${m}`);
    console.log(`  ${this.passes.length} pass / ${this.warns.length} warn / ${this.fails.length} fail`);
    process.exit(this.fails.length ? 1 : 0);
  }
}

/** 治理只诊断、不自动改。 */
export function rejectFix() {
  if (process.argv.includes('--fix')) {
    console.error('✗ 治理只诊断、不自动改。本校验器不提供 --fix。');
    process.exit(2);
  }
}
