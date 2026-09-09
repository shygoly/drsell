#!/usr/bin/env node
// scripts/migrate-shop-tokens.mjs — 把存量的「永不过期」离线令牌换成会过期令牌。
//
// 为什么需要它：`ShopAccessTokenService.getValidAccessToken` 已经会惰性迁移，
// 但只在有人真的调 Admin API 时才触发。Shopify 数的是**它那边还剩几个**
// 永不过期令牌，不是我们调没调过——所以要主动跑一遍。
// Shopify 的迁移指南也是这么建议的（"use a background job to migrate your
// existing shops"）。
//
// ⚠ 每店一次、不可逆：`migrateToExpiringToken` 一旦成功，Shopify 立刻作废旧令牌。
//   新令牌没落库就等于把该店的 Admin API 访问弄丢了（商家须重装应用）。
//   故：先写库，再报成功；任一步失败都把店铺域名打出来，便于人工兜底。
//
// 用法（在服务器上，apps/api 目录里跑——那里有 .env、node_modules 和构建产物）：
//   node scripts/migrate-shop-tokens.mjs --dry-run   # 只看会动哪些店，不发请求
//   node scripts/migrate-shop-tokens.mjs             # 真迁移
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const API_DIR = process.env.DRSELL_API_DIR || '/opt/drsell-run/apps/api';
const DRY = process.argv.includes('--dry-run');
const require = createRequire(path.join(API_DIR, 'package.json'));

// .env 不入库（AGENTS.md 陷阱 6），运行时从服务器上读
for (const line of readFileSync(path.join(API_DIR, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}

const { PrismaClient } = require('@prisma/client');
const { shopifyApi, ApiVersion } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
// 复用应用自己的加解密，别在这里重写一份 AES（ADR-8）
const { encryptShopAccessToken, decryptShopAccessToken } = require(
  path.join(API_DIR, 'dist/crypto/shop-token-cipher.js'),
);

const prisma = new PrismaClient();
const auth = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || '',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
  scopes: [],
  hostName: (process.env.SHOPIFY_APP_URL || 'https://drsell.szchada.top').replace(
    /^https?:\/\//,
    '',
  ),
  apiVersion: ApiVersion.July26,
  isEmbeddedApp: true,
}).auth;

// 「还没迁移」的判据与 ShopAccessTokenService.isLegacyNonExpiring 一致：
// 有 token、但没有到期时间。已卸载的店不迁——它的令牌 Shopify 侧本就作废了。
const shops = await prisma.shop.findMany({
  where: {
    accessToken: { not: null },
    accessTokenExpiresAt: null,
    uninstalledAt: null,
  },
  select: { id: true, shopDomain: true, accessToken: true },
});

console.log(`待迁移店铺：${shops.length} 个${DRY ? '（dry-run，不发任何请求）' : ''}`);
for (const s of shops) console.log(`  - ${s.shopDomain}`);
if (DRY || shops.length === 0) {
  await prisma.$disconnect();
  process.exit(0);
}

let ok = 0;
let failed = 0;
for (const shop of shops) {
  const plain = decryptShopAccessToken(shop.accessToken);
  if (!plain) {
    console.error(`  ✗ ${shop.shopDomain}: 令牌解密失败（SHOP_ACCESS_TOKEN_KEY 不对？），跳过`);
    failed += 1;
    continue;
  }
  try {
    const { session } = await auth.migrateToExpiringToken({
      shop: shop.shopDomain,
      nonExpiringOfflineAccessToken: plain,
    });
    if (!session.accessToken) throw new Error('migrateToExpiringToken 没有返回 accessToken');

    // 旧令牌此刻已被 Shopify 作废——这一步必须成功，否则该店失去 Admin API 访问。
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        accessToken: encryptShopAccessToken(session.accessToken),
        refreshToken: session.refreshToken
          ? encryptShopAccessToken(session.refreshToken)
          : null,
        accessTokenExpiresAt: session.expires ?? null,
        refreshTokenExpiresAt: session.refreshTokenExpires ?? null,
      },
    });
    console.log(
      `  ✓ ${shop.shopDomain} 已迁移，到期 ${session.expires?.toISOString?.() ?? session.expires}`,
    );
    ok += 1;
  } catch (e) {
    // 打全信息：若失败发生在 Shopify 已作废旧令牌之后，只能靠商家重装恢复。
    console.error(`  ✗ ${shop.shopDomain}: ${e?.message ?? e}`);
    failed += 1;
  }
}

console.log(`\n完成：${ok} 成功 / ${failed} 失败`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
