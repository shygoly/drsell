'use client';

import { Banner, Button } from '@shopify/polaris';
import { useTranslations } from '@/components/AppProviders';
import { buildEmbedDeepLink } from '@/lib/onboarding';

export function EmbedStatusBanner({ live }: { live: boolean }) {
  const t = useTranslations();

  if (live) {
    return <Banner tone="success">{t('embed.banner.live')}</Banner>;
  }

  return (
    <Banner
      tone="warning"
      action={{ content: t('embed.banner.enable'), onAction: () => window.open(buildEmbedDeepLink(), '_top') }}
    >
      {t('embed.banner.notDeployed')}
    </Banner>
  );
}
