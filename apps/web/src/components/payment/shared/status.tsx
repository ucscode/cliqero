"use client";

import { useEffect, type ReactNode } from "react";
import { apiFetch, formatExchangeRate, type FundingStatus } from "@/lib/api-client";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Toast } from "../../toast";
import { Money } from "../../money";
import { CopyValue } from "../../copy-value";
import { PaymentInstructions } from "./instructions";
import { canonicalWalletFundingUrl } from "@/lib/api-client";
import { fundingToneClass, presentFundingState } from "@/modules/funding/presentation";

export async function initializeFundingStatus(fundingId: string) {
  return apiFetch<FundingStatus>(`/api/wallet/fund/${fundingId}/initialize`, { method: "POST" });
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
    return "Complete the payment to continue.";
  }
  if (funding.state === "verification_pending")
    return funding.verification ? null : "Your payment is being verified.";
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

export const FUNDING_STATUS_POLL_INITIAL_DELAY_MS = 1000;
export const FUNDING_STATUS_POLL_INITIALIZING_INTERVAL_MS = 2500;
export const FUNDING_STATUS_POLL_AWAITING_PAYMENT_INTERVAL_MS = 10_000;
export const FUNDING_STATUS_POLL_VERIFICATION_INTERVAL_MS = 5_000;
export const FUNDING_STATUS_POLL_INTERVAL_MS = FUNDING_STATUS_POLL_VERIFICATION_INTERVAL_MS;

type FundingStatusPollerTimers = {
  setTimeout: (handler: () => void, timeout: number) => number;
  clearTimeout: (handle: number) => void;
};

export function createFundingStatusPoller({
  initialFunding,
  getStatus,
  onStatus,
  onError,
  timers,
  isVisible = () => document.visibilityState !== "hidden",
  shouldContinue = (funding) => funding.state === "verification_pending",
  getPollInterval = () => FUNDING_STATUS_POLL_INTERVAL_MS,
}: {
  initialFunding: Pick<FundingStatus, "state">;
  getStatus: () => Promise<FundingStatus>;
  onStatus: (funding: FundingStatus) => void;
  onError?: (error: unknown) => void;
  timers: FundingStatusPollerTimers;
  isVisible?: () => boolean;
  shouldContinue?: (funding: Pick<FundingStatus, "state">) => boolean;
  getPollInterval?: (funding: Pick<FundingStatus, "state">) => number;
}) {
  let currentFunding = initialFunding;
  let disposed = false;
  let inFlight = false;
  let timer: number | undefined;

  const schedule = (delay: number) => {
    if (disposed || timer !== undefined) return;
    timer = timers.setTimeout(() => {
      timer = undefined;
      void poll();
    }, delay);
  };

  const poll = async () => {
    if (disposed || inFlight) return;
    if (!isVisible()) {
      schedule(getPollInterval(currentFunding));
      return;
    }

    inFlight = true;
    try {
      const latest = await getStatus();
      if (disposed) return;
      currentFunding = latest;
      onStatus(latest);
      if (!shouldContinue(latest)) return;
    } catch (error) {
      if (!disposed) onError?.(error);
      if (!shouldContinue(currentFunding)) return;
    } finally {
      inFlight = false;
    }

    schedule(getPollInterval(currentFunding));
  };

  schedule(FUNDING_STATUS_POLL_INITIAL_DELAY_MS);
  return () => {
    disposed = true;
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = undefined;
  };
}

function useProviderStatusPolling({
  funding,
  shouldContinue,
  onStatus,
  onConfirmed,
  onError,
  getPollInterval,
}: {
  funding: FundingStatus;
  shouldContinue: (funding: Pick<FundingStatus, "state">) => boolean;
  onStatus: (funding: FundingStatus) => void;
  onConfirmed: () => void;
  onError: () => void;
  getPollInterval?: (funding: Pick<FundingStatus, "state">) => number;
}) {
  const fundingId = funding.id;
  const fundingState = funding.state;
  useEffect(() => {
    if (!shouldContinue({ state: fundingState })) return;
    return createFundingStatusPoller({
      initialFunding: {
        state: fundingState,
      },
      getStatus: () => apiFetch<FundingStatus>(`/api/wallet/fund/${fundingId}`),
      onStatus: (latest) => {
        onStatus(latest);
        if (latest.state === "confirmed") onConfirmed();
      },
      onError,
      shouldContinue,
      getPollInterval,
      timers: {
        setTimeout: (handler, delay) => window.setTimeout(handler, delay),
        clearTimeout: (handle) => window.clearTimeout(handle),
      },
    });
  }, [fundingId, fundingState, getPollInterval, onConfirmed, onError, onStatus, shouldContinue]);
}

