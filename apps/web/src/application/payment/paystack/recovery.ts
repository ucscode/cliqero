import type { FundingVerificationRecoveryPolicy } from "@/application/funding/contracts";
import type { FundingTransaction } from "@/modules/funding/funding";
import type { ProviderOperationError } from "@/kernel/provider-error";

/** Bounds ambiguous Paystack verification retries without changing other providers. */
export class PaystackVerificationRecoveryPolicy implements FundingVerificationRecoveryPolicy {
  constructor(private readonly maxAmbiguousFailures = 5) {}

  shouldReconcile(input: {
    funding: FundingTransaction;
    failureCount: number;
    error: ProviderOperationError;
  }) {
    return (
      input.funding.providerName === "paystack" &&
      input.error.kind === "ambiguous" &&
      input.failureCount >= this.maxAmbiguousFailures
    );
  }
}
