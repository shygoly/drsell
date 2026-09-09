/**
 * 到期提醒的正文。抽成纯函数：不碰 SMTP、不碰环境变量，可以直接断言措辞。
 *
 * 措辞约束（与顾客侧话术相反）：这封信是**发给商家本人**的，所以可以、也应该
 * 说清套餐、到期时间和续费入口——顾客侧那条才必须回避商家的计费状态。
 */
export type ExpiryNoticeParams = {
  shopDomain: string;
  planCode: string;
  periodEnd: Date;
  daysLeft: number;
};

const GRACE_DAYS = 2;

export function renderExpiryNotice(p: ExpiryNoticeParams): {
  subject: string;
  text: string;
} {
  const when = p.periodEnd.toISOString().slice(0, 10);
  const subject = `Drsell 订阅将在 ${p.daysLeft} 天后到期（${p.shopDomain}）`;
  const text = [
    `你好，`,
    ``,
    `${p.shopDomain} 的 Drsell 订阅（${p.planCode} 档）将在 ${p.daysLeft} 天后到期，`,
    `到期时间：${when}（UTC）。`,
    ``,
    `到期后还有 ${GRACE_DAYS} 天宽限，期间 AI 客服照常工作；宽限结束后，`,
    `顾客发来的消息将转为等待人工接管，AI 不再自动回复。`,
    ``,
    `续费入口在 Shopify 后台 → 应用 → Drsell → 套餐。`,
    `付款完成后服务会自动恢复，无需联系我们。`,
    ``,
    `—— Drsell`,
  ].join('\n');
  return { subject, text };
}
