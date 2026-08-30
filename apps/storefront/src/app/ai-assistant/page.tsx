"use client";

import { useState } from "react";
import {
  Bot,
  FlaskConical,
  RefreshCw,
  Send,
  ShieldCheck,
  Tag,
  User,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const TONES = ["Friendly & Helpful", "Professional & Formal", "Casual & Energetic"];
const LANGUAGES = [
  "Auto-detect (Recommended)",
  "English",
  "Chinese (Simplified)",
  "Spanish",
];

const HANDOFF_RULES = [
  {
    label: "Customer explicitly asks for human",
    description: 'e.g., "Speak to a real person", "agent"',
    defaultChecked: true,
  },
  {
    label: "Complaint detected",
    description: 'Negative sentiment or keywords like "angry", "terrible"',
    defaultChecked: true,
  },
  {
    label: "High-value order query",
    description: "Orders over $500",
    defaultChecked: false,
  },
];

const PERMISSIONS = [
  {
    icon: ShieldCheck,
    label: "View Orders / Track Shipping",
    enabled: true,
  },
  {
    icon: Tag,
    label: "Issue Discounts",
    enabled: false,
  },
  {
    icon: RefreshCw,
    label: "Process Refunds",
    enabled: false,
  },
];

function TestAIPanel() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant" as const,
      content: "Hi there! I'm Ava. How can I help you with your order today?",
    },
    {
      role: "user" as const,
      content: "Where is my package? The tracking hasn't updated.",
    },
  ]);
  const [typing, setTyping] = useState(false);

  function handleSend() {
    const text = message.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setMessage("");
    setTyping(true);
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Thanks! I've noted that. In the sandbox I can simulate a reply using your current persona settings.",
        },
      ]);
      setTyping(false);
    }, 900);
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
            setMessages([
              {
                role: "assistant",
                content: "Hi there! I'm Ava. How can I help you with your order today?",
              },
            ]);
            setTyping(false);
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-background p-4">
        <div className="text-center">
          <span className="text-muted-foreground text-[10px] tracking-wider uppercase">
            Today, 10:42 AM
          </span>
        </div>
        {messages.map((m, i) =>
          m.role === "assistant" ? (
            <div key={i} className="flex max-w-[85%] items-end gap-2">
              <Avatar className="bg-primary/10 text-primary h-6 w-6">
                <AvatarFallback className="text-xs">
                  <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted text-card-foreground rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
                {m.content}
              </div>
            </div>
          ) : (
            <div
              key={i}
              className="bg-primary text-primary-foreground ml-auto flex max-w-[85%] items-end gap-2 self-end"
            >
              <div className="rounded-2xl rounded-br-sm px-3 py-2 text-sm">
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
        <div className="flex items-center gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Type a message to test..."
            className="rounded-full bg-background"
          />
          <Button
            size="icon"
            onClick={handleSend}
            className="h-9 w-9 shrink-0 rounded-full"
            aria-label="Send test message"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-center text-[10px]">
          Sandbox environment • Analytics disabled
        </p>
      </div>
    </Card>
  );
}

export default function AiAssistantPage() {
  const [enabled, setEnabled] = useState(true);
  const [personaName, setPersonaName] = useState("Ava");
  const [tone, setTone] = useState(TONES[0]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [handoff, setHandoff] = useState<boolean[]>(
    HANDOFF_RULES.map((r) => r.defaultChecked),
  );
  const [permissions, setPermissions] = useState<boolean[]>(
    PERMISSIONS.map((p) => p.enabled),
  );

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
                Enable or disable the AI assistant globally.
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
                    {personaName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Button variant="outline" size="sm">
                  Change Avatar
                </Button>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ai-name">AI Name</Label>
                <Input
                  id="ai-name"
                  value={personaName}
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
                  {LANGUAGES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Behavior & Handoff */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">Behavior &amp; Handoff</CardTitle>
            <CardDescription>
              Define when the AI should escalate the conversation to a human
              agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {HANDOFF_RULES.map((rule, i) => (
              <label
                key={rule.label}
                className="flex cursor-pointer items-start gap-3"
              >
                <input
                  type="checkbox"
                  checked={handoff[i]}
                  onChange={(e) =>
                    setHandoff((prev) =>
                      prev.map((v, idx) => (idx === i ? e.target.checked : v)),
                    )
                  }
                  className="border-input mt-1 h-4 w-4 rounded"
                  style={{ accentColor: "var(--primary)" }}
                />
                <div>
                  <span className="text-sm font-medium">{rule.label}</span>
                  <p className="text-muted-foreground text-xs">
                    {rule.description}
                  </p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        {/* AI Permissions */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">AI Permissions</CardTitle>
            <CardDescription>
              Control what actions the AI can perform on behalf of your store.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {PERMISSIONS.map((permission, i) => {
              const Icon = permission.icon;
              const isEnabled = permissions[i];
              return (
                <div
                  key={permission.label}
                  className={`border-input flex items-center justify-between gap-3 rounded-lg border p-4 ${
                    isEnabled ? "bg-muted/30" : "opacity-70"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={
                        isEnabled
                          ? "text-primary h-5 w-5"
                          : "text-muted-foreground h-5 w-5"
                      }
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium">{permission.label}</span>
                  </div>
                  {isEnabled ? (
                    <span
                      className="bg-primary h-2 w-2 rounded-full"
                      title="Enabled"
                      aria-label="Enabled"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setPermissions((prev) =>
                          prev.map((v, idx) => (idx === i ? true : v)),
                        )
                      }
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      Enable
                    </button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* System Prompt */}
        <Card className="mb-8 rounded-lg">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                System Prompt (Advanced)
              </CardTitle>
              <CardDescription>
                Provide base instructions to guide the AI&apos;s core logic and
                boundaries.
              </CardDescription>
            </div>
            <Badge variant="neutral">Expert Mode</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              rows={6}
              className="bg-muted/30 font-mono text-xs"
              defaultValue="You are Ava, the AI assistant for this Shopify store. Always stay polite, concise and never promise delivery dates you cannot verify."
            />
            <div className="flex justify-end">
              <Button className="bg-primary-container hover:bg-primary-container/90 text-primary-foreground">
                Save Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-5 xl:col-span-4">
        <div className="sticky top-4">
          <TestAIPanel />
        </div>
      </div>
    </div>
  );
}
