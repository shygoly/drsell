import { Bot, Globe, Mail, MessageSquare, Smartphone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Conversation } from "@/lib/types";

const CHANNEL_ICON = {
  web: Globe,
  instagram: Smartphone,
  email: Mail,
  whatsapp: MessageSquare,
} as const;

const STATUS_BADGE = {
  ai: { label: "AI handling", variant: "success" as const },
  pending: { label: "Pending", variant: "warning" as const },
  human: { label: "Human", variant: "info" as const },
} as const;

interface LiveConversationsProps {
  conversations: Conversation[];
  /** 空态时的引导动作 */
  onNewConversation?: () => void;
}

/** 会话列表 — Stitch Live Conversations 卡片 → shadcn Card/Badge/Avatar/Button */
export function LiveConversations({
  conversations,
  onNewConversation,
}: LiveConversationsProps) {
  return (
    <Card className="gap-4 rounded-lg p-6">
      <CardHeader className="flex-row items-center justify-between px-0">
        <CardTitle className="text-accent-deep text-base">
          Live Conversations
        </CardTitle>
        <Button variant="outline" size="sm">
          View all
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-0">
        {conversations.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-3 py-10 text-sm">
            <Bot className="text-muted-foreground h-8 w-8" aria-hidden="true" />
            <p>No live conversations right now.</p>
            <Button size="sm" onClick={onNewConversation}>
              Start a conversation
            </Button>
          </div>
        ) : (
          conversations.map((c) => {
            const ChannelIcon = CHANNEL_ICON[c.channel];
            const badge = STATUS_BADGE[c.status];
            return (
              <div
                key={c.id}
                className="hover:bg-muted/60 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {c.avatarInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.customer}
                    </span>
                    <ChannelIcon
                      className="text-muted-foreground h-3.5 w-3.5 shrink-0"
                      aria-label={c.channel}
                    />
                    {c.unread ? (
                      <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                        {c.unread}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground truncate text-[13px]">
                    {c.preview}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <span className="text-muted-foreground hidden text-xs sm:inline">
                    {c.time}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
