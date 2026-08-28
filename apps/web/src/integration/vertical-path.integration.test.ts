import { afterAll,beforeEach,describe,expect,it } from "vitest";
import { createContainer } from "@/infrastructure/container";
import { newId } from "@/kernel/ids";

const databaseUrl=process.env.TEST_DATABASE_URL;
const suite=databaseUrl?describe:describe.skip;

suite("persisted commerce and access vertical path",()=>{
  const app=createContainer(databaseUrl!);
  beforeEach(async()=>{
    await app.database.query(`truncate table
      access_capability.integration_listings,access_capability.integrations,access_capability.access_grants,
      entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,
      listing_capability.listings,identity_capability.sessions,identity_capability.accounts,
      kernel.outbox_events,kernel.idempotency_records restart identity cascade`);
  });
  afterAll(()=>app.database.close());

  async function setup() {
    const seller=await app.authentication.register({email:"seller@example.com",handle:"seller",password:"correct-horse-battery"});
    const buyer=await app.authentication.register({email:"buyer@example.com",handle:"buyer",password:"correct-horse-staple"});
    const listing=await app.listingService.create(seller,{title:"Private destination",description:"Access elsewhere",priceMinor:"2500",
      currency:"USD",destination:"https://destination.example/open?existing=yes",metadata:{format_hint:"external"}});
    return {seller,buyer,listing};
  }

  it("round-trips a productless listing and preserves purchase snapshots after listing edits",async()=>{
    const {seller,buyer,listing}=await setup();
    const persisted=await app.listings.findById(listing.id);
    expect(persisted).toMatchObject({title:"Private destination",sellerId:seller.id});
    const checkout=await app.checkout.initiate({buyerId:buyer.id,buyerEmail:buyer.email,listingId:listing.id,providerName:"development",idempotencyKey:"checkout-snapshot"});
    await app.listingService.update(seller,listing.id,{title:"Changed title",description:"Changed",priceMinor:"9999",currency:"USD",
      destination:"https://destination.example/new",metadata:{changed:true}});
    const purchase=await app.purchases.findById(checkout.purchaseId!);
    expect(purchase?.terms).toMatchObject({title:"Private destination",price:{minorAmount:"2500",currency:"USD"}});
  });

  it("completes payment concurrently exactly once with entitlement and transactional outbox",async()=>{
    const {buyer,listing}=await setup();
    const checkout=await app.checkout.initiate({buyerId:buyer.id,buyerEmail:buyer.email,listingId:listing.id,providerName:"development",idempotencyKey:"checkout-concurrent"});
    const correlationId=newId();
    const [first,second]=await Promise.all([
      app.paymentCompletion.complete({paymentId:checkout.paymentId,correlationId}),
      app.paymentCompletion.complete({paymentId:checkout.paymentId,correlationId}),
    ]);
    expect(second.id).toBe(first.id);
    expect((await app.database.query(`select id from entitlement_capability.entitlements`)).rowCount).toBe(1);
    const events=await app.database.query<{event_name:string}>(`select event_name from kernel.outbox_events order by event_name`);
    expect(events.rows.map(row=>row.event_name)).toEqual(["entitlement.created","purchase.completed"]);
    const purchase=await app.purchases.findById(checkout.purchaseId!); expect(purchase?.state).toBe("completed");
  });

  it("rolls an outbox record back with its surrounding domain transaction",async()=>{
    const eventId=newId();
    await expect(app.database.transaction(async()=>{
      await app.outbox.append([{id:eventId,name:"test.fact",aggregateId:newId(),correlationId:newId(),occurredAt:new Date(),payload:{}}]);
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect((await app.database.query(`select id from kernel.outbox_events where id=$1`,[eventId])).rowCount).toBe(0);
  });

  it("hands an entitled buyer an opaque source while persisting only its hash",async()=>{
    const {buyer,listing}=await setup();
    const checkout=await app.checkout.initiate({buyerId:buyer.id,buyerEmail:buyer.email,listingId:listing.id,providerName:"development",idempotencyKey:"checkout-access"});
    await app.paymentCompletion.complete({paymentId:checkout.paymentId,correlationId:newId()});
    const destination=await app.buyerAccess.handoff(buyer,listing.id,"access-once");
    expect(destination.searchParams.get("existing")).toBe("yes");
    const source=destination.searchParams.get("source")!;
    expect(source).toHaveLength(43); expect(source).not.toContain(buyer.id); expect(source).not.toContain(listing.id);
    const stored=(await app.database.query<{token_hash:Buffer}>(`select token_hash from access_capability.access_grants`)).rows[0].token_hash;
    expect(stored).toHaveLength(32); expect(stored.toString("utf8")).not.toBe(source);
  });

  it("requires an active entitlement and independently authenticated, listing-scoped integration",async()=>{
    const {seller,buyer,listing}=await setup();
    const checkout=await app.checkout.initiate({buyerId:buyer.id,buyerEmail:buyer.email,listingId:listing.id,providerName:"development",idempotencyKey:"checkout-verify"});
    const entitlement=await app.paymentCompletion.complete({paymentId:checkout.paymentId,correlationId:newId()});
    const destination=await app.buyerAccess.handoff(buyer,listing.id); const source=destination.searchParams.get("source")!;
    const validCredential=await app.database.transaction(()=>app.integrations.create(seller.id,"destination",listing.id));
    const validIntegration=await app.integrations.authenticate(validCredential.credential);
    expect(validIntegration).not.toBeNull();
    await expect(app.access.verify(source,validIntegration!)).resolves.toMatchObject({authorized:true,buyerId:buyer.id,listingId:listing.id});
    await expect(app.integrations.authenticate(validCredential.credential+"bad")).resolves.toBeNull();

    const otherListing=await app.listingService.create(seller,{title:"Other",description:"",priceMinor:"100",currency:"USD",destination:"https://other.example"});
    const otherCredential=await app.database.transaction(()=>app.integrations.create(seller.id,"other",otherListing.id));
    const otherIntegration=await app.integrations.authenticate(otherCredential.credential);
    await expect(app.access.verify(source,otherIntegration!)).resolves.toEqual({authorized:false});
    await expect(app.access.verify("purchase-id-or-malformed",validIntegration!)).resolves.toEqual({authorized:false});

    entitlement.revoke(); await app.entitlements.save(entitlement);
    await expect(app.access.verify(source,validIntegration!)).resolves.toEqual({authorized:false});
    await expect(app.buyerAccess.handoff(buyer,listing.id)).rejects.toThrow("Active entitlement not found");
  });
});
