import type { SubscriptionState } from "@/lib/types";

/**
 * 订阅状态横幅。
 *
 * 存在的理由：顾客侧被拦下时只会看到一句「暂时无法回答，店家会跟进」——那句话
 * 刻意不暴露商家的套餐与欠费。于是商家自己如果看不到原因，只会以为产品坏了。
 * 这里把「订阅问题」和「额度用尽」明确分开：两者的处置动作完全不同。
 */
export function SubscriptionBanner({ state }: { state: SubscriptionState }) {
  if (state.reason === "active") return null;

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString() : "—";

  const copy: Record<string, { title: string; body: string; tone: "warn" | "stop" }> = {
    trial: {
      title: "Trial in progress",
      body: `Your trial ends on ${fmt(state.trialEndsAt)}. Billing starts after that.`,
      tone: "warn",
    },
    grace: {
      title: "Payment overdue — service continues briefly",
      body: `Your billing period ended. AI replies keep working until ${fmt(
        state.graceEndsAt,
      )}. Update payment in Shopify to avoid interruption.`,
      tone: "warn",
    },
    "period-ended": {
      title: "AI replies are paused",
      body: `Your billing period ended on ${fmt(
        state.periodEndsAt,
      )} and the grace window has passed. Reactivate your plan in Shopify to resume.`,
      tone: "stop",
    },
    "status-not-serviceable": {
      title: "AI replies are paused",
      body: `Your subscription is ${state.status ?? "inactive"}. Reactivate your plan in Shopify to resume.`,
      tone: "stop",
    },
    "no-subscription": {
      title: "No active plan",
      body: "Choose a plan in Shopify to turn on AI replies.",
      tone: "stop",
    },
  };

  const c = copy[state.reason];
  if (!c) return null;

  return (
    <div
      role="status"
      className={
        c.tone === "stop"
          ? "border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm"
          : "border-warning/40 bg-warning/10 text-warning-foreground rounded-lg border px-4 py-3 text-sm"
      }
    >
      <p className="font-semibold">{c.title}</p>
      <p className="mt-0.5 opacity-90">{c.body}</p>
    </div>
  );
}
