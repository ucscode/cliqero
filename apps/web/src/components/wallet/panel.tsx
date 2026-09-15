"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  ApiClientError,
  canonicalWalletFundingUrl,
  formatExchangeRate,
  formatMinorUsd,
  parseUsdMinor,
  providerFundingPreparationUrl,
  walletFundingStatusUrl,
  type ActiveFunding,
  type FundingStatus,
  type FundingMethod,
  type FundingPreparation,
  type WalletSummary,
  type WalletTransaction,
} from "@/lib/api-client";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Skeleton } from "../ui/skeleton";
import { EmptyState } from "../empty-state";
import { Toast } from "../toast";
import { Money } from "../money";
import { HoneypotField } from "../honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import {
  FundingProviderPreparation,
  initialPaymentCurrency,
  providerPreparationReady,
} from "../payment/shared/preparation";
import { LoaderCircle } from "lucide-react";
import { PaymentProviderComponent } from "../payment/shared/provider-components";

export {
  bankStatusFieldRows,
  createFundingStatusPoller,
  FUNDING_STATUS_POLL_INITIAL_DELAY_MS,
  FUNDING_STATUS_POLL_INTERVAL_MS,
  formatTimeRemaining,
  fundingActionLabel,
  fundingStatusMessage,
  snapshotInstruction,
  snapshotFields,
  verificationObservationClass,
  verificationObservationHeading,
} from "../payment/shared/provider-components";

export function walletPanelComposition(fundingPage: boolean, persistedFunding = false) {
  return {
    showOverview: !fundingPage,
    showActivity: !fundingPage,
    showCompactBalance: fundingPage,
    showFundingForm: fundingPage && !persistedFunding,
  };
}

export function activeFundingAction(_funding: Pick<ActiveFunding, "state" | "authorization_url">) {
  void _funding;
  return { label: "View payment", kind: "status" as const };
}

export function validatedPreparationAmount(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return parseUsdMinor(value);
  } catch {
    return null;
  }
}

export function walletActivityLabel(
  transaction: Pick<WalletTransaction, "type" | "provider_display_name">,
) {
  return transaction.type === "funding_credit"
    ? (transaction.provider_display_name ?? "Wallet")
    : "Listing purchase";
}

export function walletActivityReference(
  transaction: Pick<WalletTransaction, "type" | "provider_reference">,
) {
  return transaction.type === "funding_credit" ? (transaction.provider_reference ?? null) : null;
}

export function walletActivityState(state: WalletTransaction["state"]) {
  return state === "available" ? "Funded" : state === "complete" ? "Completed" : "Pending";
}

