'use client';

import { Suspense, useState } from 'react';
import { Page, TextField, Button, BlockStack, Text, Banner } from '@shopify/polaris';
import { apiFetch } from '@/lib/api';
import { useShopSession } from '@/hooks/useShopSession';
import { useTranslations } from '@/components/AppProviders';

function SettingsInner() {
  const t = useTranslations();
  const { shop, token, setShop, login } = useShopSession();
  const [chatLogo, setChatLogo] = useState('');
  const [status, setStatus] = useState('');

  async function save() {
    if (!token || !shop) return;
    await apiFetch(`/shopify/botSettings/shop/${encodeURIComponent(shop)}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ chatLogo, shopName: shop }),
    });
    setStatus(t('settings.saved'));
  }

  return (
    <Page title={t('settings.title')}>
      <BlockStack gap="400">
        <Banner tone="info">{t('settings.kbBanner')}</Banner>
        <TextField
          label={t('settings.shopDomain')}
          value={shop}
          onChange={setShop}
          autoComplete="off"
        />
        <Button onClick={() => void login()}>{t('settings.connect')}</Button>
        <TextField
          label={t('settings.chatLogo')}
          value={chatLogo}
          onChange={setChatLogo}
          autoComplete="off"
        />
        <Button variant="primary" disabled={!token} onClick={() => void save()}>
          {t('settings.save')}
        </Button>
        {status && <Text as="p">{status}</Text>}
      </BlockStack>
    </Page>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SettingsInner />
    </Suspense>
  );
}
