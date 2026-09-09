"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { HoneypotField } from "./honeypot-field";
import { Captcha, captchaTokenPayload, type CaptchaClientConfig } from "./captcha";
import { AuthShell } from "./auth-shell";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";

export function PasswordResetRequest({ captcha }: { captcha: CaptchaClientConfig }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const onCaptchaToken = useCallback((token: string | null) => setCaptchaToken(token), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setState(null);
    try {
      const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
      if (captcha.enabled && !captchaToken)
        throw new Error("Please complete the CAPTCHA challenge.");
      const response = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
        },
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
          ...captchaTokenPayload(captchaToken),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "We could not process that request.");
      }
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
      <form onSubmit={submit} className="grid gap-4" aria-busy={busy}>
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
