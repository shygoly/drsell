import { fetchConversations } from "@/lib/api";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const conversations = await fetchConversations();
  return <InboxClient initialConversations={conversations} />;
}
