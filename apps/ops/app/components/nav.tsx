'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Layers, ScrollText, Store, Users } from 'lucide-react';
import { clearToken, opsFetch } from '@/lib/api';

const LINKS = [
  { href: '/', key: 'queue' as const, label: '到期队列', Icon: Clock },
  { href: '/shops', key: 'shops' as const, label: '店铺', Icon: Store },
  { href: '/accounts', key: 'accounts' as const, label: '账号', Icon: Users },
  { href: '/audit', key: 'audit' as const, label: '审计日志', Icon: ScrollText },
  { href: '/plans', key: 'plans' as const, label: '套餐配置', Icon: Layers },
];

/** 导航项样式逐字取自 .stitch/rebuild/expiry_queue.html 的 <nav>（壳以该屏为准，见事实 6）。 */
const ITEM = 'flex items-center gap-3 px-[16px] py-3 no-underline transition-colors hover:no-underline';
const ACTIVE =
  'bg-secondary-container text-on-secondary-container border-ink border-y font-bold';
const IDLE = 'text-on-surface-variant hover:bg-surface-container';

export function OpsSidebar({ active }: { active: (typeof LINKS)[number]['key'] }) {
  const [operatorEmail, setOperatorEmail] = useState<string | null>(null);

  useEffect(() => {
    opsFetch<{ email: string }>('/ops/me')
      .then((me) => setOperatorEmail(me.email))
      .catch(() => undefined);
  }, []);

  return (
    <nav className="bg-surface border-ink flex h-screen w-[200px] shrink-0 flex-col overflow-y-auto border-r">
      <div className="border-ink flex h-16 items-center border-b px-[16px]">
        <span className="font-headline-sm text-headline-sm text-ink font-black uppercase tracking-tighter">
          Drsell 运营台
        </span>
      </div>

      <div className="flex flex-1 flex-col py-[8px]">
        {LINKS.map(({ href, key, label, Icon }) => (
          <Link
            key={key}
            href={href}
            aria-current={active === key ? 'page' : undefined}
            className={`${ITEM} ${active === key ? ACTIVE : IDLE}`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className="font-data-mono text-data-mono">{label}</span>
          </Link>
        ))}
      </div>

      <div className="border-ink flex flex-col gap-1 border-t px-[16px] py-3">
        <span className="font-data-mono text-on-surface-variant truncate text-[10px]">
          {operatorEmail ?? '未登录'}
        </span>
        <button
          type="button"
          onClick={() => {
            clearToken();
            window.location.href = '/login';
          }}
          className="font-label-caps text-label-caps text-on-surface-variant hover:text-ink self-start uppercase transition-colors"
        >
          退出登录
        </button>
      </div>
    </nav>
  );
}
