"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch, ApiClientError, presentFormApiError, safeContinuation } from "@/lib/api-client";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";
import { CountrySelect } from "./country-select";
import { HoneypotField } from "./honeypot-field";
import { AuthShell } from "./auth-shell";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { PASSWORD_MIN_LENGTH } from "@/modules/identity/password-policy";

export function OnboardingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeContinuation(params.get("next"), "/dashboard");
  const [username, setUsername] = useState("");
  const [country, setCountry] = useState("");
  const [hasPassword, setHasPassword] = useState(true);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<{ hasPassword: boolean }>("/api/me/onboarding")
      .then((value) => {
        if (!cancelled) setHasPassword(value.hasPassword);
      })
      .catch((cause: unknown) => {
        if (!cancelled && cause instanceof ApiClientError && cause.status === 409)
          router.replace(next);
        else if (!cancelled && cause instanceof ApiClientError && cause.status !== 401)
          setError("We couldn’t load your account. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setUsernameError(null);
    setPasswordError(null);
    try {
      const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
      await apiFetch("/api/me/onboarding", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
        },
        body: JSON.stringify({
          username,
          country,
          ...(!hasPassword ? { password } : {}),
        }),
      });
      router.replace(next);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        const presented = presentFormApiError(cause, ["username", "password"]);
        setUsernameError(presented.fields.username ?? null);
        setPasswordError(presented.fields.password ?? null);
        setError(presented.message);
      } else setError("We couldn’t complete onboarding.");
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10">
        <Skeleton className="h-96 w-full max-w-md" />
      </main>
    );
  return (
    <AuthShell
      eyebrow="One last step"
      title="Make your account yours."
      description="Choose the account details we’ll use across your account."
    >
      {error && (
        <Alert role="alert" className="mb-5 border-red-200 bg-red-50 text-red-900">
          {error}
        </Alert>
      )}
      <form onSubmit={submit} className="grid gap-4" aria-busy={busy}>
        <Label htmlFor="onboarding-username">Username</Label>
        <Input
          id="onboarding-username"
          value={username}
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
          required
          minLength={3}
          maxLength={32}
          aria-describedby={usernameError ? "onboarding-username-error" : undefined}
          aria-invalid={Boolean(usernameError)}
          autoComplete="username"
          placeholder="username"
          pattern="[a-z0-9][a-z0-9_-]{2,31}"
        />
        {usernameError && (
          <p id="onboarding-username-error" className="text-sm text-red-700">
            {usernameError}
          </p>
        )}
        <CountrySelect value={country} onChange={setCountry} />
        {!hasPassword && (
          <>
            <Label htmlFor="onboarding-password">Password</Label>
            <div className="relative">
              <Input
                id="onboarding-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                className="pr-11"
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? "onboarding-password-error" : undefined}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-8 w-8"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {passwordError && (
              <p id="onboarding-password-error" className="text-sm text-red-700">
                {passwordError}
              </p>
            )}
          </>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </Button>
        <HoneypotField />
      </form>
    </AuthShell>
  );
}
