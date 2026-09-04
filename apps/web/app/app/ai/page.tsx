'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useTranslations } from '@/components/AppProviders';

export default function AiAssistantPage() {
  const t = useTranslations();
  const [shop, setShop] = useState('');
  const [token, setToken] = useState('');
  const [text, setText] = useState('Hello');
  const [out, setOut] = useState('');

  async function login() {
    const res = await apiFetch<{ accessToken: string }>('/shopify/auth/login', {
      method: 'POST',
      body: JSON.stringify({ shop }),
    });
    setToken(res.accessToken);
  }

  async function chat() {
    setOut(t('ai.connecting'));
    const res = await fetch('/api/backend/adp/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ shopDomain: shop, text }),
    });
    const reader = res.body?.getReader();
    if (!reader) {
      setOut(await res.text());
      return;
    }
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      setOut(buf);
    }
  }

  return (
    <div className="panel">
      <h2>{t('ai.title')}</h2>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <input value={shop} onChange={(e) => setShop(e.target.value)} placeholder={t('ai.shopPlaceholder')} />
        <button className="btn" type="button" onClick={login}>{t('ai.login')}</button>
        <input value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" type="button" disabled={!token} onClick={chat}>{t('ai.send')}</button>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{out}</pre>
      </div>
    </div>
  );
}
