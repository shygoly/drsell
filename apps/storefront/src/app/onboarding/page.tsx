"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ExternalLink,
  Loader2,
  Lock,
  Package,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useShopSession } from "@/hooks/useShopSession";
import { useEmbedStatus } from "@/hooks/useEmbedStatus";
import {
  fetchOnboarding,
  fetchSyncStatus,
  openEmbedDeepLink,
  patchOnboarding,
  startBatchSync,
  type OnboardingStep,
  type SyncStatus,
} from "@/lib/onboarding";

const PRIMARY_COLORS = ["#006c49", "#0a3d2e", "#181c1f", "#1a60bf", "#8a5d0a"];

const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: "1", label: "Welcome" },
  { key: "2", label: "Sync" },
  { key: "3", label: "Widget" },
  { key: "5", label: "Done" },
];

const SYNC_ROWS = [
  {
    key: "products" as const,
    label: "Products",
    description: "Answer product questions and recommend items",
    icon: Package,
  },
  {
    key: "orders" as const,
    label: "Orders",
    description: "Look up shipping and return status",
    icon: Truck,
  },
  {
    key: "customers" as const,
    label: "Customers",
    description: "Link conversations to customer profiles",
    icon: Users,
  },
];

function Progress({ step }: { step: OnboardingStep }) {
  const activeIndex = STEPS.findIndex((s) => s.key === step);
  return (
    <div className="flex w-full items-center gap-2" aria-label="Setup progress">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex flex-1 flex-col gap-1.5">
          <div
            className={cn(
              "h-2 rounded-full transition-colors",
              i <= activeIndex ? "bg-chart-2" : "bg-muted",
            )}
          />
          <span
            className={cn(
              "text-center text-[11px] font-medium",
              i === activeIndex ? "text-primary" : "text-muted-foreground",
            )}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function SyncStatusCard({
  shop,
  syncStatus,
  syncError,
  syncStarted,
  onSyncNow,
}: {
  shop: string;
  syncStatus: SyncStatus | null;
  syncError: string;
  syncStarted: boolean;
  onSyncNow: () => void;
}) {
  const { userToken } = useShopSession();
  const running =
    syncStarted ||
    Boolean(
      syncStatus &&
        Object.values(syncStatus).some((s) => s.status === "running"),
    );
  const needsAuth = /missing access token/i.test(syncError);

  return (
    <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {running ? (
            <Loader2 className="text-chart-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Package className="text-muted-foreground h-4 w-4" aria-hidden="true" />
          )}
          <span className="text-sm font-semibold">Store data sync</span>
        </div>
        <Button size="sm" variant="outline" onClick={onSyncNow} disabled={running}>
          Sync now
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(["products", "orders", "customers"] as const).map((k) => {
          const s = syncStatus?.[k];
          return (
            <div
              key={k}
              className="bg-card flex items-center justify-between rounded-md border px-3 py-2 text-xs"
            >
              <span className="font-medium capitalize">{k}</span>
              <span className="text-muted-foreground flex items-center gap-1">
                {s?.status === "running" ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : null}
                {s?.status ?? "idle"}
                {typeof s?.count === "number" && s.count > 0
                  ? ` · ${s.count}`
                  : ""}
              </span>
            </div>
          );
        })}
      </div>
      {syncError ? (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <p className="text-destructive">{syncError}</p>
          {needsAuth && shop ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const target = window.top ?? window;
                const u = userToken
                  ? `&u=${encodeURIComponent(userToken)}`
                  : "";
                target.location.assign(
                  `/api/auth?shop=${encodeURIComponent(shop)}${u}`,
                );
              }}
            >
              Complete Shopify authorization
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { shop, token, ready } = useShopSession();
  const [step, setStep] = useState<OnboardingStep>("1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [color, setColor] = useState("#006c49");
  const [position, setPosition] = useState<"bottom-right" | "bottom-left">(
    "bottom-right",
  );
  const [welcome, setWelcome] = useState(
    "Hi! How can I help you today?",
  );
  const [syncProducts, setSyncProducts] = useState(true);
  const [syncOrders, setSyncOrders] = useState(true);
  const [syncCustomers, setSyncCustomers] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncError, setSyncError] = useState("");
  const [syncStarted, setSyncStarted] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!shop || !token) return;
    try {
      const state = await fetchOnboarding(shop, token);
      if (state.step === "done") {
        router.replace("/");
        return;
      }
      setStep(state.step === "5" ? "5" : state.step === "3" ? "3" : state.step === "2" ? "2" : "1");
      setColor(state.widgetPrimaryColor || "#006c49");
      setPosition(state.widgetPosition);
      setWelcome(state.welcomeMessage || welcome);
      setSyncProducts(state.syncProductsEnabled);
      setSyncOrders(state.syncOrdersEnabled);
      setSyncCustomers(state.syncCustomersEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [shop, token, router, welcome]);

  useEffect(() => {
    if (ready && shop && token) void load();
    else if (ready) setLoading(false);
  }, [ready, shop, token, load]);

  // 同步进度轮询：Step 2 及以上
  useEffect(() => {
    if (!shop || !token || step === "1") return;
    const tick = () => {
      void fetchSyncStatus(shop, token)
        .then(setSyncStatus)
        .catch(() => undefined);
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [shop, token, step]);

  const { live: embedLive, loading: embedLoading } = useEmbedStatus();

  useEffect(() => {
    if (embedLive && step === "3") void markLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedLive, step]);

  async function markLive() {
    if (!shop || !token) return;
    try {
      await patchOnboarding(shop, token, { markEmbedLive: true });
      setStep("5");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function goStep2() {
    if (!shop || !token) return;
    setError("");
    try {
      await patchOnboarding(shop, token, { step: "2" });
      setStep("2");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function skipToWidget() {
    if (!shop || !token) return;
    setError("");
    try {
      await patchOnboarding(shop, token, { step: "3" });
      void runSync().catch(() => undefined);
      setStep("3");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runSync() {
    if (!shop || !token) return;
    setSyncError("");
    try {
      await startBatchSync(shop, token);
      setSyncStarted(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSyncError(msg);
      setSyncStarted(false);
      throw e;
    }
  }

  async function continueFromSync() {
    if (!shop || !token) return;
    setError("");
    try {
      await patchOnboarding(shop, token, {
        step: "3",
        syncProductsEnabled: syncProducts,
        syncOrdersEnabled: syncOrders,
        syncCustomersEnabled: syncCustomers,
      });
      await runSync().catch(() => undefined);
      setStep("3");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveWidget(patch: {
    color?: string;
    position?: "bottom-right" | "bottom-left";
    welcome?: string;
  }) {
    if (patch.color) setColor(patch.color);
    if (patch.position) setPosition(patch.position);
    if (patch.welcome !== undefined) setWelcome(patch.welcome);
    if (!shop || !token) return;
    setSaving(true);
    setError("");
    try {
      await patchOnboarding(shop, token, {
        widgetPrimaryColor: patch.color ?? color,
        widgetPosition: patch.position ?? position,
        welcomeMessage: patch.welcome ?? welcome,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    if (!shop || !token) return;
    setError("");
    try {
      await patchOnboarding(shop, token, { complete: true });
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <Loader2 className="text-primary h-6 w-6 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4 sm:p-8">
      <div className="flex w-full max-w-[760px] flex-col gap-6">
        <Progress step={step} />

        {step === "1" && (
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="items-center pt-10 text-center">
              <div className="bg-primary/10 mb-5 flex h-16 w-16 items-center justify-center rounded-xl">
                <Bot className="text-primary h-9 w-9" aria-hidden="true" />
              </div>
              <CardTitle className="text-accent-deep text-2xl font-bold tracking-tight sm:text-[28px]">
                Welcome to DrSell
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                4 quick steps to put your AI support agent live on your storefront.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 px-6 pb-8 sm:px-10">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {SYNC_ROWS.map(({ key, label, description, icon: Icon }) => (
                  <div
                    key={key}
                    className="bg-muted/60 flex flex-col items-center gap-2 rounded-lg p-4 text-center"
                  >
                    <Icon className="text-chart-2 h-6 w-6" aria-hidden="true" />
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      {description}
                    </span>
                  </div>
                ))}
              </div>

              <div className="bg-muted/40 flex items-start gap-4 rounded-lg border p-4">
                <Lock
                  className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0"
                  aria-hidden="true"
                />
                <p className="text-muted-foreground text-sm leading-relaxed">
                  We&apos;ll read your products, orders and customers — only used to
                  answer shopper questions.
                </p>
              </div>

              {error ? (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-between border-t pt-5">
                <Button variant="ghost" onClick={() => void skipToWidget()}>
                  Continue with defaults
                </Button>
                <Button size="lg" onClick={() => void goStep2()}>
                  Start setup
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "2" && (
          <Card className="rounded-xl border shadow-xs">
            <CardHeader>
              <CardTitle className="text-accent-deep text-xl font-bold">
                Choose data to sync
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Sync runs in the background — you can continue to the widget anytime.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {SYNC_ROWS.map(({ key, label, description, icon: Icon }) => {
                const checked =
                  key === "products"
                    ? syncProducts
                    : key === "orders"
                      ? syncOrders
                      : syncCustomers;
                const status = syncStatus?.[key];
                return (
                  <div
                    key={key}
                    className="bg-muted/40 flex items-center justify-between gap-4 rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className="text-muted-foreground h-5 w-5 shrink-0"
                        aria-hidden="true"
                      />
                      <div>
                        <div className="text-sm font-semibold">{label}</div>
                        <div className="text-muted-foreground text-xs">
                          {description}
                        </div>
                        {status ? (
                          <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px]">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                status.status === "done"
                                  ? "bg-success"
                                  : status.status === "syncing"
                                    ? "bg-warning"
                                    : "bg-muted-foreground/40",
                              )}
                            />
                            {status.status}
                            {typeof status.count === "number" && status.count > 0
                              ? ` · ${status.count}`
                              : ""}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={(v) => {
                        if (key === "products") setSyncProducts(v);
                        if (key === "orders") setSyncOrders(v);
                        if (key === "customers") setSyncCustomers(v);
                      }}
                      aria-label={`Sync ${label}`}
                    />
                  </div>
                );
              })}

              {error ? (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-between border-t pt-5">
                <Button variant="ghost" onClick={() => setStep("1")}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
                <Button size="lg" onClick={() => void continueFromSync()}>
                  Continue to Widget
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "3" && (
          <Card className="rounded-xl border shadow-xs">
            <CardHeader>
              <CardTitle className="text-accent-deep text-xl font-bold">
                Configure and enable your widget
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Pick a look, then turn on the storefront widget to activate DrSell.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label>Primary color</Label>
                  <div className="flex items-center gap-2">
                    {PRIMARY_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Color ${c}`}
                        onClick={() => void saveWidget({ color: c })}
                        className={cn(
                          "h-8 w-8 rounded-full border-2 transition-transform",
                          color.toLowerCase() === c.toLowerCase()
                            ? "scale-110 border-foreground"
                            : "border-transparent hover:scale-105",
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <Input
                      type="color"
                      value={color}
                      onChange={(e) => void saveWidget({ color: e.target.value })}
                      className="h-8 w-12 cursor-pointer border p-1"
                      aria-label="Custom primary color"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Widget position</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: "bottom-right", label: "Bottom right" },
                        { value: "bottom-left", label: "Bottom left" },
                      ] as const
                    ).map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={position === opt.value ? "default" : "outline"}
                        onClick={() =>
                          void saveWidget({ position: opt.value })
                        }
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="onboarding-welcome">Welcome message</Label>
                <Input
                  id="onboarding-welcome"
                  value={welcome}
                  onChange={(e) => void saveWidget({ welcome: e.target.value })}
                  placeholder="Hi! How can I help you today?"
                />
              </div>

              <div
                className={cn(
                  "flex flex-col gap-3 rounded-lg border p-4",
                  embedLive
                    ? "bg-success/5 border-success/30"
                    : "bg-warning-container/50 border-warning/30",
                )}
              >
                <div className="flex items-center gap-2">
                  {embedLive ? (
                    <ShieldCheck className="text-success h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Sparkles className="text-warning h-5 w-5" aria-hidden="true" />
                  )}
                  <div className="text-sm font-semibold">
                    {embedLive
                      ? "Widget is live on your storefront"
                      : "Enable the storefront widget"}
                  </div>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {embedLive
                    ? "Your theme app embed is active. You can finish setup."
                    : "Open the theme editor and turn on the DrSell Chat app embed, then save."}
                </p>
                {!embedLive ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => openEmbedDeepLink(shop)}>
                      Enable in theme
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={embedLoading}
                      onClick={() => void markLive()}
                    >
                      {embedLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      )}
                      I&apos;ve enabled it
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => void markLive()}>
                    Continue
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>

              <SyncStatusCard
                shop={shop}
                syncStatus={syncStatus}
                syncError={syncError}
                syncStarted={syncStarted}
                onSyncNow={() => void runSync().catch(() => undefined)}
              />

              {error ? (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              ) : null}
              {saving ? (
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  Saving…
                </p>
              ) : null}

              <div className="flex items-center justify-between border-t pt-5">
                <Button variant="ghost" onClick={() => setStep("2")}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "5" && (
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="items-center pt-12 text-center">
              <div className="bg-success/10 mb-5 flex h-16 w-16 items-center justify-center rounded-full">
                <Check className="text-success h-9 w-9" aria-hidden="true" />
              </div>
              <CardTitle className="text-accent-deep text-2xl font-bold tracking-tight sm:text-[28px]">
                Your AI support agent is live
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                The DrSell widget is now active on your storefront.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 px-6 pb-8 sm:px-10">
              <SyncStatusCard
                shop={shop}
                syncStatus={syncStatus}
                syncError={syncError}
                syncStarted={syncStarted}
                onSyncNow={() => void runSync().catch(() => undefined)}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="bg-muted/60 flex flex-col items-center gap-1.5 rounded-lg p-4 text-center">
                  <Sparkles className="text-chart-2 h-5 w-5" aria-hidden="true" />
                  <span className="text-sm font-semibold">Test the chat</span>
                  <span className="text-muted-foreground text-xs">
                    Open your storefront and send a message
                  </span>
                </div>
                <div className="bg-muted/60 flex flex-col items-center gap-1.5 rounded-lg p-4 text-center">
                  <Users className="text-chart-2 h-5 w-5" aria-hidden="true" />
                  <span className="text-sm font-semibold">Watch conversations</span>
                  <span className="text-muted-foreground text-xs">
                    Inbox shows every shopper question
                  </span>
                </div>
                <div className="bg-muted/60 flex flex-col items-center gap-1.5 rounded-lg p-4 text-center">
                  <Bot className="text-chart-2 h-5 w-5" aria-hidden="true" />
                  <span className="text-sm font-semibold">Tune the widget</span>
                  <span className="text-muted-foreground text-xs">
                    Colors, replies and AI name in Widget Config
                  </span>
                </div>
              </div>

              {error ? (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end border-t pt-5">
                <Button size="lg" onClick={() => void finish()}>
                  Finish
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
