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
    const check = () => {
      if (cancelled) return;
      if (typeof window !== "undefined" && (window as unknown as { shopify?: ShopifyGlobal }).shopify) {
        setGlobalReady(true);
        return;
      }
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
