"use client";

import { useCallback, useState, type FormEvent } from "react";
import { apiFetch, type FundingStatus } from "@/lib/api-client";
import {
  PaymentComponent,
  ProviderStatusPolling,
  type PaymentProviderProps,
} from "../shared/status";
import {
  shouldPollDirectTrc20Funding,
  shouldShowSubmittedTransactionHash,
  shouldShowTransactionHashInput,
} from "@/providers/payment/direct-trc20/ui-policy";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Toast } from "../../toast";
import { CopyValue } from "../../copy-value";

export function DirectTrc20Payment(props: PaymentProviderProps) {
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

    // A rejected hash is only a candidate-verification observation. Once the
    // customer submits another candidate, the previous unresolved observation
    // is no longer the current interaction result and should not be rendered
    // alongside a new request error.
    if (
      props.funding.verification?.resolved === false &&
      !props.funding.provider_transaction_id
    ) {
      props.onFundingChange({ ...props.funding, verification: null });
    }

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
      <PaymentComponent
        {...props}
        sessionExpired={false}
        currentTime={currentTime}
        showInitializationStatus={false}
      >
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
