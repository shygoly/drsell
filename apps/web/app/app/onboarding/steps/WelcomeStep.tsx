'use client';

import { Banner, Button, Card, Text, BlockStack, InlineStack } from '@shopify/polaris';
import { useTranslations } from '@/components/AppProviders';

export function WelcomeStep({
  onStart,
  onSkip,
}: {
  onStart: () => void;
  onSkip: () => void;
}) {
  const t = useTranslations();

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingLg">
          {t('onboarding.step1.title')}
        </Text>
        <Text as="p" tone="subdued">
          {t('onboarding.step1.subtitle')}
        </Text>
        <BlockStack gap="200">
          <Text as="p">• {t('onboarding.step1.products')}</Text>
          <Text as="p">• {t('onboarding.step1.orders')}</Text>
          <Text as="p">• {t('onboarding.step1.customers')}</Text>
        </BlockStack>
        <InlineStack gap="300">
          <Button variant="primary" onClick={onStart}>
            {t('onboarding.step1.start')}
          </Button>
          <Button onClick={onSkip}>{t('onboarding.step1.skip')}</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
