'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Layers, ScrollText, Store, Users, HeartPulse } from 'lucide-react';
import { clearToken, opsFetch } from '@/lib/api';

/**
 * 侧边导航 —— 对齐 Stitch 项目 11226504772808429506 屏 05（System Health）的壳。
 * 五条主项 + 底部项，240px 宽，bg-surface-container-low。
 * 图标映射（Material Symbols → lucide）：storefront→Store，payments→Layers，
 * monitor_heart→HeartPulse，receipt_long→ScrollText；到期队列无稿，沿用 Clock。
 */
const LINKS = [
  { href: '/', key: 'queue' as const, label: '到期队列', Icon: Clock },
  { href: '/accounts', key: 'accounts' as const, label: '账号与店铺', Icon: Users },
  { href: '/shops', key: 'shops' as const, label: '订阅与计费', Icon: Store },
  { href: '/system', key: 'system' as const, label: '系统健康', Icon: HeartPulse },
  { href: '/audit', key: 'audit' as const, label: '审计日志', Icon: ScrollText },
  { href: '/plans', key: 'plans' as const, label: '全局配置', Icon: Layers },
];

const ITEM =
  'flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors';
const ACTIVE =
  'bg-secondary-container text-on-secondary-container border-primary border-r-4 font-semibold';
const IDLE =
  'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high';

export function OpsSidebar({ active }: { active: (typeof LINKS)[number]['key'] | 'impersonation' }) {
  const [operatorEmail, setOperatorEmail] = useState<string | null>(null);

  useEffect(() => {
    opsFetch<{ email: string }>('/ops/me')
      .then((me) => setOperatorEmail(me.email))
      .catch(() => undefined);
  }, []);

  return (
    <aside className="bg-surface-container-low border-outline-variant fixed left-0 top-[80px] z-40 flex h-[calc(100vh-80px)] w-[240px] shrink-0 flex-col border-r py-4">
      <div className="mb-8 flex items-center gap-3 px-4">
        <div className="bg-primary text-on-primary flex h-8 w-8 items-center justify-center rounded">
          <span className="font-data text-[11px] font-bold">DS</span>
        </div>
        <div>
          <h1 className="text-on-surface m-0 text-base font-extrabold">drsell Ops</h1>
          <p className="text-on-surface-variant font-label-caps m-0 text-[10px] uppercase">
            SuperAdmin Portal
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4">
        {LINKS.map(({ href, key, label, Icon }) => (
          <Link
            key={key}
            href={href}
            aria-current={active === key ? 'page' : undefined}
            className={`${ITEM} ${active === key ? ACTIVE : IDLE}`}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="text-body-md">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-1 px-4">
        <div className="text-on-surface-variant px-3 pb-2 text-[10px]">
          {operatorEmail ?? '未登录'}
        </div>
        <button
          type="button"
          onClick={() => {
            clearToken();
            window.location.href = '/login';
          }}
          className="text-on-surface-variant hover:text-on-surface font-label-caps w-full px-3 py-2 text-left text-[10px] uppercase transition-colors"
        >
          退出登录
        </button>
      </div>
    </aside>
  );
}
