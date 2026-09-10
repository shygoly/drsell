#!/usr/bin/env node
// spec/check-plan-link.mjs —— 套餐选择页的 URL 只能有一处定义。
//
// 2026-09-09 发现商家端有两个不同的 URL：
//   onboarding.ts      .../charges/<handle>/pricing_plans   ← 应用的套餐页，正确
//   settings/page.tsx  .../billing/plans                    ← 商店自己的 Shopify 订阅页
// 后者与本应用无关。商家点「Change plan」会被带去改他自己商店的 Shopify 套餐——
// 一个看起来能用、点下去做错事的按钮，比没有按钮更糟。
//
// 托管计费下这个链接是商家唯一的付费入口（`ADR-14`），拼错等于收不到钱。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, Reporter, rejectFix, walk } from './lib.mjs';

rejectFix();
const r = new Reporter('check-plan-link — 套餐页 URL 只有一处定义');

const BUILDER = 'apps/storefront/src/lib/onboarding.ts';
const abs = join(REPO_ROOT, BUILDER);
const src = existsSync(abs) ? readFileSync(abs, 'utf8') : null;

if (!src || !/buildPricingPlansLink/.test(src)) {
  r.fail(`${BUILDER} 里没有 buildPricingPlansLink —— 套餐链接失去唯一来源`);
} else if (!/charges\/\$\{handle\}\/pricing_plans/.test(src)) {
  r.fail(`${BUILDER} 的套餐链接不是 /charges/<handle>/pricing_plans`);
} else {
  r.pass('套餐链接的唯一构造点存在且形状正确');
}

// 别处不得自己拼。/billing/plans 是商店自己的订阅页，出现即错。
//
// walk() 收的是**仓库相对路径**并返回相对路径。这里一度传了绝对路径，
// readdirSync 抛错、返回空数组，于是扫了 0 个文件却报 pass——
// 一个覆盖为零却宣称通过的校验器，比没有校验器更危险。故先断言覆盖面。
const offenders = [];
let scanned = 0;
for (const rel of walk('apps', { exts: ['.ts', '.tsx'] })) {
  if (rel === BUILDER) continue;
  scanned += 1;
  const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
  if (/admin\.shopify\.com\/store\/[^"'`]*\/billing\/plans/.test(text)) {
    offenders.push(`${rel}：指向商店自己的 Shopify 订阅页，与本应用无关`);
  } else if (/pricing_plans/.test(text)) {
    offenders.push(`${rel}：自己拼了套餐链接，应调用 buildPricingPlansLink`);
  }
}

if (scanned === 0) {
  r.fail('扫描覆盖为 0 个文件 —— 本次检查什么也没验证，不能算通过');
} else if (offenders.length) {
  for (const o of offenders) r.fail(o);
} else {
  r.pass(`扫过 ${scanned} 个源文件，没有别处自行拼接套餐链接`);
}

r.done();
