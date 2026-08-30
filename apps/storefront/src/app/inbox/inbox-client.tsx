"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Gift,
  Hand,
  Mail,
  MapPin,
  Paperclip,
  Search,
  Send,
  ShoppingBag,
  Smile,
  Truck,
  Undo2,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchThreadMessages } from "@/lib/api";
import type { ChatMessage, Conversation, ConversationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { value: "open" | "mine" | "resolved"; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "mine", label: "Mine" },
  { value: "resolved", label: "Resolved" },
];

const STATUS_BADGE = {
  ai: { label: "AI handling", variant: "success" as const },
  pending: { label: "Pending", variant: "warning" as const },
  human: { label: "Human", variant: "info" as const },
} as const;

const FALLBACK_THREAD_MESSAGES: Record<string, ChatMessage[]> = {
  c1: [
    {
      id: "m1",
      role: "user",
      content: "Where is my order #10294? The tracking hasn't updated.",
      createdAt: "2026-08-30T10:42:00.000Z",
    },
    {
      id: "m2",
      role: "assistant",
      content:
        "Hi John! I've checked order #10294 — it's currently in transit and expected to arrive tomorrow by 8 PM. Is there anything else I can help you with?",
      createdAt: "2026-08-30T10:42:05.000Z",
    },
  ],
  c2: [
    {
      id: "m1",
      role: "user",
      content: "Do you ship to Canada?",
      createdAt: "2026-08-30T10:40:00.000Z",
    },
    {
      id: "m2",
      role: "assistant",
      content:
        "Yes, we ship to Canada! Standard delivery takes 3–5 business days and is free on orders over $50.",
      createdAt: "2026-08-30T10:40:04.000Z",
    },
  ],
  c3: [
    {
      id: "m1",
      role: "user",
      content: "Can I exchange for a larger size?",
      createdAt: "2026-08-30T10:37:00.000Z",
    },
    {
      id: "m2",
      role: "assistant",
      content:
        "Of course! You can start an exchange from your order page within 30 days. I can help you set that up — what's your order number?",
      createdAt: "2026-08-30T10:37:08.000Z",
    },
  ],
  c4: [
    {
      id: "m1",
      role: "user",
      content: "Thanks for the quick reply!",
      createdAt: "2026-08-30T10:30:00.000Z",
    },
    {
      id: "m2",
      role: "assistant",
      content: "You're very welcome, Sarah! Let me know if you need anything else. 😊",
      createdAt: "2026-08-30T10:30:02.000Z",
    },
  ],
  c5: [
    {
      id: "m1",
      role: "user",
      content: "Agent takeover requested",
      createdAt: "2026-08-30T10:27:00.000Z",
    },
    {
      id: "m2",
      role: "assistant",
      content:
        "A human agent has been notified about this conversation. They'll join shortly.",
      createdAt: "2026-08-30T10:27:03.000Z",
    },
  ],
};

function buildFallbackMessages(conversation: Conversation): ChatMessage[] {
  if (FALLBACK_THREAD_MESSAGES[conversation.id]) {
    return FALLBACK_THREAD_MESSAGES[conversation.id];
  }
  return [
    {
      id: "m1",
      role: "user",
      content: conversation.preview || `Hi, I need help with ${conversation.topic.toLowerCase()}.`,
      createdAt: "2026-08-30T10:42:00.000Z",
    },
    {
      id: "m2",
      role: "assistant",
      content: `Thanks for reaching out! I'm looking into your ${conversation.topic.toLowerCase()} and will help you shortly.`,
      createdAt: "2026-08-30T10:42:05.000Z",
    },
  ];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
}

type InboxClientProps = {
  initialConversations: Conversation[];
};

