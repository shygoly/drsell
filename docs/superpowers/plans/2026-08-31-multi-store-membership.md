# 多店归属（Membership）实施计划

> **For agentic workers:** REQUIRED: 用 superpowers:subagent-driven-development（有 subagent 时）或 superpowers:executing-plans 执行。步骤用 `- [x]` 勾选跟踪。

**Goal:** 让一个 drsell 账号能安装、切换、并按店计费地管理多家 Shopify 店铺。

**Architecture:** 引入 `Membership(userId, shopId, role)` 作为「谁能操作哪家店」的唯一事实源。安装归属通过 OAuth `state` 携带已登录用户 id 建立；会话仍是每次只圈定一家店的 shop JWT，切店 = 用用户 token 换发另一家店的 shop token；计费沿用 Shopify Billing 的 per-shop 模型，组内指定一家 billing shop 收全额、其余建 $0 charge。

**Tech Stack:** NestJS 11 + Prisma 6（apps/api）、Next.js App Router（apps/storefront 商家端、apps/web OAuth/webhook 端）、PostgreSQL、Shopify Billing GraphQL API。

**前置：** 步骤 1、2（接口鉴权 + 会话守卫）已完成，见 `apps/api/src/common/shop-scope.ts`。本计划的每个 Task 都依赖 `resolveScopedShopDomain` 已存在。

---

## Chunk 0：测试地基

apps/api 目前 0 个测试、jest 未接 TypeScript（`test: jest --passWithNoTests`），TDD 无从谈起。先补上。

### Task 0: 接通 ts-jest

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/jest.config.js`
- Create: `apps/api/src/common/shop-scope.spec.ts`

- [x] **Step 1: 装依赖**

```bash
pnpm --filter @drsell/api add -D ts-jest @types/jest
```

- [x] **Step 2: 写 jest 配置**

```js
// apps/api/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
};
```

- [x] **Step 3: 给已完成的 shop-scope 补回归测试**

把本次会话里手工验证过的 9 条断言固化下来（shop token 越权、admin 无店铺授权、superadmin 例外、tenant 同理）：

```ts
// apps/api/src/common/shop-scope.spec.ts
import { ForbiddenException } from '@nestjs/common';
import { resolveScopedShopDomain, resolveScopedTenantId } from './shop-scope';
import type { JwtPayload } from '../auth/auth.service';

const shopTok: JwtPayload = { typ: 'shop', shop: 'a.myshopify.com', tenantId: 't1', sub: 's1' };
const adminTok: JwtPayload = { typ: 'admin', role: 'admin', sub: 'u1' };
const superTok: JwtPayload = { typ: 'admin', role: 'superadmin', sub: 'u0' };

describe('resolveScopedShopDomain', () => {
  it('shop 会话无参数时返回绑定店铺', () => {
    expect(resolveScopedShopDomain(shopTok)).toBe('a.myshopify.com');
  });
  it('大小写/协议差异归一化后视为同一家店', () => {
    expect(resolveScopedShopDomain(shopTok, 'https://A.myshopify.com/')).toBe('a.myshopify.com');
  });
  it('shop 会话请求他店被拒', () => {
    expect(() => resolveScopedShopDomain(shopTok, 'victim.myshopify.com')).toThrow(ForbiddenException);
  });
  it('自助注册的 admin 拿不到任何店铺', () => {
    expect(() => resolveScopedShopDomain(adminTok, 'victim.myshopify.com')).toThrow(ForbiddenException);
  });
  it('无 token 被拒', () => {
    expect(() => resolveScopedShopDomain(undefined, 'victim.myshopify.com')).toThrow(ForbiddenException);
  });
  it('superadmin 可显式指定店铺', () => {
    expect(resolveScopedShopDomain(superTok, 'victim.myshopify.com')).toBe('victim.myshopify.com');
  });
});

describe('resolveScopedTenantId', () => {
  it('只认 token 里的租户', () => {
    expect(resolveScopedTenantId(shopTok)).toBe('t1');
    expect(() => resolveScopedTenantId(shopTok, 't2')).toThrow(ForbiddenException);
  });
  it('admin 无租户绑定时被拒', () => {
    expect(() => resolveScopedTenantId(adminTok, 't1')).toThrow(ForbiddenException);
  });
});
```

- [x] **Step 4: 跑测试**

Run: `pnpm --filter @drsell/api test`
Expected: 8 passed。

- [x] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/jest.config.js apps/api/src/common/shop-scope.spec.ts pnpm-lock.yaml
git commit -m "test(api): wire ts-jest and lock shop-scope guarantees"
```

---

## Chunk 1：Membership 数据模型

