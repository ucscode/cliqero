"use client";

import {
  createElement,
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  apiFetch,
  formatExchangeRate,
  formatMinorAmount,
  type FundingStatus,
} from "@/lib/api-client";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Toast } from "../../toast";
import { Money } from "../../money";
import { CopyValue } from "../../copy-value";
import { PaymentInstructions } from "./instructions";
import { LoaderCircle } from "lucide-react";
import { canonicalWalletFundingUrl } from "@/lib/api-client";
import { fundingToneClass, presentFundingState } from "@/modules/funding/presentation";
import { canSubmitBankTransferEvidence } from "@/providers/payment/bank-transfer/ui-policy";
import {
  shouldShowSubmittedTransactionHash,
  shouldShowTransactionHashInput,
  shouldPollDirectTrc20Funding,
} from "@/providers/payment/direct-trc20/ui-policy";
import { shouldPollNowPaymentsFunding } from "@/providers/payment/nowpayments/ui-policy";
import { shouldShowPaystackRefresh } from "@/providers/payment/paystack/ui-policy";

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
export const FUNDING_STATUS_POLL_INTERVAL_MS = 4000;

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
}: {
  initialFunding: Pick<FundingStatus, "state">;
  getStatus: () => Promise<FundingStatus>;
  onStatus: (funding: FundingStatus) => void;
  onError?: (error: unknown) => void;
  timers: FundingStatusPollerTimers;
  isVisible?: () => boolean;
  shouldContinue?: (funding: Pick<FundingStatus, "state">) => boolean;
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
      schedule(FUNDING_STATUS_POLL_INTERVAL_MS);
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

    schedule(FUNDING_STATUS_POLL_INTERVAL_MS);
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
}: {
  funding: FundingStatus;
  shouldContinue: (funding: Pick<FundingStatus, "state">) => boolean;
  onStatus: (funding: FundingStatus) => void;
  onConfirmed: () => void;
  onError: () => void;
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
      timers: {
        setTimeout: (handler, delay) => window.setTimeout(handler, delay),
        clearTimeout: (handle) => window.clearTimeout(handle),
      },
    });
  }, [fundingId, fundingState, onConfirmed, onError, onStatus, shouldContinue]);
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

type PaymentProviderProps = {
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
  children: ReactNode;
};

