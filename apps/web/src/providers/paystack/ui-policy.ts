import type { FundingStatus } from "@/lib/api-client";

export function shouldShowPaystackRefresh(funding: Pick<FundingStatus, "state">) {
  return funding.state === "awaiting_payment" || funding.state === "verification_pending";
}
