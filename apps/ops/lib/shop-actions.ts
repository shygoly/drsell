import { opsFetch } from '@/lib/api';
import type { ImpersonateResult, QueueItem } from '@/lib/api';
import { openImpersonationSession } from '@/lib/api';
import { queueAction } from '@/app/components/runway';

export type ShopActionResult = { message?: string; queued?: boolean };

export async function postShopAction(
  domain: string,
  path: string,
  body: object = {},
): Promise<ShopActionResult> {
  return opsFetch<ShopActionResult>(
    `/ops/shops/${encodeURIComponent(domain)}/${path}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function sendDunning(domain: string) {
  return postShopAction(domain, 'dunning');
}

export async function extendFreeze(domain: string, days: number) {
  return postShopAction(domain, 'extend-freeze', { days });
}

export async function impersonateShop(domain: string) {
  const res = await opsFetch<ImpersonateResult>(
    `/ops/shops/${encodeURIComponent(domain)}/impersonate`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  openImpersonationSession(res);
  return { message: '已打开商户端代登录窗口' };
}

export type QueueActionOutcome =
  | { type: 'navigate'; href: string }
  | { type: 'done'; message: string };

/** 队列行内动作：文案来自 queueAction，行为对齐 shop detail 处置 */
export async function runQueueAction(item: QueueItem): Promise<QueueActionOutcome> {
  const label = queueAction(item.queueKind, item.status);
  const domain = item.shopDomain;
  const shopHref = `/shops/${encodeURIComponent(domain)}`;

  if (label === '查看') {
    return { type: 'navigate', href: shopHref };
  }

  if (label === '发催缴提醒') {
    const res = await sendDunning(domain);
    return { type: 'done', message: res.message ?? '已排队催缴提醒' };
  }

  if (label === '延长试用') {
    // 无独立「延长试用」API；进店铺详情处置（与 Stitch 稿「查看/延长」同一入口）
    return { type: 'navigate', href: shopHref };
  }

  return { type: 'navigate', href: shopHref };
}
