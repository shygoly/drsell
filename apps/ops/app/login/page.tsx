'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Gauge } from 'lucide-react';
import { setToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
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
      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/') ? next : '/');
    } catch {
      setError('邮箱或密码不正确，或该账号没有 superadmin 权限。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-page-bg flex min-h-screen items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-[380px] flex-col gap-5">
        {/* 品牌块 —— 与侧栏同一套语言，进来就知道这是哪个面 */}
        <div className="flex items-center gap-2.5">
          <span className="bg-primary text-on-primary flex h-9 w-9 shrink-0 items-center justify-center">
            <Gauge className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <span className="flex flex-col">
            <strong className="font-headline-sm text-headline-sm text-on-surface leading-tight">
              运营台
            </strong>
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Internal only
            </span>
          </span>
        </div>

        <div className="bg-card-surface border-outline-variant border p-6">
          <p className="text-on-surface-variant m-0 mb-4 text-[13px]">
            需要 superadmin 账号。每一次登录都会写入审计。
          </p>
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                邮箱
              </span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-surface border-outline-variant font-data-mono text-data-mono text-on-surface focus:ring-ink h-9 border px-2 focus:outline-none focus:ring-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                密码
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-surface border-outline-variant font-data-mono text-data-mono text-on-surface focus:ring-ink h-9 border px-2 focus:outline-none focus:ring-1"
              />
            </label>
            {error ? (
              <p className="text-error m-0 text-[13px]" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="bg-primary text-on-primary border-outline-variant font-label-caps text-label-caps hover:bg-card-surface hover:text-on-surface mt-1 h-9 border uppercase transition-colors disabled:opacity-50"
            >
              {busy ? '登录中…' : '登录'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** 登录页。Stitch 四屏都没画这一屏 —— 按侧栏品牌块语言写。 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="bg-page-bg min-h-screen" />}>
      <LoginForm />
    </Suspense>
  );
}