export function PaymentComponent({
  funding,
  returnTo,
  refreshing,
  submitting,
  onRefresh,
  onCancel,
  sessionExpired,
  currentTime,
  showInstructions = true,
  children,
  providerError,
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
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
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

function ProviderStatusPolling({
  funding,
  shouldContinue,
  onFundingChange,
  onConfirmed,
  onError,
}: Pick<PaymentProviderProps, "funding" | "onFundingChange" | "onConfirmed"> & {
  shouldContinue: (funding: Pick<FundingStatus, "state">) => boolean;
  onError: () => void;
}) {
  useProviderStatusPolling({
    funding,
    shouldContinue,
    onStatus: onFundingChange,
    onConfirmed,
    onError,
  });
  return null;
}

function PaystackPayment(props: PaymentProviderProps) {
  const [currentTime] = useState(() => Date.now());
  const providerUrl = props.funding.authorization_url;
  const safeUrl = providerUrl && /^https?:\/\//.test(providerUrl) ? providerUrl : null;
  return (
    <PaymentComponent
      {...props}
      sessionExpired={false}
      currentTime={currentTime}
      showInstructions={false}
    >
      {safeUrl && props.funding.state === "awaiting_payment" && (
        <Button asChild>
          <a href={safeUrl}>{fundingActionLabel(props.funding)}</a>
        </Button>
      )}
      {shouldShowPaystackRefresh(props.funding) && (
        <Button
          type="button"
          variant="secondary"
          onClick={props.onRefresh}
          disabled={props.refreshing}
        >
          {props.refreshing ? "Refreshing…" : "Refresh status"}
        </Button>
      )}
    </PaymentComponent>
  );
}

function NowPaymentsPayment(props: PaymentProviderProps) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const { onError } = props;
  const pollingError = useCallback(
    () => onError("Automatic status updates are temporarily unavailable. Retrying…"),
    [onError],
  );
  const expired = Boolean(
    props.funding.state === "expired" ||
    (props.funding.expires_at && Date.parse(props.funding.expires_at) <= currentTime),
  );
  useEffect(() => {
    if (!props.funding.expires_at) return;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [props.funding.expires_at]);
  return (
    <>
      <ProviderStatusPolling
        funding={props.funding}
        shouldContinue={shouldPollNowPaymentsFunding}
        onFundingChange={props.onFundingChange}
        onConfirmed={props.onConfirmed}
        onError={pollingError}
      />
      <PaymentComponent {...props} sessionExpired={expired} currentTime={currentTime}>
        {!expired && props.funding.payment_amount && (
          <div className="grid gap-1">
            <span className="text-slate-600">Payment amount</span>
            <CopyValue
              label="payment amount"
              value={props.funding.payment_amount}
              displayValue={
                <strong>
                  {props.funding.payment_amount} {props.funding.payment_currency ?? ""}
                </strong>
              }
            />
          </div>
        )}
        {!expired && props.funding.payment_currency && (
          <div className="grid gap-1">
            <span className="text-slate-600">Payment currency</span>
            <strong>{props.funding.payment_currency}</strong>
          </div>
        )}
        {!expired && props.funding.payment_address && (
          <div className="grid gap-1">
            <span className="text-slate-600">Payment address</span>
            <CopyValue
              label="payment address"
              value={props.funding.payment_address}
              displayValue={
                <code className="break-all rounded bg-white p-2 text-xs text-slate-700">
                  {props.funding.payment_address}
                </code>
              }
            />
          </div>
        )}
        {!expired &&
          (props.funding.state === "awaiting_payment" ||
            props.funding.state === "verification_pending") && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              <strong>Waiting for payment</strong>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={props.onRefresh}
                disabled={props.refreshing}
              >
                {props.refreshing ? "Refreshing…" : "Refresh status"}
              </Button>
            </div>
          )}
        {props.funding.expires_at && props.funding.state !== "expired" && !expired && (
          <p className="text-sm font-medium text-slate-700" role="timer">
            {formatTimeRemaining(props.funding.expires_at, currentTime)} · Expires:{" "}
            {new Date(props.funding.expires_at).toLocaleString()}
          </p>
        )}
      </PaymentComponent>
    </>
  );
}

function DirectTrc20Payment(props: PaymentProviderProps) {
  const [currentTime] = useState(() => Date.now());
  const [transactionHash, setTransactionHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { onError } = props;
  const pollingError = useCallback(
    () => onError("Automatic status updates are temporarily unavailable. Retrying…"),
    [onError],
  );
  async function submitTransactionHash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch<{
        state: FundingStatus["state"];
        provider_transaction_id: string | null;
        verification: FundingStatus["verification"];
      }>(`/api/wallet/fund/${props.funding.id}/transaction`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transaction_hash: transactionHash }),
      });
      props.onFundingChange({
        ...props.funding,
        state: result.state,
        provider_transaction_id: result.provider_transaction_id,
        verification: result.verification,
      });
      setTransactionHash("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Transaction hash could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <>
      <ProviderStatusPolling
        funding={props.funding}
        shouldContinue={shouldPollDirectTrc20Funding}
        onFundingChange={props.onFundingChange}
        onConfirmed={props.onConfirmed}
        onError={pollingError}
      />
      <PaymentComponent {...props} sessionExpired={false} currentTime={currentTime}>
        {props.funding.payment_amount && (
          <div className="grid gap-1">
            <span className="text-slate-600">Payment amount</span>
            <CopyValue
              label="payment amount"
              value={props.funding.payment_amount}
              displayValue={
                <strong>
                  {props.funding.payment_amount} {props.funding.payment_currency ?? ""}
                </strong>
              }
            />
          </div>
        )}
        {props.funding.payment_currency && (
          <div className="grid gap-1">
            <span className="text-slate-600">Payment currency</span>
            <strong>{props.funding.payment_currency}</strong>
          </div>
        )}
        {props.funding.network && (
          <div className="grid gap-1">
            <span className="text-slate-600">Network</span>
            <strong>{props.funding.network}</strong>
          </div>
        )}
        {props.funding.payment_address && (
          <div className="grid gap-1">
            <span className="text-slate-600">Payment address</span>
            <CopyValue
              label="payment address"
              value={props.funding.payment_address}
              displayValue={
                <code className="break-all rounded bg-white p-2 text-xs text-slate-700">
                  {props.funding.payment_address}
                </code>
              }
            />
          </div>
        )}
        {shouldShowSubmittedTransactionHash(props.funding) ? (
          <div className="grid gap-1">
            <span className="text-slate-600">Submitted transaction hash</span>
            <CopyValue
              label="submitted transaction hash"
              value={props.funding.provider_transaction_id!}
              displayValue={
                <code className="break-all rounded bg-white p-2 text-xs text-slate-700">
                  {props.funding.provider_transaction_id}
                </code>
              }
            />
          </div>
        ) : shouldShowTransactionHashInput(props.funding) ? (
          <form className="grid gap-2" onSubmit={submitTransactionHash}>
            <Label htmlFor="transaction-hash">Blockchain transaction hash</Label>
            <Input
              id="transaction-hash"
              value={transactionHash}
              onChange={(event) => {
                setTransactionHash(event.target.value);
                setError(null);
              }}
              placeholder="Paste the transaction hash"
              disabled={submitting}
            />
            {error && <Toast>{error}</Toast>}
            <Button
              type="submit"
              variant="secondary"
              disabled={submitting || !transactionHash.trim()}
            >
              {submitting ? "Submitting…" : "Submit transaction hash"}
            </Button>
          </form>
        ) : null}
      </PaymentComponent>
    </>
  );
}

