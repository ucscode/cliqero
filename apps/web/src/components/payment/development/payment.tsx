"use client";

import { useState } from "react";
import { apiFetch, type FundingStatus } from "@/lib/api-client";
import { PaymentComponent, type PaymentProviderProps } from "../shared/status";
import { Button } from "../../ui/button";

export function DevelopmentPayment(props: PaymentProviderProps) {
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
