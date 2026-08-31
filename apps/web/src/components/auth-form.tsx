"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeContinuation } from "@/lib/api-client";
import { Button, Input, Toast } from "./ui";

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
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark">C</span>
          <span>cliqero</span>
        </div>
        <p className="eyebrow">{mode === "login" ? "Welcome back" : "Start exploring"}</p>
        <h1>{mode === "login" ? "Good to see you." : "Make it yours."}</h1>
        <p className="auth-copy">
          {mode === "login"
            ? "Sign in to pick up where you left off."
            : "Create your Cliqero account and discover what comes next."}
        </p>
        {error && <Toast>{error}</Toast>}
        <form onSubmit={submit} className="auth-form">
          {mode === "register" && (
            <>
              <label htmlFor="handle">Handle</label>
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
              <label htmlFor="country">
                Country <span>(optional)</span>
              </label>
              <Input
                id="country"
                value={country}
                onChange={(event) => setCountry(event.target.value.toUpperCase())}
                maxLength={2}
                placeholder="NG"
              />
            </>
          )}
          <label htmlFor="email">Email</label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
          <label htmlFor="password">Password</label>
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
            <div className="auth-divider">
              <span>or continue with</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="google-button"
              onClick={google}
              disabled={busy}
            >
              <span className="google-mark">G</span> Google
            </Button>
          </>
        )}
        <p className="auth-switch">
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
      </div>
    </main>
  );
}
