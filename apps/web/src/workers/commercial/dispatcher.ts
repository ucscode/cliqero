import {newId} from "@/kernel/ids";
import type {ApplicationContainer} from "@/infrastructure/container";
export class CommercialWorkflowDispatcher {
  constructor(private app:ApplicationContainer){}
  async runOnce(){let processed=0;
    for(const f of await this.app.funding.findWork("initialization_pending")){try{await this.app.fundingInitialization.process(f.id);}catch{}processed++;}
    for(const f of await this.app.funding.findWork("verification_pending")){try{await this.app.fundingVerification.process(f.id);}catch{}processed++;}
    await this.app.walletCredit.runBatch();await this.app.walletAvailability.runBatch();await this.app.checkoutPayment.runBatch();
    for(const p of await this.app.purchases.findCompletedWithoutEntitlement?.()??[]){try{await this.app.entitlementIssuance.process(p.id);}catch{}processed++;}
    for(const p of await this.app.purchases.findCompletedWithoutDistribution?.()??[]){try{await this.app.purchaseDistribution.process({purchaseId:p.id,correlationId:newId()});}catch{}processed++;}
    return processed;
  }
}
