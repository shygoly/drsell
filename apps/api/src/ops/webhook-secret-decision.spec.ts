import { decideSecretDeletion, type SecretUseRow } from './webhook-secret-decision';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

const row = (
  generation: 'current' | 'previous',
  topic: string,
  first: Date,
  last = first,
): SecretUseRow => ({ generation, topic, count: 1, firstSeenAt: first, lastSeenAt: last });

const decide = (rows: SecretUseRow[], configured = true, quietDays = 14) =>
  decideSecretDeletion({ rows, configured, quietDays, now: NOW });

describe('旧密钥能不能删', () => {
  it('证据表为空 → 不能删，且措辞是「不知道」不是「安全」', () => {
    const d = decide([]);
    expect(d.safeToDelete).toBe(false);
    expect(d.reason).toMatch(/不知道/);
  });

  it('2026-09-09 的假阳性：42 秒内 2 条同 topic，不足以下结论', () => {
    // 真实数据：证据表在密钥对调后才建，只有一条 current 记录，跨度 42 秒。
    // 旧实现把 quietForDays === null 当成「已静默 14 天」，报了 safeToDelete=true。
    const t0 = new Date(NOW.getTime() - 42000);
    const d = decide([row('current', 'app/uninstalled', t0, NOW)]);
    expect(d.safeToDelete).toBe(false);
    expect(d.quietForDays).toBeNull();
    expect(d.observedForDays).toBe(0);
    expect(d.reason).toMatch(/不构成证据|不足/);
  });

  it('观察窗口够长且旧密钥一次没命中 → 可以删', () => {
    const d = decide([row('current', 'app/uninstalled', daysAgo(20), daysAgo(1))]);
    expect(d.safeToDelete).toBe(true);
    expect(d.observedForDays).toBe(20);
    expect(d.reason).toMatch(/一次都没命中/);
  });

  it('窗口够长但某 topic 只在旧密钥下出现过 → 不能删，并点名', () => {
    const d = decide([
      row('current', 'app/uninstalled', daysAgo(20)),
      row('previous', 'app_subscriptions/update', daysAgo(20), daysAgo(18)),
    ]);
    expect(d.safeToDelete).toBe(false);
    expect(d.stillOnPreviousTopics).toEqual(['app_subscriptions/update']);
    expect(d.reason).toMatch(/app_subscriptions\/update/);
  });

  it('同一 topic 在新旧密钥下都出现过 → 不算「只在旧密钥下」', () => {
    const d = decide([
      row('previous', 'products/update', daysAgo(30), daysAgo(20)),
      row('current', 'products/update', daysAgo(19), daysAgo(1)),
    ]);
    expect(d.stillOnPreviousTopics).toEqual([]);
    expect(d.safeToDelete).toBe(true);
    expect(d.quietForDays).toBe(20);
  });

  it('旧密钥近期仍在被使用 → 不能删', () => {
    const d = decide([
      row('previous', 'products/update', daysAgo(30), daysAgo(3)),
      row('current', 'products/update', daysAgo(30), daysAgo(1)),
    ]);
    expect(d.safeToDelete).toBe(false);
    expect(d.quietForDays).toBe(3);
    expect(d.reason).toMatch(/仍在被使用/);
  });

  it('恰好等于静默天数的边界 → 可以删', () => {
    const d = decide([
      row('previous', 'x', daysAgo(40), daysAgo(14)),
      row('current', 'x', daysAgo(40), daysAgo(1)),
    ]);
    expect(d.safeToDelete).toBe(true);
  });

  it('未配置旧密钥 → 无可删', () => {
    const d = decide([row('current', 'x', daysAgo(30))], false);
    expect(d.safeToDelete).toBe(false);
    expect(d.reason).toMatch(/未配置/);
  });

  it('观察窗口取所有记录里最早的 firstSeenAt', () => {
    const d = decide([
      row('current', 'a', daysAgo(2)),
      row('current', 'b', daysAgo(30)),
    ]);
    expect(d.observedForDays).toBe(30);
    expect(d.topicsSeenOnCurrent).toEqual(['a', 'b']);
  });
});
