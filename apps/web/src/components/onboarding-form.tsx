"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError, safeContinuation } from "@/lib/api-client";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";
import { CountrySelect } from "./country-select";
import { HoneypotField } from "./honeypot-field";
import { siteConfig } from "@/config/site";

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const website = String(new FormData(event.currentTarget).get("website") ?? "");
    if (website.trim()) {
      setError("Request rejected.");
      setBusy(false);
      return;
    }
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

  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10">
        <Skeleton className="h-96 w-full max-w-md" />
      </main>
    );
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10 sm:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="brand-mark">{siteConfig.name.slice(0, 1)}</span>
            <span>{siteConfig.name}</span>
          </div>
          <p className="eyebrow">One last step</p>
          <CardTitle className="!text-3xl">Make your account yours.</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-sm leading-relaxed text-slate-500">
            Choose the {siteConfig.name} details we’ll use across your account.
          </p>
          {error && (
            <Alert role="alert" className="mb-5 border-red-200 bg-red-50 text-red-900">
              {error}
            </Alert>
          )}
          <form onSubmit={submit} className="grid gap-4">
            <HoneypotField />
            <Label htmlFor="onboarding-handle">Username</Label>
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
            <CountrySelect value={country} onChange={setCountry} />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
