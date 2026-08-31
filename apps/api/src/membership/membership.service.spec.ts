import { ForbiddenException } from '@nestjs/common';
import { MembershipService } from './membership.service';

function mockPrisma() {
  const upsert = jest.fn();
  const findMany = jest.fn();
  const findFirst = jest.fn();
  return {
    prisma: {
      membership: { upsert, findMany, findFirst },
    } as never,
    upsert,
    findMany,
    findFirst,
  };
}

describe('MembershipService', () => {
  it('grant 幂等：重复安装不产生第二条记录', async () => {
    const { prisma, upsert } = mockPrisma();
    upsert.mockResolvedValue({ id: 'm1' });
    const svc = new MembershipService(prisma);

    await svc.grant('u1', 's1');
    await svc.grant('u1', 's1');

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0].create).toEqual({
      userId: 'u1',
      shopId: 's1',
      role: 'owner',
    });
    expect(upsert.mock.calls[0][0].where).toEqual({
      userId_shopId: { userId: 'u1', shopId: 's1' },
    });
  });

  it('listShops 只返回该用户有 membership 的店铺', async () => {
    const { prisma, findMany } = mockPrisma();
    findMany.mockResolvedValue([
      { shop: { shopDomain: 'a.myshopify.com' } },
      { shop: { shopDomain: 'b.myshopify.com' } },
    ]);
    const svc = new MembershipService(prisma);

    const rows = await svc.listShops('u1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(rows).toHaveLength(2);
  });

  it('assertMember 对非成员抛 ForbiddenException', async () => {
    const { prisma, findFirst } = mockPrisma();
    findFirst.mockResolvedValue(null);
    const svc = new MembershipService(prisma);

    await expect(svc.assertMember('u1', 'victim.myshopify.com')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
