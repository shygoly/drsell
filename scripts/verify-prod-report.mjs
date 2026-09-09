#!/usr/bin/env node
// scripts/verify-prod-report.mjs —— 把 ops 只读接口的三份 JSON 变成断言行。
// 由 verify-prod.sh 通过 stdin 喂入；每行 `level|message`，level ∈ ok/warn/fail。
//
// 判据写在这里而不是 shell 里：这些是有分支的业务判断（密钥槽位、观察窗口、
// 令牌到期），用 jq/grep 表达会写成没人敢改的一行式。
let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;

let d;
try {
  d = JSON.parse(raw);
} catch {
  console.log('fail|ops 接口返回不是合法 JSON');
  process.exit(0);
}
const out = [];
const say = (level, msg) => out.push(`${level}|${msg}`);

// ── 部署清单 ───────────────────────────────────────────────────────
const dep = d.deploy ?? {};
if (!dep.known) {
  // 缺证据不是没问题——这是本仓反复吃亏的那个区别
  say('fail', `部署清单不可用：${dep.reason ?? '未知'}（这是「不知道」，不是「正常」）`);
} else {
  say('ok', `线上版本 ${dep.commit}（构建于 ${String(dep.builtAt).replace('T', ' ').slice(0, 16)}）`);
  if (dep.dirty) say('warn', '构建时工作区有未提交改动，这个 commit 不代表线上跑的代码');
  if (dep.inconsistentTotal > 0) {
    const who = (dep.apps ?? [])
      .filter((a) => a.inconsistentCount > 0)
      .map((a) => `${a.name}(${a.inconsistentCount})`)
      .join(' ');
    say('fail', `配置分岔 ${dep.inconsistentTotal} 项：${who}。进程读的是 standalone 那份，改根 .env 不重新部署不生效`);
  } else {
    say('ok', '各应用两份 .env 指纹一致');
  }
  if (dep.migration && !dep.migration.consistent) {
    say('fail', `迁移头不一致：代码 ${dep.migration.headInCode} / 数据库 ${dep.migration.headApplied}`);
  } else {
    say('ok', `迁移头一致（${dep.migration?.headApplied ?? '—'}）`);
  }
  if (dep.api?.stale) say('fail', dep.api.note ?? 'API 进程比部署清单还早启动');

  for (const t of dep.tokens ?? []) {
    if (!t.installed) continue;
    if (t.expired && !t.hasRefreshToken) {
      say('fail', `${t.shopDomain} 访问令牌已过期且无刷新令牌 —— 该店 Admin API 已不可用，商家须重装`);
    } else if (t.expired) {
      say('warn', `${t.shopDomain} 访问令牌已过期（有刷新令牌，下次调用会自动换发）`);
    } else if (t.expiringSoon) {
      say('warn', `${t.shopDomain} 访问令牌 ${t.expiresInHours} 小时内到期`);
    } else if (t.atRisk) {
      say('warn', `${t.shopDomain} 令牌会过期但没有刷新令牌 —— 到期即失去 Admin API 访问`);
    }
  }
}

// ── 密钥槽位 ───────────────────────────────────────────────────────
const sec = d.secret ?? {};
if (sec.latestSlot === 'previous') {
  // 2026-09-09 的真实形态：轮换进行中，后台同时列出 old/new，Shopify 仍用 old 签名
  say('warn', '轮换进行中：后台最新密钥在 _PREVIOUS 槽位。**不要删 _PREVIOUS**，它是将要接管的那把');
} else if (sec.latestSlot === 'neither') {
  say('fail', '后台最新密钥两个槽位都不匹配 —— 配置与 Shopify 侧已脱节');
} else if (sec.latestSlot === 'unknown') {
  say('warn', '未配置 SHOPIFY_API_SECRET_LATEST_FP —— 分不清新旧密钥，删除判据无法给结论');
} else if (sec.safeToDelete) {
  say('ok', `旧密钥可以删除：${sec.reason}`);
} else {
  say('ok', `旧密钥暂不可删（符合预期）：${sec.reason}`);
}
for (const topic of sec.stillOnPreviousTopics ?? []) {
  say('fail', `topic ${topic} 只在旧密钥下出现过 —— 删旧密钥它会 401`);
}

// ── 订阅闸门 ───────────────────────────────────────────────────────
const gate = d.gate ?? {};
if (gate.shops) {
  say(
    'ok',
    `订阅闸门 ${gate.enforcing ? '已开启（正在拦截）' : '观测模式（只记录不拦截）'}：` +
      `${gate.blockedCount}/${gate.shops.length} 会被拦`,
  );
  if (gate.neverSyncedCount > 0) {
    say('warn', `${gate.neverSyncedCount} 个店的订阅镜像从未与 Shopify 同步过 —— 据此停服就是误停`);
  }
  if (gate.enforcing && gate.neverSyncedCount > 0) {
    say('fail', '闸门已开启但仍有店铺镜像从未同步 —— 可能正在误停真实付费商家');
  }
}

console.log(out.join('\n'));
