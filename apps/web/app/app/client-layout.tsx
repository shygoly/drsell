'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AppProviders } from '@/components/AppProviders';
import { useShopSession } from '@/hooks/useShopSession';
import { resolveLocale } from '@/lib/i18n';

function AppShellInner({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const locale = resolveLocale(params.get('locale'));
  const { isImpersonating } = useShopSession();

  return (
    <AppProviders locale={locale}>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '1rem' }}>
        {isImpersonating ? (
          <div role="status" className="impersonation-banner">
            代登录模式 — 操作将记入审计，30 分钟后失效
          </div>
        ) : null}
        <nav className="nav">
          <Link href="/app">首页</Link>
          <Link href="/app/settings">设置</Link>
          <Link href="/app/onboarding">向导</Link>
        </nav>
        {children}
      </main>
    </AppProviders>
  );
}

export default function ClientAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<main>{children}</main>}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
