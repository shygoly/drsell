import type { OnboardingState, SyncStatus } from '@drsell/shared';
import { apiFetch } from './api';

export const EXTENSION_HANDLE = 'drsell-chat';
/** Liquid block filename (without .liquid) — required by activateAppId deep links */
export const EMBED_BLOCK_HANDLE = 'chat-embed';
export const CLIENT_ID =
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || '0b36b70772220b71b2fe296b3deba914';

/** HTTPS Admin deep link — `shopify://` does nothing in embedded iframe without App Bridge. */
export function buildEmbedDeepLink(
  shop: string,
  clientId = CLIENT_ID,
  handle = EMBED_BLOCK_HANDLE,
) {
  const domain = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const storeHandle = domain.replace(/\.myshopify\.com$/i, '');
  return `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps&activateAppId=${clientId}/${handle}`;
}

/** Top-level navigation so the button works inside Shopify Admin iframe. */
export function openEmbedDeepLink(shop: string) {
  if (!shop || typeof window === 'undefined') return;
  const url = buildEmbedDeepLink(shop);
  const target = window.top ?? window;
  target.location.assign(url);
}

export function fetchOnboarding(shop: string, token: string) {
  return apiFetch<OnboardingState>(`/shopify/onboarding?shop=${encodeURIComponent(shop)}`, {
    token,
  });
}

export function patchOnboarding(
  shop: string,
  token: string,
  body: Record<string, unknown>,
) {
  return apiFetch<OnboardingState>(`/shopify/onboarding?shop=${encodeURIComponent(shop)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export function startBatchSync(shop: string, token: string) {
  return apiFetch<{ started: string[] }>(
    `/shopify/sync/batch?shop=${encodeURIComponent(shop)}`,
    { method: 'POST', token },
  );
}

export function fetchSyncStatus(shop: string, token: string) {
  return apiFetch<SyncStatus>(`/shopify/sync/status?shop=${encodeURIComponent(shop)}`, {
    token,
  });
}
