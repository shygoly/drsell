"use client";

import { useState } from "react";
import { ArrowRight, Bot, Lock, MessagesSquare, Package, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = 5;

const VALUE_PROPS = [
  { icon: MessagesSquare, label: "24/7 AI auto-reply" },
  { icon: Package, label: "Order & shipping answers" },
  { icon: Bot, label: "Unified conversations" },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4 sm:p-8">
      <div className="flex w-full max-w-[720px] flex-col gap-8">
        {/* 进度条 */}
        <div
          className="flex w-full gap-2"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={0}
          aria-valuemax={STEPS}
        >
          {Array.from({ length: STEPS }).map((_, i) => (
            <div
              key={i}
              className={
                i < step + 1
                  ? "bg-chart-2 h-2 flex-1 rounded-full"
                  : "bg-muted h-2 flex-1 rounded-full"
              }
            />
          ))}
        </div>

        {/* 主卡片 */}
        <main className="bg-card flex flex-col items-center rounded-xl border px-6 pt-12 pb-8 shadow-xs sm:px-12">
          <div className="mb-8 flex w-full flex-col items-center gap-4 text-center">
            <div className="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-xl">
              <Bot className="text-primary h-9 w-9" aria-hidden="true" />
            </div>
            <h1 className="text-accent-deep text-2xl font-bold tracking-tight sm:text-[28px]">
              Welcome to AIChat
            </h1>
            <p className="text-muted-foreground text-sm">
              5 steps, 3 minutes to your AI support agent
            </p>
          </div>

          {/* 价值主张 */}
          <div className="mb-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
            {VALUE_PROPS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="bg-muted/60 flex flex-col items-center gap-2 rounded-lg p-4 text-center"
              >
                <Icon className="text-chart-2 h-6 w-6" aria-hidden="true" />
                <span className="text-sm font-semibold">{label}</span>
              </div>
            ))}
          </div>

          {/* 权限说明 */}
          <div className="bg-muted/40 mb-8 flex w-full items-start gap-4 rounded-lg border p-4">
            <Lock className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-muted-foreground text-sm leading-relaxed">
              We&apos;ll read your products, orders and customers — only used to
              answer shopper questions.
            </p>
          </div>

          {/* 操作 */}
          <div className="mt-1 flex w-full items-center justify-between border-t pt-6">
            <Button
              variant="ghost"
              onClick={() => setStep(0)}
              className="text-muted-foreground"
            >
              <SkipForward className="h-4 w-4" aria-hidden="true" />
              Skip setup
            </Button>
            <Button
              size="lg"
              onClick={() => setStep((s) => Math.min(s + 1, STEPS - 1))}
            >
              Get started
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
