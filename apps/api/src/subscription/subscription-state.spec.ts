import {
  GRACE_PERIOD_DAYS,
  evaluateServiceability,
  graceEndsAt,
  reminderDayOffset,
  type SubscriptionStatus,
} from './subscription-state';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

const sub = (
  status: SubscriptionStatus | null,
  currentPeriodEnd: Date | null,
  trialEnds: Date | null = null,
) => ({ status, currentPeriodEnd, trialEnds });

const ALL: SubscriptionStatus[] = [
  'PENDING',
  'ACTIVE',
  'FROZEN',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
];

describe('可服务判定', () => {
  it('没有订阅记录 → 不服务（而不是回落默认档白送额度）', () => {
    const r = evaluateServiceability(null, NOW);
    expect(r.serviceable).toBe(false);
    expect(r.reason).toBe('no-subscription');
  });

  it('ACTIVE 且在周期内 → 服务', () => {
    expect(evaluateServiceability(sub('ACTIVE', day(10)), NOW)).toMatchObject({
      serviceable: true,
      reason: 'active',
    });
  });

  it('试用期内 → 服务，且不看状态也不看周期', () => {
    // 状态是 PENDING、周期早已过，只要还在试用就服务
    for (const s of ALL) {
      const r = evaluateServiceability(sub(s, day(-400), day(5)), NOW);
      expect(r).toMatchObject({ serviceable: true, reason: 'trial' });
    }
  });

  it('六个状态 × 周期已过很久 → 只有仍在宽限的才服务', () => {
    for (const s of ALL) {
      // 一年前到期，远超宽限
      expect(evaluateServiceability(sub(s, day(-365)), NOW).serviceable).toBe(false);
      // 刚到期 1 天，在 2 天宽限内
      expect(evaluateServiceability(sub(s, day(-1)), NOW).serviceable).toBe(true);
    }
  });

  it('生产上那条：一年未续的 ACTIVE 订阅不再被服务', () => {
    // chatbotdomaintest 的真实形态：status=ACTIVE 但 currentPeriodEnd 停在一年多前
    const r = evaluateServiceability(sub('ACTIVE', new Date('2025-08-25')), NOW);
    expect(r.serviceable).toBe(false);
    expect(r.reason).toBe('period-ended');
  });
});

describe('宽限窗口', () => {
  it('到期后第 1 天仍服务，第 3 天停', () => {
    expect(evaluateServiceability(sub('ACTIVE', day(-1)), NOW)).toMatchObject({
      serviceable: true,
      reason: 'grace',
    });
    expect(evaluateServiceability(sub('ACTIVE', day(-3)), NOW).serviceable).toBe(false);
  });

  it('宽限截止是派生的，反复计算不会后移', () => {
    const end = day(-1);
    const first = graceEndsAt(end);
    const later = graceEndsAt(end);
    expect(first?.toISOString()).toBe(later?.toISOString());
    expect(first?.getTime()).toBe(end.getTime() + GRACE_PERIOD_DAYS * 86400000);
  });

  it('FROZEN 但刚到期 → 宽限内仍服务（商家可能刚付款，webhook 还没到）', () => {
    expect(evaluateServiceability(sub('FROZEN', day(-1)), NOW)).toMatchObject({
      serviceable: true,
      reason: 'grace',
    });
  });

  it('CANCELLED 且早已过宽限 → 停', () => {
    const r = evaluateServiceability(sub('CANCELLED', day(-30)), NOW);
    expect(r.serviceable).toBe(false);
    expect(r.reason).toBe('status-not-serviceable');
  });
});

describe('到期提醒的档位', () => {
  it('D-3 / D-2 / D-1 各自命中', () => {
    expect(reminderDayOffset(day(3), NOW)).toBe(3);
    expect(reminderDayOffset(day(2), NOW)).toBe(2);
    expect(reminderDayOffset(day(1), NOW)).toBe(1);
  });

  it('窗口外不提醒', () => {
    expect(reminderDayOffset(day(4), NOW)).toBeNull();
    expect(reminderDayOffset(day(-1), NOW)).toBeNull();
    expect(reminderDayOffset(null, NOW)).toBeNull();
  });

  it('剩 2.5 天落在 D-3 档（按剩余的完整 24 小时向上取整）', () => {
    expect(reminderDayOffset(new Date(NOW.getTime() + 2.5 * 86400000), NOW)).toBe(3);
  });

  it('订阅创建时只剩 1 天 → 只会命中 D-1，不补发错过的档位', () => {
    // 档位由「当下剩几天」决定，天然不会补发；去重由持久化层负责
    expect(reminderDayOffset(day(1), NOW)).toBe(1);
    expect(reminderDayOffset(day(1), new Date(NOW.getTime() - 86400000))).toBe(2);
  });
});

describe('付款解冻', () => {
  it('镜像从 FROZEN 改为 ACTIVE 后闸门立刻放行——不需要人工干预', () => {
    const periodEnd = day(20);
    // 冻结且已过宽限 → 不服务
    expect(evaluateServiceability(sub('FROZEN', day(-10)), NOW).serviceable).toBe(false);
    // app_subscriptions/update 到达，syncFromShopify 写回 ACTIVE + 新周期 → 立刻服务
    expect(evaluateServiceability(sub('ACTIVE', periodEnd), NOW)).toMatchObject({
      serviceable: true,
      reason: 'active',
    });
  });

  it('webhook 迟到但仍在宽限内 → 服务不中断', () => {
    // 商家已付款，Shopify 侧已 ACTIVE，但本地镜像还停在旧状态与旧周期
    const r = evaluateServiceability(sub('FROZEN', day(-1)), NOW);
    expect(r.serviceable).toBe(true);
    expect(r.reason).toBe('grace');
  });
});
