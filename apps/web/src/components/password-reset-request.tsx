"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { HoneypotField } from "./honeypot-field";
import { Captcha, type CaptchaClientConfig } from "./captcha";
import { AuthShell } from "./auth-shell";

export function PasswordResetRequest({ captcha }: { captcha: CaptchaClientConfig }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const onCaptchaToken = useCallback((token: string | null) => setCaptchaToken(token), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const website = String(new FormData(event.currentTarget).get("website") ?? "");
      if (website.trim()) throw new Error("Request rejected");
      if (captcha.enabled && !captchaToken)
        throw new Error("Please complete the CAPTCHA challenge.");
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
          captchaToken,
          website,
        }),
      });
      if (!response.ok) throw new Error("We could not process that request.");
      setState("If an account exists for that email, a reset link is on its way.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not process that request.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell
      eyebrow="Account security"
      title="Reset your password"
      description="Enter your account email and we’ll send a reset link."
    >
      {state && (
        <Alert role="status" className="mb-4">
          {state}
        </Alert>
      )}
      {error && (
        <Alert role="alert" className="mb-4 border-red-200 bg-red-50 text-red-900">
          {error}
        </Alert>
      )}
      <form onSubmit={submit} className="grid gap-4">
        <HoneypotField />
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Captcha config={captcha} onToken={onCaptchaToken} />
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <Link href="/login" className="mt-6 block text-sm text-emerald-700 underline">
        Back to sign in
      </Link>
    </AuthShell>
  );
}
