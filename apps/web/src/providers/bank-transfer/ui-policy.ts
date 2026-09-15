import type { FundingStatus } from "@/lib/api-client";

export function canSubmitBankTransferEvidence(
  funding: Pick<FundingStatus, "provider" | "state"> | null,
) {
  return (
    funding?.provider === "bank_transfer" &&
    (funding.state === "initialization_pending" ||
      funding.state === "initializing" ||
      funding.state === "awaiting_payment" ||
      funding.state === "verification_pending")
  );
}
