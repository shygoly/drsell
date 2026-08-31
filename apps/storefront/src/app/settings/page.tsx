"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShopSession } from "@/hooks/useShopSession";

type BillingRow = {
  role: string;
  shop: {
    id: string;
    shopDomain: string;
    tenantId: string;
    uninstalledAt: string | null;
  };
  subscription: {
    id: string;
    planCode: string;
    status: string;
    isBillingShop: boolean;
    shopifyChargeId: string | null;
  } | null;
};

export default function SettingsPage() {
  const { shop, userToken, bridge, switchShop } = useShopSession();
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const api =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

  const refresh = useCallback(async () => {
    if (!userToken) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${api}/membership/billing`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (!res.ok) throw new Error(`billing status failed: ${res.status}`);
      setRows((await res.json()) as BillingRow[]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [api, userToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function setBillingShop(shopDomain: string) {
    setBusy(shopDomain);
    setError("");
    try {
      const res = await fetch(`${api}/membership/billing/set`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ shopDomain }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`set billing shop failed: ${text.slice(0, 200)}`);
      }
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }

  async function openStore(shopDomain: string) {
    try {
      await switchShop(shopDomain);
      window.location.href = `/?shop=${encodeURIComponent(shopDomain)}`;
    } catch (e) {
      setError(String(e));
    }
  }

  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Account, stores and billing for your AIChat installation.
        </p>
      </div>

      {error ? (
        <p className="text-destructive rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {error}
        </p>
      ) : null}

      <section className="bg-card rounded-lg border p-5">
        <div className="mb-3 flex items-center gap-2">
          <Store className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">My stores</h2>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No stores connected yet.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const active = row.shop.shopDomain === shop;
              const billing = row.subscription?.isBillingShop;
              return (
                <li
                  key={row.shop.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{row.shop.shopDomain}</span>
                      {active ? (
                        <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] uppercase">
                          current
                        </span>
                      ) : null}
                      {billing ? (
                        <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 uppercase">
                          <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                          billing
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {row.subscription
                        ? `Plan ${row.subscription.planCode} · ${row.subscription.status}`
                        : "No subscription"}
                      {row.shop.uninstalledAt ? " · uninstalled" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!active && !row.shop.uninstalledAt ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openStore(row.shop.shopDomain)}
                      >
                        Open
                      </Button>
                    ) : null}
                    {!billing && !row.shop.uninstalledAt ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === row.shop.shopDomain}
                        onClick={() => setBillingShop(row.shop.shopDomain)}
                      >
                        {busy === row.shop.shopDomain
                          ? "Setting…"
                          : "Set as billing shop"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {bridge ? (
        <section className="bg-card rounded-lg border p-5">
          <h2 className="mb-1 text-lg font-semibold">Plan</h2>
          <p className="text-muted-foreground mb-3 text-sm">
            {rows.find((r) => r.shop.shopDomain === shop)?.subscription
              ? `Current plan: ${
                  rows.find((r) => r.shop.shopDomain === shop)?.subscription
                    ?.planCode
                }`
              : "No active plan."}
          </p>
          <Button size="sm" asChild>
            <a
              href={`https://admin.shopify.com/store/${storeHandle}/billing/plans`}
              target="_blank"
              rel="noreferrer"
            >
              Change plan
            </a>
          </Button>
        </section>
      ) : null}
    </div>
  );
}
