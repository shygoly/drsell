'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gauge, Layers, ScrollText, Store, Users } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { clearToken, opsFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/', key: 'queue' as const, label: '到期队列', Icon: Gauge },
  { href: '/shops', key: 'shops' as const, label: '店铺', Icon: Store },
  { href: '/accounts', key: 'accounts' as const, label: '账号', Icon: Users },
  { href: '/audit', key: 'audit' as const, label: '审计日志', Icon: ScrollText },
  { href: '/plans', key: 'plans' as const, label: '套餐配置', Icon: Layers },
];

export function OpsSidebar({ active }: { active: (typeof LINKS)[number]['key'] }) {
  const [operatorEmail, setOperatorEmail] = useState<string | null>(null);

  useEffect(() => {
    opsFetch<{ email: string }>('/ops/me')
      .then((me) => setOperatorEmail(me.email))
      .catch(() => undefined);
  }, []);

  return (
    <aside className="sticky top-0 flex h-screen w-[200px] shrink-0 flex-col border-r border-ink bg-surface py-4">
      {/* 品牌块：Stitch 两稿都有，用来在多标签页里一眼认出是哪个面 */}
      <div className="mb-3 flex items-center gap-2.5 border-b border-border px-4 pb-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-foreground text-background">
          <Gauge className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col">
          <strong className="font-display truncate text-[14px] leading-tight">运营台</strong>
          <span className="font-data truncate text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            Internal only
          </span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {LINKS.map(({ href, key, label, Icon }) => (
          <Link
            key={key}
            href={href}
            aria-current={active === key ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-muted-foreground no-underline transition-colors hover:bg-secondary hover:text-foreground hover:no-underline',
              active === key && 'bg-secondary font-semibold text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-3 flex flex-col gap-2 border-t border-border px-3 pt-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-medium text-muted-foreground">
            {operatorEmail ? operatorEmail.slice(0, 1).toUpperCase() : '—'}
          </span>
          <span className="font-data min-w-0 truncate text-[11px] text-muted-foreground">
            {operatorEmail ?? '未登录'}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start px-2 py-1"
          onClick={() => {
            clearToken();
            window.location.href = '/login';
          }}
        >
          退出登录
        </Button>
      </div>
    </aside>
  );
}
