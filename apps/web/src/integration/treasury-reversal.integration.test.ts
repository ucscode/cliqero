import {afterAll,afterEach,beforeEach,describe,expect,it} from "vitest";
import {createContainer} from "@/infrastructure/container";
import {newId} from "@/kernel/ids";

const databaseUrl=process.env.TEST_DATABASE_URL;const suite=databaseUrl?describe:describe.skip;
suite("treasury reversal database invariants",()=>{
  const app=createContainer(databaseUrl!);
  beforeEach(async()=>{await app.database.query(`truncate table treasury_capability.entries`);});
  afterEach(async()=>{await app.database.query(`truncate table treasury_capability.entries`);});
  afterAll(()=>app.database.close());

  it("enforces one direct reversal per treasury entry independently of application checks",async()=>{
    const originalId=newId(),reversalId=newId();
    await app.database.query(`insert into treasury_capability.entries(id,direction,amount_minor,title,idempotency_key) values($1,'credit',500,'Platform revenue',$2)`,[originalId,`original-${originalId}`]);
    await app.database.query(`insert into treasury_capability.entries(id,direction,amount_minor,title,source_kind,source_id,idempotency_key) values($1,'debit',500,'Reversal','treasury_reversal',$2,$3)`,[reversalId,originalId,`reversal-${reversalId}`]);
    await expect(app.database.query(`insert into treasury_capability.entries(id,direction,amount_minor,title,source_kind,source_id,idempotency_key) values($1,'debit',500,'Duplicate reversal','treasury_reversal',$2,$3)`,[newId(),originalId,`duplicate-${originalId}`])).rejects.toThrow(/treasury_entries_one_direct_reversal|duplicate key/);
    expect((await app.database.query(`select count(*)::int as count from treasury_capability.entries where source_kind='treasury_reversal' and source_id=$1`,[originalId])).rows[0].count).toBe(1);
  });
});
