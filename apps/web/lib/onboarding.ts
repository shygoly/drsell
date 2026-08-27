import type { OnboardingState, SyncStatus } from '@drsell/shared';
import { apiFetch } from './api';

export const EXTENSION_HANDLE = 'drsell-chat';
export const CLIENT_ID =
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || '0b36b70772220b71b2fe296b3deba914';

export function buildEmbedDeepLink(
  clientId = CLIENT_ID,
  handle = EXTENSION_HANDLE,
) {
  return `shopify://admin/themes/current/editor?context=apps&activateAppId=${clientId}/${handle}`;
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
