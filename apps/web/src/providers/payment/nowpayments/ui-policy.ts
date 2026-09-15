import type { FundingStatus } from "@/lib/api-client";

export function shouldPollNowPaymentsFunding(funding: Pick<FundingStatus, "state">) {
  return funding.state === "awaiting_payment" || funding.state === "verification_pending";
}
