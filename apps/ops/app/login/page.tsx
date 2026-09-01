'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { setToken } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error('登录失败');
      const data = (await res.json()) as { accessToken: string };
      setToken(data.accessToken);
      window.location.href = '/';
    } catch {
      setError('邮箱或密码不正确，或账号无 superadmin 权限');
    }
  }

  return (
    <div className="mx-auto max-w-[420px] px-6 py-16">
      <div className="mb-6">
        <h1 className="font-display m-0 mb-2 text-[28px] font-bold">运营台登录</h1>
        <p className="m-0 text-muted-foreground">需要 superadmin 账号</p>
      </div>
      <Card>
        <CardContent className="p-6">
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <Input
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error ? <p className="m-0 text-sm text-lost">{error}</p> : null}
            <Button type="submit" variant="primary" className="w-full">
              登录
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
