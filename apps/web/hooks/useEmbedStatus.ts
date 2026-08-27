'use client';

import { useCallback, useEffect, useState } from 'react';

type ExtensionInfo = { handle?: string; activated?: boolean };

export function useEmbedStatus(handle = 'drsell-chat', pollMs = 3000) {
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const shopify = (window as unknown as { shopify?: { app?: { extensions?: () => Promise<ExtensionInfo[]> } } }).shopify;
      if (!shopify?.app?.extensions) {
        setLive(false);
        return;
      }
      const exts = await shopify.app.extensions();
      const match = exts.find((e) => e.handle === handle);
      setLive(Boolean(match?.activated));
    } catch {
      setLive(false);
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { live, loading, refresh };
}
