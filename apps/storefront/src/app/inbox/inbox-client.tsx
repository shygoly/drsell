"use client";

import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Hand, Send } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchThreadMessages } from "@/lib/api";
import type { ChatMessage, Conversation, ConversationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { value: ConversationStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ai", label: "AI Handling" },
  { value: "pending", label: "Pending" },
  { value: "human", label: "Human" },
];

const STATUS_BADGE = {
  ai: { label: "AI handling", variant: "success" as const },
  pending: { label: "Pending", variant: "warning" as const },
  human: { label: "Human", variant: "info" as const },
} as const;

type InboxClientProps = {
  initialConversations: Conversation[];
};

export function InboxClient({ initialConversations }: InboxClientProps) {
  const [conversations] = useState<Conversation[]>(initialConversations);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [selectedId, setSelectedId] = useState(initialConversations[0]?.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const filtered =
    filter === "all"
      ? conversations
      : conversations.filter((c) => c.status === filter);
  const selected = conversations.find((c) => c.id === selectedId);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    void fetchThreadMessages(selectedId).then((data) => {
      if (!cancelled) {
        setMessages(data ?? []);
        setLoadingMessages(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

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

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
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
                      selectedId === c.id && "bg-muted",
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
                        {c.topic}
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
                    <div className="text-sm font-semibold">{selected.customer}</div>
                    <div className="text-muted-foreground text-xs">
                      {selected.topic} · {selected.channel}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={selected.status === "human" ? "secondary" : "default"}
                    disabled
                  >
                    <Hand className="h-4 w-4" aria-hidden="true" />
                    Take over
                  </Button>
                  <Button size="sm" variant="outline" disabled>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Resolve
                  </Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted/40 p-4">
                {loadingMessages ? (
                  <p className="text-muted-foreground text-sm">Loading messages…</p>
                ) : messages.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No messages in this thread.</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[75%]",
                        m.role === "assistant" ? "self-end" : "self-start",
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-xl px-4 py-2.5 text-sm",
                          m.role === "assistant"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-card text-card-foreground rounded-bl-sm border shadow-xs",
                        )}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t p-3">
                <div className="border-input bg-card flex items-center gap-2 rounded-lg border px-3 py-2">
                  <input
                    type="text"
                    placeholder="Type a message as human agent..."
                    className="min-w-0 flex-1 text-sm outline-none"
                    disabled
                  />
                  <Button size="icon" aria-label="Send message" disabled>
                    <Send className="h-4 w-4" aria-hidden="true" />
                  </Button>
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
      </div>
    </div>
  );
}
