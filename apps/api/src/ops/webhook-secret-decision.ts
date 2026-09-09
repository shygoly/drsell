/**
 * 「旧密钥能不能删」的判据——纯函数。
 *
 * 删早了所有 webhook 同时 401，而 `app_subscriptions/update` 是付款解冻的唯一渠道：
 * 那等于让付了钱的商家恢复不了服务。所以判据必须是**正面证据**，不能是「没看到反例」。
 *
 * 2026-09-09 这里出过一个假阳性，值得留着当反面教材：`quietForDays === null`
 * （证据表建立后从没观测到旧密钥）被当成了「已静默 14 天」，于是仅凭 42 秒内的
 * 2 条同 topic 记录就报 safeToDelete=true。**「没有证据」被读成了「证据表明没有」**——
 * 而这张表本来就是为了防这个。修法是引入观察窗口：表收集了多久才是证据的分量。
 */
export type SecretUseRow = {
  generation: string;
  topic: string;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

/**
 * Partner 后台**最新**那把密钥的指纹。**判据缺了它就是瞎的。**
 *
 * 轮换期间 Shopify 后台会**同时列出 old 与 new 两把**，而它仍用 old 签名——
 * 2026-09-09 实测正是这个形态：后台 old=`58e8f70fb2a5`（在用）、
 * new=`4c3a72ece258`（未启用）。于是 `_PREVIOUS` 里装的不是「将死的旧密钥」，
 * 而是**将要接管的新密钥**；按「静默即可删」处置，会在 Shopify 切过去那一刻
 * 让全部 webhook 与 OAuth 同时挂掉。静默恰恰是它还没被启用的表现。
 */
export type SecretDecision = {
  safeToDelete: boolean;
  /** 为什么还不能删；可删时说明依据。给人看的，不是给机器解析的。 */
  reason: string;
  observedForDays: number | null;
  quietForDays: number | null;
  lastPreviousAt: string | null;
  stillOnPreviousTopics: string[];
  topicsSeenOnCurrent: string[];
  /** 后台那把落在哪个槽位；unknown 表示没配指纹，无从判断。 */
  latestSlot: 'current' | 'previous' | 'neither' | 'unknown';
};

export function decideSecretDeletion(args: {
  rows: SecretUseRow[];
  configured: boolean;
  quietDays: number;
  now: Date;
  /** 各槽位密钥的指纹（sha256 前 12 位）。 */
  currentFp?: string | null;
  previousFp?: string | null;
  /** 后台最新那把的指纹，由运维填 `SHOPIFY_API_SECRET_LATEST_FP`（轮换期填 new 那把）。 */
  latestFp?: string | null;
}): SecretDecision {
  const { rows, configured, quietDays, now, currentFp, previousFp, latestFp } = args;
  const previous = rows.filter((r) => r.generation === 'previous');
  const current = rows.filter((r) => r.generation === 'current');
  const currentTopics = new Set(current.map((r) => r.topic));

  const lastPreviousAt = previous.reduce<Date | null>(
    (acc, r) => (!acc || r.lastSeenAt > acc ? r.lastSeenAt : acc),
    null,
  );
  const earliest = rows.reduce<Date | null>(
    (acc, r) => (!acc || r.firstSeenAt < acc ? r.firstSeenAt : acc),
    null,
  );

  const days = (from: Date) => Math.floor((now.getTime() - from.getTime()) / 86400000);
  const observedForDays = earliest ? days(earliest) : null;
  const quietForDays = lastPreviousAt ? days(lastPreviousAt) : null;
  const stillOnPreviousTopics = previous
    .filter((r) => !currentTopics.has(r.topic))
    .map((r) => r.topic);

  const latestSlot: SecretDecision['latestSlot'] = !latestFp
    ? 'unknown'
    : latestFp === currentFp
      ? 'current'
      : latestFp === previousFp
        ? 'previous'
        : 'neither';

  const base = {
    observedForDays,
    quietForDays,
    lastPreviousAt: lastPreviousAt?.toISOString() ?? null,
    stillOnPreviousTopics,
    topicsSeenOnCurrent: [...currentTopics].sort(),
    latestSlot,
  };

  if (!configured) {
    return { ...base, safeToDelete: false, reason: 'SHOPIFY_API_SECRET_PREVIOUS 未配置，无可删' };
  }
  // 后台那把在 _PREVIOUS 里 = 它是**将要接管**的密钥，删了就是自断后路。
  // 这一分支排在所有「静默」判断之前：静默恰恰是它还没被启用的表现。
  if (latestSlot === 'previous') {
    return {
      ...base,
      safeToDelete: false,
      reason:
        'SHOPIFY_API_SECRET_PREVIOUS 里装的正是 Partner 后台最新那把——它不是将死的旧密钥，' +
        '而是尚未启用、将要接管的新密钥。删掉它，Shopify 切换的那一刻 webhook 与 OAuth 会同时全挂。' +
        '正确动作是等 Shopify 切过去后把两个槽位对调，再删当时的 _PREVIOUS',
    };
  }
  if (latestSlot === 'neither') {
    return {
      ...base,
      safeToDelete: false,
      reason:
        'Partner 后台最新那把两个槽位都不匹配：配置与 Shopify 侧已经脱节，' +
        '此时删任何一把都可能踩空。先把后台那把配进来',
    };
  }
  if (latestSlot === 'unknown') {
    return {
      ...base,
      safeToDelete: false,
      reason:
        '未配置 SHOPIFY_API_SECRET_LATEST_FP：不知道后台最新那把是哪一个，' +
        '就无法区分「将死的旧密钥」与「尚未启用的新密钥」。2026-09-09 这两者真的反过来过',
    };
  }
  if (rows.length === 0) {
    return {
      ...base,
      safeToDelete: false,
      reason: '证据表为空：还没观测到任何 webhook。这是「不知道」，不是「安全」',
    };
  }
  if (stillOnPreviousTopics.length > 0) {
    return {
      ...base,
      safeToDelete: false,
      reason: `这些 topic 只在旧密钥下出现过，删掉就会全部 401：${stillOnPreviousTopics.join(', ')}`,
    };
  }
  // 观察窗口不够长时，「没见过旧密钥」什么也证明不了——可能只是这段时间没人发 webhook。
  if (observedForDays == null || observedForDays < quietDays) {
    return {
      ...base,
      safeToDelete: false,
      reason:
        `证据只收集了 ${observedForDays ?? 0} 天，不足 ${quietDays} 天。` +
        '此时「没见过旧密钥」可能只是这段时间恰好没有 webhook，不构成证据',
    };
  }
  if (quietForDays != null && quietForDays < quietDays) {
    return {
      ...base,
      safeToDelete: false,
      reason: `旧密钥 ${quietForDays} 天前仍在被使用，不足 ${quietDays} 天静默`,
    };
  }
  return {
    ...base,
    safeToDelete: true,
    reason:
      `已连续观测 ${observedForDays} 天；` +
      (quietForDays == null
        ? '期间旧密钥一次都没命中'
        : `旧密钥已静默 ${quietForDays} 天`) +
      `；${currentTopics.size} 个 topic 均已在新密钥下出现`,
  };
}