### Task 1: 建表并回填

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260901090000_membership/migration.sql`

- [x] **Step 1: 加模型**

在 `schema.prisma` 的 `AdminUser` 后追加，并给 `AdminUser` / `Shop` 加反向关系字段：

```prisma
/// 账号 ↔ 店铺归属。唯一决定「谁能操作哪家店」。
model Membership {
  id        String   @id @default(cuid())
  userId    String
  user      AdminUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  shopId    String
  shop      Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)
  /// owner = 安装者；member = 被邀请的坐席
  role      String   @default("owner")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, shopId])
  @@index([shopId])
}
```

`AdminUser` 加 `memberships Membership[]`，`Shop` 加 `memberships Membership[]`。

- [x] **Step 2: 写迁移**

```sql
-- apps/api/prisma/migrations/20260901090000_membership/migration.sql
CREATE TABLE "Membership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'owner',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Membership_userId_shopId_key" ON "Membership"("userId", "shopId");
CREATE INDEX "Membership_shopId_idx" ON "Membership"("shopId");
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [x] **Step 3: 应用并生成 client**

```bash
pnpm --filter @drsell/api exec prisma migrate deploy && pnpm --filter @drsell/api exec prisma generate
```
Expected: `Membership` 建表成功，`prisma generate` 无报错。

- [x] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add Membership table linking accounts to shops"
```

### Task 2: MembershipService + 把 shop-scope 接上

**Files:**
- Create: `apps/api/src/membership/membership.service.ts`
- Create: `apps/api/src/membership/membership.module.ts`
- Create: `apps/api/src/membership/membership.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [x] **Step 1: 写失败测试**

```ts
// membership.service.spec.ts —— 用 prisma mock，不连库
describe('MembershipService', () => {
  it('grant 幂等：重复安装不产生第二条记录', async () => { /* upsert 被调用，create 未被调用 */ });
  it('listShops 只返回该用户有 membership 的店铺', async () => { /* ... */ });
  it('assertMember 对非成员抛 ForbiddenException', async () => { /* ... */ });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @drsell/api test -- membership`
Expected: FAIL（模块不存在）。

- [x] **Step 3: 实现**

```ts
@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /** 安装/邀请时建立归属，幂等 */
  grant(userId: string, shopId: string, role = 'owner') {
    return this.prisma.membership.upsert({
      where: { userId_shopId: { userId, shopId } },
      create: { userId, shopId, role },
      update: { role },
    });
  }

  listShops(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId },
      include: { shop: { select: { id: true, shopDomain: true, tenantId: true, uninstalledAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 校验用户对某店有权限，返回 shop 记录；否则 403 */
  async assertMember(userId: string, shopDomain: string) {
    const m = await this.prisma.membership.findFirst({
      where: { userId, shop: { shopDomain: normalizeShopDomain(shopDomain) } },
      include: { shop: true },
    });
    if (!m) throw new ForbiddenException('shop not in your account');
    return m.shop;
  }
}
```

- [x] **Step 4: 跑测试**

Run: `pnpm --filter @drsell/api test -- membership`
Expected: PASS。

- [x] **Step 5: Commit**

```bash
git add apps/api/src/membership apps/api/src/app.module.ts
git commit -m "feat(api): MembershipService as the single source of shop access"
```

---

## Chunk 2：安装归属（OAuth state 携带用户）

当前 `apps/web/app/api/auth/route.ts:18` 的 `state` 是裸 `crypto.randomUUID()`，回调时无从知道是谁装的；`ensureShopTenant` 因此每家店新建一个 Tenant。这一 Chunk 把两者接上。

### Task 3: 签名 state 承载 userId

**Files:**
- Create: `apps/web/lib/oauth-state.ts`
- Modify: `apps/web/app/api/auth/route.ts:18`
- Modify: `apps/web/app/api/auth/callback/route.ts`
- Create: `apps/web/lib/oauth-state.spec.ts`

- [x] **Step 1: 写失败测试**

```ts
it('签名 state 能取回 userId', () => {
  const s = signState({ userId: 'u1' });
  expect(parseState(s)).toEqual(expect.objectContaining({ userId: 'u1' }));
});
it('被篡改的 state 解析失败', () => {
  expect(() => parseState(signState({ userId: 'u1' }).replace('u1', 'u2'))).toThrow();
});
it('过期 state 解析失败', () => { /* 10 分钟窗口 */ });
```

- [x] **Step 2: 实现**

用 `SHOPIFY_API_SECRET` 做 HMAC，payload = `{ userId?, nonce, iat }`，base64url 编码，窗口 10 分钟。**不要**把 userId 明文塞进 state。

- [x] **Step 3: 发起端带上用户**

`/api/auth` 从请求里读用户 token（已登录时由 storefront 以 `?u=<userToken>` 或 Authorization 传入），验签后取 `sub` 放进 state。未登录安装（商家直接从 App Store 装）时 state 不带 userId — 这条路径在 Task 4 处理。

