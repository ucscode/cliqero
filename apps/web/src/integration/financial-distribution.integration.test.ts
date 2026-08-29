import {afterAll,beforeEach,describe,expect,it} from "vitest";
import {createContainer} from "@/infrastructure/container";
import {newId} from "@/kernel/ids";
import {AuditedFactHandler,PurchaseCompletedDistributionHandler} from "@/workers/outbox/handlers";
import {PurchaseDistributionProcessor} from "@/processors/purchase-distribution";
import {OutboxDispatcher,OutboxHandlerRegistry} from "@/workers/outbox/dispatcher";

const databaseUrl=process.env.TEST_DATABASE_URL;const suite=databaseUrl?describe:describe.skip;
suite("purchase financial distribution",()=>{
  const app=createContainer(databaseUrl!);
  beforeEach(async()=>{await app.database.query(`truncate table ledger_capability.entry_settlements,ledger_capability.entries,ledger_capability.reversals,ledger_capability.purchase_distributions,
    payment_capability.reconciliation_attempts,payment_capability.provider_events,referral_capability.listing_attributions,
    referral_capability.listing_referral_links,referral_capability.account_referrals,access_capability.access_grants,
    entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,
    identity_capability.account_capabilities,identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records restart identity cascade`);
    await app.database.query(`update ledger_capability.distribution_policy set platform_rate_basis_points=1000,remainder_recipient='seller'`);
    await app.database.query(`update referral_capability.commission_policy set rates_basis_points='{500,250}'`);});
  afterAll(()=>app.database.close());
  async function account(label:string){return app.authentication.register({email:`${label}@example.com`,handle:label,password:"correct-horse-battery"});}
  async function completed(attributionSource?:string){const seller=await account(`seller${newId().slice(0,5)}`),buyer=await account(`buyer${newId().slice(0,5)}`);
    const listing=await app.listingService.create(seller,{title:"Auditable",description:"",priceMinor:"101",currency:"USD",destination:"https://example.test/access"});
    const checkout=await app.legacyProviderCheckout.initiate({buyerId:buyer.id,buyerEmail:buyer.email,listingId:listing.id,providerName:"development",idempotencyKey:newId(),attributionSource});
    await app.legacyPaymentCompletion.complete({paymentId:checkout.paymentId,correlationId:newId()});return {seller,buyer,listing,purchaseId:checkout.purchaseId!};}

  it("conserves organic gross and distributes exactly once under duplicate/concurrent delivery",async()=>{const value=await completed();const correlationId=newId();
    const results=await Promise.all([app.purchaseDistribution.process({purchaseId:value.purchaseId,correlationId}),app.purchaseDistribution.process({purchaseId:value.purchaseId,correlationId})]);
    expect(results[0].id).toBe(results[1].id);const entries=await app.ledger.findEntriesByPurchaseId(value.purchaseId);
    expect(entries.map(e=>[e.recipientRole,e.amount.minorAmount]).sort()).toEqual([["seller",91n],["platform",10n]].sort());
    expect(entries.reduce((sum,e)=>sum+e.amount.minorAmount,0n)).toBe(101n);
    expect((await app.database.query(`select 1 from kernel.outbox_events where event_name='purchase.distribution.completed'`)).rowCount).toBe(1);
  });

  it("uses trusted attribution and bounded exact referral commission facts",async()=>{const parent=await account(`parent${newId().slice(0,5)}`),promoter=await account(`promo${newId().slice(0,5)}`);
    await app.referralGraphService.establish(promoter.id,parent.id);const seller=await account(`sell${newId().slice(0,5)}`),buyer=await account(`buy${newId().slice(0,5)}`);
    const listing=await app.listingService.create(seller,{title:"Referral",description:"",priceMinor:"10000",currency:"USD",destination:"https://example.test"});
    const link=await app.referralAttribution.createLink(promoter.id,listing.id);const visit=await app.referralAttribution.visit(link.code);expect(visit).not.toBeNull();
    const checkout=await app.legacyProviderCheckout.initiate({buyerId:buyer.id,buyerEmail:buyer.email,listingId:listing.id,providerName:"development",idempotencyKey:newId(),attributionSource:visit!.source});
    await app.legacyPaymentCompletion.complete({paymentId:checkout.paymentId,correlationId:newId()});const purchase=(await app.purchases.findById(checkout.purchaseId!))!;
    const before=(await app.database.query(`select count(*)::int count from ledger_capability.entries`)).rows[0].count;
    const facts=await app.commissionDistribution.calculate(purchase,await app.commissionPolicy.getActive());
    expect(facts.map(f=>[f.recipientAccountId,f.level,f.calculatedAmount.minorAmount])).toEqual([[promoter.id,1,500n],[parent.id,2,250n]]);
    expect((await app.database.query(`select count(*)::int count from ledger_capability.entries`)).rows[0].count).toBe(before);
    const dispatcher=new OutboxDispatcher("distribution-test-worker",app.outbox,new OutboxHandlerRegistry().register(new AuditedFactHandler())
      .register(new PurchaseCompletedDistributionHandler(app.purchaseDistribution)),{info:()=>undefined,error:()=>undefined},{pollMilliseconds:1,staleAfterMilliseconds:1000});
    await dispatcher.runOnce();const entries=await app.ledger.findEntriesByPurchaseId(purchase.id);
    expect(entries.map(e=>[e.recipientRole,e.amount.minorAmount]).sort()).toEqual([["seller",8250n],["referral",500n],["referral",250n],["platform",1000n]].sort());
    expect((await app.database.query<{state:string}>(`select state from kernel.outbox_events where event_name='purchase.completed'`)).rows[0].state).toBe("published");
  });

  it("rolls back every financial consequence and enforces append-only history",async()=>{const value=await completed();
    const forcedFailure=new PurchaseDistributionProcessor(app.purchases,app.commissionDistribution,app.commissionPolicy,app.financialDistributionPolicy,app.ledger,
      {append:async()=>{throw new Error("forced outbox failure");}},app.database);
    await expect(forcedFailure.process({purchaseId:value.purchaseId,correlationId:newId()})).rejects.toThrow("forced outbox failure");
    expect((await app.database.query(`select 1 from ledger_capability.purchase_distributions where purchase_id=$1`,[value.purchaseId])).rowCount).toBe(0);
    await app.database.query(`update referral_capability.commission_policy set rates_basis_points='{}'`);await app.purchaseDistribution.process({purchaseId:value.purchaseId,correlationId:newId()});
    await expect(app.database.query(`update ledger_capability.entries set amount_minor=1 where purchase_id=$1`,[value.purchaseId])).rejects.toThrow(/append-only/);
    const summary=await app.ledger.summarizeAccount(value.seller.id);expect(summary[0].amountMinor).toBe(91n);
    const first=(await app.ledger.findEntriesByPurchaseId(value.purchaseId))[0];await expect(app.database.query(
      `insert into ledger_capability.entries(id,account_id,purchase_id,entry_type,direction,amount_minor,currency,idempotency_key,correlation_id)
       values($1,$2,$3,'purchase-earnings','credit',1,'USD',$4,$5)`,[newId(),value.seller.id,value.purchaseId,first.idempotencyKey,newId()])).rejects.toThrow(/duplicate key/);
  });

  it("matures pending earnings through an idempotent settlement transition",async()=>{await app.database.query(`update ledger_capability.distribution_policy set initial_balance_state='pending',settlement_delay_seconds=3600`);
    const value=await completed();await app.purchaseDistribution.process({purchaseId:value.purchaseId,correlationId:newId()});
    expect((await app.ledger.summarizeAccount(value.seller.id))[0]).toMatchObject({balanceState:"pending",amountMinor:91n});
    expect(await app.settlement.settle({now:new Date()})).toMatchObject({settled:0});
    expect(await app.settlement.settle({now:new Date(Date.now()+3_601_000),batchSize:10})).toMatchObject({settled:2});
    expect(await app.settlement.settle({now:new Date(Date.now()+3_601_000),batchSize:10})).toMatchObject({settled:0});
    expect((await app.ledger.summarizeAccount(value.seller.id))[0]).toMatchObject({balanceState:"available",amountMinor:91n});
  });

  it("creates historical compensating entries and revokes entitlement through outbox",async()=>{const value=await completed();await app.purchaseDistribution.process({purchaseId:value.purchaseId,correlationId:newId()});
    const originals=await app.ledger.findEntriesByPurchaseId(value.purchaseId);const reversal=await app.purchaseReversal.process({purchaseId:value.purchaseId,reason:"operator-approved refund",source:"operator",idempotencyKey:"reverse-1",correlationId:newId()});
    await expect(app.purchaseReversal.process({purchaseId:value.purchaseId,reason:"ignored duplicate",source:"operator",idempotencyKey:"reverse-2",correlationId:newId()})).resolves.toMatchObject({id:reversal.id});
    const after=await app.ledger.findEntriesByPurchaseId(value.purchaseId);expect(after.filter(e=>e.reversalId===undefined).map(e=>e.amount.minorAmount)).toEqual(originals.map(e=>e.amount.minorAmount));
    expect(after.filter(e=>e.reversalId).reduce((sum,e)=>sum+e.amount.minorAmount,0n)).toBe(101n);
    const dispatcher=new OutboxDispatcher("reversal-test",app.outbox,new OutboxHandlerRegistry().register(new AuditedFactHandler())
      .register(new (await import("@/workers/outbox/handlers")).PurchaseReversalEntitlementHandler(app.entitlements)),{info:()=>undefined,error:()=>undefined},{pollMilliseconds:1,staleAfterMilliseconds:1000});
    await dispatcher.runOnce();expect((await app.entitlements.findByPurchaseId(value.purchaseId))?.isActive).toBe(false);
    expect((await app.ledger.summarizeAccount(value.seller.id)).find(s=>s.balanceState==="reversed")?.amountMinor).toBe(0n);
  });
});
