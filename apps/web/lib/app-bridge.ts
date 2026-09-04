'use client';

/**
 * App Bridge 4 exposes a global `shopify` object once
 * `https://cdn.shopify.com/shopifycloud/app-bridge.js` has loaded (see app/layout.tsx).
 * It only exists when the app runs inside the Shopify Admin iframe.
 */
export type ExtensionInfo = { handle?: string; activated?: boolean };

type AppBridgeGlobal = {
  idToken?: () => Promise<string>;
  app?: { extensions?: () => Promise<ExtensionInfo[]> };
};

export function appBridge(): AppBridgeGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { shopify?: AppBridgeGlobal }).shopify;
}

/**
 * Short-lived Shopify session token identifying the current shop + user.
 * Returns '' outside the Admin, or if App Bridge has not finished booting.
 */
export async function fetchIdToken(): Promise<string> {
  const bridge = appBridge();
  if (!bridge?.idToken) return '';
  try {
    return (await bridge.idToken()) || '';
  } catch {
    return '';
  }
}

/** Wait for App Bridge to boot — the script tag may still be loading on first paint. */
export async function waitForAppBridge(timeoutMs = 4000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (appBridge()?.idToken) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return Boolean(appBridge()?.idToken);
}
