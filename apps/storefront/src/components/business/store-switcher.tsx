"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useShopSession } from "@/hooks/useShopSession";

type ShopRow = {
  role: string;
  shop: {
    id: string;
    shopDomain: string;
    tenantId: string;
    uninstalledAt: string | null;
  };
};

/**
 * 多店切换器（仅平台端非嵌入态渲染）。
 * 嵌入态由 Shopify Admin 的 iframe 锚定当前店，这里切店会和 App Bridge 冲突。
 */
export function StoreSwitcher() {
  const { shop, userToken, switchShop, listShops, startOAuth } =
    useShopSession();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ShopRow[]>([]);
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !userToken) return;
    listShops()
      .then(setRows)
      .catch((e) => setError(String(e)));
  }, [open, userToken, listShops]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function onSelect(row: ShopRow) {
    if (row.shop.shopDomain === shop || row.shop.uninstalledAt || busy) return;
    setBusy(true);
    setError("");
    try {
      await switchShop(row.shop.shopDomain);
      window.location.reload();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  function onConnect() {
    if (!domain.trim()) return;
    startOAuth(domain.trim());
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2"
      >
        <Store className="h-4 w-4" aria-hidden="true" />
        <span className="max-w-[140px] truncate">{shop || "Select store"}</span>
        <ChevronsUpDown className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
      </Button>

      {open ? (
        <div className="bg-card absolute right-0 z-50 mt-2 w-72 rounded-lg border p-2 shadow-lg">
          <p className="text-muted-foreground px-2 pt-1 pb-2 text-xs font-medium">
            Stores in your account
          </p>
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="text-muted-foreground px-2 py-3 text-xs">
                No stores connected yet.
              </p>
            ) : (
              rows.map((row) => {
                const active = row.shop.shopDomain === shop;
                const disabled = !!row.shop.uninstalledAt;
                return (
                  <button
                    key={row.shop.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(row)}
                    className={cn(
                      "hover:bg-muted flex items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors",
                      active && "bg-muted text-primary font-medium",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="min-w-0 truncate">
                      {row.shop.shopDomain}
                      {row.shop.uninstalledAt ? " (uninstalled)" : ""}
                    </span>
                    {active ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                  </button>
                );
              })
            )}
          </div>
          <div className="mt-2 flex gap-2 border-t pt-2">
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onConnect()}
              placeholder="store.myshopify.com"
              className="border-input focus:ring-ring/20 h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-xs outline-none focus:ring-2"
            />
            <Button size="sm" variant="outline" onClick={onConnect} className="gap-1">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Connect
            </Button>
          </div>
          {error ? <p className="text-destructive mt-2 px-2 text-xs">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
