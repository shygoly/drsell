import { SidebarNav } from "./sidebar-nav";

/**
 * AppShell — 由 Stitch 导出 HTML 的 SideNavBar + TopNavBar 提炼的共享布局。
 * 映射：Material Symbols 图标 → lucide-react（见 docs/stitch-to-shadcn-plan.md 组件映射表）。
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav />
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="bg-card flex h-14 w-full shrink-0 items-center justify-between border-b px-5">
          <div className="flex items-center gap-6">
            <div className="font-semibold text-primary md:hidden">AIChat</div>
            <div className="relative hidden md:block">
              <svg
                className="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                className="bg-card border-input focus:border-ring focus:ring-ring/20 w-64 rounded-lg border py-1.5 pr-3 pl-8 text-sm outline-none focus:ring-2"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-medium">
              Free plan
            </span>
            <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium">
              MC
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-background p-6">{children}</main>
      </div>
    </div>
  );
}
