import {afterAll,beforeEach,describe,expect,it} from "vitest";
import type {QueryResult,QueryResultRow} from "pg";
import {createContainer} from "@/infrastructure/container";
import {PostgresReferralGraphRepository} from "@/infrastructure/postgres/referrals";
import type {SqlExecutor} from "@/infrastructure/postgres/database";
import {newId} from "@/kernel/ids";

const databaseUrl=process.env.TEST_DATABASE_URL;const suite=databaseUrl?describe:describe.skip;
suite("referral graph and trusted purchase attribution",()=>{
  const app=createContainer(databaseUrl!);
  beforeEach(()=>app.database.query(`truncate table
    ledger_capability.entry_settlements,ledger_capability.entries,ledger_capability.reversals,ledger_capability.purchase_distributions,payment_capability.reconciliation_attempts,
    referral_capability.listing_attributions,referral_capability.listing_referral_links,referral_capability.account_referrals,
    payment_capability.provider_events,access_capability.integration_listings,access_capability.integrations,access_capability.access_grants,
    entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,
    identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records,kernel.audit_records restart identity cascade`));
  afterAll(()=>app.database.close());
  let sequence=0;
  async function account(prefix="account"){sequence++;return app.authentication.register({email:`${prefix}-${sequence}@example.com`,handle:`${prefix}_${sequence}`,password:"correct-horse-battery"});}
  async function tree(){const root=await account("root"),a=await account("a"),b=await account("b"),c=await account("c"),d=await account("d"),e=await account("e");
    await app.referralGraphService.establish(a.id,root.id);await app.referralGraphService.establish(b.id,root.id);
    await app.referralGraphService.establish(c.id,a.id);await app.referralGraphService.establish(d.id,a.id);await app.referralGraphService.establish(e.id,c.id);
    return {root,a,b,c,d,e};}

  it("enforces one immutable parent and rejects self-referral",async()=>{
    const child=await account("child"),parent=await account("parent"),other=await account("other");
    await app.referralGraphService.establish(child.id,parent.id);
    await expect(app.referralGraphService.establish(child.id,other.id)).rejects.toThrow();
    await expect(app.referralGraphService.establish(child.id,parent.id)).rejects.toThrow();
    await expect(app.referralGraphService.establish(child.id,child.id)).rejects.toThrow("Self-referral");
    await expect(app.database.query(`update referral_capability.account_referrals set parent_account_id=$2 where child_account_id=$1`,[child.id,other.id])).rejects.toThrow("immutable");
  });
  it("rejects indirect cycles inside PostgreSQL",async()=>{
    const a=await account("cycle_a"),b=await account("cycle_b"),c=await account("cycle_c");
    await app.referralGraphService.establish(a.id,b.id);await app.referralGraphService.establish(b.id,c.id);
    await expect(app.referralGraphService.establish(c.id,a.id)).rejects.toThrow("cycle");
  });
  it("returns ordered bounded uplines and relationship depth with one recursive query each",async()=>{
    const {root,a,c,e}=await tree();
    expect(await app.referralGraph.getUplines(e.id,10)).toEqual([{accountId:c.id,depth:1},{accountId:a.id,depth:2},{accountId:root.id,depth:3}]);
    expect(await app.referralGraph.getUplines(e.id,2)).toEqual([{accountId:c.id,depth:1},{accountId:a.id,depth:2}]);
    expect(await app.referralGraph.getRelationshipDepth(root.id,e.id,10)).toBe(3);
    expect(await app.referralGraph.getRelationshipDepth(root.id,e.id,2)).toBeNull();
  });
  it("returns direct and exact-depth downlines with cursor pagination",async()=>{
    const {root,a,b,c,d,e}=await tree();
    const direct=await app.referralGraph.getDirectReferrals(root.id,{limit:10});expect(new Set(direct.accounts)).toEqual(new Set([a.id,b.id]));
    expect(new Set((await app.referralGraph.getDownlineAtDepth(root.id,1,{limit:10})).accounts)).toEqual(new Set([a.id,b.id]));
    expect(new Set((await app.referralGraph.getDownlineAtDepth(root.id,2,{limit:10})).accounts)).toEqual(new Set([c.id,d.id]));
    expect((await app.referralGraph.getDownlineAtDepth(root.id,3,{limit:10})).accounts).toEqual([e.id]);
    const first=await app.referralGraph.getDownlineAtDepth(root.id,2,{limit:1});expect(first.accounts).toHaveLength(1);expect(first.nextCursor).not.toBeNull();
    const second=await app.referralGraph.getDownlineAtDepth(root.id,2,{limit:1,after:first.nextCursor!});expect(second.accounts).toHaveLength(1);
    expect(new Set([...first.accounts,...second.accounts])).toEqual(new Set([c.id,d.id]));
  });
  it("uses one bounded query for a high-cardinality exact-depth traversal",async()=>{
    const root=newId();
    await app.database.query(`insert into referral_capability.account_referrals(child_account_id,parent_account_id)
      select gen_random_uuid(),$1 from generate_series(1,600)`,[root]);
    await app.database.query(`insert into referral_capability.account_referrals(child_account_id,parent_account_id)
      select gen_random_uuid(),child_account_id from referral_capability.account_referrals where parent_account_id=$1 limit 300`,[root]);
    class CountingExecutor implements SqlExecutor{count=0;query<T extends QueryResultRow=QueryResultRow>(sql:string,values:readonly unknown[]=[]):Promise<QueryResult<T>>{
      this.count++;return app.database.query<T>(sql,values);}}
    const executor=new CountingExecutor();const graph=new PostgresReferralGraphRepository(executor);
    const page=await graph.getDownlineAtDepth(root,2,{limit:100});expect(page.accounts).toHaveLength(100);expect(page.nextCursor).not.toBeNull();expect(executor.count).toBe(1);
    const direct=await graph.getDirectReferrals(root,{limit:100});expect(direct.accounts).toHaveLength(100);expect(executor.count).toBe(2);
  });
  async function commerce(){const seller=await account("seller"),buyer=await account("buyer"),referrer=await account("promoter");
    const listing=await app.listingService.createPublished(seller,{title:"Referral listing",description:"",priceMinor:"1001",currency:"USD",destination:"https://destination.example"});
    return {seller,buyer,referrer,listing};}
  it("keeps organic purchases unattributed and rejects arbitrary account IDs as attribution",async()=>{
    const {buyer,referrer,listing}=await commerce();
    const organic=await app.legacyProviderCheckout.initiate({buyerId:buyer.id,buyerEmail:buyer.email,listingId:listing.id,providerName:"development",idempotencyKey:"organic"});
    expect((await app.purchases.findById(organic.purchaseId!))?.terms).toMatchObject({referralAttributionId:null,referralLinkId:null,referralReferrerAccountId:null});
    const forged=await app.legacyProviderCheckout.initiate({buyerId:buyer.id,buyerEmail:buyer.email,listingId:listing.id,providerName:"development",idempotencyKey:"forged",attributionSource:referrer.id});
    expect((await app.purchases.findById(forged.purchaseId!))?.terms.referralReferrerAccountId).toBeNull();
  });
  it("turns a valid referral visit into an immutable purchase attribution snapshot",async()=>{
    const {seller,buyer,referrer,listing}=await commerce();const accountParent=await account("buyer_parent");await app.referralGraphService.establish(buyer.id,accountParent.id);
    const link=await app.referralAttribution.createLink(referrer.id,listing.id);const visit=await app.referralAttribution.visit(link.code);expect(visit).not.toBeNull();
    const storedToken=(await app.database.query<{token_hash:Buffer}>(`select token_hash from referral_capability.listing_attributions`)).rows[0].token_hash;
    expect(storedToken).toHaveLength(32);expect(storedToken.toString("utf8")).not.toBe(visit!.source);
    const checkout=await app.legacyProviderCheckout.initiate({buyerId:buyer.id,buyerEmail:buyer.email,listingId:listing.id,providerName:"development",idempotencyKey:"attributed",attributionSource:visit!.source});
    const purchase=await app.purchases.findById(checkout.purchaseId!);expect(purchase?.terms).toMatchObject({referralAttributionId:expect.any(String),referralLinkId:link.id,referralReferrerAccountId:referrer.id});
    expect(purchase?.terms.referralReferrerAccountId).not.toBe(accountParent.id);
    await app.database.query(`update referral_capability.listing_referral_links set state='revoked' where id=$1`,[link.id]);
    await app.listingService.update(seller,listing.id,{title:"Changed",description:"",priceMinor:"9999",currency:"USD",destination:"https://changed.example",metadata:{}});
    const historical=await app.purchases.findById(checkout.purchaseId!);expect(historical?.terms).toMatchObject({title:"Referral listing",referralLinkId:link.id,referralReferrerAccountId:referrer.id});
  });
  it("calculates bounded exact commission facts without ledger entries",async()=>{
    const {buyer,referrer,listing}=await commerce();const level2=await account("level2"),level3=await account("level3"),level4=await account("level4");
    await app.referralGraphService.establish(referrer.id,level2.id);await app.referralGraphService.establish(level2.id,level3.id);await app.referralGraphService.establish(level3.id,level4.id);
    const link=await app.referralAttribution.createLink(referrer.id,listing.id);const visit=await app.referralAttribution.visit(link.code);
    const checkout=await app.legacyProviderCheckout.initiate({buyerId:buyer.id,buyerEmail:buyer.email,listingId:listing.id,providerName:"development",idempotencyKey:"commission",attributionSource:visit!.source});
    await app.legacyPaymentCompletion.complete({paymentId:checkout.paymentId,correlationId:newId()});const purchase=(await app.purchases.findById(checkout.purchaseId!))!;
    await app.database.query(`update referral_capability.commission_policy set rates_basis_points=array[1000,500,333],updated_at=now() where singleton=true`);
    const facts=await app.commissionDistribution.calculate(purchase,await app.commissionPolicy.getActive());
    expect(facts.map(fact=>({recipient:fact.recipientAccountId,level:fact.level,rate:fact.configuredRateBasisPoints,amount:fact.calculatedAmount.minorAmount})))
      .toEqual([{recipient:referrer.id,level:1,rate:1000,amount:100n},{recipient:level2.id,level:2,rate:500,amount:50n},{recipient:level3.id,level:3,rate:333,amount:33n}]);
    expect(facts.some(fact=>fact.recipientAccountId===level4.id)).toBe(false);
    expect((await app.database.query(`select id from ledger_capability.entries`)).rowCount).toBe(0);
  });
});
