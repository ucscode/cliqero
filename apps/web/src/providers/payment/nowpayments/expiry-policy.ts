import type { FundingTransaction } from "@/modules/funding/funding";

/** Interprets the provider-owned expiry timestamp without taking application action. */
export class NowPaymentsExpiryPolicy {
  isExpired(funding: FundingTransaction | null, now: Date): boolean {
    if (
      !funding ||
      funding.providerName !== "nowpayments" ||
      funding.state !== "awaiting_payment" ||
      !funding.providerInitialization?.expiresAt
    )
      return false;
    const expiresAt = Date.parse(funding.providerInitialization.expiresAt);
    return !Number.isNaN(expiresAt) && expiresAt <= now.getTime();
  }
}
