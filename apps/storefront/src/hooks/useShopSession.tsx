"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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

/**
 * 会话状态的实现。**不要直接调用**——用下面的 `useShopSession()` 读共享实例。
 *
 * 这里曾经就是导出的 hook 本身，于是 12 个组件各持一份互不相通的 state。
 * 平时看不出来：走 App Bridge 时每个实例都能自己换一次 token（浪费但能用）。
 * 改成消费 URL 里的 id_token 后就致命了——那枚 token 用完即从地址栏抹掉，
 * 只有最先挂载的那个实例换得到，它 setToken 更新的也只是自己那份，
 * useDashboardData 那份永远停在 localStorage 里的旧 JWT 上。
 * 实测形态：换发返回 201，但之后一个 API 调用都没有，页面停在 401。
 */
function useShopSessionState() {
  const bridge = useShopifyBridge();
  const [shop, setShop] = useState("");
  const [token, setToken] = useState("");
  const [userToken, setUserToken] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  /**
   * 嵌入态换发会话的进度。AuthGuard 靠它区分「还没换到」和「换不到」——
   * 只看 token 是否为空会在 App Bridge 就绪前就把商家踢去 /login。
   */
  const [bridgeAuth, setBridgeAuth] = useState<"idle" | "pending" | "done" | "failed">(
    "idle",
  );
  /**
   * Shopify 每次嵌入加载都会把一枚 session token 放在 URL 的 id_token 里。
   * 它和 App Bridge 的 idToken() 是同一种东西，后端换发端点照单全收——
   * 于是初次鉴权根本不需要等 App Bridge。
   */
  const [urlIdToken, setUrlIdToken] = useState("");

  useEffect(() => {
    const fromUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("shop") || ""
        : "";
    const search =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const isEmbedded =
      typeof window !== "undefined" &&
      (search.has("host") || search.get("embedded") === "1" || window.top !== window.self);
    setEmbedded(isEmbedded);
    if (isEmbedded) setBridgeAuth("pending");

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
    // 存着的 JWT 是**绑定到某一个店**的（服务端按 token 里的 shop 解析数据）。
    // URL 指向的店和存的店不是同一个时，那枚 token 属于别人——必须丢掉，
    // 否则同一个人先后打开 A、B 两个店，B 会看到 A 的会话列表。
    // 服务端隔离本身是对的，泄露发生在这里：复用了另一个店的会话。
    const tokenIsForAnotherShop = Boolean(fromUrl && storedShop && fromUrl !== storedShop);
    if (tokenIsForAnotherShop) {
      safeStorageSet(TOKEN_KEY, "");
    }
    const storedToken = fragmentToken || (tokenIsForAnotherShop ? "" : safeStorageGet(TOKEN_KEY));
    if (fragmentToken) safeStorageSet(TOKEN_KEY, fragmentToken);
    // shop 一律落盘：客户端路由跳转会丢掉查询串，之前只在拿到 fragment token 时才存，
    // 于是进到 /inbox 之后 shop 变空，换发条件永远不成立。
    if (nextShop) safeStorageSet(SHOP_KEY, nextShop);

    // id_token 是凭据，用完立刻从地址栏抹掉（有效期约 60 秒）。
    const idTok = search.get("id_token") || "";
    if (idTok) {
      setUrlIdToken(idTok);
      search.delete("id_token");
      const qs = search.toString();
      history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
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

  /** 用一枚 Shopify session token 换本站 JWT。来源可以是 URL 的 id_token，也可以是 App Bridge。 */
  const exchangeSessionToken = useCallback(async (sessionToken: string) => {
    if (!sessionToken || !shop) return;
    const api =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
    const res = await fetch(`${api}/shopify/auth/app-bridge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken }),
    });
    if (!res.ok) {
      throw new Error(`Session token exchange failed (${res.status})`);
    }
    const data = (await res.json()) as { accessToken: string };
    safeStorageSet(SHOP_KEY, shop);
    safeStorageSet(TOKEN_KEY, data.accessToken);
    setToken(data.accessToken);
    return data.accessToken;
  }, [shop]);

  const loginWithAppBridge = useCallback(async () => {
    if (!bridge || !shop) return;
    return exchangeSessionToken(await bridge.idToken());
  }, [bridge, shop, exchangeSessionToken]);

  /**
   * 首选路径：URL 里的 id_token 直接换发，不依赖 App Bridge。
   *
   * 实测 App Bridge 在本站根本起不来——它要求自己是 head 里第一个 <script> 且不带
   * async，而 Next 会把自己的 chunk 排在前面，App Bridge 随即
   * "Aborting"，window.shopify 永远不存在。此前所有商家 API 调用都带着空 token
   * 打出去，整页 401。这条路径把初次鉴权与 App Bridge 解耦。
   */
  useEffect(() => {
    if (!ready || !shop || !urlIdToken) return;
    setBridgeAuth("pending");
    void exchangeSessionToken(urlIdToken)
      .then((t) => setBridgeAuth(t ? "done" : "failed"))
      .catch(() => setBridgeAuth("failed"));
  }, [ready, shop, urlIdToken, exchangeSessionToken]);

  useEffect(() => {
    // App Bridge 可用时也换一次（token 刷新用）。目前它起不来，见上面的注释。
    // 非嵌入场景没有店铺归属证明，只能用 OAuth 回调下发并已落盘的 token，
    // 不再允许「给个 shop 域名就换 token」。
    if (!ready || !shop || !bridge) return;
    setBridgeAuth("pending");
    void loginWithAppBridge()
      .then((t) => setBridgeAuth(t ? "done" : "failed"))
      .catch(() => setBridgeAuth("failed"));
  }, [ready, shop, bridge, loginWithAppBridge]);

  /**
   * 嵌入态兜底：App Bridge 全局迟迟不出现（脚本被拦、非 admin 场景误判）时
   * 解除 pending，否则守卫会永远等下去、页面卡在空壳。
   */
  useEffect(() => {
    if (!embedded || bridgeAuth !== "pending") return;
    const id = window.setTimeout(() => {
      setBridgeAuth((s) => (s === "pending" ? "failed" : s));
    }, 8000);
    return () => window.clearTimeout(id);
  }, [embedded, bridgeAuth]);

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
    embedded,
    bridgeAuth,
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

type ShopSession = ReturnType<typeof useShopSessionState>;

const ShopSessionContext = createContext<ShopSession | null>(null);

/** 挂在根 layout：整棵树共用同一份会话状态。 */
export function ShopSessionProvider({ children }: { children: ReactNode }) {
  const session = useShopSessionState();
  return (
    <ShopSessionContext.Provider value={session}>
      {children}
    </ShopSessionContext.Provider>
  );
}

export function useShopSession(): ShopSession {
  const ctx = useContext(ShopSessionContext);
  if (!ctx) {
    throw new Error("useShopSession 必须在 ShopSessionProvider 内使用");
  }
  return ctx;
}
