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
    setBalanceError(null);
    void apiFetch<CheckoutQuote>(`/api/checkout?listing_id=${encodeURIComponent(listing.id)}`)
      .then((quote) => {
        if (!active) return;
        setWallet({
          currency: "USD",
          available_minor: quote.available.amount_minor,
          pending_minor: "0",
        });
        setShortfallMinor(quote.shortfall.amount_minor);
      })
      .catch(() => {
        if (active) setBalanceError("We couldn't load your wallet balance right now.");
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
        setCheckout(latest);
        if (latest.state === "awaiting_funds")
          void apiFetch<WalletSummary>("/api/wallet").then(setWallet);
        if (latest.state !== "awaiting_funds") {
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

  async function startCheckout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const key = idempotencyKey.current ?? `ui-checkout-${listing.id}-${crypto.randomUUID()}`;
    idempotencyKey.current = key;
    try {
      sessionStorage.setItem(storageKey, key);
    } catch {
      // The backend idempotency key remains authoritative if storage is unavailable.
    }
    try {
      const result = await apiFetch<
        CheckoutStatus & {
          available: { amount_minor: string; currency: string };
          shortfall: { amount_minor: string; currency: string };
        }
      >("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ listing_id: listing.id }),
      });
      setCheckout(result);
      setWallet({
        currency: "USD",
        available_minor: result.available.amount_minor,
        pending_minor: "0",
      });
      setShortfallMinor(result.shortfall.amount_minor);
      setStarted(true);
      if (BigInt(result.shortfall.amount_minor) > 0n) {
        router.push(walletFundingUrlForCheckout(listing.id, result.id));
      }
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
          <p className="mt-2 text-sm text-red-700" role="alert">
            {balanceError}
          </p>
        ) : (
          <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {wallet ? <Money minor={wallet.available_minor} currency="USD" /> : "Unavailable"}
          </p>
        )}
      </Card>
      <Card className="grid gap-4 p-5">
        <p className="eyebrow">One listing, one checkout</p>
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
              onClick={startCheckout}
              disabled={
                busy ||
                balanceLoading ||
                existingCheckoutLoading ||
                !!balanceError ||
                (!!checkoutId && !!error)
              }
            >
              {busy
                ? "Creating checkout…"
                : existingCheckoutLoading
                  ? "Loading checkout…"
                  : wallet && shortfallMinor && BigInt(shortfallMinor) > 0n
                    ? "Fund wallet"
                    : "Continue to wallet checkout"}
            </Button>
          </>
        ) : checkout?.state === "awaiting_funds" ? (
          <>
            <Badge variant="destructive">Awaiting funds</Badge>
            <p>
              {shortfallMinor && BigInt(shortfallMinor) > 0n
                ? `You need ${formatMinorUsd(shortfallMinor)} more in your available wallet.`
                : "Your checkout is waiting for available wallet funds."}
            </p>
            <p className="text-sm text-slate-500">
              This checkout is preserved while your funding settles.
            </p>
          </>
        ) : checkout?.state === "paid" ? (
          <>
            <Badge variant="default">Payment confirmed</Badge>
            <p>Wallet debit is complete. Your entitlement is being prepared separately.</p>
            <Button asChild>
              <Link href="/dashboard?section=purchases">View purchases</Link>
            </Button>
          </>
        ) : (
          <>
            <Badge variant="secondary">Checkout unavailable</Badge>
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
