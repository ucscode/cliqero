"use client";

import { useEffect, useState } from "react";
import { apiFetch, type FundingStatus } from "@/lib/api-client";
import {
  initializeFundingStatus,
  PaymentComponent,
  type PaymentProviderProps,
} from "../shared/status";
import { Button } from "../../ui/button";

export function applyDevelopmentVerificationResult(
  funding: FundingStatus,
  result: Pick<FundingStatus, "state">,
  onFundingChange: (funding: FundingStatus) => void,
  onConfirmed: () => void,
) {
  onFundingChange({ ...funding, state: result.state });
  if (result.state === "confirmed") onConfirmed();
}

export function DevelopmentPayment(props: PaymentProviderProps) {
  const [currentTime] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [initializing, setInitializing] = useState(false);
  async function initialize() {
    setInitializing(true);
    try {
      props.onFundingChange(await initializeFundingStatus(props.funding.id, props.onFundingChange));
      props.onError("");
    } catch (cause) {
      props.onError(
        cause instanceof Error ? cause.message : "Development funding could not be prepared.",
      );
    } finally {
      setInitializing(false);
    }
  }
  useEffect(() => {
    if (props.funding.state !== "initialization_pending") return;
    const timer = window.setTimeout(() => void initialize(), 0);
    return () => window.clearTimeout(timer);
    // Initialization is tied to this funding identity and state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.funding.id, props.funding.state]);
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
      applyDevelopmentVerificationResult(
        props.funding,
        result,
        props.onFundingChange,
        props.onConfirmed,
      );
    } catch (cause) {
      props.onError(cause instanceof Error ? cause.message : "Development verification failed.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <PaymentComponent {...props} sessionExpired={false} currentTime={currentTime}>
      {props.funding.state === "initialization_pending" && (
        <Button type="button" onClick={() => void initialize()} disabled={initializing}>
          {initializing ? "Preparing…" : "Prepare development funding"}
        </Button>
      )}
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
