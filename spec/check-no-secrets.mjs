#!/usr/bin/env node
// spec/check-no-secrets.mjs — 版本库里不得出现真凭据。
//
// 为什么本地要有这一条：AGENTS.md 陷阱 6 说「密钥出现在代码、文档或提交里都是事故」，
// 但此前它没有执行体。2026-09-09 一天之内触发了两次，都靠 GitHub 推送保护才拦下：
//   1. `git add -A` 把 apps/*/.env.bak.* 扫进提交
//   2. 单测夹具直接用了真实的 Shopify app secret
// 远端兜底意味着「已经写进本地历史了才发现」。这条把发现点提前到提交之前。
//
// 只匹配**格式无歧义**的凭据前缀 + 其真实字符集（如 Shopify 用十六进制）。
// 测试夹具因此可以用「格式合法但含非十六进制字母」的合成值，既能验正则又不误报。
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-no-secrets — 版本库无真凭据');

const PATTERNS = [
  [/shpss_[a-fA-F0-9]{32}\b/, 'Shopify app secret'],
  [/shpat_[a-fA-F0-9]{32}\b/, 'Shopify access token'],
  [/shpca_[a-fA-F0-9]{32}\b/, 'Shopify custom app token'],
  [/cfut_[A-Za-z0-9_-]{40,}\b/, 'Cloudflare user API token'],
  [/GOCSPX-[A-Za-z0-9_-]{28,}\b/, 'Google OAuth client secret'],
  // 真实 OpenAI key 是 sk- 加 48 位。收到 40+ 而不是给豁免开关：
  // 一个会对合成夹具报警的检查器，最终会被人静音。
  [/sk-[A-Za-z0-9]{40,}\b/, 'OpenAI 风格 API key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, '私钥'],
];

// 只扫 git 跟踪的文件——未跟踪的 .env 本来就不该入库，由 .gitignore 负责
let files = [];
try {
  files = execSync('git ls-files -z', { cwd: REPO_ROOT, maxBuffer: 32 * 1024 * 1024 })
    .toString()
    .split('\0')
    .filter(Boolean);
} catch {
  r.warn('无法列出 git 跟踪文件（不在仓库里？），跳过');
  r.done();
}

// 本文件自身含模式定义，跳过；锁文件与产物不含凭据但很大
const SKIP = /^(spec\/check-no-secrets\.mjs|pnpm-lock\.yaml|.*\.(png|jpg|jpeg|gif|webp|ico|woff2?|pdf))$/;

let hits = 0;
for (const f of files) {
  if (SKIP.test(f)) continue;
  const abs = join(REPO_ROOT, f);
  let st;
  try {
    st = statSync(abs);
  } catch {
    continue; // 已删除但仍在索引里
  }
  if (!st.isFile() || st.size > 2 * 1024 * 1024) continue;
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    for (const [re, label] of PATTERNS) {
      if (re.test(line)) {
        // 不打印命中内容——报告本身也不该复述凭据
        r.fail(`${f}:${i + 1} 疑似${label}。凭据不得入库（AGENTS.md 陷阱 6）`);
        hits++;
      }
    }
  });
}

if (!hits) r.pass(`扫过 ${files.length} 个跟踪文件，未发现真凭据`);
r.done();
