"use client";

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "drsell_shop_token";
const SHOP_KEY = "drsell_shop";

function safeStorageGet(key: string): string {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(key) || "" : "";
  } catch {
    return "";
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Embedded/private contexts may block storage; session still works from URL.
  }
}

export function useShopSession() {
  const [shop, setShop] = useState("");
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fromUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("shop") || ""
        : "";
    const storedShop = safeStorageGet(SHOP_KEY);
    const storedToken = safeStorageGet(TOKEN_KEY);
    const nextShop = fromUrl || storedShop || "";
    setShop(nextShop);
    if (storedToken) setToken(storedToken);
    setReady(true);
  }, []);

  const login = useCallback(async (shopDomain?: string) => {
    const target = shopDomain || shop;
    if (!target) return;
    const api =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
    const res = await fetch(`${api}/shopify/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop: target }),
    });
    if (!res.ok) {
      throw new Error(`Login failed (${res.status})`);
    }
    const data = (await res.json()) as { accessToken: string };
    safeStorageSet(SHOP_KEY, target);
    safeStorageSet(TOKEN_KEY, data.accessToken);
    setShop(target);
    setToken(data.accessToken);
    return data.accessToken;
  }, [shop]);

  useEffect(() => {
    // 每次进入都刷新一次 shop session，避免 localStorage 里的旧 token 失效后
    // 导致后续 merchantFetch 401（Admin iframe 内常见）。
    if (!ready || !shop) return;
    void login(shop).catch(() => undefined);
  }, [ready, shop, login]);

  const startOAuth = useCallback((shopDomain: string) => {
    const normalized = shopDomain.includes(".")
      ? shopDomain
      : `${shopDomain}.myshopify.com`;
    window.location.href = `/api/auth?shop=${encodeURIComponent(normalized)}`;
  }, []);

  return { shop, token, login, ready, setShop, startOAuth };
}
