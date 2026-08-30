'use client';

import { Banner } from '@shopify/polaris';
import { useTranslations } from '@/components/AppProviders';
import { openEmbedDeepLink } from '@/lib/onboarding';

export function EmbedStatusBanner({ live, shop }: { live: boolean; shop: string }) {
  const t = useTranslations();

  if (live) {
    return <Banner tone="success">{t('embed.banner.live')}</Banner>;
  }

  return (
    <Banner
      tone="warning"
      action={{
        content: t('embed.banner.enable'),
        onAction: () => openEmbedDeepLink(shop),
      }}
    >
      {t('embed.banner.notDeployed')}
    </Banner>
  );
}
