import type { FundingTransaction } from "@/modules/funding/funding";
import type { ProviderOperationError } from "@/kernel/provider-error";

export interface FundingOperations {
  recordFundingSuccess(input: {
    fundingId: string;
    provider: string;
    operation: string;
    providerMessage?: string;
  }): Promise<void>;
  recordFundingFailure(input: {
    fundingId: string;
    provider: string;
    operation: string;
    error:
      | {
          httpStatus?: number;
          providerStatus?: boolean;
          providerMessage: string;
          providerCode?: string;
          kind: string;
        }
      | ProviderOperationError;
  }): Promise<void>;
}

export interface FundingExpiryPolicy {
  isExpired(funding: FundingTransaction | null, now: Date): boolean;
}
