"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeContinuation } from "@/lib/api-client";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Globe2 } from "lucide-react";

export function AuthForm({
  mode,
  googleEnabled,
}: {
  mode: "login" | "register";
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeContinuation(searchParams.get("next"), "/dashboard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "login"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: handle });
      if (result.error) {
        setError(result.error.message || "Authentication failed.");
        return;
      }
      if (mode === "register") {
        // Better Auth intentionally keeps autoSignIn disabled. Establish the
        // normal Better Auth session before completing Cliqero onboarding.
        const signIn = await authClient.signIn.email({ email, password });
        if (signIn.error) {
          setError(signIn.error.message || "Sign in to finish setting up your account.");
          return;
        }
        const onboarding = await fetch("/api/me/onboarding", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handle, country: country || null }),
        });
        if (!onboarding.ok) {
          setError("Your account was created, but onboarding needs another step.");
          return;
        }
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `/onboarding?next=${encodeURIComponent(next)}`,
      });
      if (result.error)
        setError(result.error.message || "Google sign-in is unavailable right now.");
    } catch {
      setError("Google sign-in is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10 sm:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="brand-mark">C</span>
            <span>cliqero</span>
          </div>
          <p className="eyebrow">{mode === "login" ? "Welcome back" : "Start exploring"}</p>
          <CardTitle className="!text-3xl">
            {mode === "login" ? "Good to see you." : "Make it yours."}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-sm leading-relaxed text-slate-500">
            {mode === "login"
              ? "Sign in to pick up where you left off."
              : "Create your Cliqero account and discover what comes next."}
          </p>
          {error && (
            <Alert role="alert" className="mb-5 border-red-200 bg-red-50 text-red-900">
              {error}
            </Alert>
          )}
          <form onSubmit={submit} className="grid gap-4">
            {mode === "register" && (
              <>
                <Label htmlFor="handle">Handle</Label>
                <Input
                  id="handle"
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  required
                  minLength={3}
                  maxLength={32}
                  autoComplete="username"
                  placeholder="your-handle"
                />
                <Label htmlFor="country">
                  Country <span>(optional)</span>
                </Label>
                <Input
                  id="country"
                  value={country}
                  onChange={(event) => setCountry(event.target.value.toUpperCase())}
                  maxLength={2}
                  placeholder="NG"
                />
              </>
            )}
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={12}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="At least 12 characters"
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          {googleEnabled && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-slate-500">
                <Separator className="flex-1" />
                <span>or continue with</span>
                <Separator className="flex-1" />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={google}
                disabled={busy}
              >
                <Globe2 className="h-4 w-4" aria-hidden="true" /> Google
              </Button>
            </>
          )}
          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === "login" ? "New to Cliqero?" : "Already have an account?"}{" "}
            <a
              href={
                mode === "login"
                  ? `/register?next=${encodeURIComponent(next)}`
                  : `/login?next=${encodeURIComponent(next)}`
              }
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
