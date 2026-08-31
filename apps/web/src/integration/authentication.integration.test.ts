import { afterAll,beforeEach,describe,expect,it } from "vitest";
import { createContainer } from "@/infrastructure/container";

const databaseUrl=process.env.TEST_DATABASE_URL;
const suite=databaseUrl?describe:describe.skip;

suite("Better Auth and Cliqero identity boundary",()=>{
  const app=createContainer(databaseUrl!);
  beforeEach(async()=>{
    await app.database.query(`truncate table
      better_auth."session",better_auth.account,better_auth.verification,better_auth."user",
      identity_capability.auth_account_links,identity_capability.sessions,identity_capability.accounts
      restart identity cascade`);
  });
  afterAll(async()=>{await app.database.close();await app.authentication.betterAuth.close();});

  it("creates one Better Auth identity mapped to one Cliqero account",async()=>{
    const account=await app.authentication.register({email:"auth@example.com",handle:"authuser",password:"correct-horse-battery",country:"NG"});
    const rows=await app.database.query<{auth_user_id:string;account_id:string;onboarding_state:string}>(
      `select auth_user_id,account_id,onboarding_state from identity_capability.auth_account_links`);
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]).toMatchObject({account_id:account.id,onboarding_state:"complete"});
    expect((await app.database.query(`select password_salt,password_hash from identity_capability.accounts where id=$1`,[account.id])).rows[0]).toEqual({password_salt:null,password_hash:null});
  });

  it("supports Better Auth credential login, bearer resolution and session revocation",async()=>{
    const account=await app.authentication.register({email:"login@example.com",handle:"loginuser",password:"correct-horse-battery"});
    const result=await app.authentication.login(account.email,"correct-horse-battery");
    expect((await app.authentication.authenticate(result.token))?.id).toBe(account.id);
    await expect(app.authentication.login(account.email,"wrong-password")).rejects.toThrow("Invalid credentials");
    await app.authentication.auth.api.signOut({headers:new Headers({authorization:`Bearer ${result.token}`})});
    await expect(app.authentication.authenticate(result.token)).resolves.toBeNull();
  });

  it("uses Better Auth's HTTP-only cookie response for the compatibility login endpoint",async()=>{
    const account=await app.authentication.register({email:"cookie@example.com",handle:"cookieuser",password:"correct-horse-battery"});
    const response=await app.authentication.auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email",{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:account.email,password:"correct-horse-battery"}),
    }));
    expect(response.ok).toBe(true);
    const cookie=response.headers.get("set-cookie");
    expect(cookie).toContain("better-auth");
    const session=await app.authentication.auth.api.getSession({headers:new Headers({cookie:cookie!.split(";")[0]})});
    expect(session?.user.email).toBe(account.email);
    expect((await app.authentication.authenticateRequest(new Request("http://localhost:3000",{headers:{cookie:cookie!.split(";")[0]}})))?.id).toBe(account.id);
  });

  it("represents social-first users as authenticated but incomplete until onboarding",async()=>{
    const result=await app.authentication.auth.api.signUpEmail({body:{name:"social user",email:"social@example.com",password:"correct-horse-battery"}});
    const session=await app.authentication.auth.api.signInEmail({body:{email:result.user.email,password:"correct-horse-battery"}});
    const principal=await app.authentication.principal(new Request("http://localhost:3000",{headers:{authorization:`Bearer ${session.token!}`}}));
    expect(principal?.account).toBeNull();
    const account=await app.authentication.completeOnboarding(result.user.id,{email:result.user.email,handle:"socialuser",country:"NG"});
    expect((await app.authentication.authenticate(session.token!))?.id).toBe(account.id);
  });

  it("keeps account linking explicit and requires verified local email ownership",()=>{
    expect(app.authentication.auth.options.account?.accountLinking).toMatchObject({
      enabled:true,requireLocalEmailVerified:true,allowDifferentEmails:false,
    });
  });
});
