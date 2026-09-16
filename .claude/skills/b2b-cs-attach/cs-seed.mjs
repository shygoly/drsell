#!/usr/bin/env node
// b2b-cs-attach 测试桥 seeder：把 clients/<slug>/catalog.json 写进 drsell 生产库，
// 让 AI 客服能答该客户产品。建 Tenant + Shop(source=medusa) + BotSetting(aiEnabled) + Products。
// 幂等、隔离(独立 tenant，满足 S9)、可回滚(--purge 按 shopDomain 删干净)。
//
// ⚠ 这是**测试桥**：生产的正道是每客户独立 Medusa 实例 + ingest 管线（把 ingest 改多店，
//   见 SKILL.md）。测试期直接 seed 避免碰 live 商户 API 代码/重启。
// ⚠ 在服务器上跑（需 drsell 的 @prisma/client 与 DATABASE_URL）：
//   cd /opt/drsell-run/apps/api && \
//   DATABASE_URL="$(grep ^DATABASE_URL .env|cut -d= -f2-)" \
//   node /tmp/cs-seed.mjs --catalog /tmp/<slug>-catalog.json --shop <shopDomain>
//   回滚：... node /tmp/cs-seed.mjs --shop <shopDomain> --purge

import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/opt/drsell-run/apps/api/');
const { PrismaClient } = require('@prisma/client');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !String(arr[i + 1]).startsWith('--') ? arr[i + 1] : true]] : a), []));
const shopDomain = String(args.shop || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
if (!shopDomain) { console.error('需 --shop <shopDomain>'); process.exit(2); }
const prisma = new PrismaClient();

async function purge() {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) { console.log(`无 ${shopDomain}，无需清理`); return; }
  await prisma.product.deleteMany({ where: { shopId: shop.id } });
  await prisma.botSetting.deleteMany({ where: { shopId: shop.id } });
  await prisma.shop.delete({ where: { id: shop.id } });
  await prisma.tenant.deleteMany({ where: { id: shop.tenantId, shops: { none: {} } } }).catch(() => {});
  console.log(`✓ 已清理 ${shopDomain}（shop/products/botSetting/tenant）`);
}

async function seed() {
  const cat = JSON.parse(fs.readFileSync(String(args.catalog), 'utf8'));
  const catName = Object.fromEntries((cat.categories || []).map((c) => [c.id, c.name]));
  // Tenant + Shop（source=medusa）
  let shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    const tenant = await prisma.tenant.create({ data: { name: shopDomain } });
    shop = await prisma.shop.create({ data: { shopDomain, tenantId: tenant.id, source: 'medusa' } });
  } else if (shop.source !== 'medusa') {
    shop = await prisma.shop.update({ where: { id: shop.id }, data: { source: 'medusa' } });
  }
  // BotSetting（挂件渲染 + AI 开启）
  const shopName = cat.brand?.name || shopDomain;
  const welcomeMessage = `您好，这里是${cat.brand?.name || ''}智能客服，可咨询产品、资质与采购流程。`;
  await prisma.botSetting.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, shopName, aiEnabled: true, aiLanguage: 'zh-Hans', welcomeMessage },
    // update 也刷新展示字段——否则改名/换文案后重跑不生效（幂等要覆盖，不只保活）
    update: { shopName, welcomeMessage, aiEnabled: true, aiLanguage: 'zh-Hans' },
  });
  // Products（规格折进 description，AI 才答得出注册证等）
  const now = new Date();
  for (const p of cat.products || []) {
    const specs = p.metadata?.specs || {};
    const order = p.metadata?.specsOrder || Object.keys(specs);
    const specLine = order.filter((k) => specs[k]).map((k) => `${k}：${specs[k]}`).join('；');
    const desc = `${p.description || ''}${specLine ? `\n规格：${specLine}` : ''}`;
    await prisma.product.upsert({
      where: { tenantId_shopifyProductId: { tenantId: shop.tenantId, shopifyProductId: p.handle } },
      create: { tenantId: shop.tenantId, shopId: shop.id, shopifyProductId: p.handle, name: p.title, description: desc, handle: p.handle, category: catName[p.category] || null, source: 'medusa', status: 'published', sourceUpdatedAt: now },
      update: { name: p.title, description: desc, category: catName[p.category] || null, source: 'medusa', status: 'published', sourceUpdatedAt: now },
    });
  }
  const n = await prisma.product.count({ where: { shopId: shop.id } });
  console.log(`✓ seed 完成：shop=${shopDomain} tenant=${shop.tenantId} source=medusa，products=${n}，botSetting.aiEnabled=true`);
}

try { await (args.purge ? purge() : seed()); } finally { await prisma.$disconnect(); }
