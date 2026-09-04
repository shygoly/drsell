'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Page, BlockStack, Text } from '@shopify/polaris';
import { useShopSession } from '@/hooks/useShopSession';
import { fetchOnboarding } from '@/lib/onboarding';
import { EmbedStatusBanner } from '@/components/EmbedStatusBanner';
import { useTranslations } from '@/components/AppProviders';

function AppHomeInner() {
  const t = useTranslations();
  const router = useRouter();
  const { shop, token, ready } = useShopSession();
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (!ready || !shop || !token) return;
    void fetchOnboarding(shop, token).then((s) => {
      if (!s.activated && s.step !== 'done') {
        router.replace('/app/onboarding');
        return;
      }
      setActivated(s.activated);
    });
  }, [ready, shop, token, router]);

  if (!ready) return <p>Loading…</p>;

  return (
    <Page title="Drsell">
      <BlockStack gap="400">
        <EmbedStatusBanner live={activated} shop={shop} />
        <Text as="p" tone="subdued">
          {t('home.store')}: {shop || '—'}
        </Text>
        <nav className="nav">
          <Link href="/app/settings">{t('nav.settings')}</Link>
          <Link href="/app/inbox">{t('nav.inbox')}</Link>
        </nav>
      </BlockStack>
    </Page>
  );
}

export default function AppHomePage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <AppHomeInner />
    </Suspense>
  );
}
