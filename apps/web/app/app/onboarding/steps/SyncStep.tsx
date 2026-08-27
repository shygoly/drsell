'use client';

import {
  Banner,
  Button,
  Card,
  Checkbox,
  ProgressBar,
  Text,
  BlockStack,
} from '@shopify/polaris';
import type { SyncStatus } from '@drsell/shared';
import { useTranslations } from '@/components/AppProviders';

export function SyncStep({
  syncProducts,
  syncOrders,
  syncCustomers,
  onToggle,
  syncStatus,
  onContinue,
}: {
  syncProducts: boolean;
  syncOrders: boolean;
  syncCustomers: boolean;
  onToggle: (key: 'products' | 'orders' | 'customers', v: boolean) => void;
  syncStatus: SyncStatus | null;
  onContinue: () => void;
}) {
  const t = useTranslations();

  const row = (kind: keyof SyncStatus, label: string, checked: boolean) => {
    const st = syncStatus?.[kind];
    const progress =
      st?.status === 'running' ? 50 : st?.status === 'done' ? 100 : st?.status === 'failed' ? 100 : 0;
    return (
      <BlockStack gap="200" key={kind}>
        <Checkbox
          label={label}
          checked={checked}
          onChange={(v) => onToggle(kind, v)}
        />
        {checked && st && (
          <BlockStack gap="100">
            <Text as="p" tone="subdued" variant="bodySm">
              {st.status} {st.count != null ? `(${st.count})` : ''}
            </Text>
            <ProgressBar progress={progress} size="small" />
          </BlockStack>
        )}
      </BlockStack>
    );
  };

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingLg">
          {t('onboarding.step2.title')}
        </Text>
        <Text as="p" tone="subdued">
          {t('onboarding.step2.subtitle')}
        </Text>
        {row('products', t('onboarding.step2.products'), syncProducts)}
        {row('orders', t('onboarding.step2.orders'), syncOrders)}
        {row('customers', t('onboarding.step2.customers'), syncCustomers)}
        <Button variant="primary" onClick={onContinue}>
          {t('onboarding.step2.continue')}
        </Button>
      </BlockStack>
    </Card>
  );
}
