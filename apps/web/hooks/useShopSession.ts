'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

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

export function useShopSession() {
  const params = useSearchParams();
  const [shop, setShop] = useState('');
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    const fromUrl = params.get('shop') || '';
    const impersonationToken = params.get('impersonation_token') || '';

    if (impersonationToken && fromUrl) {
      localStorage.setItem(SHOP_KEY, fromUrl);
      localStorage.setItem(TOKEN_KEY, impersonationToken);
      setShop(fromUrl);
      setToken(impersonationToken);
      const payload = decodeJwtPayload(impersonationToken);
      setIsImpersonating(payload?.impersonation === true);
      setReady(true);

      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('impersonation_token');
        history.replaceState(null, '', url.pathname + url.search);
      }
      return;
    }

    const storedShop = typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) : '';
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : '';
    const nextShop = fromUrl || storedShop || '';
    setShop(nextShop);
    if (storedToken) {
      setToken(storedToken);
      const payload = decodeJwtPayload(storedToken);
      setIsImpersonating(payload?.impersonation === true);
    } else {
      setIsImpersonating(false);
    }
    setReady(true);
  }, [params]);

  const login = useCallback(async (shopDomain?: string) => {
    const target = shopDomain || shop;
    if (!target) return;
    const res = await apiFetch<{ accessToken: string }>('/shopify/auth/login', {
      method: 'POST',
      body: JSON.stringify({ shop: target }),
    });
    localStorage.setItem(SHOP_KEY, target);
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    setShop(target);
    setToken(res.accessToken);
    return res.accessToken;
  }, [shop]);

  useEffect(() => {
    if (!ready || !shop || token) return;
    void login(shop).catch(() => undefined);
  }, [ready, shop, token, login]);

  return { shop, token, login, ready, setShop, isImpersonating };
}
