import type { FundingStatus } from "@/lib/api-client";
import {
  FUNDING_STATUS_POLL_AWAITING_PAYMENT_INTERVAL_MS,
  FUNDING_STATUS_POLL_INITIALIZING_INTERVAL_MS,
  FUNDING_STATUS_POLL_VERIFICATION_INTERVAL_MS,
} from "@/components/payment/shared/status";

export function shouldShowPaystackRefresh(funding: Pick<FundingStatus, "state">) {
  return funding.state === "awaiting_payment" || funding.state === "verification_pending";
}

export function shouldPollPaystackFunding(funding: Pick<FundingStatus, "state">) {
  return (
    funding.state === "initializing" ||
    funding.state === "awaiting_payment" ||
    funding.state === "verification_pending"
  );
}

export function paystackFundingPollInterval(funding: Pick<FundingStatus, "state">) {
  if (funding.state === "initializing") return FUNDING_STATUS_POLL_INITIALIZING_INTERVAL_MS;
  return funding.state === "awaiting_payment"
    ? FUNDING_STATUS_POLL_AWAITING_PAYMENT_INTERVAL_MS
    : FUNDING_STATUS_POLL_VERIFICATION_INTERVAL_MS;
}
