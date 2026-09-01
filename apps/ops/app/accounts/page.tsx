'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/app/components/auth-gate';
import { OpsShell } from '@/app/components/shell';
import { Card, CardContent } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { getToken, opsFetch } from '@/lib/api';

export default function AccountsPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Array<{ id: string; email: string; role: string }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) window.location.href = '/login';
  }, []);

  async function search(prefix: string) {
    setQ(prefix);
    if (!prefix.trim()) {
      setRows([]);
      return;
    }
    try {
      const data = await opsFetch<Array<{ id: string; email: string; role: string }>>(
        `/ops/accounts?q=${encodeURIComponent(prefix)}`,
      );
      setRows(data);
      setError('');
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  return (
    <AuthGate>
      <OpsShell active="accounts" title="账号" subtitle="按邮箱前缀搜索，或从店铺反查">
        <div className="mb-4">
          <Input
            type="search"
            placeholder="邮箱前缀…"
            value={q}
            onChange={(e) => search(e.target.value)}
            className="max-w-md"
          />
        </div>
        {error ? <p className="text-sm text-lost">{error}</p> : null}
        <Card>
          <CardContent className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="font-data px-3.5 py-2.5 text-left text-[9.5px] font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                    邮箱
                  </th>
                  <th className="font-data px-3.5 py-2.5 text-left text-[9.5px] font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                    角色
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-3.5 py-2.5">
                      <Link href={`/accounts/${row.id}`} className="font-data">
                        {row.email}
                      </Link>
                    </td>
                    <td className="font-data px-3.5 py-2.5">{row.role}</td>
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