export function verificationObservationHeading(verification: FundingStatus["verification"]) {
  if (!verification) return "Verification update";
  if (verification.status === "not_found") return "Transaction not found";
  if (verification.status === "failed") return "Transaction failed";
  if (verification.status === "mismatch") return "Transaction does not match";
  if (verification.status === "provider_error") return "Verification temporarily unavailable";
  if (verification.status === "success") return "Payment verified";
  return "Verification in progress";
}

export function verificationObservationClass(verification: FundingStatus["verification"]) {
  if (verification?.level === "success") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (verification?.level === "info") return "border-blue-200 bg-blue-50 text-blue-950";
  return "border-red-200 bg-red-50 text-red-950";
}

export function formatTimeRemaining(expiresAt: string, now = Date.now()) {
  const remaining = Math.max(0, Date.parse(expiresAt) - now);
  if (remaining === 0) return "Expired";
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Expires in ${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export type PaymentProviderProps = {
  funding: FundingStatus;
  returnTo?: string;
  refreshing: boolean;
  submitting: boolean;
  onRefresh: () => void;
  onCancel: () => void;
  onFundingChange: (funding: FundingStatus) => void;
  onConfirmed: () => void;
  onError: (message: string) => void;
  providerError?: string | null;
};

type PaymentComponentProps = Omit<PaymentProviderProps, "onError"> & {
  sessionExpired: boolean;
  currentTime: number;
  showInstructions?: boolean;
  showInitializationStatus?: boolean;
  children: ReactNode;
};

export function PaymentComponent({
  funding,
  returnTo,
  submitting,
  onCancel,
  sessionExpired,
  currentTime,
  showInstructions = true,
  children,
  providerError,
  showInitializationStatus = true,
}: PaymentComponentProps) {
  const statePresentation = presentFundingState(funding.state);
  const pendingMessage = fundingStatusMessage(funding, currentTime);
  return (
    <Card className="grid gap-4 p-5" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Payment method</p>
          <p className="font-semibold">{funding.provider_display_name ?? "Payment provider"}</p>
          <p className="eyebrow mt-3">Status</p>
          <h2>{statePresentation.label}</h2>
        </div>
        <Badge
          variant={statePresentation.tone === "danger" ? "destructive" : "secondary"}
          className={fundingToneClass(statePresentation.tone)}
        >
          {statePresentation.label}
        </Badge>
      </div>
      {pendingMessage && <p>{pendingMessage}</p>}
      {showInitializationStatus &&
        (funding.state === "initialization_pending" || funding.state === "initializing") && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <span aria-hidden="true" className="text-lg leading-none">
              …
            </span>
            <span>
              {funding.state === "initialization_pending"
                ? "Preparing payment…"
                : "Contacting payment provider…"}
            </span>
          </div>
        )}
      {showInstructions && !sessionExpired && (
        <PaymentInstructions content={funding.instructions} />
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
        {!sessionExpired && funding.conversion && (
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
        {children}
        {funding.verification && <VerificationObservation verification={funding.verification} />}
      </div>
      <div className="flex flex-wrap gap-2">
        {returnTo && (
          <Button asChild variant="secondary">
            <a href={returnTo}>Return to checkout</a>
          </Button>
        )}
        {funding.state === "initialization_pending" || funding.state === "awaiting_payment" ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel funding
          </Button>
        ) : null}
        {(funding.state === "blocked" ||
          funding.state === "failed" ||
          funding.state === "expired") && (
          <Button asChild variant="secondary">
            <a href={canonicalWalletFundingUrl(returnTo ?? "/dashboard/wallet/fund")}>
              Start a new funding attempt
            </a>
          </Button>
        )}
        <Button asChild variant="ghost">
          <a href="/dashboard?section=wallet">Wallet overview</a>
        </Button>
      </div>
      {providerError && <Toast>{providerError}</Toast>}
    </Card>
  );
}

export function ProviderStatusPolling({
  funding,
  shouldContinue,
  onFundingChange,
  onConfirmed,
  onError,
  getPollInterval,
}: Pick<PaymentProviderProps, "funding" | "onFundingChange" | "onConfirmed"> & {
  shouldContinue: (funding: Pick<FundingStatus, "state">) => boolean;
  onError: () => void;
  getPollInterval?: (funding: Pick<FundingStatus, "state">) => number;
}) {
  useProviderStatusPolling({
    funding,
    shouldContinue,
    onStatus: onFundingChange,
    onConfirmed,
    onError,
    getPollInterval,
  });
  return null;
}

export function VerificationObservation({
  verification,
}: {
  verification: NonNullable<FundingStatus["verification"]>;
}) {
  return (
    <div
      className={`grid gap-1 rounded-lg border p-4 text-sm ${verificationObservationClass(verification)}`}
      role={verification.level === "error" ? "alert" : "status"}
    >
      <strong>{verificationObservationHeading(verification)}</strong>
      <span>{verification.message}</span>
    </div>
  );
}
