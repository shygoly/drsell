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
 */
export function AuthGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { token, userToken, ready } = useShopSession();

  useEffect(() => {
    if (!ready) return;
    if (PUBLIC_PATHS.has(pathname)) return;
    if (token || userToken) return;
    router.replace("/login");
  }, [ready, pathname, token, userToken, router]);

  return null;
}
