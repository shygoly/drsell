"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ExternalLink,
  HelpCircle,
  Loader2,
  MessageSquare,
  Monitor,
  Palette,
  Plus,
  Rocket,
  Save,
  Search,
  Send,
  ShoppingBag,
  Smartphone,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useShopSession } from "@/hooks/useShopSession";
import { fetchBotSettings, saveBotSettings } from "@/lib/merchant-api";
import { cn } from "@/lib/utils";

const PRIMARY_COLORS = ["#006c49", "#0a3d2e", "#181c1f", "#1a60bf", "#8a5d0a"];
const HEADER_COLORS = ["#006c49", "#0a3d2e", "#181c1f"];
const QUICK_REPLY_DEFAULTS = [
  "Where is my order?",
  "What is your return policy?",
  "Do you ship internationally?",
];

function WidgetConfigInner() {
  const { shop, token, ready, startOAuth, setShop } = useShopSession();
  const [shopInput, setShopInput] = useState("");
  const [widgetName, setWidgetName] = useState("Ava");
  const [welcomeMsg, setWelcomeMsg] = useState(
    "Hi! I'm Ava. How can I help you today?",
  );
  const [primaryColor, setPrimaryColor] = useState("#006c49");
  const [headerColor, setHeaderColor] = useState("#006c49");
  const [position, setPosition] = useState<"bottom-right" | "bottom-left">(
    "bottom-right",
  );
  const [windowSize, setWindowSize] = useState<"small" | "medium" | "large">(
    "medium",
  );
  const [launcherStyle, setLauncherStyle] = useState<"chat" | "question" | "custom">(
    "chat",
  );
  const [showWidget, setShowWidget] = useState(true);
  const [quickReplies, setQuickReplies] = useState<string[]>(QUICK_REPLY_DEFAULTS);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const connected = Boolean(shop && token);

  useEffect(() => {
    if (!ready || !shop || !token) return;
    setLoading(true);
    setError("");
    void fetchBotSettings(shop, token)
      .then((s) => {
        setWidgetName(s.shopName || "Ava");
        setWelcomeMsg(
          s.welcomeMessage || "Hi! I'm Ava. How can I help you today?",
        );
        setPrimaryColor(s.widgetPrimaryColor || "#006c49");
        setPosition(
          s.widgetPosition === "bottom-left" ? "bottom-left" : "bottom-right",
        );
      })
      .catch(() => {
        // Embedded/offline preview: saved settings may be unreachable; keep defaults.
        setStatus("Preview mode — showing default settings.");
      })
      .finally(() => setLoading(false));
  }, [ready, shop, token]);

  async function handleSave() {
    if (!shop || !token) return;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      await saveBotSettings(shop, token, {
        shopName: widgetName,
        welcomeMessage: welcomeMsg,
        widgetPrimaryColor: primaryColor,
        widgetPosition: position,
      });
      setStatus("Configuration saved.");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleConnect() {
    const domain = shopInput.trim();
    if (!domain) return;
    setShop(domain);
    startOAuth(domain);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-accent-deep text-display-lg font-bold">
            Widget Configuration
          </h2>
          <p className="text-muted-foreground text-sm">
            {connected ? (
              <>
                Store: <span className="font-medium">{shop}</span>
              </>
            ) : (
              "Preview the full widget setup — connect Shopify to save changes."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading ? (
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          ) : null}
          <Button onClick={() => void handleSave()} disabled={!connected || saving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {!connected ? (
        <Card className="border-primary/30 bg-accent/20 rounded-lg">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="shop-domain">Connect your Shopify store</Label>
              <Input
                id="shop-domain"
                placeholder="your-store.myshopify.com"
                value={shopInput}
                onChange={(e) => setShopInput(e.target.value)}
              />
            </div>
            <Button onClick={handleConnect}>Connect with Shopify</Button>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="text-primary text-sm" role="status">
          {status}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-6">
          {/* Deployment */}
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Rocket className="h-4 w-4" aria-hidden="true" />
                Deployment
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Theme app embed</div>
                  <p className="text-muted-foreground text-xs">
                    Enable the chat widget on your storefront.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={connected ? "success" : "neutral"}>
                    {connected ? "● Live" : "● Not connected"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    disabled={!connected}
                  >
                    <a
                      href={
                        connected
                          ? `https://${shop}/admin/themes/current/editor?context=apps`
                          : "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      Open theme editor
                    </a>
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Show widget to visitors</div>
                  <p className="text-muted-foreground text-xs">
                    Toggle visibility without disabling the app embed.
                  </p>
                </div>
                <Switch
                  checked={showWidget}
                  onCheckedChange={setShowWidget}
                  aria-label="Show widget to visitors"
                />
              </div>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4" aria-hidden="true" />
                Appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-1.5">
                <Label>Primary Color</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRIMARY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Primary color ${color}`}
                      onClick={() => setPrimaryColor(color)}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform",
                        primaryColor === color
                          ? "border-ring scale-110"
                          : "border-transparent hover:scale-105",
                      )}
                      style={{ backgroundColor: color }}
                    >
                      {primaryColor === color ? (
                        <Check className="text-white h-4 w-4" aria-hidden="true" />
                      ) : null}
                    </button>
                  ))}
                  <Input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    aria-label="Custom primary color"
                    className="h-8 w-8 cursor-pointer rounded-full border p-0"
                  />
                </div>
              </div>
              <Separator />
              <div className="grid gap-1.5">
                <Label>Header Color</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {HEADER_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Header color ${color}`}
                      onClick={() => setHeaderColor(color)}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform",
                        headerColor === color
                          ? "border-ring scale-110"
                          : "border-transparent hover:scale-105",
                      )}
                      style={{ backgroundColor: color }}
                    >
                      {headerColor === color ? (
                        <Check className="text-white h-4 w-4" aria-hidden="true" />
                      ) : null}
                    </button>
                  ))}
                  <Input
                    type="color"
                    value={headerColor}
                    onChange={(e) => setHeaderColor(e.target.value)}
                    aria-label="Custom header color"
                    className="h-8 w-8 cursor-pointer rounded-full border p-0"
                  />
                </div>
              </div>
              <Separator />
              <div className="grid gap-1.5">
                <Label>Widget Position</Label>
                <Tabs
                  value={position}
                  onValueChange={(v) =>
                    setPosition(v as "bottom-right" | "bottom-left")
                  }
                >
                  <TabsList>
                    <TabsTrigger value="bottom-right">Bottom Right</TabsTrigger>
                    <TabsTrigger value="bottom-left">Bottom Left</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <Separator />
              <div className="grid gap-1.5">
                <Label>Window Size</Label>
                <Tabs
                  value={windowSize}
                  onValueChange={(v) => setWindowSize(v as typeof windowSize)}
                >
                  <TabsList>
                    <TabsTrigger value="small">Small</TabsTrigger>
                    <TabsTrigger value="medium">Medium</TabsTrigger>
                    <TabsTrigger value="large">Large</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <Separator />
              <div className="grid gap-2">
                <Label>Launcher Icon Style</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "chat" as const, label: "Chat Bubble", icon: MessageSquare },
                    { value: "question" as const, label: "Question Mark", icon: HelpCircle },
                    { value: "custom" as const, label: "Custom Image", icon: Upload },
                  ].map((option) => {
                    const Icon = option.icon;
                    const selected = launcherStyle === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLauncherStyle(option.value)}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors",
                          selected
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-input text-muted-foreground hover:bg-muted/50",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-full border",
                            selected ? "border-primary bg-primary/10" : "bg-muted",
                          )}
                        >
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Content & AI Identity */}
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Content &amp; AI Identity
              </CardTitle>
              <CardDescription>
                Name, avatar and starter questions for your assistant.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-wrap items-end gap-4">
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor="ai-assistant-name">AI Assistant Name</Label>
                  <Input
                    id="ai-assistant-name"
                    value={widgetName}
                    onChange={(e) => setWidgetName(e.target.value)}
                    className="max-w-xs"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full text-base font-bold">
                    {widgetName.slice(0, 2).toUpperCase()}
                  </div>
                  <Button variant="outline" size="sm">
                    Change Avatar
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="grid gap-1.5">
                <Label htmlFor="welcome-msg">Welcome Message</Label>
                <Input
                  id="welcome-msg"
                  value={welcomeMsg}
                  onChange={(e) => setWelcomeMsg(e.target.value)}
                />
              </div>
              <Separator />
              <div className="grid gap-2">
                <Label>Quick-reply chips</Label>
                {quickReplies.map((reply, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={reply}
                      onChange={(e) =>
                        setQuickReplies((prev) =>
                          prev.map((r, idx) => (idx === i ? e.target.value : r)),
                        )
                      }
                      aria-label={`Quick reply ${i + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground h-9 w-9"
                      aria-label={`Remove quick reply ${i + 1}`}
                      onClick={() =>
                        setQuickReplies((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() => setQuickReplies((prev) => [...prev, ""])}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add quick reply
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Preview */}
        <div className="flex flex-col gap-4">
          <Card className="sticky top-0 rounded-lg">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Live Preview</CardTitle>
              <Tabs
                value={previewDevice}
                onValueChange={(v) => setPreviewDevice(v as typeof previewDevice)}
              >
                <TabsList>
                  <TabsTrigger value="desktop" aria-label="Desktop preview">
                    <Monitor className="h-4 w-4" aria-hidden="true" />
                  </TabsTrigger>
                  <TabsTrigger value="mobile" aria-label="Mobile preview">
                    <Smartphone className="h-4 w-4" aria-hidden="true" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div
                className={cn(
                  "bg-muted/50 relative mx-auto overflow-hidden rounded-lg border",
                  previewDevice === "desktop" ? "h-[420px] w-full" : "h-[520px] w-60",
                )}
              >
                {/* Browser chrome */}
                <div className="bg-muted absolute top-0 right-0 left-0 flex h-7 items-center gap-1 border-b px-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                  {previewDevice === "desktop" ? (
                    <span className="text-muted-foreground mx-auto rounded bg-background px-3 text-[9px]">
                      your-store.myshopify.com
                    </span>
                  ) : null}
                </div>

                {/* Storefront mock */}
                <div className="bg-background absolute top-7 right-0 left-0 bottom-0 overflow-hidden">
                  {previewDevice === "desktop" ? (
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between border-b px-5 py-2">
                        <span className="text-accent-deep text-sm font-bold tracking-widest">
                          LUMINA
                        </span>
                        <div className="hidden gap-4 text-[9px] font-medium text-muted-foreground sm:flex">
                          <span>SHOP</span>
                          <span>NEW ARRIVALS</span>
                          <span>ABOUT</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Search className="h-3 w-3" aria-hidden="true" />
                          <ShoppingBag className="h-3 w-3" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="flex flex-1 items-center justify-center bg-muted/30">
                        <div className="text-center">
                          <p className="text-accent-deep text-2xl font-black tracking-tight">
                            SUMMER
                          </p>
                          <p className="text-muted-foreground text-[10px]">
                            COLLECTION
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between px-4 py-2">
                        <span className="text-accent-deep text-xs font-bold tracking-widest">
                          LUMINA
                        </span>
                        <ShoppingBag className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
                      </div>
                      <div className="flex flex-1 items-center justify-center bg-muted/30">
                        <p className="text-accent-deep text-lg font-black tracking-tight">
                          SUMMER
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Chat widget overlay */}
                  {showWidget ? (
                    <div
                      className={cn(
                        "absolute flex flex-col overflow-hidden rounded-xl border bg-card shadow-lg",
                        position === "bottom-right" ? "right-3" : "left-3",
                        previewDevice === "desktop"
                          ? "bottom-3 w-56"
                          : "right-2 bottom-2 left-2 w-auto",
                      )}
                      style={{
                        width: previewDevice === "mobile" ? undefined : windowSize === "small" ? 200 : windowSize === "large" ? 260 : 224,
                      }}
                    >
                      <div
                        className="flex items-center justify-between px-3 py-2 text-white"
                        style={{ backgroundColor: headerColor }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[8px]">
                            {widgetName.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <p className="text-[10px] leading-tight font-semibold">
                              {widgetName}
                            </p>
                            <p className="text-[8px] leading-tight opacity-80">
                              ● Typically replies instantly
                            </p>
                          </div>
                        </div>
                        <X className="h-3 w-3" aria-hidden="true" />
                      </div>
                      <div className="flex flex-col gap-2 p-2">
                        <span className="text-muted-foreground text-center text-[8px]">
                          Today 9:41 AM
                        </span>
                        <div className="bg-muted max-w-[90%] rounded-lg rounded-bl-sm px-2 py-1.5 text-[9px]">
                          {welcomeMsg}
                        </div>
                        {quickReplies.filter(Boolean).map((reply) => (
                          <span
                            key={reply}
                            className="border-primary/40 text-primary ml-auto rounded-full border px-2 py-0.5 text-[8px]"
                          >
                            {reply}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 border-t px-2 py-1.5">
                        <span className="text-muted-foreground flex-1 text-[9px]">
                          Type your message here…
                        </span>
                        <Send className="text-primary h-3 w-3" aria-hidden="true" />
                      </div>
                      <p className="text-muted-foreground border-t py-1 text-center text-[7px]">
                        Powered by AIChat
                      </p>
                    </div>
                  ) : null}

                  {/* Launcher */}
                  {!showWidget ? (
                    <button
                      type="button"
                      className="absolute bottom-3 flex h-9 w-9 items-center justify-center rounded-full text-white shadow"
                      style={{ backgroundColor: primaryColor, right: position === "bottom-right" ? 12 : undefined, left: position === "bottom-left" ? 12 : undefined }}
                      aria-label="Widget launcher"
                    >
                      {launcherStyle === "chat" ? (
                        <MessageSquare className="h-4 w-4" aria-hidden="true" />
                      ) : launcherStyle === "question" ? (
                        <HelpCircle className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Upload className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                Preview reflects your current appearance and content settings.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

class WidgetConfigErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="text-destructive flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p className="font-semibold">Widget config failed to render</p>
          <p className="break-all font-mono text-xs">
            {String(this.state.error?.message || this.state.error)}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WidgetConfigClient() {
  return (
    <WidgetConfigErrorBoundary>
      <WidgetConfigInner />
    </WidgetConfigErrorBoundary>
  );
}
