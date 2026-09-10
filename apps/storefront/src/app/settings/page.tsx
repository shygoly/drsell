"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShopSession } from "@/hooks/useShopSession";
import { useDashboardData } from "@/hooks/useDashboardData";
import { PlanCard } from "@/components/business/plan-card";

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
  const { shop, userToken, embedded, switchShop } = useShopSession();
  const { stats } = useDashboardData();
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const api =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

  const refresh = useCallback(async () => {
    if (!userToken) {
      // 嵌入态由 Shopify 认证，不存在平台用户会话。这里必须解除 loading，
      // 否则「My stores」永远转圈（嵌入端实测如此）。
      setLoading(false);
      return;
    }
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
          Account, stores and billing for your Dr Sell installation.
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
          embedded && shop ? (
            // 嵌入态只管当前这家店；多店切换在独立面板里做。
            <div className="flex items-center gap-2 py-1 text-sm">
              <span className="font-medium">{shop}</span>
              <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] uppercase">
                current
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No stores connected yet.
            </p>
          )
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

      {/* 不再用 `bridge ?` 包住：App Bridge 在本站起不来，那等于永远不渲染。
          数据也不再取自需要平台用户会话的 rows——嵌入态下那个会话不存在，
          于是商家刚付过钱也只看到 "No active plan."。 */}
      <PlanCard shop={shop} subscription={stats.subscription} />
    </div>
  );
}
