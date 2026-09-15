"use client";

import { useCallback, useEffect, useState } from "react";
import { shouldPollNowPaymentsFunding } from "@/providers/payment/nowpayments/ui-policy";
import {
  PaymentComponent,
  ProviderStatusPolling,
  formatTimeRemaining,
  type PaymentProviderProps,
} from "../shared/status";
import { Button } from "../../ui/button";
import { CopyValue } from "../../copy-value";
import { LoaderCircle } from "lucide-react";

export function NowPaymentsPayment(props: PaymentProviderProps) {
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
