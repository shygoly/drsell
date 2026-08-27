'use client';

import { useEffect } from 'react';
import {
  Banner,
  Button,
  Card,
  Select,
  TextField,
  Text,
  BlockStack,
} from '@shopify/polaris';
import { useTranslations } from '@/components/AppProviders';
import { buildEmbedDeepLink } from '@/lib/onboarding';
import { useEmbedStatus } from '@/hooks/useEmbedStatus';

export function WidgetStep({
  color,
  position,
  welcome,
  onChange,
  onLive,
}: {
  color: string;
  position: 'bottom-right' | 'bottom-left';
  welcome: string;
  onChange: (patch: {
    color?: string;
    position?: 'bottom-right' | 'bottom-left';
    welcome?: string;
  }) => void;
  onLive: () => void;
}) {
  const t = useTranslations();
  const { live, loading } = useEmbedStatus();

  useEffect(() => {
    if (live) onLive();
  }, [live, onLive]);

  const openThemeEditor = () => {
    const url = buildEmbedDeepLink();
    window.open(url, '_top');
  };

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingLg">
          {t('onboarding.step3.title')}
        </Text>
        <TextField
          label={t('onboarding.step3.color')}
          value={color}
          onChange={(v) => onChange({ color: v })}
          autoComplete="off"
        />
        <Select
          label={t('onboarding.step3.position')}
          options={[
            { label: t('onboarding.step3.positionRight'), value: 'bottom-right' },
            { label: t('onboarding.step3.positionLeft'), value: 'bottom-left' },
          ]}
          value={position}
          onChange={(v) => onChange({ position: v as 'bottom-right' | 'bottom-left' })}
        />
        <TextField
          label={t('onboarding.step3.welcome')}
          value={welcome}
          onChange={(v) => onChange({ welcome: v })}
          autoComplete="off"
        />
        <Button variant="primary" onClick={openThemeEditor}>
          {t('onboarding.step3.enable')}
        </Button>
        {loading && !live && (
          <Banner tone="info">{t('onboarding.step3.waiting')}</Banner>
        )}
        {live && <Banner tone="success">{t('onboarding.step3.live')}</Banner>}
      </BlockStack>
    </Card>
  );
}
