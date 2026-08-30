import {newId} from "@/kernel/ids";
import type {ApplicationContainer} from "@/infrastructure/container";
export interface CommercialWorkflowLogger {error(fields:Record<string,unknown>,message:string):void;}
const consoleLogger:CommercialWorkflowLogger={error:(fields,message)=>console.error(JSON.stringify({level:"error",message,...fields,timestamp:new Date().toISOString()}))};
export class CommercialWorkflowDispatcher {
  constructor(private app:ApplicationContainer,private logger:CommercialWorkflowLogger=consoleLogger){}
  async runOnce(){let processed=0;
    processed+=await this.family("funding-initialization",()=>this.app.fundingInitialization.findWork(),item=>this.app.fundingInitialization.process(item.id));
    processed+=await this.family("funding-verification",()=>this.app.funding.findWork("verification_pending"),item=>this.app.fundingVerification.process(item.id));
    processed+=await this.family("wallet-credit",()=>this.app.funding.findWork("confirmed"),item=>this.app.walletCredit.process(item.id));
    processed+=await this.family("wallet-availability",()=>this.app.walletRepository.findPendingCredits(),item=>this.app.walletAvailability.process(item.id));
    processed+=await this.family("checkout-payment",()=>this.app.checkoutRepository.findAwaitingFunds(),item=>this.app.checkoutPayment.process(item.id));
    processed+=await this.family("entitlement",async()=>await this.app.purchases.findCompletedWithoutEntitlement?.()??[],item=>this.app.entitlementIssuance.process(item.id));
    processed+=await this.family("distribution",async()=>await this.app.purchases.findCompletedWithoutDistribution?.()??[],item=>this.app.purchaseDistribution.process({purchaseId:item.id,correlationId:newId()}));
    processed+=await this.family("treasury",()=>this.app.treasuryProcessor.findWork(),item=>this.app.treasuryProcessor.process(item.id));
    processed+=await this.family("listing-media-deletion",()=>this.app.listingMediaDeletion.findWork(),item=>this.app.listingMediaDeletion.process(item.id));
    return processed;
  }
  private async family<T extends {id:string}>(family:string,discover:()=>Promise<readonly T[]>,process:(item:T)=>Promise<unknown>){let processed=0;let items:readonly T[];try{items=await discover();}catch(error){this.failure(family,undefined,error,"commercial.workflow.discovery.failed");return 0;}for(const item of items){try{await process(item);processed++;}catch(error){this.failure(family,item.id,error,"commercial.workflow.item.failed");}}return processed;}
  private failure(family:string,workId:string|undefined,error:unknown,message:string){this.logger.error({processor_family:family,work_id:workId,error:error instanceof Error?error.message:String(error)},message);}
}
