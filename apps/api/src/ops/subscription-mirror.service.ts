import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const SUBSCRIPTION_STATUSES = [
  'PENDING',
  'ACTIVE',
  'FROZEN',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

const TERMINAL = new Set<SubscriptionStatus>(['DECLINED', 'EXPIRED', 'CANCELLED']);
const UNFREEZE_DAYS = 30;

@Injectable()
export class SubscriptionMirrorService {
  constructor(private readonly prisma: PrismaService) {}

  assertStatus(status: string): asserts status is SubscriptionStatus {
    if (!SUBSCRIPTION_STATUSES.includes(status as SubscriptionStatus)) {
      throw new BadRequestException(`invalid subscription status: ${status}`);
    }
  }

  async mirrorWrite(subscriptionId: string, nextStatus: SubscriptionStatus) {
    this.assertStatus(nextStatus);
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) throw new BadRequestException('subscription not found');

    const current = sub.status.toUpperCase() as SubscriptionStatus;
    if (TERMINAL.has(current) && nextStatus !== current) {
      throw new BadRequestException(`cannot transition from terminal ${current}`);
    }

    const data: {
      status: string;
      frozenAt?: Date | null;
      unfreezeBy?: Date | null;
    } = { status: nextStatus };

    if (nextStatus === 'FROZEN' && current !== 'FROZEN') {
      const frozenAt = new Date();
      data.frozenAt = frozenAt;
      data.unfreezeBy = new Date(frozenAt.getTime() + UNFREEZE_DAYS * 86400000);
    }
    if (nextStatus === 'ACTIVE' && current === 'FROZEN') {
      data.frozenAt = null;
      data.unfreezeBy = null;
    }

    return this.prisma.subscription.update({ where: { id: subscriptionId }, data });
  }

  async extendUnfreeze(subscriptionId: string, extraDays: number) {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) throw new BadRequestException('subscription not found');
    if (sub.status.toUpperCase() !== 'FROZEN') {
      throw new BadRequestException('shop is not frozen');
    }
    const base = sub.unfreezeBy ?? new Date();
    return this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        unfreezeBy: new Date(base.getTime() + extraDays * 86400000),
      },
    });
  }
}
