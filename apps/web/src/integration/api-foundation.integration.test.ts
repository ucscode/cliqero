import {afterAll,beforeEach,describe,expect,it} from "vitest";
import {createContainer} from "@/infrastructure/container";

const databaseUrl=process.env.TEST_DATABASE_URL;const suite=databaseUrl?describe:describe.skip;
suite("headless API principal and hierarchy read model",()=>{
  const app=createContainer(databaseUrl!);let n=0;
  beforeEach(()=>app.database.query(`truncate table identity_capability.api_keys,referral_capability.account_referrals,identity_capability.account_capabilities,identity_capability.auth_account_links,better_auth."session",better_auth.account,better_auth.verification,better_auth."user",identity_capability.accounts restart identity cascade`));
  afterAll(()=>app.database.close());
  async function account(prefix:string){n++;return app.authentication.register({email:`${prefix}${n}@example.com`,handle:`${prefix}${n}`,password:"correct-horse-battery",country:"NG"});}
  it("creates hashed API keys and resolves the same Cliqero account",async()=>{
    const owner=await account("key");await app.database.query(`insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,[owner.id]);
    const created=await app.apiKeys.create({accountId:owner.id,name:"automation",scopes:["hierarchy:read"],createdBy:owner.id});
    expect(created.secret).toMatch(/^cliq_live_/);expect((await app.apiKeys.authenticate(created.secret))?.accountId).toBe(owner.id);expect((await app.database.query(`select last_used_at from identity_capability.api_keys where id=$1`,[created.id])).rows[0].last_used_at).not.toBeNull();
    const row=await app.database.query<{secret_hash:Buffer}>(`select secret_hash from identity_capability.api_keys where id=$1`,[created.id]);expect(row.rows[0].secret_hash.toString()).not.toContain(created.secret);
    expect(await app.apiKeys.authenticate("cliq_live_invalid")).toBeNull();
    expect((await app.principalResolver.resolve(new Request("http://localhost",{headers:{authorization:`Bearer ${created.secret}`}})))?.kind).toBe("api_key");
    await app.apiKeys.revoke(created.id);expect(await app.apiKeys.authenticate(created.secret)).toBeNull();
    const expired=await app.apiKeys.create({accountId:owner.id,name:"expired",scopes:[],createdBy:owner.id,expiresAt:new Date(Date.now()-1000)});expect(await app.apiKeys.authenticate(expired.secret)).toBeNull();
  });
  it("authorizes descendant roots and bounds the visualization window",async()=>{
    const root=await account("root"),child=await account("child"),grand=await account("grand"),sibling=await account("sibling"),outsider=await account("outside");
    await app.referralGraphService.establish(child.id,root.id);await app.referralGraphService.establish(grand.id,child.id);await app.referralGraphService.establish(sibling.id,root.id);
    const own=await app.hierarchy.tree(root.id,root.id,false);expect(own.nodes.map(n=>n.id)).toContain(grand.id);expect(own.parent).toBeNull();
    const rebased=await app.hierarchy.tree(root.id,grand.id,false);expect(rebased.parent?.id).toBe(child.id);
    await expect(app.hierarchy.tree(root.id,outsider.id,false)).rejects.toThrow("Forbidden");
    const admin=await account("admin");await app.database.query(`insert into identity_capability.account_capabilities(account_id,capability) values($1,'operator')`,[admin.id]);expect((await app.hierarchy.tree(admin.id,outsider.id,true)).root).toBe(outsider.id);
  });
  it("searches only the authorized descendant closure for normal users",async()=>{
    const root=await account("searchroot"),child=await account("searchchild"),other=await account("searchother");await app.referralGraphService.establish(child.id,root.id);
    expect((await app.hierarchy.search(root.id,child.handle,false,20)).map(x=>x.id)).toContain(child.id);expect(await app.hierarchy.search(root.id,other.handle,false,20)).toEqual([]);
  });
});