type BankStatusField = { key: string; label: string; value: string; copyable?: boolean };
export function snapshotFields(value: unknown): BankStatusField[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const fields = (value as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter(
    (field): field is BankStatusField =>
      Boolean(field) &&
      typeof field === "object" &&
      typeof (field as BankStatusField).key === "string" &&
      typeof (field as BankStatusField).label === "string" &&
      typeof (field as BankStatusField).value === "string",
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

function BankTransferPayment(props: PaymentProviderProps) {
  const [currentTime] = useState(() => Date.now());
  const [transferReference, setTransferReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fields = snapshotFields(props.funding.provider_account_snapshot);
  const instruction = snapshotInstruction(props.funding.provider_account_snapshot);
  const evidenceAllowed = canSubmitBankTransferEvidence(props.funding) && !props.funding.evidence;
  async function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reference = transferReference.trim();
    const note = customerNote.trim();
    if (!reference && !proofFile && !note) {
      setError("Add a transfer reference, proof file, or note before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("transfer_reference", reference);
      body.set("customer_note", note);
      if (proofFile) body.set("proof_file", proofFile);
      await apiFetch(`/api/wallet/fund/${props.funding.id}/evidence`, { method: "POST", body });
      props.onFundingChange(await apiFetch<FundingStatus>(`/api/wallet/fund/${props.funding.id}`));
      setTransferReference("");
      setProofFile(null);
      setCustomerNote("");
      setMessage("Evidence submitted. Your bank transfer is awaiting manual verification.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Evidence could not be submitted. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <PaymentComponent {...props} sessionExpired={false} currentTime={currentTime}>
      <div className="grid gap-1 border-t border-slate-200 pt-3">
        <span className="text-slate-600">Transfer amount</span>
        <CopyValue
          label="transfer amount"
          value={formatMinorAmount(props.funding.collection_amount_minor)}
          displayValue={
            <strong>
              <Money
                minor={props.funding.collection_amount_minor}
                currency={props.funding.collection_currency}
              />
            </strong>
          }
        />
      </div>
      {fields.length > 0 ? (
        <div className="grid gap-4 border-t border-slate-200 pt-3">
          <strong>Receiving bank details</strong>
          {fields.map((field) => (
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
      ) : (
        <p className="border-t border-amber-200 pt-3 text-sm text-amber-900" role="status">
          Bank details are unavailable for this saved funding attempt. Do not transfer until
          receiving details are shown.
        </p>
      )}
      {instruction && (
        <div className="grid gap-1 border-t border-slate-200 pt-3">
          <span className="text-slate-600">Transfer instruction</span>
          <strong className="whitespace-pre-line">{instruction}</strong>
        </div>
      )}
      {props.funding.evidence && (
        <div className="grid gap-1 border-t border-slate-200 pt-4 text-sm" role="status">
          <strong>Evidence submitted</strong>
          <span className="text-slate-600">
            Your bank transfer is awaiting manual verification.
          </span>
          {props.funding.evidence.proof && (
            <span className="text-slate-600">
              Proof file: {props.funding.evidence.proof.original_filename ?? "Uploaded file"}
            </span>
          )}
        </div>
      )}
      {evidenceAllowed && (
        <form className="grid gap-3 border-t border-slate-200 pt-4" onSubmit={submitEvidence}>
          <div>
            <h3>Submit transfer evidence</h3>
            <p className="text-sm text-slate-600">
              Add at least one item. Evidence helps the operator reconcile your transfer; it does
              not confirm or credit your wallet automatically.
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
            <p className="text-xs text-slate-500">PNG, JPEG, WEBP, GIF, or PDF up to 10 MB.</p>
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
          {error && <Toast>{error}</Toast>}
        </form>
      )}
      {message && (
        <p className="text-sm font-medium text-emerald-800" role="status">
          {message}
        </p>
      )}
    </PaymentComponent>
  );
}

function DevelopmentPayment(props: PaymentProviderProps) {
  const [currentTime] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  async function verify() {
    setSubmitting(true);
    try {
      const result = await apiFetch<{ state: FundingStatus["state"] }>(
        "/api/funding/development/verify",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ funding_id: props.funding.id }),
        },
      );
      props.onFundingChange({ ...props.funding, state: result.state });
    } catch (cause) {
      props.onError(cause instanceof Error ? cause.message : "Development verification failed.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <PaymentComponent {...props} sessionExpired={false} currentTime={currentTime}>
      {(props.funding.state === "awaiting_payment" ||
        props.funding.state === "verification_pending") && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => void verify()}
          disabled={submitting}
        >
          {submitting ? "Verifying…" : "Verify development funding"}
        </Button>
      )}
    </PaymentComponent>
  );
}

function GenericPayment(props: PaymentProviderProps) {
  const [currentTime] = useState(() => Date.now());
  return (
    <PaymentComponent {...props} sessionExpired={false} currentTime={currentTime}>
      {null}
    </PaymentComponent>
  );
}

const paymentComponents: Record<string, ComponentType<PaymentProviderProps>> = {
  paystack: PaystackPayment,
  nowpayments: NowPaymentsPayment,
  usdt_trc20: DirectTrc20Payment,
  bank_transfer: BankTransferPayment,
  development: DevelopmentPayment,
};

export function resolvePaymentComponent(provider: string) {
  return paymentComponents[provider] ?? GenericPayment;
}

export function PaymentProviderComponent(props: PaymentProviderProps) {
  const Component = resolvePaymentComponent(props.funding.provider);
  return createElement(Component, props);
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
