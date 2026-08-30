import {afterAll,afterEach,beforeEach,describe,expect,it} from "vitest";
import {createContainer} from "@/infrastructure/container";

const databaseUrl=process.env.TEST_DATABASE_URL;const suite=databaseUrl?describe:describe.skip;
suite("treasury PostgreSQL idempotency",()=>{
  const app=createContainer(databaseUrl!);
  beforeEach(async()=>{await app.database.query(`truncate table treasury_capability.entries`);});
  afterEach(async()=>{await app.database.query(`truncate table treasury_capability.entries`);});
  afterAll(()=>app.database.close());
  const request=(overrides:Partial<{direction:"credit"|"debit";amountMinor:bigint;title:string;note:string|null;actorId:string;idempotencyKey:string}>={})=>app.treasury.createManual({direction:"credit",amountMinor:500n,title:"Correction",note:"same request",actorId:"00000000-0000-0000-0000-0000000000aa",idempotencyKey:"manual-key",...overrides});

  it("returns one persisted fact for an equivalent repeated request",async()=>{
    const first=await request(),second=await request();
    expect(second).toMatchObject({id:first.id,direction:"credit",amountMinor:500n});
    expect((await app.database.query(`select count(*)::int as count from treasury_capability.entries`)).rows[0].count).toBe(1);
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(500n);
  });

  it.each([
    ["direction",{direction:"debit" as const}],
    ["amount",{amountMinor:501n}],
    ["title",{title:"Different correction"}],
    ["note",{note:"Different explanation"}],
    ["actor",{actorId:"00000000-0000-0000-0000-0000000000bb"}],
  ])("rejects a same-key request with a different %s",async(_field,change)=>{
    await request();
    await expect(request(change)).rejects.toThrow("idempotency key");
    expect((await app.database.query(`select count(*)::int as count from treasury_capability.entries`)).rows[0].count).toBe(1);
  });

  it("converges concurrent equivalent requests on one fact",async()=>{
    const results=await Promise.all([request(),request()]);
    expect(results[0].id).toBe(results[1].id);
    expect((await app.database.query(`select count(*)::int as count from treasury_capability.entries`)).rows[0].count).toBe(1);
    expect((await app.treasuryRepository.summary()).balanceMinor).toBe(500n);
  });

  it("allows only one financial effect for concurrent conflicting requests",async()=>{
    const results=await Promise.allSettled([request(),request({direction:"debit",amountMinor:700n,title:"Conflicting request"})]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
    expect((await app.database.query(`select count(*)::int as count from treasury_capability.entries`)).rows[0].count).toBe(1);
  });
});
