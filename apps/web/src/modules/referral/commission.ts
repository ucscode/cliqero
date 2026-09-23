import type { Money } from "@/modules/money/money";
import { Money as PreciseMoney } from "@/modules/money/money";
import type { Purchase } from "@/modules/purchase/purchase";
import type { ReferralGraphRepository } from "./referral";

export interface CommissionDistributionFact {
  recipientAccountId: string | null;
  level: number;
  basis: "hierarchy-commission";
  configuredRatePercentage: number;
  configuredRateBasisPoints: number;
  calculatedAmount: Money;
}

export interface CommissionLevelRate {
  level: number;
  rateBasisPoints: number;
}

export class CommissionPolicy {
  readonly levels: readonly CommissionLevelRate[];
  readonly ratesBasisPoints: readonly number[];
  readonly rates: readonly number[];
  readonly platformRateBasisPoints: number;

  constructor(
    rates: readonly number[],
    unit: "basis-points" | "percentage" = "basis-points",
    platformRate = 0,
    explicitLevels?: readonly CommissionLevelRate[],
  ) {
    this.levels = explicitLevels
      ? explicitLevels
      : rates.map((rate, index) => ({
          level: index + 1,
          rateBasisPoints: CommissionPolicy.toBasisPoints(rate, unit, "Commission rates"),
        }));
    this.platformRateBasisPoints = explicitLevels
      ? CommissionPolicy.toBasisPoints(platformRate, "basis-points", "Platform rate")
      : CommissionPolicy.toBasisPoints(platformRate, unit, "Platform percentage");
    if (
      this.levels.some(
        (entry, index) =>
          !Number.isInteger(entry.level) ||
          entry.level < 1 ||
          entry.rateBasisPoints < 0 ||
          entry.rateBasisPoints > 10000 ||
          this.levels.findIndex((candidate) => candidate.level === entry.level) !== index,
      )
    )
      throw new Error("Commission levels must be unique positive integers");
    this.validateTotal();
    this.ratesBasisPoints = this.levels.map((entry) => entry.rateBasisPoints);
    this.rates = this.ratesBasisPoints.map((rate) => rate / 100);
  }

  static fromPercentages(
    levels: readonly { level: number; percentage: number }[],
    platformPercentage: number,
  ) {
    const explicitLevels = levels.map(({ level, percentage }) => ({
      level,
      rateBasisPoints: CommissionPolicy.toBasisPoints(
        percentage,
        "percentage",
        "Commission percentages",
      ),
    }));
    const sortedLevels = [...explicitLevels].sort((a, b) => a.level - b.level);
    const platformRateBasisPoints = CommissionPolicy.toBasisPoints(
      platformPercentage,
      "percentage",
      "Platform percentage",
    );
    return new CommissionPolicy(
      sortedLevels.map((entry) => entry.rateBasisPoints),
      "basis-points",
      platformRateBasisPoints,
      sortedLevels,
    );
  }

  private static toBasisPoints(value: number, unit: "basis-points" | "percentage", label: string) {
    const maximum = unit === "percentage" ? 100 : 10000;
    if (!Number.isInteger(value) || value < 0 || value > maximum)
      throw new Error(`${label} are invalid`);
    return unit === "percentage" ? value * 100 : value;
  }

  private validateTotal() {
    if (
      this.platformRateBasisPoints +
        this.levels.reduce((sum, entry) => sum + entry.rateBasisPoints, 0) >
      10000
    )
      throw new Error("Platform and commission percentages must not exceed 100% total");
  }

  get maximumRewardedDepth() {
    return this.levels.at(-1)?.level ?? 0;
  }

  get percentages() {
    return this.rates;
  }

  rateForLevel(level: number) {
    return this.levels.find((entry) => entry.level === level)?.rateBasisPoints ?? 0;
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
    if (policy.maximumRewardedDepth === 0) return [];
    const uplines = await this.graph.getUplines(purchase.buyerId, policy.maximumRewardedDepth);
    const recipients = new Map(uplines.map((item) => [item.depth, item.accountId]));
    const gross = PreciseMoney.of(
      BigInt(purchase.terms.canonicalPrice.minorAmount),
      purchase.terms.canonicalPrice.currency,
    );
    return policy.levels.map((configured) => {
      const rate = configured.rateBasisPoints;
      return {
        recipientAccountId: recipients.get(configured.level) ?? null,
        level: configured.level,
        basis: "hierarchy-commission" as const,
        configuredRatePercentage: rate / 100,
        configuredRateBasisPoints: rate,
        calculatedAmount: PreciseMoney.of(
          (gross.minorAmount * BigInt(rate)) / 10000n,
          gross.currency,
        ),
      };
    });
  }
}
