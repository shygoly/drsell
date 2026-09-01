'use client';

import { OpsSidebar } from '@/app/components/nav';

type Props = {
  active: 'queue' | 'shops' | 'accounts' | 'audit' | 'plans' | 'system' | 'impersonation';
  title?: string;
  subtitle?: string;
  meta?: string;
  /** Stitch 稿自带页头与内边距的页面传 false，由页面自己排版 */
  padded?: boolean;
  /** 保留参数（历史调用兼容）。壳本身不再叠加第二层顶栏。 */
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
        <span className="bg-error blinking-rec h-2 w-2 rounded-full" />
        <span className="text-error font-label-caps text-label-caps uppercase tracking-wider">
          REC LIVE AUDIT SESSION
        </span>
      </div>
    </div>
  );
}

export function OpsShell({ active, title, subtitle, meta, padded = true, children }: Props) {
  return (
    <div className="bg-background min-h-screen">
      <GlobalAuditBar />
      <OpsSidebar active={active} />
      <div className="ml-[240px] flex min-h-screen min-w-0 flex-col pt-8">
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
