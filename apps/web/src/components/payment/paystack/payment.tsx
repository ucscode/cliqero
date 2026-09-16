"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  initializeFundingStatus,
  PaymentComponent,
  ProviderStatusPolling,
  fundingActionLabel,
  type PaymentProviderProps,
} from "../shared/status";
import {
  shouldPollPaystackFunding,
  paystackFundingPollInterval,
} from "@/providers/payment/paystack/ui-policy";
import { Button } from "../../ui/button";

export function PaystackPayment(props: PaymentProviderProps) {
  const [currentTime] = useState(() => Date.now());
  const [pollingUnavailable, setPollingUnavailable] = useState(false);
  const attemptedFundingId = useRef<string | null>(null);
  const funding = props.funding;
  const { onError, onFundingChange, onConfirmed } = props;
  const providerUrl = props.funding.authorization_url;
  const safeUrl = providerUrl && /^https?:\/\//.test(providerUrl) ? providerUrl : null;
  const applyFunding = useCallback(
    (funding: Parameters<PaymentProviderProps["onFundingChange"]>[0]) => {
      setPollingUnavailable(false);
      onFundingChange(funding);
    },
    [onFundingChange],
  );
  const handlePollingError = useCallback(() => {
    setPollingUnavailable(true);
    onError("Automatic status updates are temporarily unavailable. Retrying…");
  }, [onError]);
  const initialize = useCallback(async () => {
    let recovered = false;
    try {
      applyFunding(
        await initializeFundingStatus(funding.id, (latest) => {
          recovered = true;
          applyFunding(latest);
        }),
      );
      onError("");
    } catch (cause) {
      if (recovered) {
        onError("");
        return;
      }
      onError(cause instanceof Error ? cause.message : "Paystack payment could not be prepared.");
    }
  }, [applyFunding, funding.id, onError]);
  useEffect(() => {
    if (funding.state !== "initialization_pending") return;
    if (attemptedFundingId.current === funding.id) return;
    attemptedFundingId.current = funding.id;
    void initialize();
  }, [funding.id, funding.state, initialize]);
  return (
    <>
      <ProviderStatusPolling
        funding={funding}
        shouldContinue={shouldPollPaystackFunding}
        onFundingChange={applyFunding}
        onConfirmed={onConfirmed}
        onError={handlePollingError}
        getPollInterval={paystackFundingPollInterval}
      />
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
        {pollingUnavailable && shouldPollPaystackFunding(funding) && (
          <Button
            type="button"
            variant="secondary"
            onClick={props.onRefresh}
            disabled={props.refreshing}
          >
            {props.refreshing ? "Checking…" : "Check status"}
          </Button>
        )}
      </PaymentComponent>
    </>
  );
}
