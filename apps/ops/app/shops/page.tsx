'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { Card, CardContent } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { getToken, opsFetch } from '@/lib/api';

type ShopRow = {
  shopDomain: string;
  status: string;
};

export default function ShopsPage() {
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [shopQ, setShopQ] = useState('');
  const [lookup, setLookup] = useState<{ shopDomain: string; accounts: Array<{ email: string }> } | null>(null);

  useEffect(() => {
    if (!getToken()) window.location.href = '/login';
    opsFetch<ShopRow[]>('/ops/shops').then(setShops).catch(() => undefined);
  }, []);

  async function reverseLookup(domain: string) {
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
                {shops.map((s) => (
                  <tr key={s.shopDomain} className="border-b border-border last:border-0">
                    <td className="px-3.5 py-2.5">
                      <Link href={`/shops/${encodeURIComponent(s.shopDomain)}`} className="font-data">
                        {s.shopDomain}
                      </Link>
                    </td>
                    <td className="font-data px-3.5 py-2.5">{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </OpsShell>
    </AuthGate>
  );
}
