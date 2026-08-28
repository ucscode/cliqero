import {createHmac} from "node:crypto";
import {afterAll,beforeEach,describe,expect,it,vi} from "vitest";
import {createContainer} from "@/infrastructure/container";
import {PaystackProvider} from "@/modules/payment/paystack";
import {PaystackWebhookIngress} from "@/application/paystack-webhooks";
import {OutboxDispatcher,OutboxHandlerRegistry,type WorkerLogger} from "@/workers/outbox/dispatcher";
import {PaystackChargeSucceededHandler} from "@/workers/outbox/paystack-handler";

const databaseUrl=process.env.TEST_DATABASE_URL;const suite=databaseUrl?describe:describe.skip;
const secret="sk_test_webhook_secret";const silent:WorkerLogger={info:()=>undefined,error:()=>undefined};
suite("Paystack webhook to commerce consequence",()=>{
  const app=createContainer(databaseUrl!);let verification:{status:string;reference:string;amount:number;currency:string};let networkFailure=false;
  const http=vi.fn(async(input:string|URL,init?:RequestInit)=>{
    if(networkFailure)throw new Error("Paystack network unavailable");
    const url=String(input);
    if(url.includes("/transaction/initialize")){const request=JSON.parse(String(init?.body));return Response.json({status:true,message:"ok",data:{
      authorization_url:"https://checkout.paystack.com/test",access_code:"access",reference:request.reference}});}
    return Response.json({status:true,message:"verified",data:{id:123456,status:verification.status,reference:verification.reference,
      amount:verification.amount,currency:verification.currency}});
  });
  const provider=new PaystackProvider({secretKey:secret,apiBaseUrl:"https://api.paystack.co"},http);
  app.providers.register(provider);
  const ingress=new PaystackWebhookIngress(provider,app.providerEvents,app.outbox,app.database);
  const dispatcher=new OutboxDispatcher("paystack-worker",app.outbox,new OutboxHandlerRegistry().register(
    new PaystackChargeSucceededHandler(app.providerEvents,app.payments,app.paymentCompletion)),silent,{pollMilliseconds:1,staleAfterMilliseconds:1000});

  beforeEach(async()=>{networkFailure=false;http.mockClear();await app.database.query(`truncate table
    payment_capability.reconciliation_attempts,payment_capability.provider_events,access_capability.integration_listings,access_capability.integrations,access_capability.access_grants,
    entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,
    identity_capability.account_capabilities,identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records restart identity cascade`);});
  afterAll(()=>app.database.close());

  async function setup(){
    const seller=await app.authentication.register({email:"paystack-seller@example.com",handle:"paystack_seller",password:"correct-horse-battery"});
    const buyer=await app.authentication.register({email:"paystack-buyer@example.com",handle:"paystack_buyer",password:"correct-horse-staple"});
    const listing=await app.listingService.create(seller,{title:"Paystack listing",description:"",priceMinor:"2500",currency:"USD",destination:"https://destination.example"});
    const checkout=await app.checkout.initiate({buyerId:buyer.id,buyerEmail:buyer.email,listingId:listing.id,providerName:"paystack",idempotencyKey:"paystack-checkout"});
    verification={status:"success",reference:checkout.providerReference,amount:2500,currency:"USD"};return {buyer,listing,checkout};
  }
  function webhook(reference:string,amount=2500,currency="USD",id=777){
    const raw=Buffer.from(JSON.stringify({event:"charge.success",data:{id,status:"success",reference,amount,currency}}));
    return {raw,signature:createHmac("sha512",secret).update(raw).digest("hex")};
  }

  it("accepts valid signatures and rejects invalid signatures before persistence",async()=>{
    const {checkout}=await setup();const event=webhook(checkout.providerReference);
    await expect(ingress.ingest(event.raw,"0".repeat(128))).resolves.toEqual({authenticated:false});
    expect((await app.database.query(`select id from payment_capability.provider_events`)).rowCount).toBe(0);
    await expect(ingress.ingest(event.raw,event.signature)).resolves.toMatchObject({authenticated:true,accepted:true});
  });
  it("records an unknown payment reference as rejected without completing commerce",async()=>{
    await setup();const event=webhook("cliqero-unknown");await ingress.ingest(event.raw,event.signature);await dispatcher.runOnce();
    expect((await app.database.query<{state:string;last_error:string}>(`select state,last_error from payment_capability.provider_events`)).rows[0])
      .toMatchObject({state:"rejected",last_error:"Unknown Paystack payment reference"});
    expect((await app.database.query(`select id from entitlement_capability.entitlements`)).rowCount).toBe(0);
  });
  it.each([[2600,"USD"],[2500,"NGN"]])("rejects webhook amount/currency mismatch (%s %s)",async(amount,currency)=>{
    const {checkout}=await setup();const event=webhook(checkout.providerReference,amount,currency);await ingress.ingest(event.raw,event.signature);await dispatcher.runOnce();
    expect((await app.database.query<{state:string}>(`select state from payment_capability.provider_events`)).rows[0].state).toBe("rejected");
    expect((await app.database.query(`select id from entitlement_capability.entitlements`)).rowCount).toBe(0);
  });
  it("converges duplicate successful webhooks on one purchase, entitlement, and event set",async()=>{
    const {checkout}=await setup();const event=webhook(checkout.providerReference);
    const first=await ingress.ingest(event.raw,event.signature);const duplicate=await ingress.ingest(event.raw,event.signature);
    expect(first.duplicate).toBe(false);expect(duplicate.duplicate).toBe(true);await dispatcher.runOnce();
    expect((await app.database.query(`select id from payment_capability.provider_events`)).rowCount).toBe(1);
    expect((await app.database.query(`select id from entitlement_capability.entitlements`)).rowCount).toBe(1);
    const names=(await app.database.query<{event_name:string}>(`select event_name from kernel.outbox_events order by event_name`)).rows.map(row=>row.event_name);
    expect(names).toEqual(["entitlement.created","payment.paystack.charge-succeeded","purchase.completed"]);
    expect(http.mock.calls.filter(([url])=>String(url).includes("/transaction/verify/"))).toHaveLength(1);
  });
  it("rejects authoritative verification amount or currency mismatch",async()=>{
    const {checkout}=await setup();verification.amount=9999;const event=webhook(checkout.providerReference);
    await ingress.ingest(event.raw,event.signature);await dispatcher.runOnce();
    const outbox=(await app.database.query<{state:string;last_error:string}>(`select state,last_error from kernel.outbox_events where event_name='payment.paystack.charge-succeeded'`)).rows[0];
    expect(outbox.state).toBe("failed");expect(outbox.last_error).toBe("Payment amount or currency mismatch");
    expect((await app.database.query(`select id from entitlement_capability.entitlements`)).rowCount).toBe(0);
  });
  it("does not falsely complete payment on provider network failure",async()=>{
    const {checkout}=await setup();const event=webhook(checkout.providerReference);await ingress.ingest(event.raw,event.signature);networkFailure=true;await dispatcher.runOnce();
    expect((await app.database.query<{state:string}>(`select state from kernel.outbox_events where event_name='payment.paystack.charge-succeeded'`)).rows[0].state).toBe("failed");
    expect((await app.database.query(`select id from entitlement_capability.entitlements`)).rowCount).toBe(0);
  });
  it("reconciles an eligible pending payment through authoritative verification and is repeat-safe",async()=>{
    const {buyer,checkout}=await setup();await app.database.query(`insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,[buyer.id]);
    const input={actorId:buyer.id,paymentId:checkout.paymentId,idempotencyKey:"manual-reconcile-1",correlationId:checkout.paymentId};
    await expect(app.paymentReconciliation.reconcile(input)).resolves.toMatchObject({state:"completed"});
    await expect(app.paymentReconciliation.reconcile(input)).resolves.toMatchObject({state:"completed"});
    await expect(app.paymentReconciliation.reconcile({...input,idempotencyKey:"manual-reconcile-after-complete"})).resolves.toMatchObject({state:"skipped"});
    expect((await app.database.query(`select 1 from entitlement_capability.entitlements`)).rowCount).toBe(1);
    expect((await app.database.query(`select 1 from payment_capability.reconciliation_attempts`)).rowCount).toBe(2);
  });
  it("surfaces reconciliation mismatches and network failures without local completion",async()=>{
    const {buyer,checkout}=await setup();await app.database.query(`insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,[buyer.id]);
    verification.amount=9999;await expect(app.paymentReconciliation.reconcile({actorId:buyer.id,paymentId:checkout.paymentId,idempotencyKey:"mismatch",correlationId:checkout.paymentId})).rejects.toThrow("mismatch");
    expect((await app.database.query<{state:string}>(`select state from payment_capability.reconciliation_attempts`)).rows[0].state).toBe("mismatch");
    expect((await app.database.query(`select 1 from entitlement_capability.entitlements`)).rowCount).toBe(0);
  });
  it("keeps a payment pending when reconciliation cannot reach Paystack",async()=>{const {buyer,checkout}=await setup();
    await app.database.query(`insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,[buyer.id]);networkFailure=true;
    await expect(app.paymentReconciliation.reconcile({actorId:buyer.id,paymentId:checkout.paymentId,idempotencyKey:"network",correlationId:checkout.paymentId})).rejects.toThrow("network unavailable");
    expect((await app.payments.findById(checkout.paymentId))?.state).toBe("pending");
    expect((await app.database.query<{state:string}>(`select state from payment_capability.reconciliation_attempts`)).rows[0].state).toBe("failed");
  });
  it("operator inspection is authorized and sanitized",async()=>{const {buyer}=await setup();
    await expect(app.paystackInspection.listEvents(buyer.id,10)).rejects.toThrow("Forbidden");
    await app.database.query(`insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,[buyer.id]);
    const rows=await app.paystackInspection.listEvents(buyer.id,10);expect(rows).toEqual([]);
    expect(JSON.stringify(rows)).not.toContain(secret);
  });
});
