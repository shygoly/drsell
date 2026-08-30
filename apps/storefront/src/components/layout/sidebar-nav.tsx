"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Home, MessageSquare, Puzzle } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/ai-assistant", label: "AI Assistant", icon: Bot },
  { href: "/widget-config", label: "Widget Config", icon: Puzzle },
];

export function SidebarNav() {
  const pathname = usePathname();

  const renderItem = (item: (typeof NAV_ITEMS)[number]) => {
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
              ? "bg-primary/10 font-semibold text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
        <div className="bg-primary flex h-10 w-10 items-center justify-center rounded-lg text-primary-foreground">
          <Bot className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg leading-tight font-bold">AIChat</h1>
          <p className="text-muted-foreground text-[13px]">Green Tech AI</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-1 px-4">{NAV_ITEMS.map(renderItem)}</ul>
      </div>
    </nav>
  );
}
