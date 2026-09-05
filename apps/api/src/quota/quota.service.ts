import { Injectable, Logger } from '@nestjs/common';
import { AiQuotaUsage, PlanCode, planOf } from '@drsell/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Shopify 的应用订阅按 30 天计费，配额跟着扣费周期走而不是自然月。 */
const PERIOD_DAYS = 30;

export class QuotaExceededError extends Error {
  constructor(readonly usage: AiQuotaUsage) {
    super('AI answer quota exhausted for this billing period');
    this.name = 'QuotaExceededError';
  }
}

/**
 * AI 回答配额。
 *
 * 计数单位是「一次成功的 AI 回答」——模型真的产出了内容才计。请求失败、
 * 被本服务拦下、商家在 Inbox 里人工回复，都不计入：商家不该为没得到的答案付费。
 *
 * 判断放在调模型之前，所以超额时不会产生任何上游成本。
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 本店当前计费周期的起点。
   *
   * 优先用订阅的 currentPeriodEnd 倒推，这样配额在扣费当天重置。没有订阅记录
   * （试用、刚安装、ops 手工建的店）时回落到自然月，避免整条链路因缺订阅而失效。
   */
  async periodStart(shopId: string | null): Promise<Date> {
    if (shopId) {
      const sub = await this.prisma.subscription.findFirst({
        where: { shopId, currentPeriodEnd: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { currentPeriodEnd: true },
      });
      if (sub?.currentPeriodEnd) {
        // currentPeriodEnd 可能已经过期：Shopify 续期了而本地镜像滞后，或是一条
        // 陈旧的历史订阅（生产上就有一条 currentPeriodEnd 停在一年前的）。
        // 直接倒推会把配额永远钉死在那个陈旧周期里——用量再也不重置，
        // 商家用满一次就永久被拦。按整周期推进到包含「现在」的那一期，
        // 既修掉这点，又保住「按扣费日重置」的对齐。
        const periodMs = PERIOD_DAYS * 24 * 60 * 60 * 1000;
        const anchor = new Date(sub.currentPeriodEnd).getTime();
        const now = Date.now();
        const skipped = anchor > now ? 0 : Math.floor((now - anchor) / periodMs) + 1;
        const start = new Date(anchor + skipped * periodMs - periodMs);
        start.setUTCHours(0, 0, 0, 0);
        return start;
      }
    }

    const fallback = new Date();
    fallback.setUTCDate(1);
    fallback.setUTCHours(0, 0, 0, 0);
    return fallback;
  }

  private async planCodeFor(shopId: string | null): Promise<PlanCode> {
    if (!shopId) return planOf(null).code;
    const sub = await this.prisma.subscription.findFirst({
      where: { shopId },
      orderBy: { updatedAt: 'desc' },
      select: { planCode: true },
    });
    return planOf(sub?.planCode).code;
  }

  /** 域名 → shopId。店铺不存在时返回 null，配额按 DEFAULT_PLAN 的自然月处理。 */
  private async shopIdOf(shopDomain: string): Promise<string | null> {
    const shop = await this.prisma.shop.findFirst({
      where: { shopDomain },
      select: { id: true },
    });
    return shop?.id ?? null;
  }

  /** 当前用量快照，供商家端展示与超额判断共用。 */
  async usage(shopDomain: string): Promise<AiQuotaUsage> {
    const shopId = await this.shopIdOf(shopDomain);
    const [start, code] = await Promise.all([
      this.periodStart(shopId),
      this.planCodeFor(shopId),
    ]);
    const plan = planOf(code);

    const row = shopId
      ? await this.prisma.aiUsage.findUnique({
          where: { shopId_periodStart: { shopId, periodStart: start } },
          select: { answers: true },
        })
      : null;
    const used = row?.answers ?? 0;

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + PERIOD_DAYS);

    return {
      planCode: plan.code,
      planName: plan.name,
      used,
      limit: plan.answersPerPeriod,
      remaining: Math.max(plan.answersPerPeriod - used, 0),
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      exhausted: used >= plan.answersPerPeriod,
    };
  }

  /**
   * 配额闸门：额度用尽就抛 QuotaExceededError，调用方据此给顾客一句诚实的提示。
   * 必须在调用模型**之前**执行——超额时不该产生任何上游请求。
   */
  async assertWithinQuota(shopDomain: string): Promise<AiQuotaUsage> {
    const usage = await this.usage(shopDomain);
    if (usage.exhausted) {
      this.logger.warn(
        `quota exhausted shop=${shopDomain} plan=${usage.planCode} used=${usage.used}/${usage.limit}`,
      );
      throw new QuotaExceededError(usage);
    }
    return usage;
  }

  /** 成功产出一次回答后计数。计数失败不应影响已经给到顾客的回答，故只记日志。 */
  async recordAnswer(shopDomain: string): Promise<void> {
    const shopId = await this.shopIdOf(shopDomain);
    if (!shopId) {
      this.logger.warn(`cannot record AI answer: no Shop row for ${shopDomain}`);
      return;
    }
    const start = await this.periodStart(shopId);
    try {
      await this.prisma.aiUsage.upsert({
        where: { shopId_periodStart: { shopId, periodStart: start } },
        create: { shopId, periodStart: start, answers: 1 },
        update: { answers: { increment: 1 } },
      });
    } catch (e) {
      this.logger.error(`failed to record AI answer for ${shopDomain}: ${String(e)}`);
    }
  }
}