- [x] **Step 4: 回调端落归属**

`callback/route.ts` 在换发 shop JWT 后，若 state 携带 userId，调 `POST /api/membership/grant`（内部密钥）建立 Membership。

- [x] **Step 5: 跑测试 + 手测**

```bash
pnpm --filter @drsell/web test
```
手测：已登录状态下从平台端点「Connect store」→ 装完回来，DB 里应有一条 Membership。

- [x] **Step 6: Commit**

```bash
git add apps/web/lib/oauth-state.ts apps/web/lib/oauth-state.spec.ts apps/web/app/api/auth
git commit -m "feat(web): bind OAuth install to the initiating account via signed state"
```

### Task 4: 认领未归属的安装

**Files:**
- Modify: `apps/api/src/membership/membership.service.ts`
- Create: `apps/api/src/membership/membership.controller.ts`
- Modify: `apps/api/src/tenant/tenant.service.ts:14-46`

从 Shopify App Store 直接安装时没有 userId。处理方式：安装照常完成，店铺处于「未认领」状态；商家在嵌入端点「Link to my drsell account」→ 用当前 shop JWT + 用户 token 双证明建立 Membership。

- [x] **Step 1: 写失败测试**

```ts
it('claim 要求同时持有该店的 shop token 和用户 token', async () => { /* ... */ });
it('已被他人认领的店铺不能再次 claim', async () => { /* ... */ });
```

- [x] **Step 2: 实现 `POST /api/membership/claim`**

入参：Authorization 里的用户 token（`typ:'admin'`）+ body 里的 shop token（`typ:'shop'`）。两边都验签通过，且该 shop 尚无 owner，才 grant。

- [x] **Step 3: `ensureShopTenant` 停止无脑建租户**

改为：若调用方传入 `tenantId`（来自发起用户已有的租户）则复用，否则才新建。这样同一账号装第二家店时不再产生孤立租户。

- [x] **Step 4: 跑测试 + Commit**

```bash
pnpm --filter @drsell/api test
git add apps/api/src/membership apps/api/src/tenant
git commit -m "feat(api): let merchants claim an unowned install from the embedded app"
```

### Task 5: shop-scope 改走 Membership

**Files:**
- Modify: `apps/api/src/common/shop-scope.ts`
- Modify: `apps/api/src/common/shop-scope.spec.ts`

- [x] **Step 1: 补测试**

```ts
it('admin 会话 + 有 membership 的店铺 → 放行', async () => { /* ... */ });
it('admin 会话 + 无 membership 的店铺 → 403', async () => { /* ... */ });
```

- [x] **Step 2: 实现**

`typ:'admin'` 分支从「只有 superadmin 放行」改为「查 Membership」。因为要查库，把纯函数拆成 `ShopScopeService`（注入 MembershipService），控制器改注入调用。`typ:'shop'` 分支不动 —— 它是嵌入端的快路径，无需查库。

- [x] **Step 3: 跑全量测试 + Commit**

```bash
pnpm --filter @drsell/api test && pnpm --filter @drsell/api build
git add apps/api/src/common
git commit -m "feat(api): resolve admin-session shop scope through Membership"
```

---

## Chunk 3：切店

### Task 6: 换发接口 + 店铺列表

**Files:**
- Modify: `apps/api/src/membership/membership.controller.ts`
- Modify: `apps/api/src/auth/auth.service.ts`（复用 `signShopSession`）

- [x] **Step 1: 写失败测试**

```ts
it('GET /api/membership/shops 返回当前用户的店铺列表', async () => { /* ... */ });
it('POST /api/membership/switch 对非成员店铺返回 403', async () => { /* ... */ });
it('POST /api/membership/switch 返回目标店铺的 shop JWT', async () => { /* ... */ });
```

- [x] **Step 2: 实现**

```ts
@Auth()
@Get('shops')
shops(@CurrentUser() user: JwtPayload) {
  return this.membership.listShops(user.sub);
}

@Auth()
@Post('switch')
async switch(@CurrentUser() user: JwtPayload, @Body() body: { shopDomain: string }) {
  const shop = await this.membership.assertMember(user.sub, body.shopDomain);
  return this.auth.signShopSession({ shop: shop.shopDomain, tenantId: shop.tenantId, shopRecordId: shop.id });
}
```

- [x] **Step 3: 跑测试 + Commit**

```bash
pnpm --filter @drsell/api test
git add apps/api/src/membership
git commit -m "feat(api): shop list and session switch endpoints"
```

### Task 7: 顶栏 store switcher

