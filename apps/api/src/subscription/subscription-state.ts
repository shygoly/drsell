/**
 * 订阅是否可服务——纯函数，不碰数据库，好测也好复用。
 *
 * 这条判定此前**根本不存在**：服务链路只看回答次数，从不看订阅状态。
 * 生产上 chatbotdomaintest 的 currentPeriodEnd 停在 2025-08-25，一年多未续，
 * 应用照常服务。
 */

/** Shopify AppSubscriptionStatus 的六个取值（`ADR-13`：只镜像，不自造状态词）。 */
export type SubscriptionStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'FROZEN'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED';

/** 到期后的宽限天数。给商家反应时间，也给 app_subscriptions/update 的迟到留余地。 */
export const GRACE_PERIOD_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionSnapshot = {
  status: string | null;
  trialEnds: Date | null;
  currentPeriodEnd: Date | null;
};

export type ServiceabilityReason =
  | 'active'
  | 'trial'
  | 'grace'
  | 'no-subscription'
  | 'status-not-serviceable'
  | 'period-ended';

export type Serviceability = {
  serviceable: boolean;
  reason: ServiceabilityReason;
  /** 宽限截止时刻；不在宽限语境下为 null。 */
  graceEndsAt: Date | null;
};

/**
 * 宽限截止 = currentPeriodEnd + 2 天，**派生而非落库**。
 *
 * 落一个 gracePeriodEnd 字段就多一处要与 currentPeriodEnd 保持一致的真相；
 * 派生值不可能不同步，而且「宽限窗口不可被刷新」这条要求天然满足——
 * 同一个 currentPeriodEnd 算出来永远是同一个截止时刻。
 */
export function graceEndsAt(currentPeriodEnd: Date | null): Date | null {
  if (!currentPeriodEnd) return null;
  return new Date(currentPeriodEnd.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
}

export function isInTrial(sub: SubscriptionSnapshot, now: Date): boolean {
  return sub.trialEnds != null && sub.trialEnds.getTime() > now.getTime();
}

/** 状态本身是否允许服务。PENDING = 商家还没批准收费，不给服务。 */
function statusAllows(status: string | null): boolean {
  return status === 'ACTIVE';
}

export function evaluateServiceability(
  sub: SubscriptionSnapshot | null,
  now: Date = new Date(),
): Serviceability {
  if (!sub) {
    return { serviceable: false, reason: 'no-subscription', graceEndsAt: null };
  }

  // 试用优先于一切：试用期内不看状态也不看周期。
  if (isInTrial(sub, now)) {
    return { serviceable: true, reason: 'trial', graceEndsAt: null };
  }

  const grace = graceEndsAt(sub.currentPeriodEnd);

  if (!statusAllows(sub.status)) {
    // 状态已不可服务（FROZEN/CANCELLED/EXPIRED/DECLINED/PENDING），
    // 但周期还没走完 + 宽限时，仍先放行——商家可能刚付款而 webhook 未到。
    if (grace && grace.getTime() > now.getTime()) {
      return { serviceable: true, reason: 'grace', graceEndsAt: grace };
    }
    return { serviceable: false, reason: 'status-not-serviceable', graceEndsAt: grace };
  }

  // ACTIVE 但周期已过：宽限内继续，宽限外停。
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() <= now.getTime()) {
    if (grace && grace.getTime() > now.getTime()) {
      return { serviceable: true, reason: 'grace', graceEndsAt: grace };
    }
    return { serviceable: false, reason: 'period-ended', graceEndsAt: grace };
  }

  return { serviceable: true, reason: 'active', graceEndsAt: null };
}

/**
 * 到期前第几天（3 / 2 / 1），不在提醒窗口内返回 null。
 *
 * 按「还剩几个完整的 24 小时」算：剩 2.5 天算 D-3 的那一档已过、落在 D-2。
 * 不足三天时不补发已经错过的档位。
 */
export function reminderDayOffset(
  currentPeriodEnd: Date | null,
  now: Date = new Date(),
): 1 | 2 | 3 | null {
  if (!currentPeriodEnd) return null;
  const msLeft = currentPeriodEnd.getTime() - now.getTime();
  if (msLeft <= 0) return null;
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  return daysLeft >= 1 && daysLeft <= 3 ? (daysLeft as 1 | 2 | 3) : null;
}
