"use client";

import { useState } from "react";
import { Play, Save, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";

export default function AiAssistantPage() {
  const [enabled, setEnabled] = useState(true);
  const [fullNameTakeover, setFullNameTakeover] = useState(true);
  const [suggestOnly, setSuggestOnly] = useState(false);
  const [personaName, setPersonaName] = useState("Ava");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-accent-deep text-xl font-bold">AI Assistant Settings</h2>
        <p className="text-muted-foreground text-sm">
          Configure the persona, behavior and permissions of your AI agent.
        </p>
      </div>

      {/* AI Status */}
      <Card className="rounded-lg">
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">AI Status</CardTitle>
            <Badge variant={enabled ? "success" : "neutral"}>
              {enabled ? "Active" : "Paused"}
            </Badge>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Toggle AI service"
          />
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          When active, Ava handles new conversations instantly and only hands
          off to humans based on the rules below.
        </CardContent>
      </Card>

      {/* Persona */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">Persona</CardTitle>
          <CardDescription>
            How your AI assistant presents itself to customers.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="bg-primary/10 text-primary h-14 w-14">
              <AvatarFallback className="text-lg font-bold">
                {personaName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="persona-name">Assistant name</Label>
              <Input
                id="persona-name"
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value)}
                className="max-w-xs"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="persona-tone">Tone of voice</Label>
            <Tabs defaultValue="friendly">
              <TabsList>
                <TabsTrigger value="friendly">Friendly</TabsTrigger>
                <TabsTrigger value="professional">Professional</TabsTrigger>
                <TabsTrigger value="concise">Concise</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Behavior & Handoff */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">Behavior &amp; Handoff</CardTitle>
          <CardDescription>
            Rules for when the AI escalates to a human agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Detect customer full name</div>
              <p className="text-muted-foreground text-xs">
                Hand off when a customer shares their full name.
              </p>
            </div>
            <Switch
              checked={fullNameTakeover}
              onCheckedChange={setFullNameTakeover}
              aria-label="Detect customer full name"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Suggest only mode</div>
              <p className="text-muted-foreground text-xs">
                AI drafts replies but a human must approve before sending.
              </p>
            </div>
            <Switch
              checked={suggestOnly}
              onCheckedChange={setSuggestOnly}
              aria-label="Suggest only mode"
            />
          </div>
          <Separator />
          <div className="grid gap-1.5">
            <Label htmlFor="escalation-threshold">
              Escalate after N unanswered AI turns
            </Label>
            <Input
              id="escalation-threshold"
              type="number"
              defaultValue={3}
              className="max-w-28"
            />
          </div>
        </CardContent>
      </Card>

      {/* AI Permissions */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">AI Permissions</CardTitle>
          <CardDescription>
            What the AI is allowed to do on your behalf.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {[
            "Issue discount codes (max 20%)",
            "Check order status",
            "Start returns",
            "Edit shipping address",
          ].map((permission, i) => (
            <div key={permission} className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <span className="text-sm">{permission}</span>
              <Switch defaultChecked={i < 2} aria-label={permission} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">System Prompt (Advanced)</CardTitle>
          <CardDescription>
            Custom instructions appended to the AI&apos;s base configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            rows={4}
            defaultValue="You are Ava, the AI assistant for this Shopify store. Always stay polite, concise and never promise delivery dates you cannot verify."
          />
          <p className="text-muted-foreground text-xs">
            Changes take effect for new conversations only.
          </p>
        </CardContent>
      </Card>

      {/* Test + Save */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="text-primary h-4 w-4" aria-hidden="true" />
            Test your AI
          </CardTitle>
          <CardDescription>
            Open the test widget to preview replies with the current settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline">
            <Play className="h-4 w-4" aria-hidden="true" />
            Open test widget
          </Button>
          <Button>
            <Save className="h-4 w-4" aria-hidden="true" />
            Save changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
