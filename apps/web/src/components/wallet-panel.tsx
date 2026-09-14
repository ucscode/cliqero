"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  ApiClientError,
  canonicalWalletFundingUrl,
  formatExchangeRate,
  formatMinorAmount,
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
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./empty-state";
import { Toast } from "./toast";
import { Money } from "./money";
import { HoneypotField } from "./honeypot-field";
import { HONEYPOT_FIELD_NAME, HONEYPOT_HEADER_NAME } from "@/lib/honeypot";
import { FundingProviderPreparation, initialPaymentCurrency } from "./funding-provider-preparation";
import { CopyValue } from "./copy-value";
import { PaymentInstructions } from "./payment-instructions";
import { LoaderCircle } from "lucide-react";
import { fundingToneClass, presentFundingState } from "@/modules/funding/presentation";

const terminalFundingStates = new Set([
  "confirmed",
  "failed",
  "blocked",
  "cancelled",
  "expired",
  "reconciliation_pending",
]);

function safeProviderUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

type BankStatusField = {
  key: string;
  label: string;
  value: string;
  copyable?: boolean;
};

function snapshotFields(value: unknown): BankStatusField[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const fields = (value as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter(
    (field): field is BankStatusField =>
      Boolean(field) &&
      typeof field === "object" &&
      typeof (field as { key?: unknown }).key === "string" &&
      typeof (field as { label?: unknown }).label === "string" &&
      typeof (field as { value?: unknown }).value === "string",
  );
}

export function snapshotInstruction(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const instruction = (value as { instruction?: unknown }).instruction;
  return typeof instruction === "string" && instruction.trim() ? instruction : null;
}

export function bankStatusFieldRows(fields: readonly BankStatusField[]) {
  return [...fields];
}

export function fundingStatusMessage(
  funding: Pick<FundingStatus, "provider" | "state" | "expires_at" | "error_message"> & {
    verification?: FundingStatus["verification"];
  },
  now = Date.now(),
) {
  if (funding.state === "initialization_pending") return "Preparing payment.";
  if (funding.state === "initializing") return "Contacting payment provider.";
  if (funding.state === "awaiting_payment") {
    if (funding.expires_at && Date.parse(funding.expires_at) <= now)
      return "This provider payment session has expired. Start a new funding attempt.";
    if (funding.provider === "bank_transfer") return "Use the details below to make your transfer.";
    if (funding.provider === "nowpayments")
      return "Send the exact amount below. Cliqero will detect the payment automatically.";
    return "Complete the payment to continue.";
  }
  if (funding.state === "verification_pending")
    return funding.verification?.message ?? "Your payment is being verified.";
  if (funding.state === "expired")
    return "This payment session has expired. Start a new funding attempt.";
  if (funding.state === "failed" || funding.state === "blocked")
    return (
      funding.error_message ??
      "This funding attempt could not be completed. You can start a new attempt."
    );
  if (funding.state === "cancelled") return "This funding attempt was cancelled.";
  if (funding.state === "confirmed")
    return "Your funding is confirmed. Wallet availability will update as the credit settles.";
  return null;
}

export function fundingActionLabel(funding: Pick<FundingStatus, "customer_action">) {
  return funding.customer_action ?? "Continue";
}

export function canSubmitBankTransferEvidence(
  funding: Pick<FundingStatus, "provider" | "state"> | null,
) {
  return (
    funding?.provider === "bank_transfer" &&
    (funding.state === "initialization_pending" ||
      funding.state === "initializing" ||
      funding.state === "awaiting_payment" ||
      funding.state === "verification_pending")
  );
}

export function shouldPollFunding(funding: Pick<FundingStatus, "provider" | "state">) {
  return funding.provider !== "bank_transfer" && !terminalFundingStates.has(funding.state);
}

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

export function formatTimeRemaining(expiresAt: string, now = Date.now()) {
  const remaining = Math.max(0, Date.parse(expiresAt) - now);
  if (remaining === 0) return "Expired";
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Expires in ${minutes}:${seconds.toString().padStart(2, "0")}`;
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
  const [pollingNotice, setPollingNotice] = useState<string | null>(null);
  const [fundOpen, setFundOpen] = useState(fundingPage);
  const [amount, setAmount] = useState(fundingAmount ?? "");
  const [transactionHash, setTransactionHash] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [evidenceMessage, setEvidenceMessage] = useState<string | null>(null);
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
  const [currentTime, setCurrentTime] = useState(() => Date.now());
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
      setPollingNotice(null);
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

  useEffect(() => {
    const fundingId = funding?.id;
    const fundingProvider = funding?.provider;
    const fundingState = funding?.state;
    if (
      !fundingId ||
      !fundingProvider ||
      !fundingState ||
      !shouldPollFunding({ provider: fundingProvider, state: fundingState })
    )
      return;
    let attempts = 0;
    let timeout: number | undefined;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      attempts += 1;
      try {
        const latest = await apiFetch<FundingStatus>(`/api/wallet/fund/${fundingId}`);
        setFunding(latest);
        if (latest.state === "confirmed") void loadWallet(true);
        if (!shouldPollFunding(latest)) {
          setPollingNotice(null);
          return;
        }
        if (attempts >= 20) {
          setPollingNotice(
            "Automatic updates are paused. Funding may still be processing; refresh to check again.",
          );
          return;
        }
      } catch {
        if (attempts >= 20) {
          setPollingNotice(
            "Automatic updates are paused. Funding may still be processing; refresh to check again.",
          );
          return;
        }
      }
      timeout = window.setTimeout(() => void poll(), 4000);
    };
    timeout = window.setTimeout(() => void poll(), 1000);
    return () => {
      if (timeout) window.clearTimeout(timeout);
    };
  }, [funding?.id, funding?.provider, funding?.state, loadWallet]);

  const selectedMethod = fundingMethods.find((method) => method.id === provider) ?? null;
  const methodsToRender = providerPreparation
    ? fundingMethods.filter((method) => method.id === provider)
    : fundingMethods;
  const preparationLoading = Boolean(
    providerPreparation && fixedAmountMinor && selectedMethod && !preparation && !preparationError,
  );
  const bankFundingOptions = fundingOptions;
  const bankAccountRequired = providerPreparation && selectedMethod?.id === "bank_transfer";

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
    if (!funding?.expires_at) return;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [funding?.expires_at]);

  useEffect(() => {
    if (!fundingPage || summaryLoading) return;
    document.getElementById("wallet-funding")?.scrollIntoView({ block: "start" });
  }, [fundingPage, summaryLoading]);

  const providerUrl =
    funding?.expires_at && Date.parse(funding.expires_at) <= currentTime
      ? null
      : safeProviderUrl(funding?.authorization_url ?? null);
  const paymentSessionExpired = Boolean(
    funding?.state === "expired" ||
    (funding?.provider === "nowpayments" &&
      funding.expires_at &&
      Date.parse(funding.expires_at) <= currentTime),
  );
  const canContinueProvider = funding?.state === "awaiting_payment" && providerUrl;
  const bankEvidenceAllowed = canSubmitBankTransferEvidence(funding) && !funding?.evidence;
  const pendingMessage = useMemo(
    () => (funding ? fundingStatusMessage(funding, currentTime) : null),
    [currentTime, funding],
  );
  const bankFields = bankStatusFieldRows(snapshotFields(funding?.provider_account_snapshot));
  const bankInstruction = snapshotInstruction(funding?.provider_account_snapshot);
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
      setPollingNotice(null);
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

  async function submitTransactionHash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!funding) return;
    setProviderError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<{
        id: string;
        state: FundingStatus["state"];
        provider_transaction_id: string | null;
        verification: FundingStatus["verification"];
      }>(`/api/wallet/fund/${funding.id}/transaction`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transaction_hash: transactionHash }),
      });
      setFunding((current) =>
        current
          ? {
              ...current,
              state: result.state,
              provider_transaction_id: result.provider_transaction_id,
              verification: result.verification,
            }
          : current,
      );
      setTransactionHash("");
    } catch (cause) {
      setProviderError(
        cause instanceof ApiClientError
          ? cause.message
          : "Transaction hash could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBankEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!funding) return;
    setProviderError(null);
    setEvidenceMessage(null);
    const evidence = {
      transfer_reference: transferReference.trim(),
      customer_note: customerNote.trim(),
    };
    if (!evidence.transfer_reference && !proofFile && !evidence.customer_note) {
      setProviderError("Add a transfer reference, proof file, or note before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("transfer_reference", evidence.transfer_reference);
      body.set("customer_note", evidence.customer_note);
      if (proofFile) body.set("proof_file", proofFile);
      await apiFetch(`/api/wallet/fund/${funding.id}/evidence`, {
        method: "POST",
        body,
      });
      const latest = await apiFetch<FundingStatus>(`/api/wallet/fund/${funding.id}`);
      setFunding(latest);
      setTransferReference("");
      setProofFile(null);
      setCustomerNote("");
      setEvidenceMessage("Evidence submitted. Your bank transfer is awaiting manual verification.");
    } catch (cause) {
      setProviderError(
        cause instanceof ApiClientError
          ? cause.message
          : "Evidence could not be submitted. Please try again.",
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
        <Card className="grid gap-4 p-5" aria-live="polite">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Payment method</p>
              <p className="font-semibold">{funding.provider_display_name ?? "Payment provider"}</p>
              <p className="eyebrow mt-3">Status</p>
              <h2>{presentFundingState(funding.state).label}</h2>
            </div>
            <Badge
              variant={
                presentFundingState(funding.state).tone === "danger" ? "destructive" : "secondary"
              }
              className={fundingToneClass(presentFundingState(funding.state).tone)}
            >
              {presentFundingState(funding.state).label}
            </Badge>
          </div>
          <p>{pendingMessage}</p>
          {(funding.state === "initialization_pending" || funding.state === "initializing") && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>
                {funding.state === "initialization_pending"
                  ? "Preparing payment…"
                  : "Contacting payment provider…"}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void refreshFunding()}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          )}
          {pollingNotice && (
            <p className="text-sm text-amber-800" role="status">
              {pollingNotice}
            </p>
          )}
          {funding.provider !== "bank_transfer" && !paymentSessionExpired && (
            <PaymentInstructions content={funding.instructions} />
          )}
          {funding.provider === "nowpayments" &&
            (funding.state === "awaiting_payment" || funding.state === "verification_pending") &&
            !(funding.expires_at && Date.parse(funding.expires_at) <= currentTime) && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                <div className="grid gap-1">
                  <strong>Waiting for payment</strong>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void refreshFunding()}
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing…" : "Refresh status"}
                </Button>
              </div>
            )}
          <div className="grid gap-4 rounded-lg bg-slate-50 p-4 text-sm">
            <div className="grid gap-1">
              <span className="text-slate-600">Reference ID</span>
              <CopyValue
                label="reference ID"
                value={funding.funding_reference ?? funding.id}
                displayValue={
                  <code className="break-all rounded bg-white px-2 py-1 text-xs text-slate-700">
                    {funding.funding_reference ?? funding.id}
                  </code>
                }
              />
            </div>
            <div className="grid gap-1">
              <span className="text-slate-600">Funding amount</span>
              <strong>
                <Money minor={funding.amount_minor} currency={funding.currency} />
              </strong>
            </div>
            {!paymentSessionExpired && funding.conversion && (
              <>
                <div className="grid gap-1">
                  <span className="text-slate-600">Payment amount</span>
                  <strong>
                    <Money
                      minor={funding.collection_amount_minor}
                      currency={funding.collection_currency}
                    />
                  </strong>
                </div>
                <div className="grid gap-1">
                  <span className="text-slate-600">Exchange rate</span>
                  <strong>
                    {formatExchangeRate(funding.conversion.rate, funding.conversion.to_currency)} /{" "}
                    {funding.conversion.from_currency}
                  </strong>
                </div>
              </>
            )}
            {!paymentSessionExpired && funding.payment_amount && (
              <div className="grid gap-1">
                <span className="text-slate-600">Payment amount</span>
                <CopyValue
                  label="payment amount"
                  value={funding.payment_amount}
                  displayValue={
                    <strong>
                      {funding.payment_amount} {funding.payment_currency ?? ""}
                    </strong>
                  }
                />
              </div>
            )}
            {!paymentSessionExpired && funding.payment_currency && (
              <div className="grid gap-1">
                <span className="text-slate-600">Payment currency</span>
                <strong>{funding.payment_currency}</strong>
              </div>
            )}
            {!paymentSessionExpired && funding.network && (
              <div className="grid gap-1">
                <span className="text-slate-600">Network</span>
                <strong>{funding.network}</strong>
              </div>
            )}
            {funding.provider === "bank_transfer" && (
              <div className="grid gap-1 border-t border-slate-200 pt-3">
                <span className="text-slate-600">Transfer amount</span>
                <CopyValue
                  label="transfer amount"
                  value={formatMinorAmount(funding.collection_amount_minor)}
                  displayValue={
                    <strong>
                      <Money
                        minor={funding.collection_amount_minor}
                        currency={funding.collection_currency}
                      />
                    </strong>
                  }
                />
              </div>
            )}
            {funding.provider === "bank_transfer" && bankFields.length > 0 && (
              <div className="grid gap-4 border-t border-slate-200 pt-3">
                <strong>Receiving bank details</strong>
                {bankFields.map((field) => (
                  <div
                    className="grid gap-1 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] sm:items-center sm:gap-3"
                    key={field.key}
                  >
                    <span className="text-slate-600">{field.label}</span>
                    <div className="min-w-0">
                      {field.copyable ? (
                        <CopyValue
                          label={field.label}
                          value={field.value}
                          displayValue={<strong className="break-all">{field.value}</strong>}
                        />
                      ) : (
                        <strong className="block break-all">{field.value}</strong>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {funding.provider === "bank_transfer" && bankFields.length === 0 && (
              <p className="border-t border-amber-200 pt-3 text-sm text-amber-900" role="status">
                Bank details are unavailable for this saved funding attempt. Do not transfer until
                receiving details are shown.
              </p>
            )}
            {funding.provider === "bank_transfer" && bankInstruction && (
              <div className="grid gap-1 border-t border-slate-200 pt-3">
                <span className="text-slate-600">Transfer instruction</span>
                <strong className="whitespace-pre-line">{bankInstruction}</strong>
              </div>
            )}
            {!paymentSessionExpired && funding.payment_address && (
              <div className="grid gap-1">
                <span className="text-slate-600">Payment address</span>
                <CopyValue
                  label="payment address"
                  value={funding.payment_address}
                  displayValue={
                    <code className="break-all rounded bg-white p-2 text-xs text-slate-700">
                      {funding.payment_address}
                    </code>
                  }
                />
              </div>
            )}
            {funding.provider === "usdt_trc20" && funding.provider_transaction_id ? (
              <div className="grid gap-1">
                <span className="text-slate-600">Submitted transaction hash</span>
                <CopyValue
                  label="submitted transaction hash"
                  value={funding.provider_transaction_id}
                  displayValue={
                    <code className="break-all rounded bg-white p-2 text-xs text-slate-700">
                      {funding.provider_transaction_id}
                    </code>
                  }
                />
              </div>
            ) : funding.provider === "usdt_trc20" &&
              (funding.state === "awaiting_payment" || funding.state === "verification_pending") ? (
              <form className="grid gap-2" onSubmit={submitTransactionHash}>
                <Label htmlFor="transaction-hash">Blockchain transaction hash</Label>
                <Input
                  id="transaction-hash"
                  value={transactionHash}
                  onChange={(event) => setTransactionHash(event.target.value)}
                  placeholder="Paste the transaction hash"
                  disabled={submitting}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={submitting || !transactionHash.trim()}
                >
                  {submitting ? "Submitting…" : "Submit transaction hash"}
                </Button>
              </form>
            ) : null}
            {funding.provider === "bank_transfer" && funding.evidence && (
              <div className="grid gap-1 border-t border-slate-200 pt-4 text-sm" role="status">
                <strong>Evidence submitted</strong>
                <span className="text-slate-600">
                  Your bank transfer is awaiting manual verification.
                </span>
                {funding.evidence.proof && (
                  <span className="text-slate-600">
                    Proof file: {funding.evidence.proof.original_filename ?? "Uploaded file"}
                  </span>
                )}
              </div>
            )}
            {bankEvidenceAllowed && (
              <form
                className="grid gap-3 border-t border-slate-200 pt-4"
                onSubmit={submitBankEvidence}
              >
                <div>
                  <h3>Submit transfer evidence</h3>
                  <p className="text-sm text-slate-600">
                    Add at least one item. Evidence helps the operator reconcile your transfer; it
                    does not confirm or credit your wallet automatically.
                  </p>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="bank-transfer-reference">Transfer reference</Label>
                  <Input
                    id="bank-transfer-reference"
                    value={transferReference}
                    onChange={(event) => setTransferReference(event.target.value)}
                    maxLength={200}
                    disabled={submitting}
                    placeholder="Bank transfer reference"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="bank-proof-file">Transaction proof file</Label>
                  <Input
                    id="bank-proof-file"
                    name="proof_file"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                    disabled={submitting}
                  />
                  <p className="text-xs text-slate-500">
                    PNG, JPEG, WEBP, GIF, or PDF up to 10 MB.
                  </p>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="bank-customer-note">Note</Label>
                  <Textarea
                    id="bank-customer-note"
                    value={customerNote}
                    onChange={(event) => setCustomerNote(event.target.value)}
                    maxLength={2000}
                    disabled={submitting}
                    placeholder="Optional note for the operator"
                  />
                </div>
                <Button type="submit" variant="secondary" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit transfer evidence"}
                </Button>
              </form>
            )}
            {funding.expires_at && funding.state !== "expired" && !paymentSessionExpired && (
              <p className="text-sm font-medium text-slate-700" role="timer">
                {formatTimeRemaining(funding.expires_at, currentTime)} · Expires:{" "}
                {new Date(funding.expires_at).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canContinueProvider && (
              <Button asChild>
                <a href={providerUrl}>{fundingActionLabel(funding)}</a>
              </Button>
            )}
            {process.env.NODE_ENV !== "production" &&
              funding.provider === "development" &&
              (funding.state === "awaiting_payment" ||
                funding.state === "verification_pending") && (
                <Button
                  variant="secondary"
                  onClick={verifyDevelopmentFunding}
                  disabled={submitting}
                >
                  {submitting ? "Verifying…" : "Verify development funding"}
                </Button>
              )}
            {returnTo && (
              <Button asChild variant="secondary">
                <Link href={returnTo}>Return to checkout</Link>
              </Button>
            )}
            {funding.state === "initialization_pending" || funding.state === "awaiting_payment" ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void cancelFunding()}
                disabled={submitting}
              >
                Cancel funding
              </Button>
            ) : null}
            {(funding.state === "blocked" ||
              funding.state === "failed" ||
              funding.state === "expired") && (
              <Button asChild variant="secondary">
                <Link href={canonicalWalletFundingUrl(returnTo ?? "/dashboard/wallet/fund")}>
                  Start a new funding attempt
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/dashboard?section=wallet">Wallet overview</Link>
            </Button>
          </div>
          {providerError && <Toast>{providerError}</Toast>}
          {evidenceMessage && (
            <p className="text-sm font-medium text-emerald-800" role="status">
              {evidenceMessage}
            </p>
          )}
        </Card>
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
                  fundingOptions={bankFundingOptions}
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
                (!bankAccountRequired || Boolean(fundingOptionId)) && (
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
                  (bankAccountRequired && !fundingOptionId) ||
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
