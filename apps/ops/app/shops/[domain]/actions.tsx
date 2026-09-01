'use client';

import { useState } from 'react';
import { Ban, LogIn, Megaphone, RefreshCw, Repeat2, TimerReset } from 'lucide-react';
import {
  extendFreeze,
  impersonateShop,
  postShopAction,
  sendDunning,
} from '@/lib/shop-actions';

type Props = {
  domain: string;
  widgetVisible: boolean;
  onDone: () => void;
};

/** 六等分通栏，逐字对齐 .stitch/rebuild/shop_detail.html 的动作条 */
/** 页头用的紧凑动作按钮，样式取自稿子 08 的 Manual Resync */
const CELL =
  'bg-surface-container-low border-outline-variant text-on-surface hover:bg-surface-container-high font-label-caps text-label-caps flex items-center gap-2 rounded border px-3 py-2 transition-colors disabled:opacity-50';

export function ShopActions({ domain, widgetVisible, onDone }: Props) {
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  async function act(path: string, fallback: string, body: object = {}) {
    setErr('');
    setMsg('');
    setBusy(path);
    try {
      const res = await postShopAction(domain, path, body);
      setMsg(res?.message ?? fallback);
      onDone();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy('');
    }
  }

  async function onDunning() {
    setErr('');
    setMsg('');
    setBusy('dunning');
    try {
      const res = await sendDunning(domain);
      setMsg(res.message ?? '已排队催缴提醒');
      onDone();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy('');
    }
  }

  async function onImpersonate() {
    setErr('');
    setMsg('');
    setBusy('impersonate');
    try {
      const res = await impersonateShop(domain);
      setMsg(res.message ?? '已打开商户端代登录窗口');
      onDone();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy('');
    }
  }

  function onExtendFreeze() {
    const input = window.prompt('延长解冻期多少天？（1–30）', '7');
    if (input === null) return;
    const days = Number(input);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      setErr('天数需要是 1 到 30 之间的整数。');
      return;
    }
    setBusy('extend-freeze');
    extendFreeze(domain, days)
      .then((res) => {
        setMsg(res.message ?? `已延长解冻期 ${days} 天`);
        onDone();
      })
      .catch((e) => setErr(String((e as Error).message)))
      .finally(() => setBusy(''));
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={CELL} disabled={!!busy} onClick={() => void onDunning()}>
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          发催缴提醒
        </button>
        <button type="button" className={CELL} disabled={!!busy} onClick={onExtendFreeze}>
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
        <button type="button" className={CELL} disabled={!!busy} onClick={() => void onImpersonate()}>
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
      {msg ? <span className="text-on-surface-variant text-[12px]">{msg}</span> : null}
      {err ? <span className="text-error text-[12px]">{err}</span> : null}
    </>
  );
}
