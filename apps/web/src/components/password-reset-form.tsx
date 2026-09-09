"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { HoneypotField } from "./honeypot-field";
import { AuthShell } from "./auth-shell";
import { PASSWORD_MIN_LENGTH } from "@/modules/identity/password-policy";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";

export function PasswordResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
      await apiFetch("/api/password-reset", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
        },
        body: JSON.stringify({
          newPassword: password,
          token,
        }),
      });
      setMessage("Password reset. You can now sign in.");
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "We couldn’t reset your password. Please request a new reset link.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell eyebrow="Account security" title="Choose a new password">
      {message ? (
        <Alert role="status">
          {message}{" "}
          <Link className="underline" href="/login">
            Sign in
          </Link>
        </Alert>
      ) : (
        <form onSubmit={submit} className="grid gap-4" aria-busy={busy}>
          <HoneypotField />
          <Label htmlFor="new-password">New password</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={show ? "text" : "password"}
              minLength={PASSWORD_MIN_LENGTH}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-11"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-8 w-8"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((value) => !value)}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {error && (
            <Alert role="alert" className="border-red-200 bg-red-50 text-red-900">
              {error}
            </Alert>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Resetting password…" : "Reset password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