export function InboxClient({ initialConversations }: InboxClientProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(initialConversations[0]?.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialConversations[0]
      ? buildFallbackMessages(initialConversations[0])
      : [],
  );
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "resolved" && !resolvedIds.includes(c.id)) return false;
      if (filter === "mine" && c.status !== "human") return false;
      if (filter === "open" && resolvedIds.includes(c.id)) return false;
      if (!q) return true;
      return (
        c.customer.toLowerCase().includes(q) ||
        c.topic.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q)
      );
    });
  }, [conversations, filter, resolvedIds, search]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const isResolved = selected ? resolvedIds.includes(selected.id) : false;

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    void fetchThreadMessages(selectedId).then((data) => {
      if (cancelled) return;
      const found = conversations.find((c) => c.id === selectedId);
      setMessages(
        data && data.length > 0 ? data : found ? buildFallbackMessages(found) : [],
      );
      setLoadingMessages(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function handleTakeOver() {
    if (!selected) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, status: "human" as ConversationStatus } : c)),
    );
  }

  function handleResolve() {
    if (!selected) return;
    setResolvedIds((prev) => (prev.includes(selected.id) ? prev : [...prev, selected.id]));
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, status: "human" as ConversationStatus } : c)),
    );
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || !selected) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]);
    setDraft("");
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-ai-${Date.now()}`,
          role: "assistant",
          content: "Got it — a human agent will follow up on this right away.",
          createdAt: new Date().toISOString(),
        },
      ]);
    }, 800);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="bg-accent text-accent-foreground flex items-center justify-center gap-2 rounded-lg px-5 py-2 text-xs font-medium">
        <span className="bg-primary animate-pulse-dot h-2 w-2 rounded-full" />
        <span className="font-bold">AI Service Active</span>
        <span className="opacity-70">|</span>
        <a href="/" className="font-bold underline underline-offset-2">
          View Real-time Metrics
        </a>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* Conversation list */}
        <Card className="min-h-0 gap-0 overflow-hidden rounded-lg py-0">
          <div className="border-b p-3">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList className="w-full">
                {FILTERS.map((f) => (
                  <TabsTrigger key={f.value} value={f.value} className="text-xs">
                    {f.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative mt-2">
              <Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter conversations..."
                className="border-input bg-card focus:border-ring focus:ring-ring/20 h-8 w-full rounded-lg border py-1 pr-2 pl-7 text-xs outline-none focus:ring-2"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-sm">
                <Bot className="text-muted-foreground h-7 w-7" aria-hidden="true" />
                No conversations yet
              </div>
            ) : (
              filtered.map((c) => {
                const badge = STATUS_BADGE[c.status];
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "hover:bg-muted/60 flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors last:border-b-0",
                      selectedId === c.id && "bg-primary/5",
                    )}
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {c.avatarInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {c.customer}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-[11px]">
                          {c.time}
                        </span>
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {c.preview || c.topic}
                      </p>
                      <Badge variant={badge.variant} className="mt-1.5">
                        {badge.label}
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Chat panel */}
        <Card className="min-h-0 gap-0 overflow-hidden rounded-lg py-0">
          {selected ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {selected.avatarInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      {selected.customer}
                      <span className="bg-primary h-2 w-2 rounded-full" aria-label="Online" />
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {selected.channel === "web" ? "Web Store" : selected.channel} • Browsing
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleTakeOver}>
                    <Hand className="h-4 w-4" aria-hidden="true" />
                    Take over
                  </Button>
                  <Button size="sm" onClick={handleResolve} disabled={isResolved}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {isResolved ? "Resolved" : "Resolve"}
                  </Button>
                </div>
              </div>

              <div className="bg-muted/40 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                {loadingMessages ? (
                  <p className="text-muted-foreground text-sm">Loading messages…</p>
                ) : messages.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No messages in this thread.</p>
                ) : (
                  <>
                    <div className="flex justify-center">
                      <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-[10px] tracking-wider uppercase">
                        Today, 10:42 AM
                      </span>
                    </div>
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "max-w-[75%]",
                          m.role === "assistant" ? "self-start" : "self-end",
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-2.5 text-sm",
                            m.role === "assistant"
                              ? "bg-card text-card-foreground border shadow-xs"
                              : "bg-primary text-primary-foreground",
                          )}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 self-start">
                      <Avatar className="bg-primary/10 text-primary h-7 w-7">
                        <AvatarFallback className="text-xs">
                          <Bot className="h-4 w-4" aria-hidden="true" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-muted-foreground text-xs italic">
                        AI is typing...
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="border-t p-3">
                <div className="border-input bg-card rounded-lg border focus-within:border-ring focus-within:ring-ring/20 focus-within:ring-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={2}
                    placeholder="Type a message or use '/' for shortcuts..."
                    className="w-full resize-none bg-transparent p-3 text-sm outline-none"
                  />
                  <div className="flex items-center justify-between border-t px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Add attachment">
                        <Paperclip className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Insert snippet">
                        <Zap className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Insert emoji">
                        <Smile className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground hidden text-xs xl:inline">
                        Press Enter to send
                      </span>
                      <Button size="icon" onClick={handleSend} className="h-8 w-8 rounded-md" aria-label="Send message">
                        <Send className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-sm">
              <Bot className="text-muted-foreground h-8 w-8" aria-hidden="true" />
              Select a conversation to view details
            </div>
          )}
        </Card>

        {/* Customer context panel */}
        <aside className="bg-card hidden h-full flex-col overflow-y-auto rounded-lg border xl:flex">
          {selected ? (
            <>
              <div className="border-b p-4 text-center">
                <Avatar className="bg-primary/10 text-primary mx-auto h-20 w-20">
                  <AvatarFallback className="text-xl font-bold">
                    {selected.avatarInitials}
                  </AvatarFallback>
                </Avatar>
                <h3 className="text-accent-deep mt-3 text-lg font-bold">
                  {selected.customer}
                </h3>
                <p className="text-muted-foreground text-sm">Customer since 2022</p>
              </div>

              <div className="space-y-3 border-b px-4 py-4 text-sm">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    Email
                  </span>
                  <span className="w-32 truncate text-right font-medium">
                    {slugify(selected.customer)}@example.com
                  </span>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Location
                  </span>
                  <span className="font-medium">Portland, OR</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                    Lifetime Value
                  </span>
                  <span className="text-primary font-medium">$450.00</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-b px-4 py-4">
                {["VIP", "Returning"].map((tag) => (
                  <span key={tag} className="bg-muted rounded px-2 py-1 text-xs font-medium">
                    {tag}
                  </span>
                ))}
                <span className="bg-accent text-accent-foreground rounded px-2 py-1 text-xs font-medium">
                  + Add tag
                </span>
              </div>

              <div className="border-b bg-muted/20 px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-accent-deep text-sm font-semibold">Recent Orders</h4>
                  <a href="#" className="text-primary text-xs hover:underline">
                    View all
                  </a>
                </div>
                <div className="bg-card rounded-lg border p-3">
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold">#GT-8992</p>
                      <p className="text-muted-foreground text-xs">Oct 12, 2023</p>
                    </div>
                    <Badge variant="success">In Transit</Badge>
                  </div>
                  <div className="flex items-center gap-3 border-t pt-3">
                    <div className="bg-muted flex h-10 w-10 items-center justify-center rounded border">
                      <Truck className="text-primary h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Smart Planter Pro</p>
                      <p className="text-muted-foreground text-xs">Qty: 1 • $129.00</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-b px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-accent-deep text-sm font-semibold">Active Cart</h4>
                  <span className="bg-muted rounded px-2 py-0.5 text-xs">$45.00</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-muted flex h-12 w-12 items-center justify-center rounded border">
                    <ShoppingBag className="text-muted-foreground h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Organic Plant Food</p>
                    <p className="text-muted-foreground text-xs">Added 10m ago</p>
                  </div>
                </div>
              </div>

              <div className="px-4 py-4">
                <h4 className="text-accent-deep mb-3 text-sm font-semibold">Quick Actions</h4>
                <div className="space-y-2">
                  {[
                    { icon: Gift, label: "Send discount", className: "text-primary" },
                    { icon: Truck, label: "Track order", className: "text-primary" },
                    { icon: Undo2, label: "Refund order", className: "text-destructive" },
                  ].map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.label}
                        type="button"
                        className="border-input bg-card hover:border-primary/50 hover:bg-muted/40 flex w-full items-center justify-between rounded-lg border p-2 text-sm transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <Icon className={cn("h-4 w-4", action.className)} aria-hidden="true" />
                          {action.label}
                        </span>
                        <ChevronRight className="text-muted-foreground h-4 w-4" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm">
              <Bot className="text-muted-foreground h-8 w-8" aria-hidden="true" />
              Select a conversation to see customer context
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
