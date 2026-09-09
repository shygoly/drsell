import { Injectable, Logger } from '@nestjs/common';
import { AiQuotaUsage, PlanCode, planOf } from '@drsell/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  evaluateServiceability,
  isInTrial,
  type Serviceability,
} from '../subscription/subscription-state';

/** Shopify 的应用订阅按 30 天计费，配额跟着扣费周期走而不是自然月。 */
const PERIOD_DAYS = 30;

/** 订阅不可服务。与「额度用尽」区分开——两者的处置动作不同。 */
export class SubscriptionInactiveError extends Error {
  constructor(readonly verdict: Serviceability) {
    super(`subscription is not serviceable: ${verdict.reason}`);
    this.name = 'SubscriptionInactiveError';
  }
}

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
   * 拿到本店订阅的最新一条（含状态、试用与周期），供周期计算与闸门共用。
   * 只取一条：多条时以最近更新的为准，Shopify 侧同一 app 同一店只有一份有效订阅。
   */
  async latestSubscription(shopId: string | null) {
    if (!shopId) return null;
    return this.prisma.subscription.findFirst({
      where: { shopId },
      orderBy: { updatedAt: 'desc' },
      select: {
        status: true,
        planCode: true,
        trialEnds: true,
        currentPeriodEnd: true,
      },
    });
  }

  /**
   * 本店当前计费周期的起点。
   *
   * 两条规则：
   * - **试用期不计入周期**：试用期内周期尚未开始，锚点是 trialEnds 而非安装日
   *   或自然月，避免试用跨自然月时白白重置一次额度。
   * - **失效订阅不再自动续期**：原实现会把周期「推进到包含现在的那一期」，
   *   那是为修「陈旧 currentPeriodEnd 把额度永久钉死」而加的，副作用是让过期
   *   订阅每 30 天自动获得一次免费额度（生产上 chatbotdomaintest 就这样白用了
   *   一年）。现在只对**可服务**的订阅推进；失效订阅由闸门拦下，压根不需要
   *   算周期。
   */
  async periodStart(shopId: string | null, now = new Date()): Promise<Date> {
    const sub = await this.latestSubscription(shopId);

    if (sub) {
      // 试用期内：周期从试用结束才开始，此刻用 trialEnds 当锚点，
      // 试用多长都只算作「周期尚未开始」的同一段。
      if (isInTrial(sub, now)) {
        const start = new Date(sub.trialEnds as Date);
        start.setUTCHours(0, 0, 0, 0);
        return start;
      }

      if (sub.currentPeriodEnd) {
        const periodMs = PERIOD_DAYS * 24 * 60 * 60 * 1000;
        const anchor = new Date(sub.currentPeriodEnd).getTime();
        const serviceable = evaluateServiceability(sub, now).serviceable;
        // 只有可服务的订阅才推进周期。不可服务的保持在原周期上——
        // 它不该靠「时间流逝」拿到新额度。
        const skipped =
          anchor > now.getTime() || !serviceable
            ? 0
            : Math.floor((now.getTime() - anchor) / periodMs) + 1;
        const start = new Date(anchor + skipped * periodMs - periodMs);
        start.setUTCHours(0, 0, 0, 0);
        return start;
      }
    }

    const fallback = new Date(now);
    fallback.setUTCDate(1);
    fallback.setUTCHours(0, 0, 0, 0);
    return fallback;
  }

  /**
   * 档位只取自**可服务**的订阅。
   *
   * 原实现不带任何状态条件，取不到就回落默认档——等于拿一条 CANCELLED 订阅的
   * 档位当额度依据，或者给完全没有订阅的店免费额度。
   * 试用期按 basic 档给（产品决定，2026-09-09）。
   */
  private async planCodeFor(shopId: string | null, now = new Date()): Promise<PlanCode> {
    const sub = await this.latestSubscription(shopId);
    if (!sub) return planOf(null).code;
    if (!evaluateServiceability(sub, now).serviceable) return planOf(null).code;
    return planOf(sub.planCode).code;
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
  /**
   * 订阅状态闸门。
   *
   * **默认只观测不拦截**（`SUBSCRIPTION_GATE_ENFORCE` 未开启时）。
   * 理由见 openspec design 的 D6：本地订阅镜像刚从一年多的滞后中恢复
   * （app_subscriptions/update 此前因密钥错误全线 401），直接开闸会误停
   * 可能只是没同步的真实付费商家。误停一个付费商家的代价，远大于多让失效
   * 商家白用几天。先跑观测、确认无误判，再把开关打开。
   */
  async assertSubscriptionServiceable(shopDomain: string, now = new Date()) {
    const shopId = await this.shopIdOf(shopDomain);
    const sub = await this.latestSubscription(shopId);
    const verdict = evaluateServiceability(sub, now);
    if (verdict.serviceable) return verdict;

    const enforcing = process.env.SUBSCRIPTION_GATE_ENFORCE === 'true';
    this.logger.warn(
      `subscription gate ${enforcing ? 'BLOCK' : 'OBSERVE'} shop=${shopDomain} ` +
        `reason=${verdict.reason} status=${sub?.status ?? '-'} ` +
        `periodEnd=${sub?.currentPeriodEnd?.toISOString() ?? '-'} ` +
        `trialEnds=${sub?.trialEnds?.toISOString() ?? '-'}`,
    );
    if (enforcing) throw new SubscriptionInactiveError(verdict);
    return verdict;
  }

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
