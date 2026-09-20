"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  apiFetch,
  ApiClientError,
  formatMinorUsd,
  walletFundingUrlForCheckout,
  type CheckoutStatus,
  type CheckoutQuote,
  type Listing,
  type WalletSummary,
} from "@/lib/api-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Toast } from "../toast";
import { Money } from "../money";

const PAID_WALLET_REFRESH_ERROR =
  "Payment is complete, but your wallet balance could not be refreshed.";

type CheckoutPaymentResponse = CheckoutStatus & {
  available: { amount_minor: string; currency: string };
  pending: { amount_minor: string; currency: string };
  shortfall: { amount_minor: string; currency: string };
};

export function checkoutPrimaryAction(input: {
  busy: boolean;
  restoring: boolean;
  walletLoaded: boolean;
  shortfallMinor: string | null;
}) {
  if (input.busy) return "Paying…";
  if (input.restoring) return "Loading checkout…";
  if (input.walletLoaded && input.shortfallMinor && BigInt(input.shortfallMinor) > 0n)
    return "Fund wallet";
  return "Pay now";
}

export function checkoutStatusPresentation(state: CheckoutStatus["state"]) {
  switch (state) {
    case "pending":
      return {
        label: "Ready to pay",
        variant: "warning" as const,
        className: "justify-self-start",
      };
    case "paid":
      return { label: "Paid", variant: "default" as const, className: "justify-self-start" };
    case "failed":
      return {
        label: "Payment failed",
        variant: "destructive" as const,
        className: "justify-self-start",
      };
  }
}

export type CheckoutPollProjection = {
  checkout: CheckoutStatus;
  wallet: WalletSummary | null;
  balanceError: string | null;
  paidWalletRefreshCheckoutId: string | null;
  shouldContinuePolling: boolean;
};

export async function applyCheckoutPollResult(
  latest: CheckoutStatus,
  current: Pick<CheckoutPollProjection, "wallet" | "balanceError" | "paidWalletRefreshCheckoutId">,
  loadWallet: () => Promise<WalletSummary>,
): Promise<CheckoutPollProjection> {
  let wallet = current.wallet;
  let balanceError = current.balanceError;
  let paidWalletRefreshCheckoutId = current.paidWalletRefreshCheckoutId;
  const isPending = latest.state === "pending";
  const isFinalPaidRefresh = latest.state === "paid" && paidWalletRefreshCheckoutId !== latest.id;
  if (isPending || isFinalPaidRefresh) {
    if (isFinalPaidRefresh) paidWalletRefreshCheckoutId = latest.id;
    try {
      wallet = await loadWallet();
      balanceError = null;
    } catch {
      if (isFinalPaidRefresh) balanceError = PAID_WALLET_REFRESH_ERROR;
    }
  }
  return {
    checkout: latest,
    wallet,
    balanceError,
    paidWalletRefreshCheckoutId,
    shouldContinuePolling: latest.state === "pending",
  };
}

