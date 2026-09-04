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

export function PasswordResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const website = String(new FormData(event.currentTarget).get("website") ?? "");
      if (website.trim()) throw new Error("Request rejected");
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: password, token, website }),
      });
      if (!response.ok) throw new Error("This reset link is invalid or expired.");
      setMessage("Password reset. You can now sign in.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password reset failed.");
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
        <form onSubmit={submit} className="grid gap-4">
          <HoneypotField />
          <Label htmlFor="new-password">New password</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={show ? "text" : "password"}
              minLength={12}
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
          <Label htmlFor="confirm-new-password">Confirm password</Label>
          <div className="relative">
            <Input
              id="confirm-new-password"
              type={showConfirm ? "text" : "password"}
              minLength={12}
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="pr-11"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-8 w-8"
              aria-label={showConfirm ? "Hide confirmation password" : "Show confirmation password"}
              onClick={() => setShowConfirm((value) => !value)}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {error && (
            <Alert role="alert" className="border-red-200 bg-red-50 text-red-900">
              {error}
            </Alert>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Reset password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
