"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAppBridge, type ShopifyGlobal } from "@shopify/app-bridge-react";

const ShopifyBridgeContext = createContext<ShopifyGlobal | null>(null);

function BridgeObserver({
  onBridge,
}: {
  onBridge: (shopify: ShopifyGlobal) => void;
}) {
  const shopify = useAppBridge();
  useEffect(() => {
    onBridge(shopify);
  }, [shopify, onBridge]);
  return null;
}

/**
 * 正式接入 @shopify/app-bridge-react：
 * - 仅在 App Bridge 全局存在时挂载 BridgeObserver（内部使用 useAppBridge）
 * - 公开站没有 window.shopify 时保持 null，不影响普通访问
 */
export function ShopifyBridgeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [bridge, setBridge] = useState<ShopifyGlobal | null>(null);
  const [globalReady, setGlobalReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 有上限的等待。App Bridge 一旦判定自己加载方式不合规（非 head 首个 script、
    // 或带 async）会直接 Aborting，window.shopify 永远不会出现——原来的无限轮询
    // 会在每个页面留下一个每 100ms 空转的定时器。10 秒等不到就认了：
    // 鉴权已经不依赖它（改走 URL 的 id_token，见 useShopSession）。
    const deadline = Date.now() + 10_000;
    const check = () => {
      if (cancelled) return;
      if (typeof window !== "undefined" && (window as unknown as { shopify?: ShopifyGlobal }).shopify) {
        setGlobalReady(true);
        return;
      }
      if (Date.now() >= deadline) return;
      window.setTimeout(check, 100);
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ShopifyBridgeContext.Provider value={bridge}>
      {globalReady ? <BridgeObserver onBridge={setBridge} /> : null}
      {children}
    </ShopifyBridgeContext.Provider>
  );
}

export function useShopifyBridge() {
  return useContext(ShopifyBridgeContext);
}
