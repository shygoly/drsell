"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useShopSession } from "@/hooks/useShopSession";
import { fetchOnboarding } from "@/lib/onboarding";

/**
 * 首次进入守卫：embedded 商店会话存在且未完成向导时，把用户带到 /onboarding。
 * /onboarding 与 /login 不挂载本组件，避免循环。
 */
export function OnboardingGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { shop, token, ready } = useShopSession();
  const checked = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !shop || !token) return;
    if (pathname === "/onboarding" || pathname === "/login") return;
    const cacheKey = `${shop}:${pathname}`;
    if (checked.current === cacheKey) return;

    let cancelled = false;
    void fetchOnboarding(shop, token)
      .then((state) => {
        if (cancelled) return;
        checked.current = cacheKey;
        if (state.step !== "done") {
          router.replace("/onboarding");
        }
      })
      .catch(() => {
        // 读取失败（例如 token 尚未就绪）不阻塞 dashboard；token 更新后重试
      });
    return () => {
      cancelled = true;
    };
  }, [ready, shop, token, pathname, router]);

  return null;
}
