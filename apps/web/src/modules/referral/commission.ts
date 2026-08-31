import type { Money } from "@/modules/money/money";
import { Money as PreciseMoney } from "@/modules/money/money";
import type { Purchase } from "@/modules/purchase/purchase";
import type { ReferralGraphRepository } from "./referral";

export interface CommissionDistributionFact {
  recipientAccountId: string;
  level: number;
  basis: "listing-referral";
  configuredRatePercentage: number;
  configuredRateBasisPoints: number;
  calculatedAmount: Money;
}
export class CommissionPolicy {
  readonly ratesBasisPoints: readonly number[];
  constructor(
    readonly rates: readonly number[],
    unit: "basis-points" | "percentage" = "basis-points",
  ) {
    if (
      rates.some(
        (rate) =>
          !Number.isInteger(rate) || rate < 0 || rate > (unit === "percentage" ? 100 : 10000),
      )
    )
      throw new Error("Commission rates are invalid");
    this.ratesBasisPoints = unit === "percentage" ? rates.map((rate) => rate * 100) : rates;
  }
  get maximumRewardedDepth() {
    return this.rates.length;
  }
  get percentages() {
    return this.ratesBasisPoints.map((rate) => rate / 100);
  }
}
export interface CommissionPolicyRepository {
  getActive(): Promise<CommissionPolicy>;
}
export class CommissionDistributionService {
  constructor(private readonly graph: ReferralGraphRepository) {}
  async calculate(
    purchase: Purchase,
    policy: CommissionPolicy,
  ): Promise<readonly CommissionDistributionFact[]> {
    if (!(purchase.state === "paid" || purchase.state === "completed"))
      throw new Error("Commission distribution requires a paid purchase");
    const source = purchase.terms.referralReferrerAccountId;
    if (!source || policy.maximumRewardedDepth === 0) return [];
    const recipients = [{ accountId: source, depth: 1 }];
    if (policy.maximumRewardedDepth > 1) {
      const uplines = await this.graph.getUplines(source, policy.maximumRewardedDepth - 1);
      recipients.push(
        ...uplines.map((item) => ({ accountId: item.accountId, depth: item.depth + 1 })),
      );
    }
    const gross = PreciseMoney.of(
      BigInt(purchase.terms.canonicalPrice.minorAmount),
      purchase.terms.canonicalPrice.currency,
    );
    return recipients
      .map((recipient) => {
        const rate = policy.ratesBasisPoints[recipient.depth - 1] ?? 0;
        return {
          recipientAccountId: recipient.accountId,
          level: recipient.depth,
          basis: "listing-referral" as const,
          configuredRatePercentage: rate / 100,
          configuredRateBasisPoints: rate,
          calculatedAmount: PreciseMoney.of(
            (gross.minorAmount * BigInt(rate)) / 10000n,
            gross.currency,
          ),
        };
      })
      .filter((fact) => fact.configuredRateBasisPoints > 0);
  }
}
