'use client';

import Link from 'next/link';
import { BellRing, LogOut, Search, ShieldCheck } from 'lucide-react';
import { OpsSidebar } from '@/app/components/nav';
import { clearToken } from '@/lib/auth';

type Props = {
  active: 'queue' | 'shops' | 'accounts' | 'audit' | 'plans' | 'system' | 'impersonation';
  title?: string;
  subtitle?: string;
  meta?: string;
  /** Stitch 稿自带页头与内边距的页面传 false，由页面自己排版 */
  padded?: boolean;
  /**
   * 顶部装饰。稿子四屏各不相同，实测：
   * 屏 05 只有 32px 审计条（main mt-8）；屏 08 只有 48px 顶栏（main mt-row-height-standard）；
   * 屏 02 两者都有；屏 07 用自己的横幅。固定 80px 会让每屏都错位。
   */
  chrome?: 'topbar' | 'audit' | 'both';
  /**
   * 置顶通栏。稿子屏 07 把冒名横幅放在全局顶栏**之上**（y 0-63），
   * 其余层依次下移；有 banner 时不再叠加 REC 审计条（稿子 07 也没有）。
   */
  banner?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * 全局审计条 —— 对齐 Stitch 屏 05 的 h-8 REC LIVE AUDIT SESSION。
 * 超管面每一次登录都会写审计（INV-3），这条常驻红点条是视觉锚。
 */
function GlobalAuditBar({ offsetTop = 0 }: { offsetTop?: number }) {
  return (
    <div className="bg-primary-container border-card-border fixed z-[55] flex h-8 w-full items-center justify-center border-b"
      style={{ top: offsetTop }}>
      <div className="flex items-center gap-2">
        <span className="bg-error blinking-rec h-2 w-2 rounded-full" />
        <span className="text-error font-label-caps text-label-caps uppercase tracking-wider">
          REC LIVE AUDIT SESSION
        </span>
      </div>
    </div>
  );
}


/**
 * 全局顶栏 —— 对齐 Stitch 屏 02/08 的 h-row-height-standard(48px) 顶栏。
 * spacing 令牌按 skill 门禁第 5 条不迁移，一律 arbitrary：
 * row-height-standard 48px / container-padding 24px。
 */
function GlobalTopBar({ offsetTop = 0, insetLeft = 0 }: { offsetTop?: number; insetLeft?: number }) {
  return (
    <header className="bg-surface-container-highest border-outline-variant fixed z-[60] flex h-[48px] items-center justify-between border-b px-[24px]"
      style={{ top: offsetTop, left: insetLeft, width: `calc(100% - ${insetLeft}px)` }}>
      <div className="flex h-full min-w-0 items-center gap-6">
        <span className="font-headline-md text-headline-md text-primary flex shrink-0 items-center whitespace-nowrap font-bold">
          drsell Admin
        </span>
        <nav className="hidden h-full shrink-0 items-center gap-4 md:flex">
          <Link
          href="/system"
          className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface flex h-full shrink-0 items-center whitespace-nowrap border-b-2 border-transparent px-4 font-medium no-underline transition-colors"
          >
          系统健康
        </Link>
          <Link
          href="/audit"
          className="text-on-surface-variant hover:bg-surface-variant hover:text-on-surface flex h-full shrink-0 items-center whitespace-nowrap border-b-2 border-transparent px-4 font-medium no-underline transition-colors"
          >
          审计日志
        </Link>
        </nav>
        <div className="group relative hidden h-full w-full max-w-md min-w-0 items-center lg:flex">
          <Search
            className="text-on-surface-variant group-focus-within:text-primary absolute left-3 z-10 h-4 w-4 transition-colors"
            aria-hidden="true"
          />
          <span className="sr-only">按邮箱、域名或用户 ID 检索</span>
          <input
            type="search"
            placeholder="按邮箱、域名或用户 ID 检索"
            className="bg-background border-outline-variant text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-primary font-body-sm text-body-sm h-8 w-full rounded border py-1.5 pl-10 pr-16 transition-all focus:ring-1"
          />
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
            {['⌘', 'K'].map((k) => (
              <kbd
                key={k}
                className="border-outline-variant text-on-surface-variant bg-surface-container-high rounded border px-1.5 py-0.5 text-[10px] leading-none"
              >
                {k}
              </kbd>
            ))}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-on-surface-variant flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          <BellRing className="h-5 w-5" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => {
            clearToken();
            window.location.href = '/login';
          }}
          className="border-outline-variant text-on-surface hover:bg-surface-variant flex items-center gap-2 rounded border px-3 py-1.5 text-sm transition-colors"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          End Session
        </button>
      </div>
    </header>
  );
}

export function OpsShell({
  active,
  title,
  subtitle,
  meta,
  padded = true,
  chrome = 'both',
  banner,
  children,
}: Props) {
  const showTopBar = !banner && (chrome === 'topbar' || chrome === 'both');
  const showAudit = !banner && (chrome === 'audit' || chrome === 'both');
  const chromeH = (showTopBar ? 48 : 0) + (showAudit ? 32 : 0);
  // 稿子 07：横幅 64px 通栏，侧栏紧接其下；顶栏只覆盖内容区。
  const sidebarTop = banner ? 64 : chromeH;
  const contentTop = banner ? 112 : chromeH;
  return (
    <div className="bg-background min-h-screen">
      {banner ? (
        <div className="fixed top-0 z-[70] h-16 w-full">{banner}</div>
      ) : null}
      {banner || showTopBar ? (
        <GlobalTopBar offsetTop={banner ? 64 : 0} insetLeft={banner ? 240 : 0} />
      ) : null}
      {showAudit ? <GlobalAuditBar offsetTop={showTopBar ? 48 : 0} /> : null}
      <OpsSidebar active={active} offsetTop={sidebarTop} />
      <div
        className="ml-[240px] flex min-h-screen min-w-0 flex-col"
        style={{ paddingTop: contentTop }}
      >
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
