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
    const storedToken = safeStorageGet(TOKEN_KEY);
    const storedUserToken = safeStorageGet(USER_TOKEN_KEY);
    const storedUserEmail = safeStorageGet(USER_EMAIL_KEY);
    const nextShop = fromUrl || storedShop || "";
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
    // 每次进入都刷新 shop session：
    // Admin embedded 优先用 App Bridge session token 换发 JWT；
    // 公开站/桥接不可用时回退到 shop 参数 + /auth/login。
    if (!ready || !shop) return;
    const refresh = async () => {
      try {
        if (bridge) {
          await loginWithAppBridge();
        } else {
          await login(shop);
        }
      } catch {
        // 桥接失败时回退到传统 login（例如公开站或 token 尚未就绪）
        if (bridge) {
          try {
            await login(shop);
          } catch {
            // ignore
          }
        }
      }
    };
    void refresh();
  }, [ready, shop, bridge, login, loginWithAppBridge]);

  const startOAuth = useCallback((shopDomain: string) => {
    const normalized = shopDomain.includes(".")
      ? shopDomain
      : `${shopDomain}.myshopify.com`;
    window.location.href = `/api/auth?shop=${encodeURIComponent(normalized)}`;
  }, []);

  return {
    shop,
    token,
    userToken,
    userEmail,
    login,
    loginWithPassword,
    register,
    startGoogleLogin,
    applyUserSession,
    logout,
    ready,
    setShop,
    startOAuth,
  };
}
