import { decideSecretDeletion, type SecretUseRow } from './webhook-secret-decision';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

const row = (
  generation: 'current' | 'previous',
  topic: string,
  first: Date,
  last = first,
): SecretUseRow => ({ generation, topic, count: 1, firstSeenAt: first, lastSeenAt: last });

// 默认让后台那把落在 current 槽位——即「正常轮换尾声」的形态，
// 这样原有用例考的仍是静默/窗口逻辑。
const decide = (rows: SecretUseRow[], configured = true, quietDays = 14) =>
  decideSecretDeletion({
    rows,
    configured,
    quietDays,
    now: NOW,
    currentFp: 'ffffffffffff',
    previousFp: 'aaaaaaaaaaaa',
    latestFp: 'ffffffffffff',
  });

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

describe('后台最新那把在哪个槽位（2026-09-09 的真实形态）', () => {
  const rows = [row('current', 'app/uninstalled', daysAgo(30), daysAgo(1))];
  const at = (latestFp: string | null) =>
    decideSecretDeletion({
      rows,
      configured: true,
      quietDays: 14,
      now: NOW,
      currentFp: '58e8f70fb2a5',
      previousFp: '4c3a72ece258',
      latestFp,
    });

  it('后台那把在 _PREVIOUS 里 → 绝不能删，即使它一直静默', () => {
    // 真实数据：后台同时列出 old=58e8f70fb2a5（在用）与 new=4c3a72ece258（未启用）。
    // _PREVIOUS 里装的是**将要接管**的新密钥；静默恰恰是它还没启用的表现。
    const d = at('4c3a72ece258');
    expect(d.latestSlot).toBe('previous');
    expect(d.safeToDelete).toBe(false);
    expect(d.reason).toMatch(/将要接管|自断后路|同时全挂/);
  });

  it('静默 30 天也不放行——窗口够长不能盖过槽位错配', () => {
    expect(at('4c3a72ece258').safeToDelete).toBe(false);
  });

  it('后台那把在 SHOPIFY_API_SECRET 里 → 回到正常的静默判断', () => {
    const d = at('58e8f70fb2a5');
    expect(d.latestSlot).toBe('current');
    expect(d.safeToDelete).toBe(true);
  });

  it('后台那把两个槽位都不匹配 → 配置已脱节，不放行', () => {
    const d = at('deadbeef0000');
    expect(d.latestSlot).toBe('neither');
    expect(d.safeToDelete).toBe(false);
    expect(d.reason).toMatch(/脱节/);
  });

  it('没配后台指纹 → 不放行，并说清为什么这不是小事', () => {
    const d = at(null);
    expect(d.latestSlot).toBe('unknown');
    expect(d.safeToDelete).toBe(false);
    expect(d.reason).toMatch(/无法区分|反过来/);
  });
});
