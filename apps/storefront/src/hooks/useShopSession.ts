"use client";

import { useCallback, useEffect, useState } from "react";
import { useShopifyBridge } from "@/components/business/shopify-bridge";

const TOKEN_KEY = "drsell_shop_token";
const SHOP_KEY = "drsell_shop";
const USER_TOKEN_KEY = "drsell_user_token";
const USER_EMAIL_KEY = "drsell_user_email";

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
  const bridge = useShopifyBridge();
  const [shop, setShop] = useState("");
  const [token, setToken] = useState("");
  const [userToken, setUserToken] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fromUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("shop") || ""
        : "";
    const storedShop = safeStorageGet(SHOP_KEY);
    const storedUserToken = safeStorageGet(USER_TOKEN_KEY);
    const storedUserEmail = safeStorageGet(USER_EMAIL_KEY);
    const nextShop = fromUrl || storedShop || "";

    // OAuth 回调用 fragment 下发 shop JWT（唯一的非 App Bridge 取得途径），
    // 读到后立刻从地址栏抹掉。
    let fragmentToken = "";
    if (typeof window !== "undefined" && window.location.hash.includes("shop_token=")) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      fragmentToken = params.get("shop_token") || "";
      if (fragmentToken) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
    const storedToken = fragmentToken || safeStorageGet(TOKEN_KEY);
    if (fragmentToken && nextShop) {
      safeStorageSet(SHOP_KEY, nextShop);
      safeStorageSet(TOKEN_KEY, fragmentToken);
    }

    setShop(nextShop);
    if (storedToken) setToken(storedToken);
    if (storedUserToken) setUserToken(storedUserToken);
    if (storedUserEmail) setUserEmail(storedUserEmail);
    setReady(true);
  }, []);

  const applyUserSession = useCallback((accessToken: string, email: string) => {
    safeStorageSet(USER_TOKEN_KEY, accessToken);
    safeStorageSet(USER_EMAIL_KEY, email);
    setUserToken(accessToken);
    setUserEmail(email);
  }, []);

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const api =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
      const res = await fetch(`${api}/auth/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          text ? `Login failed: ${text.slice(0, 160)}` : `Login failed (${res.status})`,
        );
      }
      const data = (await res.json()) as { accessToken: string };
      applyUserSession(data.accessToken, email);
      return data.accessToken;
    },
    [applyUserSession],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const api =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
      const res = await fetch(`${api}/auth/admin/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          text ? `Registration failed: ${text.slice(0, 160)}` : `Registration failed (${res.status})`,
        );
      }
      const data = (await res.json()) as { accessToken: string };
      applyUserSession(data.accessToken, email);
      return data.accessToken;
    },
    [applyUserSession],
  );

  const startGoogleLogin = useCallback(() => {
    const api =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
    window.location.href = `${api}/auth/google`;
  }, []);

  const logout = useCallback(() => {
    safeStorageSet(USER_TOKEN_KEY, "");
    safeStorageSet(USER_EMAIL_KEY, "");
    safeStorageSet(SHOP_KEY, "");
    safeStorageSet(TOKEN_KEY, "");
    setUserToken("");
    setUserEmail("");
    setShop("");
    setToken("");
  }, []);

  const loginWithAppBridge = useCallback(async () => {
    if (!bridge || !shop) return;
    const sessionToken = await bridge.idToken();
    const api =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
    const res = await fetch(`${api}/shopify/auth/app-bridge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken }),
    });
    if (!res.ok) {
      throw new Error(`App Bridge login failed (${res.status})`);
    }
    const data = (await res.json()) as { accessToken: string };
    safeStorageSet(SHOP_KEY, shop);
    safeStorageSet(TOKEN_KEY, data.accessToken);
    setToken(data.accessToken);
    return data.accessToken;
  }, [bridge, shop]);

  useEffect(() => {
    // Admin embedded：每次进入都用 App Bridge session token 换发 JWT。
    // 非嵌入场景没有店铺归属证明，只能用 OAuth 回调下发并已落盘的 token，
    // 不再允许「给个 shop 域名就换 token」。
    if (!ready || !shop || !bridge) return;
    void loginWithAppBridge().catch(() => {
      // token 尚未就绪时静默失败，下次渲染重试
    });
  }, [ready, shop, bridge, loginWithAppBridge]);

  const startOAuth = useCallback(
    (shopDomain: string) => {
      const normalized = shopDomain.includes(".")
        ? shopDomain
        : `${shopDomain}.myshopify.com`;
      const u = userToken ? `&u=${encodeURIComponent(userToken)}` : "";
      window.location.href = `/api/auth?shop=${encodeURIComponent(normalized)}${u}`;
    },
    [userToken],
  );

  const listShops = useCallback(async () => {
    if (!userToken) return [];
    const api =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
    const res = await fetch(`${api}/membership/shops`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`List shops failed: ${text.slice(0, 160)}`);
    }
    return (await res.json()) as Array<{
      role: string;
      shop: {
        id: string;
        shopDomain: string;
        tenantId: string;
        uninstalledAt: string | null;
      };
    }>;
  }, [userToken]);

  const switchShop = useCallback(
    async (shopDomain: string) => {
      const api =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
      const res = await fetch(`${api}/membership/switch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ shopDomain }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          text ? `Switch failed: ${text.slice(0, 160)}` : `Switch failed (${res.status})`,
        );
      }
      const data = (await res.json()) as { accessToken: string };
      safeStorageSet(SHOP_KEY, shopDomain);
      safeStorageSet(TOKEN_KEY, data.accessToken);
      setShop(shopDomain);
      setToken(data.accessToken);
      return data.accessToken;
    },
    [userToken],
  );

  return {
    shop,
    token,
    userToken,
    userEmail,
    bridge,
    loginWithPassword,
    register,
    startGoogleLogin,
    applyUserSession,
    logout,
    ready,
    setShop,
    startOAuth,
    listShops,
    switchShop,
  };
}
