import { BadRequestException } from '@nestjs/common';
import { SubscriptionMirrorService } from './subscription-mirror.service';

describe('SubscriptionMirrorService', () => {
  const update = jest.fn();
  const findUnique = jest.fn();
  const prisma = { subscription: { findUnique, update } } as never;
  const svc: SubscriptionMirrorService = new SubscriptionMirrorService(prisma);

  beforeEach(() => {
    update.mockReset();
    findUnique.mockReset();
  });

  it('镜像写入的 status 只能是六个取值之一', () => {
    expect(() => svc.assertStatus('SUSPENDED')).toThrow(BadRequestException);
    svc.assertStatus('ACTIVE');
  });

  it('从终态不允许再迁出', async () => {
    findUnique.mockResolvedValue({ id: 's1', status: 'CANCELLED' });
    await expect(svc.mirrorWrite('s1', 'ACTIVE')).rejects.toThrow(BadRequestException);
  });

  it('ACTIVE → FROZEN 记录转冻结时刻，解冻截止 = 转冻结 + 30 天', async () => {
    findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE' });
    update.mockImplementation(async ({ data }) => ({ id: 's1', ...data }));
    const result = await svc.mirrorWrite('s1', 'FROZEN');
    expect(result.frozenAt).toBeInstanceOf(Date);
    expect(result.unfreezeBy).toBeInstanceOf(Date);
    const diff = result.unfreezeBy!.getTime() - result.frozenAt!.getTime();
    expect(Math.round(diff / 86400000)).toBe(30);
  });

  it('FROZEN → ACTIVE 清空解冻截止', async () => {
    findUnique.mockResolvedValue({
      id: 's1',
      status: 'FROZEN',
      frozenAt: new Date(),
      unfreezeBy: new Date(),
    });
    update.mockImplementation(async ({ data }) => ({ id: 's1', status: 'ACTIVE', ...data }));
    const result = await svc.mirrorWrite('s1', 'ACTIVE');
    expect(result.frozenAt).toBeNull();
    expect(result.unfreezeBy).toBeNull();
  });
});
