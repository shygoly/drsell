#!/usr/bin/env node
// spec/check-deploy-facts.mjs — DEPLOY.md 声称的部署事实必须仍然成立。
//
// 存在理由：DEPLOY.md 记的是「配置改哪里才生效」这类实况，而实况会随脚本改动
// 漂移。一份漂了的部署文档比没有更糟——它会让人把配置改在没人读的文件上，
// 而且不报错（2026-09-09 就这样空转了很久）。故每条可机器判定的断言都在这里守住。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-deploy-facts — 部署实况未漂移');

const read = (f) => (existsSync(join(REPO_ROOT, f)) ? readFileSync(join(REPO_ROOT, f), 'utf8') : null);

const deployMd = read('DEPLOY.md');
if (!deployMd) {
  r.fail('DEPLOY.md 缺失——配置实况没有出处');
  r.done();
}
r.pass('DEPLOY.md 存在');

// 1. AGENTS.md 的事实来源表必须指向它，否则没人会读到
const agents = read('AGENTS.md') ?? '';
if (/\[?`?DEPLOY\.md`?\]?/.test(agents)) r.pass('AGENTS.md 事实来源表指向 DEPLOY.md');
else r.fail('AGENTS.md 没有指向 DEPLOY.md——事实来源表漏了它，等于没人会读');

// 2. DEPLOY.md §2 断言：部署会把根 .env 覆盖进 standalone。没有这一步，
//    「改本机 .env 再部署」这条规矩就是假的。
const script = read('scripts/deploy-mvp.sh') ?? '';
if (/standalone\/apps\/\\?\$app\/\.env|sa_env/.test(script)) {
  r.pass('deploy-mvp.sh 仍把根 .env 覆盖进 standalone');
} else {
  r.fail(
    'deploy-mvp.sh 不再把根 .env 覆盖进 standalone —— DEPLOY.md §2 的生效链路已失效，' +
      '改配置将再次空转',
  );
}

// 3. 部署脚本必须自报 DEPLOY.md，否则「部署前先读」只是口头约定
if (/DEPLOY\.md/.test(script)) r.pass('deploy-mvp.sh 提示先读 DEPLOY.md');
else r.fail('deploy-mvp.sh 未提示 DEPLOY.md——「部署前先读」缺少执行体');

// 4. DEPLOY.md 不得出现密钥明文（AGENTS.md 陷阱 6）。只允许指纹。
const SECRET_RE = /\b(shpss_[a-f0-9]{20,}|shpat_[a-f0-9]{20,}|cfut_[A-Za-z0-9]{20,})\b/;
if (SECRET_RE.test(deployMd)) r.fail('DEPLOY.md 里出现了密钥明文——只允许记指纹');
else r.pass('DEPLOY.md 只记指纹，无密钥明文');

// 5. 每条 DEP-n 决策都要有日期，否则无法判断是否过期
const deps = [...deployMd.matchAll(/^### (DEP-\d+)[：:](.*)$/gm)];
if (!deps.length) r.warn('DEPLOY.md 尚无 DEP-n 决策');
for (const [, id, title] of deps) {
  if (/\d{4}-\d{2}-\d{2}/.test(title)) r.pass(`${id} 带日期`);
  else r.fail(`${id} 缺日期——配置决策必须可判断是否已过期`);
}

// 6. .env 的时间戳备份必须被忽略。2026-09-09 `git add -A` 把 .env.bak.* 扫进提交，
//    靠 GitHub 推送保护才拦下——不能指望远端替我们守 AGENTS.md 陷阱 6。
const ignore = read('.gitignore') ?? '';
if (/apps\/\*\/\.env\.bak\.\*/.test(ignore)) r.pass('.gitignore 忽略 .env 的时间戳备份');
else r.fail('.gitignore 未忽略 apps/*/.env.bak.* —— 备份文件会被 git add -A 扫进提交');

// 7. 部署清单必须仍在生成。没有它，运营台 /deploy 会静默显示旧值或空白——
//    而「看起来正常」比「明说不知道」更危险（openspec ops-deploy-observability 1.4）。
if (/deploy-manifest\.mjs/.test(script) && /deploy-manifest\.json/.test(script)) {
  r.pass('deploy-mvp.sh 仍生成部署清单');
} else {
  r.fail('deploy-mvp.sh 不再生成 deploy-manifest.json —— 运营台 /deploy 会失去数据来源');
}

// 8. 清单生成器不得输出明文：它读的是真 .env，一旦漏写指纹就是把密钥落盘到
//    一个会被 API 读取并渲染到网页上的文件里。
const gen = read('scripts/deploy-manifest.mjs') ?? '';
if (!gen) r.fail('scripts/deploy-manifest.mjs 缺失');
else if (/createHash\('sha256'\)/.test(gen) && /SECRET_KEYS/.test(gen)) {
  r.pass('清单生成器对密钥类配置只写指纹');
} else {
  r.fail('scripts/deploy-manifest.mjs 未见 sha256 指纹化 —— 可能把密钥明文写进了清单');
}

// 9. DEPLOY.md 与运营台视图互相指认：文档记「应该是什么」，视图记「现在是什么」
if (/ops\.szchada\.top\/deploy|运营台.*\/deploy|\/deploy/.test(deployMd)) {
  r.pass('DEPLOY.md 指向运营台 /deploy');
} else {
  r.fail('DEPLOY.md 未指向运营台 /deploy —— 读文档的人不知道哪里能看实况');
}

// 10. 验证脚本必须存在且被 DEPLOY.md 引用。文档里写「应该怎么验」而没有执行体，
//     就是本仓反复吃亏的那种规矩——2026-09-09 一天内因此漏判三次。
const vp = read('scripts/verify-prod.sh');
if (!vp) {
  r.fail('scripts/verify-prod.sh 缺失 —— DEPLOY.md 的验证规矩失去执行体');
} else if (!/DEPLOY\.md|verify-prod\.sh/.test(deployMd)) {
  r.fail('DEPLOY.md 未引用 scripts/verify-prod.sh');
} else if (/set -e[^u]/.test(vp)) {
  // -e 会让脚本停在第一个失败，看不到全貌；这里要的是「一次跑完，一次看全」
  r.fail('verify-prod.sh 不应带 set -e —— 所有检查都要跑完才有诊断价值');
} else {
  r.pass('verify-prod.sh 存在且被 DEPLOY.md 引用');
}

// 11. 验证脚本只读。它会在生产上跑，误加写操作的代价很高。
if (vp && /(pm2 (restart|stop|delete)|rm -|DELETE FROM|UPDATE |INSERT |migrate deploy|> *\/opt)/.test(vp)) {
  r.fail('verify-prod.sh 含疑似写操作 —— 它必须是只读体检');
} else if (vp) {
  r.pass('verify-prod.sh 未见写操作');
}

r.done();
