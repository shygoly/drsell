'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

const TOKEN_KEY = 'drsell_shop_token';
const SHOP_KEY = 'drsell_shop';

export function useShopSession() {
  const params = useSearchParams();
  const [shop, setShop] = useState('');
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fromUrl = params.get('shop') || '';
    const storedShop = typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) : '';
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : '';
    const nextShop = fromUrl || storedShop || '';
    setShop(nextShop);
    if (storedToken) setToken(storedToken);
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

  return { shop, token, login, ready, setShop };
}
