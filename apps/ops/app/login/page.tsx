'use client';

import { FormEvent, useState } from 'react';
import { Gauge } from 'lucide-react';
import { setToken } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api';

/**
 * 登录页。Stitch 四屏都没画这一屏，所以没有像素参照物 ——
 * 按侧栏品牌块的语言写：图标块 + 名称 + INTERNAL ONLY。不加插图、不加渐变。
 */
export default function LoginPage() {
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
      window.location.href = '/';
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
          <span className="bg-ink text-on-primary flex h-9 w-9 shrink-0 items-center justify-center">
            <Gauge className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <span className="flex flex-col">
            <strong className="font-headline-sm text-headline-sm text-ink leading-tight">
              运营台
            </strong>
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Internal only
            </span>
          </span>
        </div>

        <div className="bg-card-surface border-ink border p-6">
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
                className="bg-surface border-ink font-data-mono text-data-mono text-ink focus:ring-ink h-9 border px-2 focus:outline-none focus:ring-1"
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
                className="bg-surface border-ink font-data-mono text-data-mono text-ink focus:ring-ink h-9 border px-2 focus:outline-none focus:ring-1"
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
              className="bg-ink text-on-primary border-ink font-label-caps text-label-caps hover:bg-card-surface hover:text-ink mt-1 h-9 border uppercase transition-colors disabled:opacity-50"
            >
              {busy ? '登录中…' : '登录'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
