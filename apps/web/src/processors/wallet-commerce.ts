import { newId } from "@/kernel/ids";
import type { UnitOfWork } from "@/kernel/unit-of-work";
import type { FundingRepository } from "@/modules/funding/funding";
import type { WalletRepository } from "@/modules/wallet/wallet";
import type { CheckoutRepository } from "@/modules/checkout/checkout";
import type { PurchaseRepository } from "@/modules/purchase/purchase";
import { Entitlement, type EntitlementRepository } from "@/modules/entitlement/entitlement";

export class WalletCreditProcessor {
  constructor(
    private funding: FundingRepository,
    private wallet: WalletRepository,
    private uow: UnitOfWork,
  ) {}
  async process(id: string) {
    return this.uow.transaction(async () => {
      const f = await this.funding.findById(id, { forUpdate: true });
      if (!f || f.state !== "confirmed") return null;
      const existing = await this.wallet.findCreditByFunding(f.id);
      if (existing) return existing;
      const credit = {
        id: newId(),
        accountId: f.accountId,
        fundingId: f.id,
        amount: f.canonicalAmount,
        state: "pending" as const,
      };
      await this.wallet.createCredit(credit);
      return credit;
    });
  }
  async runBatch() {
    for (const f of await this.funding.findWork("confirmed")) await this.process(f.id);
  }
}
export class WalletAvailabilityProcessor {
  constructor(
    private wallet: WalletRepository,
    private uow: UnitOfWork,
  ) {}
  async process(id: string) {
    return this.uow.transaction(async () => {
      await this.wallet.makeCreditAvailable(id);
      return true;
    });
  }
  async runBatch() {
    for (const c of await this.wallet.findPendingCredits()) await this.process(c.id);
  }
}
export class CheckoutPaymentProcessor {
  constructor(
    private checkouts: CheckoutRepository,
    private wallet: WalletRepository,
    private purchases: PurchaseRepository,
    private uow: UnitOfWork,
  ) {}
  async process(id: string) {
    return this.uow.transaction(async () => {
      const c = await this.checkouts.findById(id, { forUpdate: true });
      if (!c || c.state !== "awaiting_funds") return c;
      await this.wallet.lockAccount(c.buyerId);
      if (await this.wallet.findDebitByCheckout(c.id)) {
        c.state = "paid";
        c.paidAt ??= new Date();
        await this.checkouts.save(c);
        return c;
      }
      const balance = await this.wallet.summary(c.buyerId);
      if (balance.available.minorAmount < c.amount.minorAmount) return c;
      await this.wallet.createDebit({
        id: newId(),
        accountId: c.buyerId,
        checkoutId: c.id,
        amount: c.amount,
      });
      c.state = "paid";
      c.paidAt = new Date();
      await this.checkouts.save(c);
      const p = await this.purchases.findById(c.purchaseId, { forUpdate: true });
      if (!p) throw new Error("Purchase not found");
      if (p.state === "pending") {
        p.markPaid();
        await this.purchases.save(p);
      }
      return c;
    });
  }
  async runBatch() {
    for (const c of await this.checkouts.findAwaitingFunds()) await this.process(c.id);
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
