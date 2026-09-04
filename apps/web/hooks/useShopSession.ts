'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { fetchIdToken, waitForAppBridge } from '@/lib/app-bridge';

const TOKEN_KEY = 'drsell_shop_token';
const SHOP_KEY = 'drsell_shop';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Embedded session.
 *
 * Primary path is App Bridge token exchange: `shopify.idToken()` produces a
 * short-lived Shopify session token, which the API verifies (signature +
 * audience) and swaps for our own shop JWT. That is the only path a normally
 * installed merchant has — storage written outside the Admin is in a different
 * partition and is not visible inside the iframe.
 *
 * `impersonation_token` remains the ops support path.
 */
export function useShopSession() {
  const params = useSearchParams();
  const [shop, setShop] = useState('');
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);

  const persist = useCallback((nextShop: string, nextToken: string) => {
    try {
      localStorage.setItem(SHOP_KEY, nextShop);
      localStorage.setItem(TOKEN_KEY, nextToken);
    } catch {
      // partitioned or blocked storage — the token still lives in React state
    }
    setShop(nextShop);
    setToken(nextToken);
    setIsImpersonating(decodeJwtPayload(nextToken)?.impersonation === true);
  }, []);

  /** Exchange an App Bridge session token for our shop JWT. */
  const exchange = useCallback(async (): Promise<string> => {
    await waitForAppBridge();
    const sessionToken = await fetchIdToken();
    if (!sessionToken) return '';
    try {
      const res = await apiFetch<{ accessToken: string; shop?: { shopDomain?: string } }>(
        '/shopify/auth/app-bridge',
        { method: 'POST', body: JSON.stringify({ sessionToken }) },
      );
      const resolvedShop = res.shop?.shopDomain || '';
      if (res.accessToken) {
        persist(resolvedShop, res.accessToken);
        return res.accessToken;
      }
    } catch {
      // fall through — caller renders the unauthenticated state
    }
    return '';
  }, [persist]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const fromUrl = params.get('shop') || '';
      const impersonationToken = params.get('impersonation_token') || '';

      if (impersonationToken && fromUrl) {
        persist(fromUrl, impersonationToken);
        setReady(true);
        const url = new URL(window.location.href);
        url.searchParams.delete('impersonation_token');
        history.replaceState(null, '', url.pathname + url.search);
        return;
      }

      const storedShop = typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) || '' : '';
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) || '' : '';

      // A stored token is only reusable for the same shop the Admin is showing.
      if (storedToken && (!fromUrl || fromUrl === storedShop)) {
        if (cancelled) return;
        persist(storedShop || fromUrl, storedToken);
        setReady(true);
        return;
      }

      setShop(fromUrl);
      await exchange();
      if (!cancelled) setReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [params, persist, exchange]);

  return { shop, token, login: exchange, ready, setShop, isImpersonating };
}
