import type { FundingStatus } from "@/lib/api-client";

export function shouldShowTransactionHashInput(
  funding: Pick<FundingStatus, "provider" | "state" | "provider_transaction_id">,
) {
  return (
    funding.provider === "usdt_trc20" &&
    !funding.provider_transaction_id &&
    (funding.state === "awaiting_payment" || funding.state === "verification_pending")
  );
}

export function shouldShowSubmittedTransactionHash(
  funding: Pick<FundingStatus, "provider" | "provider_transaction_id">,
) {
  return funding.provider === "usdt_trc20" && Boolean(funding.provider_transaction_id);
}

export function shouldPollDirectTrc20Funding(funding: Pick<FundingStatus, "state">) {
  return funding.state === "verification_pending";
}