**Files:**
- Create: `apps/storefront/src/components/business/store-switcher.tsx`
- Modify: `apps/storefront/src/hooks/useShopSession.ts`
- Modify: `apps/storefront/src/components/layout/app-shell.tsx:82`（右侧操作区）

- [x] **Step 1: useShopSession 加 `switchShop`**

调 `/membership/switch`，成功后写入 `drsell_shop` / `drsell_shop_token` 并 `setShop` / `setToken`。**嵌入态（bridge 存在）不渲染切换器** —— Shopify Admin 的 iframe 已经锚定了当前店，在里面切店会和 App Bridge 的 host 冲突。

- [x] **Step 2: 组件**

下拉列出 `listShops` 结果，当前店打勾，底部「+ Connect another store」→ `startOAuth`。已卸载（`uninstalledAt` 非空）的店标灰不可选。

- [x] **Step 3: 挂进 AppShell，只在 `!bridge && userToken` 时渲染**

- [x] **Step 4: 验证**

```bash
pnpm --filter @drsell/storefront build
```
手测：两家店的账号能来回切，切完 Overview 数字随之变化；切到非成员店铺（改本地请求）应 403。

- [x] **Step 5: Commit**

```bash
git add apps/storefront/src
git commit -m "feat(storefront): store switcher for multi-shop accounts"
```

---

## Chunk 4：多店计费

Shopify Billing 没有跨店合并账单，只能「组内指定一家店收全额、其余 $0」。

### Task 8: billing shop 标记

**Files:**
- Modify: `apps/api/prisma/schema.prisma`（`Subscription`）
- Create: `apps/api/prisma/migrations/20260901120000_billing_shop/migration.sql`

- [x] **Step 1: 加字段**

```prisma
model Subscription {
  // ...
  /// 组内唯一收全额的店；其余店建 $0 charge
  isBillingShop  Boolean @default(false)
  shopifyChargeId String?
  seats          Int     @default(1)
}
```

- [x] **Step 2: 迁移 + generate + Commit**

```sql
ALTER TABLE "Subscription" ADD COLUMN "isBillingShop" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "shopifyChargeId" TEXT,
ADD COLUMN "seats" INTEGER NOT NULL DEFAULT 1;
```

### Task 9: BillingService

**Files:**
- Create: `apps/api/src/subscription/billing.service.ts`
- Create: `apps/api/src/subscription/billing.service.spec.ts`

- [x] **Step 1: 写失败测试**

```ts
it('账号内第一家店 → 建全额 charge 并标记 isBillingShop', async () => { /* ... */ });
it('第二家店 → 建 $0 charge，不重复收费', async () => { /* ... */ });
it('billing shop 卸载 → 自动把计费转移到组内下一家店', async () => { /* ... */ });
it('改指定 billing shop → 先取消旧 charge 再建新的', async () => { /* ... */ });
```

- [x] **Step 2: 实现**

用 `appSubscriptionCreate` GraphQL mutation；`$0` 用 `test: false` + `amount: 0` 的 plan。取消用 `appSubscriptionCancel`。**转移失败必须留痕**（写 `KnowledgeSyncJob` 同款的 job 表或日志表），不要静默吞掉 —— 商家会变成「全组免费」。

- [x] **Step 3: 卸载 webhook 接上**

`apps/api/src/shopify/shopify.service.ts` 的 `handleUninstall` 里，若卸载的是 billing shop，调 `BillingService.reassign(tenantId)`。

- [x] **Step 4: 跑测试 + Commit**

```bash
pnpm --filter @drsell/api test
git add apps/api/src/subscription apps/api/src/shopify
git commit -m "feat(api): multi-store billing with a designated billing shop"
```

### Task 10: 计费 UI（仅嵌入端）

**Files:**
- Modify: `apps/storefront/src/app/settings/page.tsx`

Shopify 要求套餐确认必须在 Admin 内完成，所以**平台端只读展示**，「Change plan」按钮在平台端跳回 Admin 深链，不在平台端发起 charge。

- [x] **Step 1: 嵌入端渲染当前套餐 + 组内计费店，「Change plan」走 Shopify 确认页**
- [x] **Step 2: 平台端只读列出各店计费状态 + 「指定为计费店」操作**
- [x] **Step 3: `pnpm --filter @drsell/storefront build` + Commit**

---

## 收尾检查

- [x] `pnpm --filter @drsell/api test` 全绿
- [x] 三个 app `build` 全过
- [x] 手测四条路径：①已登录装第二家店 ②App Store 直装后认领 ③切店 ④卸载计费店后计费转移
- [x] `/auth/admin/register` 是否仍要公开开放 —— 现在自助注册账号拿不到任何店铺，但公开注册端点仍应加频率限制或邀请制
- [x] 更新 `docs/MVP_SCOPE.md`：多店已从「不做」移入范围
