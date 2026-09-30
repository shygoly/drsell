"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarNav } from "./sidebar-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useShopSession } from "@/hooks/useShopSession";
import { AuthGuard } from "@/components/business/auth-guard";
import { OnboardingGuard } from "@/components/business/onboarding-guard";
import { StoreSwitcher } from "@/components/business/store-switcher";

/**
 * AppShell — 由 Stitch 导出 HTML 的 SideNavBar + TopNavBar 提炼的共享布局。
 * 映射：Material Symbols 图标 → lucide-react（见 docs/stitch-to-shadcn-plan.md 组件映射表）。
 *
 * 注：稿中的 StatusBanner 只出现在 home_dashboard，不在其余三屏，
 * 因此它归首页（app/page.tsx）而非本共享壳。
 */
const TOP_TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { userEmail, userToken, bridge, embedded, logout } = useShopSession();

  // Stitch onboarding_welcome 是独立欢迎屏，不含 Sidebar/TopBar。
  // /login 也是独立认证页，不套后台壳。
  if (pathname === "/onboarding" || pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <>
      <AuthGuard />
      <OnboardingGuard />
      <div className="flex h-screen overflow-hidden">
      <SidebarNav />
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="bg-card flex h-14 w-full shrink-0 items-center justify-between border-b px-5">
          <div className="flex h-full items-center gap-6">
            <div className="text-primary font-semibold md:hidden">Pichat</div>
            {/* 稿中此处为全局搜索框：目前无搜索后端，暂移除以免出现点了没反应的死控件。 */}
            <nav
              aria-label="Section navigation"
              className="hidden h-full items-center gap-4 md:flex"
            >
              {TOP_TABS.map((tab) => {
                const active = pathname === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-full items-center text-sm transition-opacity",
                      active
                        ? "text-primary border-primary mt-[2px] border-b-2 pb-1 font-bold"
                        : "text-muted-foreground hover:text-primary opacity-80 hover:opacity-100",
                    )}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {!bridge && userToken ? <StoreSwitcher /> : null}
            <Button variant="outline" size="sm" asChild className="hidden md:inline-flex">
              <Link href="/settings">Quick Settings</Link>
            </Button>
            <Button size="sm" asChild className="hidden md:inline-flex">
              <Link href="/widget-config">Test Widget</Link>
            </Button>
            {/* 通知铃铛/帮助图标原为 Stitch 稿占位：无通知系统，帮助只指向 ComingSoon 页。
                按「不暴露未完成功能」原则（见 sidebar-nav 注释）先移除，等有功能再放回。 */}
            {/* 稿中此处为外链头像图；改用首字母头像，避免依赖外部图片资源 */}
            {userEmail ? (
              <div className="flex items-center gap-2">
                <div className="bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium">
                  {userEmail.slice(0, 1).toUpperCase()}
                </div>
                <span className="text-muted-foreground hidden max-w-[160px] truncate text-xs lg:inline">
                  {userEmail}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    logout();
                    window.location.href = "/login";
                  }}
                >
                  Log out
                </Button>
              </div>
            ) : embedded ? null : (
              // 嵌入态不显示登录入口：商家已经由 Shopify 认证，
              // 在 admin 里再摆一个「Log in」正是审核判定「要求二次登录」的特征。
              <Button size="sm" asChild>
                <Link href="/login">Log in</Link>
              </Button>
            )}
          </div>
        </header>
        <main className="bg-background flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      </div>
    </>
  );
}
