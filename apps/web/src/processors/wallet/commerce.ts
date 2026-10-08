import { newId } from "@/kernel/ids";
import { Money } from "@/modules/money/money";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { FundingRepository } from "@/modules/funding/funding";
import type { WalletRepository } from "@/modules/wallet/wallet";
import type { PurchaseRepository } from "@/modules/purchase/purchase";
import { Entitlement, type EntitlementRepository } from "@/modules/entitlement/entitlement";
import type { LifecycleDiagnosticWriter } from "@/kernel/diagnostics";
import type { AccountDebtService } from "@/application/finance/account-debt";

export class WalletCreditProcessor {
  constructor(
    private funding: FundingRepository,
    private wallet: WalletRepository,
    private uow: UnitOfWork,
    private diagnostics?: LifecycleDiagnosticWriter,
  ) {}
  async process(id: string) {
    return this.uow.transaction(async () => {
      const owner = await this.funding.findById(id);
      if (!owner) return null;
      await this.wallet.lockAccount(owner.accountId);
      const f = await this.funding.findById(id, { forUpdate: true });
      if (!f || f.state !== "confirmed") return null;
      const existing = await this.wallet.findCreditByFunding(f.id);
      if (existing) return existing;
      const unreversed =
        f.canonicalAmount.minorAmount - (await this.wallet.reversedAmountForFunding(f.id));
      if (unreversed <= 0n) return null;
      const credit = {
        id: newId(),
        accountId: f.accountId,
        fundingId: f.id,
        amount: Money.of(unreversed, "USD"),
        state: "pending" as const,
      };
      await this.wallet.createCredit(credit);
      this.diagnostics?.write({
        level: "info",
        event: "wallet.credit.created",
        metadata: {
          funding_id: f.id,
          credit_id: credit.id,
          amount_minor: credit.amount.minorAmount.toString(),
        },
      });
      return credit;
    });
  }
  async runBatch() {
    for (const funding of await this.wallet.findFundingCreditWork()) await this.process(funding.id);
  }
}
export class WalletAvailabilityProcessor {
  constructor(
    private wallet: WalletRepository,
    private uow: UnitOfWork,
    private diagnostics?: LifecycleDiagnosticWriter,
    private debt?: AccountDebtService,
  ) {}
  async process(id: string) {
    return this.uow.transaction(async () => {
      const initial = await this.wallet.findPendingCredit(id);
      if (!initial) return false;
      await this.wallet.lockAccount(initial.accountId);
      const credit = await this.wallet.findPendingCreditForUpdate(id);
      if (!credit) return false;
      await this.debt?.settleInflow({
        accountId: credit.accountId,
        incomingMinor: credit.amount.minorAmount,
        wallet: "funding",
        sourceKind: "wallet_funding_credit",
        sourceId: credit.id,
        reason: "Funding inflow settled outstanding account debt before availability",
        actor: { kind: "system", id: "wallet-availability-processor" },
        correlationId: credit.fundingId,
        idempotencyKey: `debt-settlement:wallet-funding-credit:${credit.id}`,
      });
      await this.wallet.makeCreditAvailable(id);
      this.diagnostics?.write({
        level: "info",
        event: "wallet.credit.available",
        metadata: { credit_id: id },
      });
      return true;
    });
  }
  async runBatch() {
    for (const c of await this.wallet.findPendingCredits()) await this.process(c.id);
  }
}
export class EntitlementIssuanceProcessor {
  constructor(
    private purchases: PurchaseRepository,
    private entitlements: EntitlementRepository,
    private uow: UnitOfWork,
  ) {}
  async process(purchaseId: string, expiresAt: Date | null = null) {
    return this.uow.transaction(async () => {
      const p = await this.purchases.findById(purchaseId, { forUpdate: true });
      if (!p || !(p.state === "paid" || p.state === "completed")) return null;
      const existing = await this.entitlements.findByPurchaseId(p.id);
      if (existing) return existing;
      const e = new Entitlement(newId(), p.buyerId, p.terms.listingId, p.id, expiresAt);
      await this.entitlements.save(e);
      return e;
    });
  }
}
