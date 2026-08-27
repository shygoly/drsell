'use client';

import { Suspense, useState } from 'react';
import { Page, TextField, Button, BlockStack, Text, Banner } from '@shopify/polaris';
import { apiFetch } from '@/lib/api';
import { useShopSession } from '@/hooks/useShopSession';

function SettingsInner() {
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
    setStatus('已保存');
  }

  return (
    <Page title="机器人设置">
      <BlockStack gap="400">
        <Banner tone="info">
          AI 知识库（政策页抓取、FAQ 模板）将在后续版本开放，请先完成店铺 Widget 上线。
        </Banner>
        <TextField
          label="Shop domain"
          value={shop}
          onChange={setShop}
          autoComplete="off"
        />
        <Button onClick={() => void login()}>登录店铺会话</Button>
        <TextField
          label="Chat logo URL"
          value={chatLogo}
          onChange={setChatLogo}
          autoComplete="off"
        />
        <Button variant="primary" disabled={!token} onClick={() => void save()}>
          保存
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
