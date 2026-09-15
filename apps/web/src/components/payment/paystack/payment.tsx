"use client";

import { useState } from "react";
import { shouldShowPaystackRefresh } from "@/providers/payment/paystack/ui-policy";
import { PaymentComponent, fundingActionLabel, type PaymentProviderProps } from "../shared/status";
import { Button } from "../../ui/button";

export function PaystackPayment(props: PaymentProviderProps) {
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
