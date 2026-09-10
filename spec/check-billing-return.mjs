#!/usr/bin/env node
// spec/check-billing-return.mjs —— 套餐回跳的处理不得成环。
//
// 2026-09-09 生产事故：回跳处理写成「同步完 window.location.reload()」，
// 而 reload 之后 URL 上的 plan_handle 还在，于是又同步又 reload——商家页面无限
// 闪动，Today's conversations 在 0/1 之间反复跳。
//
// 教训不是「别用 reload」，而是**不成环这件事不能托付给一条 reload 会清掉的路径**：
// 内存里的守卫（ref、模块变量）跨不过 reload，唯一跨得过的是 URL 与 storage。
// 所以摘参数必须发生在 reload 之前。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, Reporter, rejectFix } from './lib.mjs';

const read = (rel) => {
  const abs = join(REPO_ROOT, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
};

rejectFix();
const r = new Reporter('check-billing-return — 套餐回跳不成环');

const FILE = 'apps/storefront/src/app/page.tsx';
const src = read(FILE);

if (!src) {
  r.fail(`${FILE} 缺失`);
  r.done();
}

const handlesReturn = /plan_handle/.test(src);
if (!handlesReturn) {
  // 处理逻辑可能被挪走了。挪走不等于消失——指出来，别默默放行。
  r.warn(`${FILE} 不再处理 plan_handle；若已挪到别处，请把本检查器一并指过去`);
  r.done();
}

const stripAt = src.search(
  /searchParams\s*\.\s*delete\s*\(\s*["'`]plan_handle["'`]\s*\)/,
);
// 真正要守的边界是「摘参数早于那个可能失败的异步调用」，而不是早于 reload。
// 摘除若落在 .then() 里，同步一失败参数就留下了，下次加载照样重新触发——
// 只是环变慢了，没有消失。
const asyncAt = src.search(/syncSubscription\s*\(/);

if (stripAt < 0) {
  r.fail(
    `${FILE} 处理了 plan_handle 却没有把它从 URL 上摘掉 —— ` +
      '任何一次重新加载都会重新触发处理',
  );
} else if (asyncAt >= 0 && stripAt > asyncAt) {
  r.fail(
    `${FILE} 在发起同步之后才摘 plan_handle —— 同步失败时参数会留在 URL 上，` +
      '下次加载重新触发（2026-09-09 无限刷新的同一类成因）',
  );
} else {
  r.pass('回跳处理先摘参数，再做可能失败的事');
}

// 跨 reload 的守卫：内存里的 ref 跨不过整页重载，必须有 storage 一级
if (/sessionStorage|localStorage/.test(src)) {
  r.pass('存在跨重载的去重守卫');
} else {
  r.warn(`${FILE} 只有内存内守卫；整页重载后失效，建议保留 storage 一级`);
}

r.done();
