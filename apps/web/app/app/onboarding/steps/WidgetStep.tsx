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
  InlineStack,
} from '@shopify/polaris';
import { useTranslations } from '@/components/AppProviders';
import { openEmbedDeepLink } from '@/lib/onboarding';
import { useEmbedStatus } from '@/hooks/useEmbedStatus';

export function WidgetStep({
  shop,
  color,
  position,
  welcome,
  onChange,
  onLive,
}: {
  shop: string;
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
        <Banner tone="info">{t('onboarding.step3.manualHint')}</Banner>
        <InlineStack gap="300">
          <Button variant="primary" onClick={() => openEmbedDeepLink(shop)}>
            {t('onboarding.step3.enable')}
          </Button>
          {!live && (
            <Button onClick={() => onLive()}>{t('onboarding.step3.confirmEnabled')}</Button>
          )}
        </InlineStack>
        {loading && !live && (
          <Banner tone="info">{t('onboarding.step3.waiting')}</Banner>
        )}
        {live && <Banner tone="success">{t('onboarding.step3.live')}</Banner>}
      </BlockStack>
    </Card>
  );
}