export function WalletPanel({
  returnTo,
  fundingPage = false,
  fundingId,
  fundingProvider,
  fundingAmount,
}: {
  returnTo?: string;
  fundingPage?: boolean;
  fundingId?: string;
  fundingProvider?: string;
  fundingAmount?: string;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [funding, setFunding] = useState<FundingStatus | null>(null);
  const [fundOpen, setFundOpen] = useState(fundingPage);
  const [amount, setAmount] = useState(fundingAmount ?? "");
  const [providerError, setProviderError] = useState<string | null>(null);
  const [fundingMethods, setFundingMethods] = useState<FundingMethod[]>([]);
  const [preparation, setPreparation] = useState<FundingPreparation | null>(null);
  const [fundingOptions, setFundingOptions] = useState<FundingPreparation["funding_options"]>([]);
  const [provider, setProvider] = useState("");
  const [fundingOptionId, setFundingOptionId] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(!fundingPage);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const persistedFunding = fundingPage && Boolean(fundingId);
  const composition = walletPanelComposition(fundingPage, persistedFunding);
  const showActivity = composition.showActivity;
  const providerPreparation = Boolean(fundingProvider);
  const fixedAmountMinor = validatedPreparationAmount(fundingAmount);
  const refreshFunding = useCallback(async () => {
    if (!fundingId) return;
    setRefreshing(true);
    try {
      await apiFetch<{
        id: string;
        state: FundingStatus["state"];
        provider_transaction_id: string | null;
        verification: FundingStatus["verification"];
      }>(`/api/wallet/fund/${fundingId}/verify`, { method: "POST" });
      const latest = await apiFetch<FundingStatus>(`/api/wallet/fund/${fundingId}`);
      setFunding(latest);
      setProviderError(null);
    } catch {
      setProviderError("We couldn't refresh this funding attempt right now.");
    } finally {
      setRefreshing(false);
    }
  }, [fundingId]);

  const loadWallet = useCallback(
    async (background = false) => {
      if (background) setRefreshing(true);
      else {
        setSummaryLoading(true);
        if (showActivity) setActivityLoading(true);
      }
      if (!background) {
        setSummaryError(null);
        if (showActivity) setActivityError(null);
      }
      const walletRequest = apiFetch<WalletSummary>("/api/wallet");
      const activityRequest = showActivity
        ? apiFetch<{ transactions: WalletTransaction[] }>("/api/wallet/transactions")
        : Promise.resolve({ transactions: [] as WalletTransaction[] });
      const [walletResult, activityResult] = await Promise.allSettled([
        walletRequest,
        activityRequest,
      ]);
      if (walletResult.status === "fulfilled") {
        setSummary(walletResult.value);
        setSummaryError(null);
      } else {
        setSummaryError(
          walletResult.reason instanceof ApiClientError && walletResult.reason.status === 401
            ? "Your session expired. Sign in again to view your wallet."
            : "We couldn't load your wallet balance right now.",
        );
      }
      if (showActivity) {
        if (activityResult.status === "fulfilled") {
          setTransactions(activityResult.value.transactions);
          setActivityError(null);
        } else {
          setActivityError(
            activityResult.reason instanceof ApiClientError && activityResult.reason.status === 401
              ? "Your session expired. Sign in again to view wallet activity."
              : "We couldn't load recent wallet activity right now.",
          );
        }
      }
      setSummaryLoading(false);
      if (showActivity) setActivityLoading(false);
      setRefreshing(false);
    },
    [showActivity],
  );
  const handleFundingConfirmed = useCallback(() => {
    void loadWallet(true);
  }, [loadWallet]);

  useEffect(() => {
    // Route changes can preserve this client component instance. Reset the
    // route-scoped mode so an old funding status cannot bleed into creation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFunding(null);
    setFundOpen(fundingPage && !fundingId);
    setAmount(fundingAmount ?? "");
    setFundingOptionId("");
    setPreparation(null);
    setFundingOptions([]);
    setPreparationError(null);
  }, [fundingAmount, fundingId, fundingPage, fundingProvider]);

  useEffect(() => {
    // The initial network read intentionally establishes the loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    if (!fundingId) return;
    void apiFetch<FundingStatus>(`/api/wallet/fund/${fundingId}`)
      .then(setFunding)
      .catch(() => setProviderError("We couldn't load this funding attempt right now."));
  }, [fundingId]);

  const selectedMethod = fundingMethods.find((method) => method.id === provider) ?? null;
  const methodsToRender = providerPreparation
    ? fundingMethods.filter((method) => method.id === provider)
    : fundingMethods;
  const preparationLoading = Boolean(
    providerPreparation && fixedAmountMinor && selectedMethod && !preparation && !preparationError,
  );

  useEffect(() => {
    if (!fundOpen && !fundingPage) return;
    void apiFetch<{ methods: FundingMethod[] }>("/api/wallet/funding-methods")
      .then(({ methods }) => {
        setFundingMethods(methods);
        const first = methods[0];
        setProvider(
          (current) =>
            fundingProvider ??
            (methods.some((method) => method.id === current) ? current : (first?.id ?? "")),
        );
        const selected =
          methods.find((method) => method.id === fundingProvider) ??
          (fundingProvider ? null : first);
        if (selected) {
          setPaymentCurrency(initialPaymentCurrency(selected));
        }
      })
      .catch(() => setProviderError("We couldn't load funding methods right now."));
  }, [fundOpen, fundingPage, fundingProvider]);

  useEffect(() => {
    if (!providerPreparation || !fundingProvider || !fixedAmountMinor || !selectedMethod) return;
    let active = true;
    const query = new URLSearchParams({
      amount_minor: fixedAmountMinor,
      provider: fundingProvider,
    });
    if (fundingOptionId) query.set("bank_account_id", fundingOptionId);
    if (paymentCurrency) query.set("payment_currency", paymentCurrency);
    void apiFetch<FundingPreparation>(`/api/wallet/funding/prepare?${query.toString()}`)
      .then((result) => {
        if (active) {
          setPreparation(result);
          setFundingOptions(result.funding_options);
        }
      })
      .catch((cause) => {
        if (!active) return;
        setPreparation(null);
        setPreparationError(
          cause instanceof ApiClientError ? cause.message : "Provider preparation is unavailable.",
        );
      });
    return () => {
      active = false;
    };
  }, [
    fixedAmountMinor,
    fundingProvider,
    paymentCurrency,
    providerPreparation,
    selectedMethod,
    fundingOptionId,
  ]);

  useEffect(() => {
    if (!fundingPage || summaryLoading) return;
    document.getElementById("wallet-funding")?.scrollIntoView({ block: "start" });
  }, [fundingPage, summaryLoading]);

  const activeFundings =
    summary?.active_fundings ?? (summary?.active_funding ? [summary.active_funding] : []);

  async function submitFunding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const honeypot = String(new FormData(event.currentTarget).get(HONEYPOT_FIELD_NAME) ?? "");
    setProviderError(null);
    let amountMinor: string;
    try {
      amountMinor = providerPreparation
        ? (fixedAmountMinor ??
          (() => {
            throw new Error("This funding preparation amount is invalid.");
          })())
        : parseUsdMinor(amount);
    } catch (cause) {
      setProviderError(cause instanceof Error ? cause.message : "Enter a valid USD amount.");
      return;
    }
    setSubmitting(true);
    try {
      if (!providerPreparation) {
        router.push(providerFundingPreparationUrl(provider, amount, returnTo));
        return;
      }
      const created = await apiFetch<{ id: string; state: FundingStatus["state"] }>(
        "/api/wallet/fund",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `wallet-funding-${crypto.randomUUID()}`,
            ...(honeypot ? { [HONEYPOT_HEADER_NAME]: honeypot } : {}),
          },
          body: JSON.stringify({
            amount_minor: amountMinor,
            provider: fundingProvider,
            ...(fundingOptionId ? { bank_account_id: fundingOptionId } : {}),
            ...(paymentCurrency ? { payment_currency: paymentCurrency } : {}),
          }),
        },
      );
      const latest = await apiFetch<FundingStatus>(`/api/wallet/fund/${created.id}`);
      setFunding(latest);
      setFundOpen(false);
      setAmount("");
      setPaymentCurrency("");
      router.replace(walletFundingStatusUrl(created.id, returnTo));
    } catch (cause) {
      setProviderError(
        cause instanceof ApiClientError ? cause.message : "Funding could not be initiated.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelFunding() {
    if (!funding) return;
    setProviderError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<{ id: string; state: FundingStatus["state"] }>(
        `/api/wallet/fund/${funding.id}/cancel`,
        { method: "POST" },
      );
      setFunding((current) => (current ? { ...current, state: result.state } : current));
      await loadWallet(true);
    } catch (cause) {
      setProviderError(
        cause instanceof ApiClientError ? cause.message : "Funding could not be cancelled.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4">
      {summaryError && <Toast>{summaryError}</Toast>}
      {composition.showCompactBalance && (
        <Card className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4">
          <div>
            <p className="text-sm text-slate-600">Current balance</p>
            <div className="text-xl font-semibold tracking-tight">
              {summaryLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : summary ? (
                <Money minor={summary.available_minor} currency="USD" />
              ) : (
                "Unavailable"
              )}
            </div>
          </div>
          <div className="text-sm text-slate-500">
            Pending:{" "}
            {summaryLoading ? (
              <Skeleton className="inline-block h-4 w-16 align-middle" />
            ) : summary ? (
              <Money minor={summary.pending_minor} currency="USD" />
            ) : (
              "Unavailable"
            )}
            {refreshing && " · Updating…"}
          </div>
        </Card>
      )}
      {composition.showOverview && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(250px,0.7fr)]">
          <Card className="bg-emerald-50/70 p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>Available wallet balance</span>
              {refreshing && <span className="text-xs text-slate-500">Updating…</span>}
            </div>
            <div className="my-2 text-4xl font-semibold tracking-tight sm:text-5xl">
              {summaryLoading ? (
                <Skeleton className="inline-block h-12 w-36 align-middle" />
              ) : summary ? (
                <Money minor={summary.available_minor} currency="USD" />
              ) : (
                "Unavailable"
              )}
            </div>
            <p className="text-sm text-slate-500">Ready for one-listing purchases.</p>
            <Button asChild>
              <Link href="/dashboard/wallet/fund">Fund wallet</Link>
            </Button>
          </Card>
          <Card className="p-6 sm:p-8">
            <p className="eyebrow">In progress</p>
            <h3>Pending wallet credit</h3>
            <div className="my-3 text-2xl font-semibold tracking-tight">
              {summaryLoading ? (
                <Skeleton className="inline-block h-8 w-24 align-middle" />
              ) : summary ? (
                <Money minor={summary.pending_minor} currency="USD" />
              ) : (
                "Unavailable"
              )}
            </div>
            <p>Pending credits become spendable only after availability processing.</p>
          </Card>
        </section>
      )}

      {persistedFunding && !funding && (
        <Card className="flex items-center gap-3 p-5" aria-live="polite">
          <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" aria-hidden="true" />
          <div>
            <h2>Loading funding status</h2>
            <p className="text-sm text-slate-600">Retrieving the saved funding attempt…</p>
          </div>
        </Card>
      )}

      {funding && (
        <PaymentProviderComponent
          funding={funding}
          returnTo={returnTo}
          refreshing={refreshing}
          submitting={submitting}
          onRefresh={() => void refreshFunding()}
          onCancel={() => void cancelFunding()}
          onFundingChange={setFunding}
          onConfirmed={handleFundingConfirmed}
          onError={setProviderError}
          providerError={providerError}
        />
      )}

      {!fundingPage && activeFundings.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-emerald-200 bg-emerald-50/60 p-5">
          <div className="grid gap-1">
            <p className="eyebrow">Payments in progress</p>
            <h2>{activeFundings.length} active payments</h2>
            <p className="text-sm text-slate-600">Resume a saved payment or review its status.</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/dashboard/wallet/funding?active=true">View payments</Link>
          </Button>
        </Card>
      )}

      {composition.showActivity && (
        <section className="grid gap-3" aria-labelledby="wallet-history-heading">
          <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Your money movement</p>
              <h2 id="wallet-history-heading">Wallet activity</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="ghost">
                <Link href="/dashboard/wallet/funding">View all activity</Link>
              </Button>
              <Button variant="ghost" onClick={() => void loadWallet(true)} disabled={refreshing}>
                Refresh
              </Button>
            </div>
          </div>
          {transactions.length === 0 ? (
            activityLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : activityError ? (
              <Toast>{activityError}</Toast>
            ) : (
              <EmptyState
                title="No wallet activity yet"
                description="Fund your wallet to make your first purchase, or come back after a payment settles."
              />
            )
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
                    <strong>{walletActivityLabel(transaction)}</strong>
                    {walletActivityReference(transaction) && (
                      <code className="break-all text-xs text-slate-500">
                        {walletActivityReference(transaction)}
                      </code>
                    )}
                    <span className="text-xs text-slate-500">
                      {new Date(transaction.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid justify-items-end gap-1">
                    <Money minor={transaction.amount_minor} currency={transaction.currency} />
                    <Badge variant={transaction.state === "available" ? "default" : "secondary"}>
                      {walletActivityState(transaction.state)}
                    </Badge>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {fundOpen && composition.showFundingForm && providerPreparation && !fixedAmountMinor ? (
        <Card className="grid gap-4 p-6 sm:p-8" id="wallet-funding" tabIndex={-1}>
          <div className="grid gap-2">
            <p className="eyebrow">Wallet funding</p>
            <h2>Invalid funding preparation</h2>
            <p className="text-sm text-slate-600">
              The amount is missing or invalid. Return to funding entry to choose it again.
            </p>
          </div>
          <Button asChild>
            <Link href={returnTo ? canonicalWalletFundingUrl(returnTo) : "/dashboard/wallet/fund"}>
              Change funding method or amount
            </Link>
          </Button>
        </Card>
      ) : (
        fundOpen &&
        composition.showFundingForm && (
          <Card className="grid gap-4 p-6 sm:p-8" id="wallet-funding" tabIndex={-1}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Wallet funding</p>
                <h2>Fund your Cliqero wallet</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {returnTo && (
                  <Button asChild variant="secondary">
                    <Link href={returnTo}>Return to checkout</Link>
                  </Button>
                )}
                <Button asChild variant="ghost">
                  <Link
                    href={
                      providerPreparation ? "/dashboard/wallet/fund" : "/dashboard?section=wallet"
                    }
                  >
                    {providerPreparation ? "Change funding method" : "Back to wallet"}
                  </Link>
                </Button>
              </div>
            </div>
            <form className="grid gap-3" onSubmit={submitFunding}>
              <p>
                {providerPreparation
                  ? "Review the provider details before continuing. Your wallet credit becomes available after verification."
                  : "Enter the amount to add in canonical USD. It becomes available after verification."}
              </p>
              {providerPreparation ? (
                <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">Wallet credit</span>
                    <strong className="text-xl tracking-tight">
                      <Money minor={fixedAmountMinor ?? "0"} currency="USD" />
                    </strong>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                    <span className="text-sm text-slate-600">Provider</span>
                    <strong>{selectedMethod?.display_name ?? fundingProvider}</strong>
                  </div>
                </div>
              ) : (
                <>
                  <Label htmlFor="funding-amount">Amount in USD</Label>
                  <Input
                    id="funding-amount"
                    autoFocus={fundingPage}
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="25.00"
                    aria-describedby="funding-help"
                  />
                  <span id="funding-help" className="text-xs text-slate-500">
                    Enter a positive amount with up to two decimal places.
                  </span>
                </>
              )}
              {!providerPreparation && <Label>Funding method</Label>}
              {!providerPreparation && (
                <div className="grid gap-3">
                  {methodsToRender.map((method) => (
                    <label
                      className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white p-4 has-[:checked]:border-emerald-600 has-[:checked]:ring-1 has-[:checked]:ring-emerald-600"
                      key={method.id}
                    >
                      <input
                        type="radio"
                        name="funding-provider"
                        value={method.id}
                        checked={provider === method.id}
                        onChange={() => {
                          setProvider(method.id);
                          setFundingOptionId("");
                          setPreparation(null);
                          setFundingOptions([]);
                          setPreparationError(null);
                          setPaymentCurrency(initialPaymentCurrency(method));
                        }}
                        className={providerPreparation ? "sr-only" : undefined}
                        disabled={submitting}
                        required
                      />
                      <span className="grid flex-1 gap-2">
                        <span className="flex items-center gap-3">
                          <img className="h-8 w-8 rounded-md" src={method.image_url} alt="" />
                          <strong>{method.display_name}</strong>
                          {method.test_only && <Badge variant="secondary">TEST ONLY</Badge>}
                        </span>
                        <span className="text-sm text-slate-600">{method.description}</span>
                        <span className="text-xs text-slate-500">
                          Account credit currency: {(method.collection_currencies ?? []).join(", ")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {providerPreparation && selectedMethod && (
                <FundingProviderPreparation
                  method={selectedMethod}
                  fundingOptions={fundingOptions}
                  fundingOptionId={fundingOptionId}
                  onFundingOptionChange={(value) => {
                    setFundingOptionId(value);
                    setPreparation(null);
                    setPreparationError(null);
                  }}
                  paymentCurrency={paymentCurrency}
                  onPaymentCurrencyChange={(value) => {
                    setPreparation(null);
                    setPreparationError(null);
                    setPaymentCurrency(value);
                  }}
                  disabled={submitting}
                />
              )}
              {providerPreparation && preparationLoading && (
                <p className="text-sm text-slate-600" role="status">
                  Loading provider quote…
                </p>
              )}
              {providerPreparation && preparationError && <Toast>{preparationError}</Toast>}
              {providerPreparation &&
                preparation &&
                providerPreparationReady(selectedMethod!, fundingOptionId) && (
                  <div className="grid gap-2 rounded-lg border border-slate-200 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-600">You pay</span>
                      <strong>
                        <Money
                          minor={preparation.collection_amount_minor}
                          currency={preparation.collection_currency}
                        />
                      </strong>
                    </div>
                    {preparation.conversion && (
                      <p className="text-slate-600">
                        Rate:{" "}
                        {formatExchangeRate(
                          preparation.conversion.rate,
                          preparation.conversion.to_currency,
                        )}{" "}
                        / {preparation.conversion.from_currency}
                      </p>
                    )}
                  </div>
                )}
              {providerError && <Toast>{providerError}</Toast>}
              <Button
                type="submit"
                disabled={
                  submitting ||
                  methodsToRender.length === 0 ||
                  !provider ||
                  (providerPreparation &&
                    selectedMethod &&
                    !providerPreparationReady(selectedMethod, fundingOptionId)) ||
                  (providerPreparation && !preparation)
                }
              >
                {submitting
                  ? "Starting funding…"
                  : providerPreparation
                    ? (selectedMethod?.customer_action ?? "Create funding")
                    : "Review payment"}
              </Button>
              <HoneypotField />
            </form>
          </Card>
        )
      )}
    </div>
  );
}

export function formatTransactionAmount(transaction: WalletTransaction): string {
  return formatMinorUsd(transaction.amount_minor);
}