export function CheckoutFlow({ listing, checkoutId }: { listing: Listing; checkoutId?: string }) {
  const router = useRouter();
  const [checkout, setCheckout] = useState<CheckoutStatus | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(Boolean(checkoutId));
  const [existingCheckoutLoading, setExistingCheckoutLoading] = useState(Boolean(checkoutId));
  const [shortfallMinor, setShortfallMinor] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const walletRef = useRef<WalletSummary | null>(null);
  const balanceErrorRef = useRef<string | null>(null);
  const walletRefreshedForPaidCheckout = useRef<string | null>(null);
  const storageKey = `cliqero.checkout.${listing.id}`;

  useEffect(() => {
    try {
      idempotencyKey.current = sessionStorage.getItem(storageKey);
    } catch {
      idempotencyKey.current = null;
    }
  }, [storageKey]);

  useEffect(() => {
    let active = true;
    // The initial network read intentionally establishes the loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBalanceLoading(true);
    balanceErrorRef.current = null;
    setBalanceError(null);
    void apiFetch<CheckoutQuote>(`/api/checkout?listing_id=${encodeURIComponent(listing.id)}`)
      .then((quote) => {
        if (!active) return;
        const nextWallet = {
          currency: "USD",
          available_minor: quote.available.amount_minor,
          pending_minor: "0",
          active_fundings: [],
        } satisfies WalletSummary;
        walletRef.current = nextWallet;
        setWallet(nextWallet);
        setShortfallMinor(quote.shortfall.amount_minor);
      })
      .catch(() => {
        if (active) {
          const message = "We couldn't load your wallet balance right now.";
          balanceErrorRef.current = message;
          setBalanceError(message);
        }
      })
      .finally(() => {
        if (active) setBalanceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listing.id]);

  useEffect(() => {
    if (!checkoutId) return;
    let active = true;
    void apiFetch<CheckoutStatus>(`/api/checkout/${checkoutId}`)
      .then((current) => {
        if (!active) return;
        setCheckout(current);
        setStarted(true);
      })
      .catch(() => {
        if (active)
          setError("We couldn't load this checkout. Please return to Purchases and try again.");
      })
      .finally(() => {
        if (active) setExistingCheckoutLoading(false);
      });
    return () => {
      active = false;
    };
  }, [checkoutId]);

  useEffect(() => {
    const checkoutId = checkout?.id;
    if (!checkoutId) return;
    let attempts = 0;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      attempts += 1;
      try {
        const latest = await apiFetch<CheckoutStatus>(`/api/checkout/${checkoutId}`);
        const projection = await applyCheckoutPollResult(
          latest,
          {
            wallet: walletRef.current,
            balanceError: balanceErrorRef.current,
            paidWalletRefreshCheckoutId: walletRefreshedForPaidCheckout.current,
          },
          () => apiFetch<WalletSummary>("/api/wallet"),
        );
        setCheckout(projection.checkout);
        walletRef.current = projection.wallet;
        setWallet(projection.wallet);
        if (projection.wallet) {
          const shortfall =
            projection.checkout.amount_minor > projection.wallet.available_minor
              ? BigInt(projection.checkout.amount_minor) - BigInt(projection.wallet.available_minor)
              : 0n;
          setShortfallMinor(shortfall.toString());
        }
        balanceErrorRef.current = projection.balanceError;
        setBalanceError(projection.balanceError);
        walletRefreshedForPaidCheckout.current = projection.paidWalletRefreshCheckoutId;
        if (!projection.shouldContinuePolling) {
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            // A storage failure does not change backend checkout semantics.
          }
          idempotencyKey.current = null;
          return;
        }
        if (attempts >= 20) return;
      } catch {
        if (attempts >= 20) return;
      }
      window.setTimeout(() => void poll(), 4000);
    };
    const timer = window.setTimeout(() => void poll(), 1000);
    return () => window.clearTimeout(timer);
  }, [checkout?.id, storageKey]);

  function fundWallet() {
    if (busy) return;
    router.push(walletFundingUrlForCheckout(listing.id, checkout?.id));
  }

  function clearStoredCheckout() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // A storage failure does not change backend checkout semantics.
    }
    idempotencyKey.current = null;
  }

  async function payNow() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let current = checkout;
      if (!current) {
        const key = idempotencyKey.current ?? `ui-checkout-${listing.id}-${crypto.randomUUID()}`;
        idempotencyKey.current = key;
        try {
          sessionStorage.setItem(storageKey, key);
        } catch {
          // The backend idempotency key remains authoritative if storage is unavailable.
        }
        current = await apiFetch<CheckoutPaymentResponse>("/api/checkout", {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": key },
          body: JSON.stringify({ listing_id: listing.id }),
        });
        setCheckout(current);
        setStarted(true);
      }
      const result = await apiFetch<CheckoutPaymentResponse>(`/api/checkout/${current.id}/pay`, {
        method: "POST",
      });
      setCheckout(result);
      const nextWallet = {
        currency: "USD",
        available_minor: result.available.amount_minor,
        pending_minor: result.pending.amount_minor,
        active_fundings: [],
      } satisfies WalletSummary;
      walletRef.current = nextWallet;
      setWallet(nextWallet);
      setShortfallMinor(result.shortfall.amount_minor);
      setStarted(true);
      if (result.state === "paid") clearStoredCheckout();
      else if (BigInt(result.shortfall.amount_minor) > 0n)
        router.push(walletFundingUrlForCheckout(listing.id, result.id));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Checkout could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="bg-emerald-50/70 p-5 sm:p-6">
        <p className="text-sm text-slate-600">Available wallet balance</p>
        {balanceLoading ? (
          <p className="mt-2 text-sm text-slate-600" role="status">
            Loading available wallet balance…
          </p>
        ) : balanceError ? (
          <p
            className={`mt-2 text-sm ${checkout?.state === "paid" ? "text-amber-800" : "text-red-700"}`}
            role={checkout?.state === "paid" ? "status" : "alert"}
          >
            {balanceError}
          </p>
        ) : (
          <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {wallet ? <Money minor={wallet.available_minor} currency="USD" /> : "Unavailable"}
          </p>
        )}
      </Card>
      <Card className="grid gap-4 p-5">
        <p className="eyebrow">Checkout</p>
        <h2>{listing.title}</h2>
        <Money minor={listing.price.minor_amount} currency={listing.price.currency} />
        {!started ? (
          <>
            <div className="grid gap-1 text-sm text-slate-600">
              <p>
                Purchase total:{" "}
                <Money minor={listing.price.minor_amount} currency={listing.price.currency} />
              </p>
              {!balanceLoading &&
                !balanceError &&
                shortfallMinor &&
                (BigInt(shortfallMinor) > 0n ? (
                  <p>You need {formatMinorUsd(shortfallMinor)} more to complete this purchase.</p>
                ) : (
                  <p>Your wallet balance covers this purchase.</p>
                ))}
            </div>
            <Button
              onClick={BigInt(shortfallMinor ?? "0") > 0n ? fundWallet : payNow}
              disabled={
                busy ||
                balanceLoading ||
                existingCheckoutLoading ||
                !!balanceError ||
                (!!checkoutId && !!error)
              }
            >
              {checkoutPrimaryAction({
                busy,
                restoring: existingCheckoutLoading,
                walletLoaded: wallet !== null,
                shortfallMinor,
              })}
            </Button>
          </>
        ) : checkout?.state === "pending" ? (
          <>
            <Badge
              className={checkoutStatusPresentation(checkout.state).className}
              variant={checkoutStatusPresentation(checkout.state).variant}
            >
              {checkoutStatusPresentation(checkout.state).label}
            </Badge>
            <p>
              {shortfallMinor && BigInt(shortfallMinor) > 0n
                ? `You need ${formatMinorUsd(shortfallMinor)} more in your available wallet.`
                : "Your checkout is waiting for available wallet funds."}
            </p>
            <p className="text-sm text-slate-500">
              Once funds are available, choose Pay now to complete this purchase.
            </p>
            <Button onClick={shortfallMinor && BigInt(shortfallMinor) > 0n ? fundWallet : payNow}>
              {shortfallMinor && BigInt(shortfallMinor) > 0n ? "Fund wallet" : "Pay now"}
            </Button>
          </>
        ) : checkout?.state === "paid" ? (
          <>
            <Badge
              className={checkoutStatusPresentation(checkout.state).className}
              variant={checkoutStatusPresentation(checkout.state).variant}
            >
              {checkoutStatusPresentation(checkout.state).label}
            </Badge>
            <p>Payment complete. You can view your purchase and access status in Purchases.</p>
            <Button asChild>
              <Link href="/dashboard?section=purchases">View purchases</Link>
            </Button>
          </>
        ) : checkout?.state === "failed" ? (
          <>
            <Badge
              className={checkoutStatusPresentation(checkout.state).className}
              variant={checkoutStatusPresentation(checkout.state).variant}
            >
              {checkoutStatusPresentation(checkout.state).label}
            </Badge>
            <p>{error ?? "This payment could not be completed."}</p>
            <Button variant="secondary" onClick={() => setStarted(false)}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <Badge className="justify-self-start" variant="secondary">
              Checkout unavailable
            </Badge>
            <p>{error ?? "This checkout could not be completed."}</p>
            <Button variant="secondary" onClick={() => setStarted(false)}>
              Try again
            </Button>
          </>
        )}
        {error && <Toast>{error}</Toast>}
      </Card>
    </div>
  );
}
