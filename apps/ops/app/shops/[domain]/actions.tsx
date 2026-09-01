'use client';

import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { CardFooter } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { ImpersonateResult, openImpersonationSession, opsFetch } from '@/lib/api';

type Props = {
  domain: string;
  widgetVisible: boolean;
  onDone: () => void;
};

export function ShopActions({ domain, widgetVisible, onDone }: Props) {
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [extendDays, setExtendDays] = useState('7');

  async function act(path: string, label: string, body: object = {}) {
    setErr('');
    setMsg('');
    try {
      const res = await opsFetch<{ message?: string }>(
        `/ops/shops/${encodeURIComponent(domain)}/${path}`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      setMsg(res?.message ?? label);
      onDone();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  async function impersonate() {
    setErr('');
    setMsg('');
    try {
      const res = await opsFetch<ImpersonateResult>(
        `/ops/shops/${encodeURIComponent(domain)}/impersonate`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      openImpersonationSession(res);
      setMsg('已打开商户端代登录窗口');
      onDone();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  return (
    <>
      <CardFooter className="flex-wrap items-end gap-2">
        <Button type="button" onClick={() => act('dunning', '已发送催缴提醒')}>
          发催缴提醒
        </Button>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={30}
            value={extendDays}
            onChange={(e) => setExtendDays(e.target.value)}
            className="h-9 w-16"
            aria-label="延长天数"
          />
          <Button
            type="button"
            onClick={() => act('extend-freeze', '已延长解冻期', { days: Number(extendDays) || 7 })}
          >
            延长解冻期
          </Button>
        </div>
        <Button type="button" onClick={() => act('billing-shop', '已改指定计费店')}>
          改指定计费店
        </Button>
        <Button type="button" onClick={() => act('resync', '已排队重跑同步')}>
          重跑同步
        </Button>
        <Button type="button" onClick={impersonate}>
          代登录
        </Button>
        {widgetVisible ? (
          <Button type="button" variant="destructive" onClick={() => act('disable-widget', '已停用聊天窗')}>
            停用聊天窗
          </Button>
        ) : (
          <Button type="button" onClick={() => act('enable-widget', '已恢复聊天窗')}>
            撤销停用
          </Button>
        )}
      </CardFooter>
      {msg ? <p className="px-5 pb-4 text-[13.5px] text-muted-foreground">{msg}</p> : null}
      {err ? <p className="px-5 pb-4 text-sm text-lost">{err}</p> : null}
    </>
  );
}
