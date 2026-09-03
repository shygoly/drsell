// tools/glm-swarm/repo.mjs — 确定性仓库检查工具。零依赖。
// 任务的 collect() 与 verify() 都只用这里的函数：它们不经过模型，是"下结论"的一侧。

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const DEFAULT_EXCLUDE = new Set([
  'node_modules', '.next', 'dist', 'build', '.pnpm-store', '.git', '.turbo',
  '.serena', '.workbuddy', 'test-results', '.runs', 'coverage', '.vercel',
]);

/** 递归收集文件，返回相对 REPO_ROOT 的路径。 */
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

/** 仓库内路径是否存在。拒绝逃逸出 REPO_ROOT 的路径。 */
export function repoPathExists(relPath) {
  if (typeof relPath !== 'string' || !relPath) return false;
  const abs = resolve(REPO_ROOT, relPath);
  if (!abs.startsWith(REPO_ROOT)) return false;
  return existsSync(abs);
}

export function readRepoFile(relPath) {
  const abs = resolve(REPO_ROOT, relPath);
  if (!abs.startsWith(REPO_ROOT)) return null;
  try { return readFileSync(abs, 'utf8'); } catch { return null; }
}

/** 读取指定行（1-based）。越界或文件不存在返回 null。 */
export function readRepoLine(relPath, lineNo) {
  const src = readRepoFile(relPath);
  if (src == null) return null;
  const lines = src.split('\n');
  if (!Number.isInteger(lineNo) || lineNo < 1 || lineNo > lines.length) return null;
  return lines[lineNo - 1];
}

/** 空白归一化后判断 needle 是否为 haystack 的子串。用于核对模型给的引文。 */
export function looseIncludes(haystack, needle) {
  if (typeof haystack !== 'string' || typeof needle !== 'string') return false;
  const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const n = norm(needle);
  if (!n) return false;
  return norm(haystack).includes(n);
}

/** 在给定目录集合内做纯文本搜索。返回命中的相对路径列表（最多 limit 个）。 */
export function grepRepo(term, { dirs = ['apps', 'packages', 'scripts', 'infra'], exts = null, limit = 20 } = {}) {
  if (typeof term !== 'string' || !term.trim()) return [];
  const needle = term.toLowerCase();
  const hits = [];
  for (const d of dirs) {
    for (const f of walk(d, { exts })) {
      const src = readRepoFile(f);
      if (src && src.toLowerCase().includes(needle)) {
        hits.push(f);
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}

/** 根 package.json 的 scripts 键集合。只读，不修改。 */
export function rootPackageScripts() {
  const raw = readRepoFile('package.json');
  if (!raw) return new Set();
  try { return new Set(Object.keys(JSON.parse(raw).scripts ?? {})); } catch { return new Set(); }
}

// ---------------------------------------------------------------------------
// 密钥脱敏 —— 送进模型的每一段文件内容都必须先过这里。
// 理由：配置核对任务天然要读 .env / infra 配置，这些文件含真实凭证。
// 送给第三方 API 前必须抹掉值，只保留键名与形状；不一致性判断靠键名与非密值即可成立。
// ---------------------------------------------------------------------------

const SECRET_KEY_RE = /(pass(word)?|secret|token|api[-_ ]?key|apikey|credential|private[-_ ]?key|auth|session|cookie|salt|signature|access[-_ ]?key|client[-_ ]?secret|dsn|webhook)/i;

function maskValue(v) {
  const s = String(v);
  if (!s) return s;
  return `<redacted:${s.length}>`;
}

/** URL / DSN 中内嵌的 user:pass@ 一律抹掉密码段。 */
function redactUrlCredentials(text) {
  return text.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:@/]+):([^\s@/]+)@/g,
    (_m, head) => `${head}:<redacted>@`);
}

/**
 * 通用脱敏：处理 env / JSON / TOML / YAML 四种形状里"键名像密钥"的赋值，
 * 外加内嵌凭证的 URL，以及裸露的长 token。宁可多抹，不可漏抹。
 */
export function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  let out = text;

  // KEY=VALUE（env / shell）
  out = out.replace(/^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)([ \t]*=[ \t]*)(.+)$/gm,
    (m, pre, key, eq, val) => (SECRET_KEY_RE.test(key) ? `${pre}${key}${eq}${maskValue(val.trim())}` : m));

  // "key": "value"（JSON）
  out = out.replace(/("([^"]+)"[ \t]*:[ \t]*)"([^"]*)"/g,
    (m, pre, key, val) => (SECRET_KEY_RE.test(key) ? `${pre}"${maskValue(val)}"` : m));

  // key = "value" / key: value（TOML / YAML）
  out = out.replace(/^([ \t]*)([A-Za-z_][A-Za-z0-9_.-]*)([ \t]*[:=][ \t]*)(["']?)([^\n"']*)\4[ \t]*$/gm,
    (m, ind, key, sep, q, val) => (SECRET_KEY_RE.test(key) && val ? `${ind}${key}${sep}${q}${maskValue(val)}${q}` : m));

  out = redactUrlCredentials(out);

  // 裸露的长随机串（>=32 位 base64/hex 样式），常见于漏网的 key
  out = out.replace(/\b[A-Za-z0-9_\-]{32,}\b/g, (m) => (/^[0-9]+$/.test(m) ? m : `<redacted:${m.length}>`));

  return out;
}

/** 读文件并脱敏。任何进入 prompt 的内容都必须走这个函数，而不是 readRepoFile。 */
export function readForPrompt(relPath) {
  const src = readRepoFile(relPath);
  return src == null ? null : redactSecrets(src);
}

/** 把若干文件拼成带行号的语料块，便于模型引用 path:line。 */
export function buildCorpus(relPaths, { maxCharsPerFile = 20000 } = {}) {
  const parts = [];
  for (const p of relPaths) {
    let body = readForPrompt(p);
    if (body == null) continue;
    if (body.length > maxCharsPerFile) body = `${body.slice(0, maxCharsPerFile)}\n...<truncated>`;
    const numbered = body.split('\n').map((l, i) => `${i + 1}| ${l}`).join('\n');
    parts.push(`--- FILE: ${p} ---\n${numbered}`);
  }
  return parts.join('\n\n');
}

export { relative };
