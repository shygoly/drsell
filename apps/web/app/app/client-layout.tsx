'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AppProviders } from '@/components/AppProviders';
import { useShopSession } from '@/hooks/useShopSession';
import { createTranslator, resolveLocale } from '@/lib/i18n';

function AppShellInner({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const locale = resolveLocale(params.get('locale'));
  const t = createTranslator(locale);
  const { isImpersonating } = useShopSession();

  return (
    <AppProviders locale={locale}>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '1rem' }}>
        {isImpersonating ? (
          <div role="status" className="impersonation-banner">
            {t('app.impersonation')}
          </div>
        ) : null}
        <nav className="nav">
          <Link href="/app">{t('nav.home')}</Link>
          <Link href="/app/settings">{t('nav.settings')}</Link>
          <Link href="/app/onboarding">{t('nav.onboarding')}</Link>
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
