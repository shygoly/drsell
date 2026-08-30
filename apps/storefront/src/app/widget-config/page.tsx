"use client";

import { useState } from "react";
import { ExternalLink, MessageSquare, Palette, Rocket, Save } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function WidgetConfigPage() {
  const [widgetName, setWidgetName] = useState("Ava");
  const [welcomeMsg, setWelcomeMsg] = useState(
    "Hi! I'm Ava. How can I help you today?"
  );
  const [quickReplies, setQuickReplies] = useState(true);
  const [preChatForm, setPreChatForm] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-accent-deep text-xl font-bold">Widget Configuration</h2>
        <p className="text-muted-foreground text-sm">
          Control center for your storefront AI chat widget.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_400px]">
        {/* 左侧设置 */}
        <div className="flex flex-col gap-6">
          {/* Appearance */}
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4" aria-hidden="true" />
                Appearance
              </CardTitle>
              <CardDescription>Brand colors, position and identity.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="ai-name">AI identity name</Label>
                <Input
                  id="ai-name"
                  value={widgetName}
                  onChange={(e) => setWidgetName(e.target.value)}
                  className="max-w-xs"
                />
              </div>
              <Separator />
              <div className="grid gap-1.5">
                <Label>Widget position</Label>
                <Tabs defaultValue="bottom-right">
                  <TabsList>
                    <TabsTrigger value="bottom-right">Bottom right</TabsTrigger>
                    <TabsTrigger value="bottom-left">Bottom left</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardContent>
          </Card>

          {/* Conversion tools */}
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Conversion Tools
              </CardTitle>
              <CardDescription>
                Quick replies and lead capture before the conversation starts.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Quick-reply chips</div>
                  <p className="text-muted-foreground text-xs">
                    Instant answers for common FAQs.
                  </p>
                </div>
                <Switch
                  checked={quickReplies}
                  onCheckedChange={setQuickReplies}
                  aria-label="Quick-reply chips"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Pre-chat form</div>
                  <p className="text-muted-foreground text-xs">
                    Capture name/email before chatting.
                  </p>
                </div>
                <Switch
                  checked={preChatForm}
                  onCheckedChange={setPreChatForm}
                  aria-label="Pre-chat form"
                />
              </div>
              <Separator />
              <div className="grid gap-1.5">
                <Label htmlFor="welcome-msg">Welcome message</Label>
                <Input
                  id="welcome-msg"
                  value={welcomeMsg}
                  onChange={(e) => setWelcomeMsg(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Deployment */}
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Rocket className="h-4 w-4" aria-hidden="true" />
                Deployment
              </CardTitle>
              <CardDescription>
                Enable the App Embed in your Shopify theme.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open Shopify Theme Editor
              </Button>
              <Button>
                <Save className="h-4 w-4" aria-hidden="true" />
                Save configuration
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 右侧实时预览 */}
        <div className="flex flex-col gap-4">
          <Card className="sticky top-0 rounded-lg">
            <CardHeader>
              <CardTitle className="text-base">Live Preview</CardTitle>
              <CardDescription>Desktop &amp; mobile mockups.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* 桌面预览 */}
              <div className="bg-muted/50 relative h-44 overflow-hidden rounded-lg border">
                <div className="bg-muted absolute top-0 right-0 left-0 h-4 border-b" />
                <div className="absolute top-6 left-3 w-16 space-y-1">
                  <div className="bg-card h-2 rounded" />
                  <div className="bg-card h-2 w-3/4 rounded" />
                </div>
                <div className="bg-primary absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-full shadow">
                  <MessageSquare
                    className="text-primary-foreground h-4 w-4"
                    aria-hidden="true"
                  />
                </div>
                <div className="bg-card absolute right-14 bottom-3 w-40 rounded-xl border p-2 shadow">
                  <div className="text-[10px] font-semibold">{widgetName}</div>
                  <div className="bg-muted mt-1 h-2 w-full rounded" />
                  <div className="bg-muted mt-1 h-2 w-2/3 rounded" />
                  {quickReplies ? (
                    <div className="mt-1.5 flex gap-1">
                      <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[8px]">
                        Track order
                      </span>
                      <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[8px]">
                        Returns
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* 移动预览 */}
              <div className="bg-muted/50 relative mx-auto h-56 w-32 overflow-hidden rounded-xl border">
                <div className="bg-muted absolute top-0 right-0 left-0 h-3 border-b" />
                <div className="bg-primary absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded-full shadow">
                  <MessageSquare
                    className="text-primary-foreground h-3 w-3"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
