"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPricingPlansLink } from "@/lib/onboarding";
import type { SubscriptionState } from "@/lib/types";

/**
 * 商家的套餐与租期。
 *
 * 此前 Settings 里的「Plan」区块商家**基本看不到**，两个原因叠加：
 * 它整块被 `bridge ?` 包着，而 App Bridge 在本站起不来（见 useShopSession 的注释）；
 * 数据又取自需要平台用户会话的 `rows`，嵌入态下那个会话不存在。
 * 于是「Current plan」永远是 "No active plan."，哪怕商家刚付过钱。
 *
 * 现在的数据来自 `stats.subscription`（服务端已算好可服务性与档位），
 * 与顾客侧闸门用的是同一份判定——控制台与实际行为不会说两套话。
 */
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/** 一句话说清「现在是什么状态、下一步该做什么」。 */
function statusLine(s: SubscriptionState): { text: string; tone: "ok" | "warn" | "bad" } {
  switch (s.reason) {
    case "active":
      return { text: "Active", tone: "ok" };
    case "test":
      return { text: "Test subscription (development store)", tone: "ok" };
    case "trial":
      return { text: `Free trial — ends ${fmtDate(s.trialEndsAt)}`, tone: "ok" };
    case "install-grace": {
      const d = daysLeft(s.installGraceEndsAt);
      return {
        text: `No plan selected yet — full access for ${d ?? 0} more day${d === 1 ? "" : "s"}`,
        tone: "warn",
      };
    }
    case "grace": {
      const d = daysLeft(s.graceEndsAt);
      return {
        text: `Payment overdue — service continues for ${d ?? 0} more day${d === 1 ? "" : "s"}`,
        tone: "warn",
      };
    }
    case "period-ended":
      return { text: "Billing period ended — service paused", tone: "bad" };
    case "status-not-serviceable":
      return { text: `Subscription ${s.status ?? "inactive"} — service paused`, tone: "bad" };
    case "no-subscription":
      return { text: "No active plan — service paused", tone: "bad" };
    default:
      return { text: s.status ?? "Unknown", tone: "warn" };
  }
}

const TONE: Record<"ok" | "warn" | "bad", string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
};

export function PlanCard({ shop, subscription: s }: { shop: string; subscription: SubscriptionState }) {
  const status = statusLine(s);
  const renews = daysLeft(s.periodEndsAt);

  return (
    <section className="bg-card rounded-lg border p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Plan &amp; billing</h2>
        <span className={`text-sm font-medium ${TONE[status.tone]}`}>{status.text}</span>
      </div>

      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <Row label="Plan">
          {s.planName ? (
            <>
              <span className="font-medium">{s.planName}</span>
              {s.priceUsd != null ? (
                <span className="text-muted-foreground"> · ${s.priceUsd}/month</span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">Not selected</span>
          )}
        </Row>

        <Row label="AI replies included">
          {s.answersPerPeriod != null ? (
            `${s.answersPerPeriod.toLocaleString()} per billing period`
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Row>

        <Row label="Current period ends">
          {s.periodEndsAt ? (
            <>
              {fmtDate(s.periodEndsAt)}
              {renews != null && renews >= 0 ? (
                <span className="text-muted-foreground"> · in {renews} day{renews === 1 ? "" : "s"}</span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Row>

        <Row label="Renewal">
          {s.periodEndsAt ? (
            // 托管计费下续订由 Shopify 自动执行，我们不创建 charge（ADR-14）。
            // 说清这一点，商家才不会以为需要手动续。
            <span className="text-muted-foreground">
              Renews automatically via Shopify
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Row>

        {s.trialEndsAt ? <Row label="Trial ends">{fmtDate(s.trialEndsAt)}</Row> : null}
        {!s.serviceable && s.graceEndsAt ? (
          <Row label="Grace period ends">{fmtDate(s.graceEndsAt)}</Row>
        ) : null}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button size="sm" asChild>
          {/* 新标签页：把商家从应用现场导航走，他就回不来看结果了 */}
          <a href={buildPricingPlansLink(shop)} target="_blank" rel="noopener noreferrer">
            {s.planName ? "Change plan" : "Choose a plan"}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </Button>
        <p className="text-muted-foreground text-xs">
          Plans are managed by Shopify. Changes take effect immediately.
        </p>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
