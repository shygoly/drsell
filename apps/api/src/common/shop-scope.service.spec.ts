import { ForbiddenException } from '@nestjs/common';
import { ShopScopeService } from './shop-scope.service';
import type { JwtPayload } from '../auth/auth.service';

const shopTok: JwtPayload = {
  typ: 'shop',
  shop: 'a.myshopify.com',
  tenantId: 't1',
  sub: 's1',
};
const adminTok: JwtPayload = { typ: 'admin', role: 'admin', sub: 'u1' };

function makeService(opts: { membership?: Partial<Record<string, unknown>> }) {
  const assertMember = jest.fn(async () => ({
    id: 's1',
    shopDomain: 'a.myshopify.com',
    tenantId: 't1',
  }));
  const findFirst = jest.fn(
    async (): Promise<{ id: string } | null> => ({ id: 'm1' }),
  );
  const membership = {
    assertMember,
    ...(opts.membership ?? {}),
  } as never;
  const prisma = { membership: { findFirst } } as never;
  return {
    svc: new ShopScopeService(membership, prisma),
    assertMember,
    findFirst,
  };
}

describe('ShopScopeService.resolveShopDomain', () => {
  it('shop 会话快路径：只认绑定店铺', async () => {
    const { svc } = makeService({});
    await expect(svc.resolveShopDomain(shopTok)).resolves.toBe('a.myshopify.com');
    await expect(
      svc.resolveShopDomain(shopTok, 'victim.myshopify.com'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('admin 会话 + 有 membership 的店铺 → 放行', async () => {
    const { svc, assertMember } = makeService({});
    await expect(
      svc.resolveShopDomain(adminTok, 'a.myshopify.com'),
    ).resolves.toBe('a.myshopify.com');
    expect(assertMember).toHaveBeenCalledWith('u1', 'a.myshopify.com');
  });

  it('admin 会话 + 无 membership 的店铺 → 403', async () => {
    const { svc, assertMember } = makeService({});
    assertMember.mockRejectedValue(new ForbiddenException('shop not in your account'));
    await expect(
      svc.resolveShopDomain(adminTok, 'victim.myshopify.com'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('admin 无参数 → 403', async () => {
    const { svc } = makeService({});
    await expect(svc.resolveShopDomain(adminTok)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('ShopScopeService.resolveTenantId', () => {
  it('admin 会话只能访问自己 membership 的租户', async () => {
    const { svc, findFirst } = makeService({});
    await expect(svc.resolveTenantId(adminTok, 't1')).resolves.toBe('t1');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', shop: { tenantId: 't1' } },
      }),
    );

    findFirst.mockResolvedValueOnce(null);
    await expect(svc.resolveTenantId(adminTok, 't2')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
