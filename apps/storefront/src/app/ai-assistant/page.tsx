"use client";

import { Bot, FlaskConical, RefreshCw, Send, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Textarea } from "@/components/ui/textarea";
import { useShopSession } from "@/hooks/useShopSession";
import {
  fetchBotSettings,
  previewAi,
  saveBotSettings,
  type AiPersonaDraft,
} from "@/lib/merchant-api";
import { useEffect, useState } from "react";

const TONES = ["Friendly & Helpful", "Professional & Formal", "Casual & Energetic"];
const LANGUAGE_OPTIONS: { label: string; code: string }[] = [
  { label: "Auto-detect (Recommended)", code: "auto" },
  { label: "English", code: "en" },
  { label: "Chinese (Simplified)", code: "zh-Hans" },
  { label: "Spanish", code: "es" },
];

const DEFAULT_SYSTEM_PROMPT =
  "You are Ava, the AI assistant for this Shopify store. Always stay polite, concise and never promise delivery dates you cannot verify.";

// 转人工规则与工具权限（Issue Discounts / Process Refunds）v1 不做：前者需要转人工
// 触发逻辑，后者是目前不存在的写操作工具、风险高。功能落地前不摆出死开关（沿用
// 「不暴露未完成功能」的约定）。

type ChatBubble = { role: "assistant" | "user"; content: string };

