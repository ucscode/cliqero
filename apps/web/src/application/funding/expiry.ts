import type { FundingRepository, FundingTransaction } from "@/modules/funding/funding";
import type { FundingVerificationProcessor } from "@/application/funding/verification";
import type { FundingExpiryPolicy } from "./contracts";

/** NOWPayments owns the meaning of its provider-issued expiry timestamp. */
export class NowPaymentsExpiryProcessor {
  constructor(
    private readonly funding: FundingRepository,
    private readonly verification: FundingVerificationProcessor,
    private readonly policy: FundingExpiryPolicy,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  findWork(limit = 50) {
    const now = this.clock();
    return (
      this.funding.findExpired?.("nowpayments", now, limit) ??
      Promise.resolve([] as FundingTransaction[])
    );
  }

  async process(id: string) {
    const now = this.clock();
    const funding = await this.funding.findById(id);
    if (!this.policy.isExpired(funding, now)) return null;
    const checked = await this.verification.process(id, { now, rethrowProviderErrors: false });
    if (!checked || checked.state === "confirmed") return checked;
    return this.verification.expire(id, now);
  }
}
