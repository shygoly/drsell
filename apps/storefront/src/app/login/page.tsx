"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
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
import { useShopSession } from "@/hooks/useShopSession";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const {
    userToken,
    applyUserSession,
    loginWithPassword,
    register,
    startGoogleLogin,
    startOAuth,
  } = useShopSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (userToken) {
      window.location.href = "/";
      return;
    }
    const hash = window.location.hash;
    if (hash.startsWith("#token=")) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get("token") || "";
      const email = params.get("email") || "";
      if (token) {
        applyUserSession(token, email);
        window.location.hash = "";
        window.location.href = "/";
      }
    }
  }, [applyUserSession, userToken]);

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        await loginWithPassword(email, password);
      } else {
        await register(email, password);
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleShopify(e: FormEvent) {
    e.preventDefault();
    if (!shopDomain.trim()) return;
    startOAuth(shopDomain.trim());
  }

  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="bg-primary-container text-primary-foreground mb-2 flex h-12 w-12 items-center justify-center rounded-xl">
            <Bot className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl font-bold">Welcome to AIChat</CardTitle>
          <CardDescription>
            Log in with Google, your email, or your Shopify store.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={startGoogleLogin}
          >
            <GoogleIcon />
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="bg-border h-px flex-1" />
            or
            <div className="bg-border h-px flex-1" />
          </div>

          <form onSubmit={handlePassword} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : mode === "login" ? (
                "Log in"
              ) : (
                "Create account"
              )}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            className="text-primary text-sm hover:underline"
          >
            {mode === "login"
              ? "Create an account instead"
              : "Have an account? Log in"}
          </button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="bg-border h-px flex-1" />
            or
            <div className="bg-border h-px flex-1" />
          </div>

          <form onSubmit={handleShopify} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-shop">Shopify store domain</Label>
              <Input
                id="login-shop"
                type="text"
                placeholder="your-store.myshopify.com"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" className="w-full">
              Continue with Shopify
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
