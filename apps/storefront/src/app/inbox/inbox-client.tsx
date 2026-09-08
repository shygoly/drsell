"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Clock,
  Globe,
  Hand,
  Paperclip,
  Search,
  Send,
  Smile,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  closeThread,
  fetchThreadMessages,
  replyToThread,
  takeOverThread,
} from "@/lib/api";
import { useShopSession } from "@/hooks/useShopSession";
import type { ChatMessage, Conversation, ConversationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { value: "open" | "mine" | "resolved"; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "mine", label: "Mine" },
  { value: "resolved", label: "Resolved" },
];

const CHANNEL_LABEL: Record<Conversation["channel"], string> = {
  web: "Web Store",
  instagram: "Instagram",
  email: "Email",
  whatsapp: "WhatsApp",
};

const STATUS_BADGE: Record<
  ConversationStatus,
  { label: string; variant: "success" | "warning" | "info" | "secondary" }
> = {
  ai: { label: "AI handling", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  human: { label: "Human", variant: "info" },
  closed: { label: "Closed", variant: "secondary" },
};

/*
 * 这里原本有 FALLBACK_THREAD_MESSAGES 与 buildFallbackMessages：真实消息为空或
 * 请求失败时，用编造的对话顶上（含虚构订单号 #10294、"expected to arrive
 * tomorrow by 8 PM"、"free on orders over $50" 之类的配送承诺）。那等于把商家
 * 从未做过的承诺伪装成 AI 的历史回复，已整段删除——拿不到消息就显示空态。
 */

interface InboxClientProps {
  initialConversations: Conversation[];
}

export function InboxClient({ initialConversations }: InboxClientProps) {
  const { token } = useShopSession();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(initialConversations[0]?.id ?? "");
  // 初始为空：真实消息由下面的 effect 拉取，拿不到就保持空态。
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "resolved" && c.status !== "closed") return false;
      if (filter === "mine" && c.status !== "human") return false;
      if (filter === "open" && c.status === "closed") return false;
      if (!q) return true;
      return (
        c.customer.toLowerCase().includes(q) ||
        c.topic.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q)
      );
    });
  }, [conversations, filter, search]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const isResolved = selected?.status === "closed";

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    if (!token) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    void fetchThreadMessages(selectedId, token)
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        setMessages(data && data.length > 0 ? data : []);
        setLoadingMessages(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, token]);

  function patchStatus(id: string, status: ConversationStatus) {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c)),
    );
  }

  /**
   * 接管 / 解决 / 发送以前全是纯本地 state：刷新页面接管就没了，
   * 商家发的消息从未离开浏览器，而 status='human' 后端根本没人写。
   * 现在三个动作都落到服务端，失败要说人话而不是静默吞掉。
   */
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleTakeOver() {
    if (!selected || !token) return;
    const id = selected.id;
    void run(async () => {
      const r = await takeOverThread(id, token);
      patchStatus(id, r.status);
    });
  }

  function handleResolve() {
    if (!selected || !token) return;
    const id = selected.id;
    void run(async () => {
      const r = await closeThread(id, token);
      patchStatus(id, r.status);
    });
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || !selected || !token) return;
    const id = selected.id;
    void run(async () => {
      const sent = await replyToThread(id, token, text);
      setDraft("");
      setMessages((prev) => [
        ...prev,
        {
          id: sent.id,
          role: sent.role,
          content: sent.content,
          createdAt: sent.createdAt,
        },
      ]);
      patchStatus(id, sent.threadStatus);
    });
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTakeOver}
                    disabled={busy}
                  >
                    <Hand className="h-4 w-4" aria-hidden="true" />
                    Take over
                  </Button>
                  <Button size="sm" onClick={handleResolve} disabled={isResolved || busy}>
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
                    {/* 时间取第一条消息，不再写死成 "Today, 10:42 AM" */}
                    <div className="flex justify-center">
                      <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-[10px] tracking-wider uppercase">
                        {new Date(messages[0].createdAt).toLocaleString()}
                      </span>
                    </div>
                    {/*
                      顾客在左，店家（AI + 人工）在右——这是商家的收件箱，
                      右侧应当是「我们说的话」。人工回复另给一套配色，
                      否则商家分不清哪句是自己说的、哪句是 AI 说的。
                    */}
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "max-w-[75%]",
                          m.role === "user" ? "self-start" : "self-end",
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-2.5 text-sm",
                            m.role === "user" &&
                              "bg-card text-card-foreground border shadow-xs",
                            m.role === "assistant" && "bg-primary text-primary-foreground",
                            m.role === "agent" &&
                              "bg-accent text-accent-foreground border-primary/40 border",
                          )}
                        >
                          {m.content}
                        </div>
                        {m.role === "agent" ? (
                          <div className="text-muted-foreground mt-1 text-right text-[10px]">
                            You
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="border-t p-3">
                {error ? (
                  <div
                    role="alert"
                    className="border-destructive/40 bg-destructive/10 text-destructive mb-2 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs"
                  >
                    <span>Could not reach the server — nothing was sent. {error}</span>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="font-medium underline underline-offset-2"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
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
                      <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={busy}
                        className="h-8 w-8 rounded-md"
                        aria-label="Send message"
                      >
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
                <p className="text-muted-foreground text-sm">Storefront visitor</p>
              </div>

              <div className="space-y-3 border-b px-4 py-4 text-sm">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Globe className="h-4 w-4" aria-hidden="true" />
                    Channel
                  </span>
                  <span className="font-medium">{CHANNEL_LABEL[selected.channel]}</span>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Bot className="h-4 w-4" aria-hidden="true" />
                    Status
                  </span>
                  <span className="font-medium">{STATUS_BADGE[selected.status].label}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    Last active
                  </span>
                  <span className="font-medium">{selected.time}</span>
                </div>
              </div>

              {/*
                这里原本渲染的是设计稿留下的假客户档案（邮箱、Portland OR、
                Lifetime Value $450、订单 #GT-8992 Smart Planter Pro、购物车），
                以及三个没有 onClick 的 Quick Actions。那是编造的客户身份与交易
                记录，会被 Shopify 审核判为 misrepresentation。在真正接入
                Shopify 客户与订单之前，这里只说实话。
              */}
              <div className="px-4 py-4">
                <h4 className="text-accent-deep mb-2 text-sm font-semibold">
                  Customer profile
                </h4>
                <p className="text-muted-foreground text-sm">
                  This conversation is not linked to a Shopify customer, so there is no
                  contact or order history to show here.
                </p>
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
