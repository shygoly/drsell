'use client';

import { useState } from 'react';
import { Ban, LogIn, Megaphone, RefreshCw, Repeat2, TimerReset } from 'lucide-react';
import { ImpersonateResult, openImpersonationSession, opsFetch } from '@/lib/api';

type Props = {
  domain: string;
  widgetVisible: boolean;
  onDone: () => void;
};

/** 六等分通栏，逐字对齐 .stitch/rebuild/shop_detail.html 的动作条 */
const CELL =
  'font-label-caps text-label-caps border-ink hover:bg-surface-container flex items-center justify-center gap-2 border-r px-2 py-3 uppercase transition-colors last:border-r-0 disabled:opacity-50';

export function ShopActions({ domain, widgetVisible, onDone }: Props) {
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  async function act(path: string, label: string, body: object = {}) {
    setErr('');
    setMsg('');
    setBusy(path);
    try {
      const res = await opsFetch<{ message?: string }>(
        `/ops/shops/${encodeURIComponent(domain)}/${path}`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      setMsg(res?.message ?? label);
      onDone();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy('');
    }
  }

  async function impersonate() {
    setErr('');
    setMsg('');
    setBusy('impersonate');
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
    } finally {
      setBusy('');
    }
  }

  /** 延长天数不占动作条的位置：点按钮时问一次，默认 7 天 */
  function extendFreeze() {
    const input = window.prompt('延长解冻期多少天？（1–30）', '7');
    if (input === null) return;
    const days = Number(input);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      setErr('天数需要是 1 到 30 之间的整数。');
      return;
    }
    void act('extend-freeze', `已延长解冻期 ${days} 天`, { days });
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <button
          type="button"
          className={CELL}
          disabled={!!busy}
          onClick={() => act('dunning', '已发送催缴提醒')}
        >
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          发催缴提醒
        </button>
        <button type="button" className={CELL} disabled={!!busy} onClick={extendFreeze}>
          <TimerReset className="h-4 w-4" aria-hidden="true" />
          延长解冻期
        </button>
        <button
          type="button"
          className={CELL}
          disabled={!!busy}
          onClick={() => act('billing-shop', '已改指定计费店')}
        >
          <Repeat2 className="h-4 w-4" aria-hidden="true" />
          改指定计费店
        </button>
        <button
          type="button"
          className={CELL}
          disabled={!!busy}
          onClick={() => act('resync', '已排队重跑同步')}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          重跑同步
        </button>
        <button type="button" className={CELL} disabled={!!busy} onClick={impersonate}>
          <LogIn className="h-4 w-4" aria-hidden="true" />
          代登录
        </button>
        {widgetVisible ? (
          <button
            type="button"
            className={`${CELL} text-error`}
            disabled={!!busy}
            onClick={() => act('disable-widget', '已停用聊天窗')}
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
            停用聊天窗
          </button>
        ) : (
          <button
            type="button"
            className={CELL}
            disabled={!!busy}
            onClick={() => act('enable-widget', '已恢复聊天窗')}
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
            撤销停用
          </button>
        )}
      </div>
      {msg ? <p className="text-on-surface-variant m-0 pt-2 text-[13px]">{msg}</p> : null}
      {err ? <p className="text-error m-0 pt-2 text-[13px]">{err}</p> : null}
    </>
  );
}
