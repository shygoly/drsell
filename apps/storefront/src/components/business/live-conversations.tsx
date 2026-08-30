import { Globe, Mail, MessageSquare, Smartphone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";

const CHANNEL_ICON = {
  web: Globe,
  instagram: Smartphone,
  email: Mail,
  whatsapp: MessageSquare,
} as const;

/**
 * 稿中每行右侧不是徽章，而是一枚状态圆点（多数为绿、待接管为红）。
 * 保留 label 供屏幕阅读器使用，避免为了像素还原丢掉可访问性。
 */
const STATUS_DOT = {
  ai: { label: "AI handling", className: "bg-primary-container" },
  pending: { label: "Pending takeover", className: "bg-destructive" },
  human: { label: "Human handling", className: "bg-info" },
} as const;

interface LiveConversationsProps {
  conversations: Conversation[];
  /** 空态时的引导动作 */
  onNewConversation?: () => void;
}

/**
 * 会话列表 — 对齐 Stitch home_dashboard 的 Live Conversations 卡片。
 *
 * 稿中实测：卡片 padding 0、行间分隔线、头像 32px 灰底、姓名 16/24/600、
 * 预览 13/18、时间 12/16/500、View all 为 12px 文字链接（primary-container 色）、
 * 待接管行姓名为 destructive 色。
 */
export function LiveConversations({
  conversations,
  onNewConversation,
}: LiveConversationsProps) {
  return (
    <Card className="gap-0 overflow-hidden rounded-lg p-0">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <span
            className="bg-primary-container h-2 w-2 rounded-full"
            aria-hidden="true"
          />
          <h3 className="text-accent-deep text-base font-semibold">
            Live Conversations
          </h3>
        </div>
        <a
          href="/inbox"
          className="text-primary-container text-xs font-medium hover:underline"
        >
          View all
        </a>
      </div>

      {conversations.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-3 border-t py-10 text-sm">
          <p>No live conversations right now.</p>
          <Button size="sm" onClick={onNewConversation}>
            Start a conversation
          </Button>
        </div>
      ) : (
        <ul className="divide-y border-t">
          {conversations.map((c) => {
            const ChannelIcon = CHANNEL_ICON[c.channel];
            const dot = STATUS_DOT[c.status];
            const alerting = c.status === "pending";
            return (
              <li
                key={c.id}
                className="hover:bg-muted/40 flex items-start gap-3 px-4 py-4 transition-colors"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-border text-muted-foreground text-xs font-semibold">
                    {c.avatarInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "truncate font-semibold",
                        alerting ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {c.customer}
                    </span>
                    <span className="text-muted-foreground/70 shrink-0 text-xs font-medium">
                      {c.time}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-stat mt-0.5 flex items-center gap-1.5">
                    <ChannelIcon
                      className="h-3.5 w-3.5 shrink-0"
                      aria-label={c.channel}
                    />
                    <span className="truncate">{c.preview}</span>
                  </div>
                </div>
                <span
                  className={`mt-7 h-2 w-2 shrink-0 rounded-full ${dot.className}`}
                  role="img"
                  aria-label={dot.label}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
