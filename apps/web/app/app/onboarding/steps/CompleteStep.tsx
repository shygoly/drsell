'use client';

import { Button, Card, Text, BlockStack, List } from '@shopify/polaris';
import { useTranslations } from '@/components/AppProviders';

export function CompleteStep({
  shop,
  onDone,
}: {
  shop: string;
  onDone: () => void;
}) {
  const t = useTranslations();
  const storeUrl = shop ? `https://${shop.replace(/^https?:\/\//, '')}` : '#';

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingLg">
          {t('onboarding.step5.title')}
        </Text>
        <Text as="p" tone="subdued">
          {t('onboarding.step5.subtitle')}
        </Text>
        <List type="bullet">
          <List.Item>{t('onboarding.step5.next1')}</List.Item>
          <List.Item>{t('onboarding.step5.next2')}</List.Item>
          <List.Item>{t('onboarding.step5.next3')}</List.Item>
        </List>
        <Button url={storeUrl} external>
          {t('onboarding.step5.viewStore')}
        </Button>
        <Button variant="primary" onClick={onDone}>
          {t('onboarding.step5.goHome')}
        </Button>
      </BlockStack>
    </Card>
  );
}
