'use client';

import { Bell, Search, Settings } from 'lucide-react';
import { OpsSidebar } from '@/app/components/nav';

type Props = {
  active: 'queue' | 'shops' | 'accounts' | 'audit' | 'plans';
  title?: string;
  subtitle?: string;
  meta?: string;
  /** Stitch 稿自带页头与内边距的页面传 false，由页面自己排版 */
  padded?: boolean;
  children: React.ReactNode;
};

/** 顶栏：Stitch 两稿都有，线上原先缺。全局检索是运营最高频的入口——
 *  工单进来时手上往往只有一个店铺域名。 */
function OpsTopBar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-7 py-2.5">
      <label className="relative flex min-w-0 max-w-md flex-1 items-center">
        <Search
          className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">搜索店铺、账号或操作记录</span>
        <input
          type="search"
          placeholder="搜索店铺、账号或操作记录"
          className="h-8 w-full rounded-sm border border-input bg-background py-1 pl-8 pr-3 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </label>
      <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
        <button
          type="button"
          aria-label="通知"
          className="rounded-sm p-1.5 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="设置"
          className="rounded-sm p-1.5 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export function OpsShell({ active, title, subtitle, meta, padded = true, children }: Props) {
  return (
    <div className="flex min-h-screen">
      <OpsSidebar active={active} />
      <div className="flex min-w-0 flex-1 flex-col">
        <OpsTopBar />
        <main className={padded ? "min-w-0 flex-1 px-7 pb-12 pt-6" : "flex min-w-0 flex-1 flex-col overflow-hidden"}>
          {(title || meta) && (
            <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                {title ? (
                  <h1 className="font-display m-0 mb-1.5 text-[clamp(22px,3vw,28px)] font-bold tracking-[-0.015em]">
                    {title}
                  </h1>
                ) : null}
                {subtitle ? (
                  <p className="m-0 text-[13.5px] text-muted-foreground">{subtitle}</p>
                ) : null}
              </div>
              {meta ? (
                <span className="font-data whitespace-nowrap text-[13.5px] text-muted-foreground">
                  {meta}
                </span>
              ) : null}
            </header>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
