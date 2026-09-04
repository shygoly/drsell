"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useShopSession } from "@/hooks/useShopSession";

const PUBLIC_PATHS = new Set(["/login"]);

/**
 * 会话守卫：没有店铺会话（App Bridge / OAuth 下发）也没有用户会话时，一律送去 /login。
 *
 * 数据侧的真正边界在后端（所有 /api/storefront/* 都要求 token 并按 token 圈定店铺），
 * 这里只负责不让未登录的人停在一个永远加载失败的空壳后台上。
 *
 * 嵌入态例外：Shopify admin 里 App Bridge 换发会话是异步的（先轮询 window.shopify，
 * 再发一次换发请求），而 ready 是同步就绪的。只看 token 空不空会在换发完成前
 * 就把商家踢到 /login——那正是「Shopify 后台里出现第三方登录页」的成因，
 * 也是嵌入应用的必驳项。所以嵌入态必须等 bridgeAuth 有结论再决定。
 */
export function AuthGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { token, userToken, ready, embedded, bridgeAuth } = useShopSession();

  useEffect(() => {
    if (!ready) return;
    if (PUBLIC_PATHS.has(pathname)) return;
    if (token || userToken) return;
    if (embedded && bridgeAuth !== "failed") return;
    router.replace("/login");
  }, [ready, pathname, token, userToken, embedded, bridgeAuth, router]);

  return null;
}
