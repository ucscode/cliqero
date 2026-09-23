import { newId } from "@/kernel/ids";
import type { EventOutbox } from "@/kernel/events";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import { Money } from "@/modules/money/money";
import type { PurchaseRepository } from "@/modules/purchase/purchase";
import type {
  CommissionDistributionService,
  CommissionPolicyRepository,
} from "@/modules/referral/commission";
import type {
  FinancialDistributionPolicyRepository,
  LedgerEntryDraft,
  LedgerRepository,
  PurchaseDistribution,
} from "@/modules/ledger/ledger";

export class PurchaseDistributionProcessor {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly commissions: CommissionDistributionService,
    private readonly commissionPolicy: CommissionPolicyRepository,
    private readonly financialPolicy: FinancialDistributionPolicyRepository,
    private readonly ledger: LedgerRepository,
    private readonly outbox: EventOutbox,
    private readonly uow: UnitOfWork,
    private readonly yamlCommissionPolicy?: CommissionPolicyRepository,
  ) {}

  async process(input: {
    purchaseId: string;
    correlationId: string;
  }): Promise<PurchaseDistribution> {
    return this.uow.transaction(async () => {
      const purchase = await this.purchases.findById(input.purchaseId, { forUpdate: true });
      if (!purchase) throw new Error("Purchase not found");
      if (!(purchase.state === "paid" || purchase.state === "completed"))
        throw new Error("Purchase distribution requires a paid purchase");
      const existing = await this.ledger.findDistributionByPurchaseId(purchase.id);
      if (existing) return existing;

      const gross = Money.of(
        BigInt(purchase.terms.canonicalPrice.minorAmount),
        purchase.terms.canonicalPrice.currency,
      );
      const [dbCommissionPolicy, financialPolicy] = await Promise.all([
        this.commissionPolicy.getActive(),
        this.financialPolicy.getActive(),
      ]);
      const usesYamlPolicy = Boolean(purchase.checkoutId && this.yamlCommissionPolicy);
      const commissionPolicy = usesYamlPolicy
        ? await this.yamlCommissionPolicy!.getActive()
        : dbCommissionPolicy;
      const platformRateBasisPoints = usesYamlPolicy
        ? commissionPolicy.platformRateBasisPoints
        : financialPolicy.platformRateBasisPoints;
      const commissionFacts = await this.commissions.calculate(purchase, commissionPolicy);
      const configuredLevelMinor = commissionFacts.reduce(
        (sum, fact) => sum + fact.calculatedAmount.minorAmount,
        0n,
      );
      const platformBaseMinor = (gross.minorAmount * BigInt(platformRateBasisPoints)) / 10000n;
      const sellerMinor = gross.minorAmount - platformBaseMinor - configuredLevelMinor;
      if (sellerMinor < 0n) throw new Error("Distribution policy exceeds gross purchase amount");
      const missingLevelMinor = commissionFacts
        .filter((fact) => fact.recipientAccountId === null)
        .reduce((sum, fact) => sum + fact.calculatedAmount.minorAmount, 0n);
      const actualReferralMinor = configuredLevelMinor - missingLevelMinor;
      const platformMinor = platformBaseMinor + missingLevelMinor;
      const distributionId = newId();
      const entries: LedgerEntryDraft[] = [];
      const balanceState = usesYamlPolicy ? "available" : financialPolicy.initialBalanceState;

      const add = (
        accountId: string | null,
        amountMinor: bigint,
        role: "seller" | "referral" | "platform",
        basis: string,
        suffix: string,
        level?: number,
      ) => {
        if (amountMinor === 0n) return;
        entries.push({
          id: newId(),
          distributionId,
          accountId,
          purchaseId: purchase.id,
          entryType: "purchase-earnings",
          direction: "credit",
          amount: Money.of(amountMinor, gross.currency),
          idempotencyKey: `purchase-distribution:${purchase.id}:${suffix}`,
          correlationId: input.correlationId,
          recipientRole: role,
          basis,
          referralLevel: level,
          balanceState,
          maturityAt:
            balanceState === "pending"
              ? new Date(Date.now() + financialPolicy.settlementDelaySeconds * 1000)
              : undefined,
        });
      };

      add(purchase.terms.sellerId, sellerMinor, "seller", "purchase-seller-proceeds", "seller");
      for (const fact of commissionFacts) {
        if (fact.recipientAccountId === null) continue;
        add(
          fact.recipientAccountId,
          fact.calculatedAmount.minorAmount,
          "referral",
          fact.basis,
          `referral:${fact.level}:${fact.recipientAccountId}`,
          fact.level,
        );
      }
      add(
        financialPolicy.platformAccountId,
        platformMinor,
        "platform",
        "platform-share",
        "platform",
      );
      if (entries.reduce((sum, entry) => sum + entry.amount.minorAmount, 0n) !== gross.minorAmount)
        throw new Error("Distribution does not conserve purchase gross");

      const configuredRateBasisPoints = commissionFacts.reduce(
        (sum, fact) => sum + fact.configuredRateBasisPoints,
        0,
      );
      const policySnapshot = {
        version: usesYamlPolicy ? "yaml" : "legacy",
        sellerRateBasisPoints: 10000 - platformRateBasisPoints - configuredRateBasisPoints,
        platformRateBasisPoints,
        platformBaseMinor: platformBaseMinor.toString(),
        configuredLevelMinor: configuredLevelMinor.toString(),
        actualReferralMinor: actualReferralMinor.toString(),
        missingLevelMinor: missingLevelMinor.toString(),
        levels: commissionFacts.map((fact) => ({
          level: fact.level,
          percentage: fact.configuredRatePercentage,
          recipient: fact.recipientAccountId,
          amountMinor: fact.calculatedAmount.minorAmount.toString(),
          allocatedTo: fact.recipientAccountId ? "referral" : "platform",
        })),
        platformAmountMinor: platformMinor.toString(),
        sellerAmountMinor: sellerMinor.toString(),
        providerFeeTreatment: "informational",
      };
      await this.ledger.createDistribution({
        id: distributionId,
        purchaseId: purchase.id,
        gross,
        platformAmountMinor: platformMinor,
        policySnapshot,
        correlationId: input.correlationId,
      });
      await this.ledger.append(entries);
      await this.outbox.append([
        {
          id: newId(),
          name: "purchase.distribution.completed",
          aggregateId: distributionId,
          correlationId: input.correlationId,
          occurredAt: new Date(),
          payload: {
            purchaseId: purchase.id,
            grossMinor: gross.minorAmount.toString(),
            currency: gross.currency,
          },
        },
      ]);
      const result = await this.ledger.findDistributionByPurchaseId(purchase.id);
      if (!result) throw new Error("Distribution persistence failed");
      return result;
    });
  }
}
