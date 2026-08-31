"use client";

import { useCallback, useEffect, useState } from "react";
import { EMBED_BLOCK_HANDLE, EXTENSION_HANDLE } from "@/lib/onboarding";

type ExtensionInfo = { handle?: string; activated?: boolean };

/** Polls App Bridge for the theme app extension embed activation (published theme). */
export function useEmbedStatus(pollMs = 3000) {
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const shopify = (
        window as unknown as {
          shopify?: { app?: { extensions?: () => Promise<ExtensionInfo[]> } };
        }
      ).shopify;
      if (!shopify?.app?.extensions) {
        setLive(false);
        return;
      }
      const exts = await shopify.app.extensions();
      const match = exts.find(
        (e) =>
          (e.handle === EXTENSION_HANDLE || e.handle === EMBED_BLOCK_HANDLE) &&
          e.activated,
      );
      setLive(Boolean(match));
    } catch {
      setLive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { live, loading, refresh };
}
