"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { BrandLink } from "../brand-identity";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

export const DASHBOARD_SLOW_LOADING_MS = 10_000;

export type DashboardLoadingStage = "session" | "account";

const stageCopy: Record<DashboardLoadingStage, { title: string; description: string }> = {
  session: {
    title: "Loading your dashboard…",
    description: "Checking your session.",
  },
  account: {
    title: "Preparing your account…",
    description: "Loading your Cliqero workspace.",
  },
};

export function DashboardSlowLoadingNotice({
  onRetry,
  retrying = false,
}: {
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-4">
      <div>
        <p className="font-medium text-amber-950">This is taking longer than expected.</p>
        <p className="text-sm text-amber-900">Your connection may be slow.</p>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" disabled={retrying} onClick={onRetry}>
          {retrying ? "Retrying…" : "Try again"}
        </Button>
      )}
    </div>
  );
}

export function dashboardSlowMessageVisible(
  elapsedMs: number,
  thresholdMs = DASHBOARD_SLOW_LOADING_MS,
) {
  return elapsedMs >= thresholdMs;
}

export function DashboardLoadingState({
  stage = "session",
  onRetry,
  slowAfterMs = DASHBOARD_SLOW_LOADING_MS,
}: {
  stage?: DashboardLoadingStage;
  onRetry?: () => void | Promise<void>;
  slowAfterMs?: number;
}) {
  const [slow, setSlow] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setTimeout(
      () => setSlow(dashboardSlowMessageVisible(Date.now() - startedAt, slowAfterMs)),
      slowAfterMs,
    );
    return () => window.clearTimeout(timer);
  }, [slowAfterMs]);

  async function retry() {
    if (!onRetry || retryingRef.current) return;
    retryingRef.current = true;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  }

  const copy = stageCopy[stage];
  return (
    <main className="min-h-screen bg-slate-50 md:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-6 md:block">
        <BrandLink className="text-lg tracking-tight text-slate-950" />
        <div className="mt-10 grid gap-3" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </aside>
      <section className="mx-auto grid w-full max-w-6xl content-start gap-6 p-5 sm:p-8 lg:p-12">
        <div className="flex items-center gap-3">
          <BrandLink className="text-lg tracking-tight text-slate-950 md:hidden" />
          <div role="status" aria-live="polite" className="flex items-start gap-3">
            <LoaderCircle
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 animate-spin text-emerald-700 motion-reduce:animate-none"
            />
            <div>
              <h1 className="text-xl font-semibold text-slate-950">{copy.title}</h1>
              <p className="mt-1 text-sm text-slate-600">{copy.description}</p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rounded-lg border border-slate-200 bg-white p-5">
              <Skeleton className="mb-4 h-4 w-28" />
              <Skeleton className="mb-5 h-9 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6" aria-hidden="true">
          <Skeleton className="mb-5 h-6 w-48" />
          <Skeleton className="mb-3 h-4 w-full" />
          <Skeleton className="mb-3 h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        {slow && (
          <DashboardSlowLoadingNotice
            onRetry={onRetry ? () => void retry() : undefined}
            retrying={retrying}
          />
        )}
      </section>
    </main>
  );
}
