#!/usr/bin/env node
// spec/check-dashboard-metrics.mjs — 商家仪表盘不得返回硬编码的度量值。
//
// 曾经的实况：getStats 返回 `avgFirstResponseSec: 12` —— 一个写死的常量，
// 前端原样渲染成「12s」。商家看到的是一个从未被测量过的数字。
// 同期还有 `aiResolution` 恒定接近 100%（因为 status='human' 后端从不写入）。
//
// 假数字比缺数字更糟：缺数字看得出来，假数字看不出来。
// 这里守的是「凡是度量，要么真算，要么别返回」。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, stripComments, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-dashboard-metrics — 仪表盘度量');

const FILE = 'apps/api/src/storefront-dashboard/storefront-dashboard.service.ts';

// 名字以这些结尾的字段是「测出来的量」，不该等于字面量。
// Target / Limit / Days 这类是配置目标或窗口宽度，不是测量结果，故不在列。
const MEASURED = /\b(\w*(?:Sec|Ms|Pct|Rate|Count|Resolution|Avg|Median))\s*:\s*(-?\d+(?:\.\d+)?)\s*[,}]/;

let src;
try {
  src = stripComments(readFileSync(join(REPO_ROOT, FILE), 'utf8'), '.ts');
} catch {
  r.fail(`读不到 ${FILE}`);
  r.done();
}

const ALLOW = new Set(['aiResolutionTarget']);

let violations = 0;
src.split('\n').forEach((line, i) => {
  const m = line.match(MEASURED);
  if (!m) return;
  if (ALLOW.has(m[1])) return;
  r.fail(
    `${FILE}:${i + 1} 度量字段 ${m[1]} 被写成常量 ${m[2]}——` +
      `要么由数据真实计算，要么不返回该字段（null 也行），不要拿常量冒充实测值`,
  );
  violations++;
});

if (!violations) {
  r.pass('getStats 无硬编码度量值');
}

// 无数据时必须能表达「没有数据」，否则 0% 与 100% 会被读成真实业绩。
if (/aiResolution\s*=[\s\S]{0,200}?null/.test(src)) {
  r.pass('分流率在窗内无会话时返回 null，而非 0/100');
} else {
  r.fail('分流率必须在窗内无会话时返回 null——0% 和 100% 都会被读成真实业绩');
}

r.done();
