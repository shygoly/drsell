'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function AiAssistantPage() {
  const [shop, setShop] = useState('');
  const [token, setToken] = useState('');
  const [text, setText] = useState('你好');
  const [out, setOut] = useState('');

  async function login() {
    const res = await apiFetch<{ accessToken: string }>('/shopify/auth/login', {
      method: 'POST',
      body: JSON.stringify({ shop }),
    });
    setToken(res.accessToken);
  }

  async function chat() {
    setOut('连接中...');
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
      <h2>AI 助手（ADP）</h2>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="shop domain" />
        <button className="btn" type="button" onClick={login}>登录</button>
        <input value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" type="button" disabled={!token} onClick={chat}>发送</button>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{out}</pre>
      </div>
    </div>
  );
}
