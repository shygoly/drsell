#!/usr/bin/env node
// spec/check-pricing.mjs — 上架文案的价格必须等于代码里实际会收的价格（ADR-14）。
//
// 这条规矩是被真事故逼出来的：billing 曾只有单一 PLAN_CODE/PLAN_PRICE，
// 生产按回落值实收 $9.90，而 listing 打算写 Basic/Pro 两档。
// 在 Shopify 上宣传做不到的计费方式是驳回项，且是**先上线后才发现**的那类。
//
// 唯一事实来源是 @drsell/shared 的 PLANS。这里做两件事：
//   1. listing/LISTING.md 的 Pricing 表逐行对上 PLANS 的价格与额度；
//   2. billing.service.ts 里不得再出现按环境变量定价的回落——那正是漂移的源头。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, Reporter, rejectFix } from './lib.mjs';

rejectFix();
const r = new Reporter('check-pricing — 价格与文案对账');

const SHARED = 'packages/shared/src/index.ts';
const LISTING = 'listing/LISTING.md';
const BILLING = 'apps/api/src/subscription/billing.service.ts';

const shared = readFileSync(join(REPO_ROOT, SHARED), 'utf8');

// PLANS 的每一行形如：
//   basic: { code: 'basic', name: 'Basic', price: 15, answersPerPeriod: 1500 },
const plans = new Map();
const block = shared.match(/export const PLANS[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!block) {
  r.fail(`${SHARED} 里找不到 PLANS —— 价格的唯一事实来源不见了`);
  r.done();
} else {
  const rowRe = /name:\s*'([^']+)'\s*,\s*price:\s*([\d.]+)\s*,\s*answersPerPeriod:\s*(\d+)/g;
  for (const m of block[1].matchAll(rowRe)) {
    plans.set(m[1], { price: Number(m[2]), answers: Number(m[3]) });
  }

  if (plans.size === 0) {
    r.fail(`${SHARED} 的 PLANS 解析不出任何套餐`);
  } else {
    r.pass(`PLANS ${plans.size} 档：${[...plans].map(([n, p]) => `${n} $${p.price}/${p.answers}`).join('，')}`);
  }

  // 1. listing 的 Pricing 表
  const listingPath = join(REPO_ROOT, LISTING);
  if (!existsSync(listingPath)) {
    r.fail(`缺少 ${LISTING} —— 上架文案没有事实来源，只能每次重想一遍`);
  } else {
    const md = readFileSync(listingPath, 'utf8');
    const section = md.match(/\n## Pricing\n([\s\S]*?)(?=\n## |\n---\n|$)/);
    if (!section) {
      r.fail(`${LISTING} 缺少 "## Pricing" 一节`);
    } else {
      // | Basic | 15 | 1500 |
      const listed = new Map();
      const rowRe = /^\|\s*([A-Za-z][\w ]*?)\s*\|\s*\$?([\d.]+)\s*\|\s*([\d,]+)\s*\|/gm;
      for (const m of section[1].matchAll(rowRe)) {
        listed.set(m[1].trim(), { price: Number(m[2]), answers: Number(m[3].replace(/,/g, '')) });
      }

      let bad = 0;
      for (const [name, want] of plans) {
        const got = listed.get(name);
        if (!got) {
          r.fail(`${LISTING} 的 Pricing 表缺少 "${name}" 档`);
          bad++;
        } else if (got.price !== want.price || got.answers !== want.answers) {
          r.fail(
            `"${name}" 档不一致：PLANS 是 $${want.price}/${want.answers} 次，` +
              `${LISTING} 写的是 $${got.price}/${got.answers} 次`,
          );
          bad++;
        }
      }
      for (const name of listed.keys()) {
        if (!plans.has(name)) {
          r.fail(`${LISTING} 多出一档 "${name}"，代码里不存在——宣传了收不到的套餐`);
          bad++;
        }
      }
      if (bad === 0) r.pass(`${LISTING} 的 Pricing 表与 PLANS 逐行一致`);
    }
  }

  // 2. billing 不得再按环境变量定价
  const billingPath = join(REPO_ROOT, BILLING);
  if (!existsSync(billingPath)) {
    r.fail(`缺少 ${BILLING}`);
  } else {
    const src = readFileSync(billingPath, 'utf8');
    // 注释里提旧变量是可以的（那是在解释历史），代码里读它才是问题。
    const live = src
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join('\n');
    if (/process\.env\.BILLING_PLAN_(PRICE|CODE)/.test(live)) {
      r.fail(`${BILLING} 仍按 BILLING_PLAN_PRICE/CODE 定价——价格会与 PLANS 漂移`);
    } else {
      r.pass(`${BILLING} 的价格取自 PLANS，未按环境变量回落`);
    }
  }

  r.done();
}
