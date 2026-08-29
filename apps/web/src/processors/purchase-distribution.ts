import {newId} from "@/kernel/ids";
import type {EventOutbox} from "@/kernel/events";
import type {UnitOfWork} from "@/kernel/unit-of-work";
import {Money} from "@/modules/money/money";
import type {PurchaseRepository} from "@/modules/purchase/purchase";
import type {CommissionDistributionService,CommissionPolicyRepository} from "@/modules/referral/commission";
import type {FinancialDistributionPolicyRepository,LedgerEntryDraft,LedgerRepository,PurchaseDistribution} from "@/modules/ledger/ledger";

export class PurchaseDistributionProcessor {
  constructor(private readonly purchases:PurchaseRepository,private readonly commissions:CommissionDistributionService,
    private readonly commissionPolicy:CommissionPolicyRepository,private readonly financialPolicy:FinancialDistributionPolicyRepository,
    private readonly ledger:LedgerRepository,private readonly outbox:EventOutbox,private readonly uow:UnitOfWork){}
  async process(input:{purchaseId:string;correlationId:string}):Promise<PurchaseDistribution>{return this.uow.transaction(async()=>{
    const purchase=await this.purchases.findById(input.purchaseId,{forUpdate:true});if(!purchase)throw new Error("Purchase not found");
    if(purchase.state!=="completed")throw new Error("Purchase distribution requires a completed purchase");
    const existing=await this.ledger.findDistributionByPurchaseId(purchase.id);if(existing)return existing;
    const gross=Money.of(BigInt(purchase.terms.canonicalPrice.minorAmount),purchase.terms.canonicalPrice.currency);
    const [commissionPolicy,financialPolicy]=await Promise.all([this.commissionPolicy.getActive(),this.financialPolicy.getActive()]);
    const referralFacts=await this.commissions.calculate(purchase,commissionPolicy);
    const referralRate=referralFacts.reduce((sum,fact)=>sum+fact.configuredRateBasisPoints,0);
    const totalPolicyRate=referralRate+financialPolicy.platformRateBasisPoints;if(totalPolicyRate>10000)throw new Error("Distribution policy exceeds gross purchase amount");
    const sellerRate=10000-totalPolicyRate;
    let sellerMinor=gross.minorAmount*BigInt(sellerRate)/10000n;
    let platformMinor=gross.minorAmount*BigInt(financialPolicy.platformRateBasisPoints)/10000n;
    const referralMinor=referralFacts.reduce((sum,fact)=>sum+fact.calculatedAmount.minorAmount,0n);
    const residual=gross.minorAmount-sellerMinor-platformMinor-referralMinor;
    if(financialPolicy.remainderRecipient==="seller")sellerMinor+=residual;else platformMinor+=residual;
    const distributionId=newId();const entries:LedgerEntryDraft[]=[];
    const add=(accountId:string,amountMinor:bigint,role:"seller"|"referral"|"platform",basis:string,suffix:string,level?:number)=>{if(amountMinor===0n)return;entries.push({
      id:newId(),distributionId,accountId,purchaseId:purchase.id,entryType:"purchase-earnings",direction:"credit",amount:Money.of(amountMinor,gross.currency),
      idempotencyKey:`purchase-distribution:${purchase.id}:${suffix}`,correlationId:input.correlationId,recipientRole:role,basis,referralLevel:level,
      balanceState:financialPolicy.initialBalanceState,maturityAt:financialPolicy.initialBalanceState==="pending"?new Date(Date.now()+financialPolicy.settlementDelaySeconds*1000):undefined});};
    add(purchase.terms.sellerId,sellerMinor,"seller","purchase-seller-proceeds","seller");
    for(const fact of referralFacts)add(fact.recipientAccountId,fact.calculatedAmount.minorAmount,"referral",fact.basis,`referral:${fact.level}:${fact.recipientAccountId}`,fact.level);
    add(financialPolicy.platformAccountId,platformMinor,"platform","platform-share","platform");
    if(entries.reduce((sum,entry)=>sum+entry.amount.minorAmount,0n)!==gross.minorAmount)throw new Error("Distribution does not conserve purchase gross");
    const policySnapshot={sellerRateBasisPoints:sellerRate,platformRateBasisPoints:financialPolicy.platformRateBasisPoints,
      referralRatesBasisPoints:referralFacts.map(f=>({level:f.level,rate:f.configuredRateBasisPoints})),remainderRecipient:financialPolicy.remainderRecipient,
      remainderMinor:residual.toString(),providerFeeTreatment:"informational"};
    await this.ledger.createDistribution({id:distributionId,purchaseId:purchase.id,gross,policySnapshot,correlationId:input.correlationId});await this.ledger.append(entries);
    await this.outbox.append([{id:newId(),name:"purchase.distribution.completed",aggregateId:distributionId,correlationId:input.correlationId,occurredAt:new Date(),
      payload:{purchaseId:purchase.id,grossMinor:gross.minorAmount.toString(),currency:gross.currency}}]);
    const result=await this.ledger.findDistributionByPurchaseId(purchase.id);if(!result)throw new Error("Distribution persistence failed");return result;
  });}
}
