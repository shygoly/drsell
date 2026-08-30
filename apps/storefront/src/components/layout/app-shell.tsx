"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, HelpCircle, Search } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * AppShell — 由 Stitch 导出 HTML 的 SideNavBar + TopNavBar 提炼的共享布局。
 * 映射：Material Symbols 图标 → lucide-react（见 docs/stitch-to-shadcn-plan.md 组件映射表）。
 *
 * 注：稿中的 StatusBanner 只出现在 home_dashboard，不在其余三屏，
 * 因此它归首页（app/page.tsx）而非本共享壳。
 */
const TOP_TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav />
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="bg-card flex h-14 w-full shrink-0 items-center justify-between border-b px-5">
          <div className="flex h-full items-center gap-6">
            <div className="text-primary font-semibold md:hidden">AIChat</div>
            <div className="relative hidden md:block">
              <Search
                className="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Search..."
                className="bg-card border-input focus:border-ring focus:ring-ring/20 w-64 rounded-lg border py-1.5 pr-3 pl-8 text-sm outline-none focus:ring-2"
              />
            </div>
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
            <Button variant="outline" size="sm" className="hidden md:inline-flex">
              Quick Settings
            </Button>
            <Button size="sm" className="hidden md:inline-flex">
              Test Widget
            </Button>
            <div className="text-muted-foreground flex items-center gap-2">
              <button
                type="button"
                aria-label="Notifications"
                className="hover:bg-muted rounded-full p-1 transition-colors"
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Help"
                className="hover:bg-muted rounded-full p-1 transition-colors"
              >
                <HelpCircle className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {/* 稿中此处为外链头像图；改用首字母头像，避免依赖外部图片资源 */}
            <div className="bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium">
              MC
            </div>
          </div>
        </header>
        <main className="bg-background flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
