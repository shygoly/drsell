'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { Card, CardContent } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { opsFetch } from '@/lib/api';
import { normalizeShopQuery } from '@/lib/search-route';

type ShopRow = {
  shopDomain: string;
  status: string;
};

export default function ShopsPage() {
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [shopQ, setShopQ] = useState('');
  const [lookup, setLookup] = useState<{ shopDomain: string; accounts: Array<{ email: string }> } | null>(null);

  useEffect(() => {
    opsFetch<ShopRow[]>('/ops/shops').then(setShops).catch(() => undefined);
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) void reverseLookup(q);
  }, []);

  async function reverseLookup(raw: string) {
    const domain = normalizeShopQuery(raw);
    setShopQ(domain);
    if (!domain.trim()) {
      setLookup(null);
      return;
    }
    try {
      const data = await opsFetch<{ shopDomain: string; accounts: Array<{ email: string }> }>(
        `/ops/accounts/by-shop/${encodeURIComponent(domain)}`,
      );
      setLookup(data);
    } catch {
      setLookup(null);
    }
  }

  const needle = shopQ.trim().toLowerCase();
  const filtered = needle
    ? shops.filter((s) => s.shopDomain.toLowerCase().includes(needle))
    : shops;

  return (
    <AuthGate>
      <OpsShell active="shops" title="店铺" subtitle="全部店铺 · 按域名反查所属账号">
        <div className="mb-4">
          <Input
            type="search"
            placeholder="店铺域名反查…"
            value={shopQ}
            onChange={(e) => reverseLookup(e.target.value)}
            className="max-w-md"
          />
        </div>
        {lookup ? (
          <p className="mb-4 text-[13.5px] text-muted-foreground">
            {lookup.shopDomain} → {lookup.accounts.map((a) => a.email).join(', ') || '无 membership'}
          </p>
        ) : null}
        <Card>
          <CardContent className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="font-data px-3.5 py-2.5 text-left text-[9.5px] font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                    域名
                  </th>
                  <th className="font-data px-3.5 py-2.5 text-left text-[9.5px] font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                    状态
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.shopDomain} className="border-b border-border last:border-0">
                    <td className="px-3.5 py-2.5">
                      <Link href={`/shops/${encodeURIComponent(s.shopDomain)}`} className="font-data">
                        {s.shopDomain}
                      </Link>
                    </td>
                    <td className="font-data px-3.5 py-2.5">{s.status}</td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={2} className="px-3.5 py-2.5 text-muted-foreground">
                      无匹配店铺
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </OpsShell>
    </AuthGate>
  );
}
