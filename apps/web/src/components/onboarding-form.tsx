"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError, safeContinuation } from "@/lib/api-client";
import { Button, Input, Toast } from "./ui";

export function OnboardingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeContinuation(params.get("next"), "/dashboard");
  const [handle, setHandle] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/me/profile")
      .then(() => {
        if (!cancelled) router.replace(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled && cause instanceof ApiClientError && cause.status !== 401)
          setError("We couldn’t load your account. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/me/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, country: country || null }),
      });
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "We couldn’t complete onboarding.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="page-loading" />;
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark">C</span>
          <span>cliqero</span>
        </div>
        <p className="eyebrow">One last step</p>
        <h1>Make your account yours.</h1>
        <p className="auth-copy">Choose the Cliqero details we’ll use across your account.</p>
        {error && <Toast>{error}</Toast>}
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="onboarding-handle">Handle</label>
          <Input
            id="onboarding-handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            required
            minLength={3}
            maxLength={32}
            autoComplete="username"
            placeholder="your-handle"
          />
          <label htmlFor="onboarding-country">
            Country <span>(optional)</span>
          </label>
          <Input
            id="onboarding-country"
            value={country}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
            maxLength={2}
            placeholder="NG"
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Continue"}
          </Button>
        </form>
      </div>
    </main>
  );
}