function TestAIPanel({
  draft,
  shop,
  token,
  connected,
}: {
  draft: AiPersonaDraft;
  shop: string;
  token: string;
  connected: boolean;
}) {
  const greeting = `Hi there! I'm ${
    draft.aiPersonaName?.trim() || "Ava"
  }. How can I help you with your order today?`;
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatBubble[]>([
    { role: "assistant", content: greeting },
  ]);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    const text = message.trim();
    if (!text || typing) return;
    if (!connected) {
      setError("Connect your Shopify store to test the assistant.");
      return;
    }
    setError("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setMessage("");
    setTyping(true);
    try {
      // 用当前（未保存的）草稿设置试聊，商家保存前就能看到效果。
      const { reply } = await previewAi(shop, token, { ...draft, message: text });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setTyping(false);
    }
  }

  return (
    <Card className="flex h-full max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-lg">
      <CardHeader className="bg-muted/40 flex-row items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="text-primary h-5 w-5" aria-hidden="true" />
          <CardTitle className="text-base">Test your AI</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground h-8 w-8"
          aria-label="Reset test conversation"
          onClick={() => {
            setMessages([{ role: "assistant", content: greeting }]);
            setTyping(false);
            setError("");
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-background p-4">
        {messages.map((m, i) =>
          m.role === "assistant" ? (
            <div key={i} className="flex max-w-[85%] items-end gap-2">
              <Avatar className="bg-primary/10 text-primary h-6 w-6">
                <AvatarFallback className="text-xs">
                  <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted text-card-foreground rounded-2xl rounded-bl-sm px-3 py-2 text-sm whitespace-pre-wrap">
                {m.content}
              </div>
            </div>
          ) : (
            <div
              key={i}
              className="bg-primary text-primary-foreground ml-auto flex max-w-[85%] items-end gap-2 self-end"
            >
              <div className="rounded-2xl rounded-br-sm px-3 py-2 text-sm whitespace-pre-wrap">
                {m.content}
              </div>
              <Avatar className="bg-border text-muted-foreground h-6 w-6">
                <AvatarFallback className="text-xs">
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                </AvatarFallback>
              </Avatar>
            </div>
          ),
        )}
        {typing ? (
          <div className="flex max-w-[85%] items-end gap-2">
            <Avatar className="bg-primary/10 text-primary h-6 w-6">
              <AvatarFallback className="text-xs">
                <Bot className="h-3.5 w-3.5" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            <div className="bg-muted flex h-10 items-center gap-1 rounded-2xl rounded-bl-sm px-4">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="bg-primary h-1.5 w-1.5 animate-bounce rounded-full"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>

      <div className="shrink-0 border-t p-3">
        {error ? (
          <p className="text-destructive mb-2 text-center text-xs">{error}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSend();
            }}
            placeholder="Type a message to test..."
            className="rounded-full bg-background"
          />
          <Button
            size="icon"
            onClick={() => void handleSend()}
            disabled={typing}
            className="h-9 w-9 shrink-0 rounded-full"
            aria-label="Send test message"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-center text-[10px]">
          Sandbox — uses your unsaved settings, not shown to customers
        </p>
      </div>
    </Card>
  );
}

export default function AiAssistantPage() {
  const { shop, token, ready } = useShopSession();
  const connected = Boolean(shop && token);

  const [enabled, setEnabled] = useState(true);
  const [personaName, setPersonaName] = useState("Ava");
  const [tone, setTone] = useState(TONES[0]);
  const [language, setLanguage] = useState("auto");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // 挂载时拉取已保存设置回填。拉不到（未连接/离线）就用默认值，不报错阻断页面。
  useEffect(() => {
    if (!ready || !connected) return;
    void fetchBotSettings(shop, token)
      .then((s) => {
        if (typeof s.aiEnabled === "boolean") setEnabled(s.aiEnabled);
        if (s.aiPersonaName) setPersonaName(s.aiPersonaName);
        if (s.aiTone) setTone(s.aiTone);
        if (s.aiLanguage) setLanguage(s.aiLanguage);
        if (s.aiSystemPrompt) setSystemPrompt(s.aiSystemPrompt);
      })
      .catch(() => setStatus("Couldn't load saved settings — showing defaults."));
  }, [ready, connected, shop, token]);

  const draft: AiPersonaDraft = {
    aiEnabled: enabled,
    aiPersonaName: personaName,
    aiTone: tone,
    aiLanguage: language,
    aiSystemPrompt: systemPrompt,
  };

  async function handleSave() {
    if (!connected) {
      setStatus("Connect your Shopify store to save settings.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      await saveBotSettings(shop, token, draft);
      setStatus("Saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="flex flex-col gap-6 lg:col-span-7 xl:col-span-8">
        <div>
          <h2 className="text-accent-deep text-display-lg font-bold">
            AI Assistant Settings
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure how your AI interacts with customers on your storefront.
          </p>
        </div>

        {/* AI Status */}
        <Card className="rounded-lg">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">AI Status</CardTitle>
              <CardDescription>
                When off, the AI stops auto-replying and new chats wait for your
                team.
              </CardDescription>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Toggle AI service"
            />
          </CardHeader>
        </Card>

        {/* Persona */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">Persona</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="bg-primary/10 text-primary h-16 w-16">
                  <AvatarFallback className="text-lg font-bold">
                    {(personaName || "AI").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ai-name">AI Name</Label>
                <Input
                  id="ai-name"
                  value={personaName}
                  maxLength={40}
                  onChange={(e) => setPersonaName(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="tone">Conversational Tone</Label>
                <select
                  id="tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="border-input bg-card focus:border-ring focus:ring-ring/20 h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2"
                >
                  {TONES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="language">Primary Language</Label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="border-input bg-card focus:border-ring focus:ring-ring/20 h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2"
                >
                  {LANGUAGE_OPTIONS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Prompt */}
        <Card className="mb-8 rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">System Prompt (Advanced)</CardTitle>
            <CardDescription>
              Extra instructions for your assistant. Safety rules (store scope,
              ignoring injected instructions) always apply and can&apos;t be
              overridden here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              rows={6}
              maxLength={2000}
              className="bg-muted/30 font-mono text-xs"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
            <div className="flex items-center justify-end gap-3">
              {status ? (
                <span className="text-muted-foreground text-xs">{status}</span>
              ) : null}
              <Button
                onClick={() => void handleSave()}
                disabled={saving}
                className="bg-primary-container hover:bg-primary-container/90 text-primary-foreground"
              >
                {saving ? "Saving…" : "Save Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-5 xl:col-span-4">
        <div className="sticky top-4">
          <TestAIPanel
            draft={draft}
            shop={shop}
            token={token}
            connected={connected}
          />
        </div>
      </div>
    </div>
  );
}
