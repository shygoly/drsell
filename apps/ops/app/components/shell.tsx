'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Search, Settings } from 'lucide-react';
import { OpsSidebar } from '@/app/components/nav';
import { resolveSearchRoute } from '@/lib/search-route';

type Props = {
  active: 'queue' | 'shops' | 'accounts' | 'audit' | 'plans' | 'system';
  title?: string;
  subtitle?: string;
  meta?: string;
  /** Stitch 稿自带页头与内边距的页面传 false，由页面自己排版 */
  padded?: boolean;
  /** expiry_queue 稿没有顶栏（页头那一行就是顶栏），传 false 避免整页下推 56px */
  chrome?: boolean;
  children: React.ReactNode;
};

/**
 * 全局审计条 —— 对齐 Stitch 屏 05 的 h-8 REC LIVE AUDIT SESSION。
 * 超管面每一次登录都会写审计（INV-3），这条常驻红点条是视觉锚。
 */
function GlobalAuditBar() {
  return (
    <div className="bg-primary-container border-outline-variant fixed top-0 z-[60] flex h-8 w-full items-center justify-center border-b">
      <div className="flex items-center gap-2">
        <span className="bg-error h-2 w-2 rounded-full" />
        <span className="text-error font-label-caps text-label-caps uppercase tracking-wider">
          REC LIVE AUDIT SESSION
        </span>
      </div>
    </div>
  );
}

/** 顶栏：Stitch 超管稿的右上检索/通知/设置。 */
function OpsTopBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(resolveSearchRoute(q));
  }

  return (
    <header className="border-outline-variant bg-background sticky top-8 z-30 flex h-16 shrink-0 items-center justify-end gap-4 border-b px-4 py-2.5">
      <form className="relative flex w-64 min-w-0 items-center" onSubmit={onSearch}>
        <Search
          className="text-on-surface-variant pointer-events-none absolute left-2.5 h-4 w-4"
          aria-hidden="true"
        />
        <label className="sr-only" htmlFor="ops-global-search">
          搜索店铺或账号
        </label>
        <input
          id="ops-global-search"
          type="search"
          placeholder="搜索店铺、账号…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-surface-container-low border-outline-variant font-data-mono text-on-surface focus:border-primary focus:ring-primary h-8 w-full border py-1 pl-8 pr-3 text-[12px] outline-none focus-visible:ring-1"
        />
      </form>
      <div className="flex shrink-0 items-center gap-1 text-on-surface-variant">
        <button
          type="button"
          aria-label="通知"
          className="hover:text-on-surface flex h-8 w-8 items-center justify-center border border-transparent transition-colors"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="设置"
          className="hover:text-on-surface flex h-8 w-8 items-center justify-center border border-transparent transition-colors"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export function OpsShell({ active, title, subtitle, meta, padded = true, chrome = true, children }: Props) {
  return (
    <div className="bg-background min-h-screen">
      <GlobalAuditBar />
      <OpsSidebar active={active} />
      <div className="ml-[240px] flex min-h-screen min-w-0 flex-col pt-8">
        {chrome ? <OpsTopBar /> : null}
        <main
          className={
            padded
              ? 'min-w-0 flex-1 px-7 pb-12 pt-6'
              : 'flex min-w-0 flex-1 flex-col overflow-hidden'
          }
        >
          {(title || meta) && (
            <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                {title ? (
                  <h1 className="text-on-surface font-display m-0 mb-1.5 text-[clamp(22px,3vw,28px)] font-bold tracking-[-0.015em]">
                    {title}
                  </h1>
                ) : null}
                {subtitle ? (
                  <p className="text-on-surface-variant m-0 text-[13.5px]">{subtitle}</p>
                ) : null}
              </div>
              {meta ? (
                <span className="font-data text-on-surface-variant whitespace-nowrap text-[13.5px]">
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
