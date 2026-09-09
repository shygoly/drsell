#!/usr/bin/env node
// scripts/deploy-manifest.mjs — 在**服务器上**生成部署清单，供运营台 /deploy 显示。
//
// 为什么由部署脚本生成而不是应用自省（openspec design 的 D1）：应用无法可靠知道
// 自己是哪个 commit 构建的——process.env 里没有，Next 的 standalone 产物也不带。
// 让四个应用各自去猜，会得到四个可能不一致的答案。
//
// 为什么在服务器上跑：清单要记的是**实际写入服务器的那些文件**的指纹，
// 不是本机模板的。尤其要并排记下每个 Next 应用的两份 .env——
// 进程读的是 standalone 那份，而两份分岔过且没人看得出来（2026-09-09）。
//
// 用法（在 ${REMOTE} 目录里）：
//   node scripts/deploy-manifest.mjs --commit=<sha> --subject=<msg> > deploy-manifest.json
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = process.env.DRSELL_RUN_DIR || process.cwd();
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

/** 密钥类：只记 sha256 前 12 位与长度，绝不记值。长度能最快暴露「多了引号」「被截断」。 */
const SECRET_KEYS = [
  'SHOPIFY_API_SECRET',
  'SHOPIFY_API_SECRET_PREVIOUS',
  'SHOPIFY_API_KEY',
  'DATABASE_URL',
  'INTERNAL_API_KEY',
  'JWT_SECRET',
  'SHOP_TOKEN_ENC_KEY',
  'GOOGLE_CLIENT_SECRET',
  'SMTP_PASS',
];
/** 非密钥类：值本身才是运维要看的东西。 */
const PLAIN_KEYS = [
  'SHOPIFY_APP_URL',
  'API_INTERNAL_URL',
  'NEXT_PUBLIC_API_BASE',
  'NEXT_PUBLIC_API_URL',
  'ASSET_PREFIX',
  'PORT',
  'SUBSCRIPTION_GATE_ENFORCE',
  'SMTP_HOST',
];

const fp = (v) => createHash('sha256').update(v).digest('hex').slice(0, 12);

function parseEnv(file) {
  if (!existsSync(file)) return null;
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').trim();
  }
  return out;
}

function summarize(file) {
  const env = parseEnv(file);
  if (!env) return { present: false, file, secrets: {}, plain: {} };
  const secrets = {};
  for (const k of SECRET_KEYS) {
    if (env[k] == null) continue;
    secrets[k] = env[k] === '' ? { fp: null, len: 0 } : { fp: fp(env[k]), len: env[k].length };
  }
  const plain = {};
  for (const k of PLAIN_KEYS) if (env[k] != null) plain[k] = env[k];
  return { present: true, file, secrets, plain };
}

// 三个 Next 应用各有两份 .env；api 只有一份（无 standalone 产物）。
const apps = {};
for (const app of ['web', 'storefront', 'ops']) {
  apps[app] = {
    root: summarize(path.join(ROOT, `apps/${app}/.env`)),
    runtime: summarize(path.join(ROOT, `apps/${app}/standalone/apps/${app}/.env`)),
    /** 进程实际读的是 runtime 那份 —— 前端据此措辞 */
    runtimeIsStandalone: true,
  };
}
apps.api = {
  root: summarize(path.join(ROOT, 'apps/api/.env')),
  runtime: summarize(path.join(ROOT, 'apps/api/.env')),
  runtimeIsStandalone: false,
};

let migrationHeadInCode = null;
const migDir = path.join(ROOT, 'apps/api/prisma/migrations');
if (existsSync(migDir)) {
  const dirs = readdirSync(migDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  migrationHeadInCode = dirs[dirs.length - 1] ?? null;
}

process.stdout.write(
  JSON.stringify(
    {
      schema: 1,
      commit: arg('commit'),
      commitSubject: arg('subject'),
      builtAt: new Date().toISOString(),
      migrationHeadInCode,
      apps,
    },
    null,
    2,
  ) + '\n',
);
