"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  apiFetch,
  ApiClientError,
  formatMinorUsd,
  parseUsdMinor,
  type FundingStatus,
  type WalletSummary,
  type WalletTransaction,
} from "@/lib/api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { Money } from "./money";

const terminalFundingStates = new Set(["confirmed", "failed", "blocked", "reconciliation_pending"]);

function fundingLabel(state: FundingStatus["state"]): string {
  switch (state) {
    case "initialization_pending":
    case "initializing":
      return "Preparing funding";
    case "awaiting_payment":
      return "Awaiting payment";
    case "verification_pending":
      return "Verifying payment";
    case "confirmed":
      return "Funding confirmed";
    default:
      return "Funding needs attention";
  }
}

function safeProviderUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function WalletPanel({ returnTo }: { returnTo?: string }) {
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [funding, setFunding] = useState<FundingStatus | null>(null);
  const [fundOpen, setFundOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [providerError, setProviderError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const [wallet, history] = await Promise.all([
        apiFetch<WalletSummary>("/api/wallet"),
        apiFetch<{ transactions: WalletTransaction[] }>("/api/wallet/transactions"),
      ]);
      setSummary(wallet);
      setTransactions(history.transactions);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        setError("Your session expired. Sign in again to view your wallet.");
      } else {
        setError("We couldn't load your wallet right now.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // The initial network read intentionally establishes the loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    const fundingId = funding?.id;
    if (!fundingId) return;
    let attempts = 0;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      attempts += 1;
      try {
        const latest = await apiFetch<FundingStatus>(`/api/wallet/fund/${fundingId}`);
        setFunding(latest);
        if (latest.state === "confirmed") void loadWallet(true);
        if (terminalFundingStates.has(latest.state) || attempts >= 20) return;
      } catch {
        if (attempts >= 20) return;
      }
      window.setTimeout(() => void poll(), 4000);
    };
    const timer = window.setTimeout(() => void poll(), 1000);
    return () => window.clearTimeout(timer);
  }, [funding?.id, loadWallet]);

  const configuredProvider = process.env.NODE_ENV === "development" ? "development" : "paystack";
  const providerUrl = safeProviderUrl(funding?.authorization_url ?? null);
  const pendingMessage = useMemo(() => {
    if (!funding) return null;
    if (funding.state === "confirmed")
      return "Your funding is confirmed. Wallet availability will update as the credit settles.";
    if (funding.state === "awaiting_payment")
      return "Complete the provider payment, then return here while Cliqero verifies it.";
    if (funding.state === "verification_pending") return "Your payment is being verified.";
    if (funding.state === "failed" || funding.state === "blocked")
      return "This funding attempt could not be completed. You can start a new attempt.";
    return "Your funding request is being prepared.";
  }, [funding]);

  async function submitFunding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProviderError(null);
    let amountMinor: string;
    try {
      amountMinor = parseUsdMinor(amount);
    } catch (cause) {
      setProviderError(cause instanceof Error ? cause.message : "Enter a valid USD amount.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiFetch<{ id: string; state: FundingStatus["state"] }>(
        "/api/wallet/fund",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `wallet-funding-${crypto.randomUUID()}`,
          },
          body: JSON.stringify({ amount_minor: amountMinor, provider: configuredProvider }),
        },
      );
      const latest = await apiFetch<FundingStatus>(`/api/wallet/fund/${created.id}`);
      setFunding(latest);
      setFundOpen(false);
      setAmount("");
      setError(null);
    } catch (cause) {
      setProviderError(
        cause instanceof ApiClientError ? cause.message : "Funding could not be initiated.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyDevelopmentFunding() {
    if (!funding) return;
    setSubmitting(true);
    try {
      const result = await apiFetch<{ state: FundingStatus["state"] }>(
        "/api/funding/development/verify",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ funding_id: funding.id }),
        },
      );
      setFunding((current) => (current ? { ...current, state: result.state } : current));
    } catch (cause) {
      setProviderError(
        cause instanceof ApiClientError ? cause.message : "Development verification failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );

  return (
    <div className="grid gap-4">
      {error && <Toast>{error}</Toast>}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(250px,0.7fr)]">
        <Card className="bg-emerald-50/70 p-6 sm:p-8">
          <div className="mb-4 flex items-center justify-between gap-3 text-sm text-slate-600">
            <span>Available wallet balance</span>
            {refreshing && <span className="text-xs text-slate-500">Updating…</span>}
          </div>
          <p className="my-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            <Money minor={summary?.available_minor ?? "0"} currency="USD" />
          </p>
          <p className="text-sm text-slate-500">Ready for one-listing purchases.</p>
          <Button onClick={() => setFundOpen(true)}>Fund wallet</Button>
        </Card>
        <Card className="p-6 sm:p-8">
          <p className="eyebrow">In progress</p>
          <h3>Pending wallet credit</h3>
          <p className="my-3 text-2xl font-semibold tracking-tight">
            <Money minor={summary?.pending_minor ?? "0"} currency="USD" />
          </p>
          <p>Pending credits become spendable only after availability processing.</p>
        </Card>
      </section>

      {funding && (
        <Card className="grid gap-3 p-5" aria-live="polite">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Funding activity</p>
              <h2>{fundingLabel(funding.state)}</h2>
            </div>
            <Badge variant={funding.state === "confirmed" ? "default" : "destructive"}>
              {funding.state.replaceAll("_", " ")}
            </Badge>
          </div>
          <p>{pendingMessage}</p>
          <Money minor={funding.amount_minor} currency={funding.currency} />
          <div className="flex flex-wrap gap-2">
            {providerUrl && (
              <a
                className="inline-flex h-10 items-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
                href={providerUrl}
                target="_blank"
                rel="noreferrer"
              >
                Continue to provider
              </a>
            )}
            {process.env.NODE_ENV !== "production" && funding.provider === "development" && (
              <Button variant="secondary" onClick={verifyDevelopmentFunding} disabled={submitting}>
                {submitting ? "Verifying…" : "Verify development funding"}
              </Button>
            )}
            {returnTo && (
              <Button asChild variant="secondary">
                <Link href={returnTo}>Return to checkout</Link>
              </Button>
            )}
          </div>
          {providerError && <Toast>{providerError}</Toast>}
        </Card>
      )}

      <section className="grid gap-3" aria-labelledby="wallet-history-heading">
        <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Your money movement</p>
            <h2 id="wallet-history-heading">Wallet activity</h2>
          </div>
          <Button variant="ghost" onClick={() => void loadWallet(true)} disabled={refreshing}>
            Refresh
          </Button>
        </div>
        {transactions.length === 0 ? (
          <EmptyState
            title="No wallet activity yet"
            description="Fund your wallet to make your first purchase, or come back after a payment settles."
          />
        ) : (
          <div className="grid gap-2">
            {transactions.map((transaction) => (
              <article
                className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
                key={transaction.id}
              >
                <div
                  className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-emerald-800"
                  aria-hidden="true"
                >
                  {transaction.type === "funding_credit" ? "+" : "−"}
                </div>
                <div className="grid gap-1">
                  <strong>
                    {transaction.type === "funding_credit" ? "Wallet funding" : "Listing purchase"}
                  </strong>
                  <span className="text-xs text-slate-500">
                    {new Date(transaction.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="grid justify-items-end gap-1">
                  <Money minor={transaction.amount_minor} currency={transaction.currency} />
                  <Badge variant={transaction.state === "available" ? "default" : "secondary"}>
                    {transaction.state}
                  </Badge>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Dialog open={fundOpen} onOpenChange={setFundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fund your wallet</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={submitFunding}>
            <p>Funding is collected externally and becomes available after verification.</p>
            <Label htmlFor="funding-amount">Amount in USD</Label>
            <Input
              id="funding-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="25.00"
              aria-describedby="funding-help"
            />
            <span id="funding-help" className="text-xs text-slate-500">
              Enter a positive amount with up to two decimal places.
            </span>
            {providerError && <Toast>{providerError}</Toast>}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Starting funding…" : "Start funding"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function formatTransactionAmount(transaction: WalletTransaction): string {
  return formatMinorUsd(transaction.amount_minor);
}
