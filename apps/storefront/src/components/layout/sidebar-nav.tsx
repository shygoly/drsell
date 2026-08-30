"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  FileText,
  HelpCircle,
  Home,
  MessageSquare,
  Plus,
  Puzzle,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 侧边栏 — 对齐 Stitch home_dashboard/code.html 的 SideNavBar。
 * 稿中结构：品牌块 → New Automation CTA → 主导航 7 项 → border-t 分隔的底部 2 项。
 * 图标映射（Material Symbols → lucide）见 docs/stitch-to-shadcn-plan.md 组件映射表。
 */
const MAIN_ITEMS = [
  { href: "/", label: "Home", icon: Home }, // home
  { href: "/inbox", label: "Inbox", icon: MessageSquare }, // chat_bubble
  { href: "/ai-assistant", label: "AI Assistant", icon: Bot }, // smart_toy
  { href: "/widget-config", label: "Widget Config", icon: Puzzle }, // settings_input_component
  { href: "/customers", label: "Customers", icon: Users }, // group
  { href: "/analytics", label: "Analytics", icon: BarChart3 }, // bar_chart
  { href: "/settings", label: "Settings", icon: Settings }, // settings
];

const FOOTER_ITEMS = [
  { href: "/support", label: "Support", icon: HelpCircle }, // help
  { href: "/documentation", label: "Documentation", icon: FileText }, // description
];

export function SidebarNav() {
  const pathname = usePathname();

  const renderItem = (item: { href: string; label: string; icon: typeof Home }) => {
    const active = pathname === item.href;
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-4 rounded-lg px-3 py-2 text-sm transition-colors",
            active
              ? // 稿中激活态：淡底 + 右侧 4px 主色条
                "bg-primary-container/10 text-primary border-primary border-r-4 font-semibold"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label="Main navigation"
      className="bg-card hidden h-screen w-64 shrink-0 flex-col border-r md:flex"
    >
      <div className="flex items-center gap-2 p-6">
        <div className="bg-primary-container text-primary-foreground flex h-10 w-10 items-center justify-center rounded-lg">
          <Bot className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg leading-tight font-bold">AIChat</h1>
          <p className="text-muted-foreground text-[13px]">Green Tech AI</p>
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          type="button"
          className="bg-primary-container text-primary-foreground flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Automation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-1 px-4">{MAIN_ITEMS.map(renderItem)}</ul>
      </div>

      <div className="border-t p-4">
        <ul className="space-y-1">{FOOTER_ITEMS.map(renderItem)}</ul>
      </div>
    </nav>
  );
}
