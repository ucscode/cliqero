import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/infrastructure/container";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("operator account index PostgreSQL projection", () => {
  const app = createContainer(databaseUrl!);

  beforeEach(async () => {
    await app.database.query(`truncate table
      kernel.audit_records,better_auth."session",better_auth.account,better_auth.verification,
      better_auth."user",identity_capability.auth_account_links,identity_capability.sessions,
      identity_capability.accounts restart identity cascade`);
  });

  afterAll(async () => {
    await app.database.close();
    await app.authentication.betterAuth.close();
  });

  it("creates email-setup identities without credentials and authenticates manual-password accounts", async () => {
    const actor = await app.authentication.register({
      email: "operator.credential.actor@example.test",
      username: "operator_credential_actor",
      password: "correct-horse-battery",
      country: "NG",
    });
    const emailMode = await app.authentication.registerForOperatorWithoutPassword(
      {
        email: "operator.email.mode@example.test",
        username: "operator_email_mode",
        country: "GH",
      },
      actor.id,
    );
    const emailIdentity = (
      await app.database.query<{ authUserId: string; credentialCount: string }>(
        `select link.auth_user_id as "authUserId",
                count(auth_account.id)::text as "credentialCount"
           from identity_capability.auth_account_links link
           left join better_auth.account auth_account
             on auth_account."userId"=link.auth_user_id
            and auth_account."providerId"='credential'
            and auth_account.password is not null
          where link.account_id=(select id from identity_capability.accounts where uuid=$1)
          group by link.auth_user_id`,
        [emailMode.id],
      )
    ).rows[0];
    expect(emailIdentity.credentialCount).toBe("0");
    await expect(
      app.authentication.login("operator.email.mode@example.test", "NoCredential!2026"),
    ).rejects.toThrow();
    expect(await app.authentication.accountForAuthUser(emailIdentity.authUserId)).toMatchObject({
      id: emailMode.id,
    });

    const manualPassword = "OperatorChosen!2026";
    const manual = await app.authentication.registerForOperator(
      {
        email: "operator.manual.mode@example.test",
        username: "operator_manual_mode",
        password: manualPassword,
      },
      actor.id,
    );
    await expect(
      app.authentication.login("operator.manual.mode@example.test", manualPassword),
    ).resolves.toMatchObject({
      account: { id: manual.id },
      token: expect.any(String),
    });
    const audit = await app.database.query<{ new_state: Record<string, unknown> }>(
      `select new_state from kernel.audit_records
        where action='operator.account_created' and subject_id=$1`,
      [manual.id],
    );
    expect(JSON.stringify(audit.rows[0]?.new_state)).not.toContain(manualPassword);
  });

  it("updates the canonical authentication email, operator projection, and audit record together", async () => {
    const actor = await app.authentication.register({
      email: "ops.email.actor@example.test",
      username: "ops_email_actor",
      password: "correct-horse-battery",
      country: "NG",
    });
    const target = await app.authentication.register({
      email: "ops.email.before@example.test",
      username: "ops_email_target",
      password: "correct-horse-battery",
      country: "GH",
    });

    const updated = await app.operatorAccountManagement.update(actor.id, target.id, {
      email: "OPS.EMAIL.AFTER@example.test",
    });

    expect(updated.email).toBe("ops.email.after@example.test");
    const identity = await app.database.query<{ email: string; email_verified: boolean }>(
      `select auth_user.email,auth_user."emailVerified" email_verified
         from better_auth."user" auth_user
         join identity_capability.auth_account_links link on link.auth_user_id=auth_user.id
        where link.account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [target.id],
    );
    expect(identity.rows).toEqual([
      { email: "ops.email.after@example.test", email_verified: false },
    ]);

    const audit = await app.database.query<{ previous_state: unknown; new_state: unknown }>(
      `select previous_state,new_state from kernel.audit_records
        where action='operator.account_profile_updated' and subject_id=$1
        order by occurred_at desc limit 1`,
      [target.id],
    );
    expect(audit.rows[0]).toMatchObject({
      previous_state: expect.objectContaining({ email: "ops.email.before@example.test" }),
      new_state: expect.objectContaining({ email: "ops.email.after@example.test" }),
    });
  });

  it("lists canonical accounts, searches profile fields, and paginates without skips or repeats", async () => {
    const first = await app.authentication.register({
      email: "ops.account.first@example.test",
      username: "ops_account_first",
      password: "correct-horse-battery",
      country: "NG",
    });
    const second = await app.authentication.register({
      email: "ops.account.second@example.test",
      username: "ops_account_second",
      password: "correct-horse-battery",
      country: "GH",
    });
    const third = await app.authentication.register({
      email: "ops.account.third@example.test",
      username: "ops_account_third",
      password: "correct-horse-battery",
      country: "US",
    });
    const noAuthMetadata = (
      await app.database.query<{ uuid: string }>(
        `insert into identity_capability.accounts(username,metadata)
         values('ops_account_noauth','{"country":"GB"}'::jsonb) returning uuid`,
      )
    ).rows[0].uuid;
    const child = await app.authentication.register({
      email: "ops.account.child@example.test",
      username: "ops_account_child",
      password: "correct-horse-battery",
      country: "NG",
    });

    const ids = [first.id, second.id, third.id, noAuthMetadata, child.id];
    const stableTimestamp = "2026-01-01T00:00:00.000Z";
    await app.database.query(
      `update identity_capability.accounts set created_at=$1::timestamptz where uuid=any($2::uuid[])`,
      [stableTimestamp, ids],
    );
    await app.database.query(
      `insert into referral_capability.account_referrals(child_account_id,parent_account_id)
       select child.id,parent.id from identity_capability.accounts child
       join identity_capability.accounts parent on parent.uuid=$2
       where child.uuid=$1`,
      [child.id, first.id],
    );

    const firstPage = await app.operatorAccounts.list({ limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();

    const all = [...firstPage.items];
    let cursor = firstPage.nextCursor;
    while (cursor) {
      const page = await app.operatorAccounts.list({ limit: 2, cursor });
      all.push(...page.items);
      cursor = page.nextCursor;
    }
    expect(all.map((account) => account.id)).toEqual([...ids].reverse());
    expect(new Set(all.map((account) => account.id)).size).toBe(ids.length);

    const usernameFirst = await app.operatorAccounts.list({
      sort: "username",
      direction: "asc",
      limit: 2,
    });
    expect(usernameFirst.items.map((account) => account.username)).toEqual(
      [...usernameFirst.items.map((account) => account.username)].sort((a, b) =>
        a.localeCompare(b),
      ),
    );
    expect(usernameFirst.nextCursor).toBeTruthy();
    await expect(
      app.operatorAccounts.list({
        sort: "created",
        direction: "desc",
        cursor: usernameFirst.nextCursor!,
        limit: 2,
      }),
    ).rejects.toThrow("Invalid or stale pagination cursor");
    const usernameRemaining = await app.operatorAccounts.list({
      sort: "username",
      direction: "asc",
      cursor: usernameFirst.nextCursor!,
      limit: 10,
    });
    expect(
      [...usernameFirst.items, ...usernameRemaining.items].map((item) => item.username),
    ).toEqual(
      [...ids.map((id) => all.find((item) => item.id === id)!.username)].sort((a, b) =>
        a.localeCompare(b),
      ),
    );

    const withoutAuth = all.find((account) => account.id === noAuthMetadata);
    expect(withoutAuth).toMatchObject({
      username: "ops_account_noauth",
      email: null,
      country: "GB",
    });
    expect(all.find((account) => account.id === first.id)?.directReferralCount).toBe(1);

    await expect(
      app.operatorAccounts.list({ search: "ops_account_second", limit: 10 }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: second.id })] });
    await expect(
      app.operatorAccounts.list({ search: "ops.account.third@example.test", limit: 10 }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: third.id })] });
    await expect(app.operatorAccounts.list({ search: child.id, limit: 10 })).resolves.toMatchObject(
      {
        items: [expect.objectContaining({ id: child.id })],
      },
    );
    await expect(
      app.operatorAccounts.list({ search: "ops_account_", limit: 10 }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining(ids.map((id) => expect.objectContaining({ id }))),
    });
  });

  it("tombstones identity, detaches children without changing their descendants, and retains history", async () => {
    const actor = await app.authentication.register({
      email: "ops.delete.actor@example.test",
      username: "ops_delete_actor",
      password: "correct-horse-battery",
      country: "NG",
    });
    const parent = await app.authentication.register({
      email: "ops.delete.parent@example.test",
      username: "ops_delete_parent",
      password: "correct-horse-battery",
      country: "NG",
    });
    const target = await app.authentication.register({
      email: "ops.delete.target@example.test",
      username: "ops_delete_target",
      password: "correct-horse-battery",
      country: "GH",
    });
    const child = await app.authentication.register({
      email: "ops.delete.child@example.test",
      username: "ops_delete_child",
      password: "correct-horse-battery",
      country: "US",
    });
    const sibling = await app.authentication.register({
      email: "ops.delete.sibling@example.test",
      username: "ops_delete_sibling",
      password: "correct-horse-battery",
      country: "US",
    });
    const grandchild = await app.authentication.register({
      email: "ops.delete.grandchild@example.test",
      username: "ops_delete_grandchild",
      password: "correct-horse-battery",
      country: "GB",
    });

    await app.database.query(
      `insert into referral_capability.account_referrals(child_account_id,parent_account_id)
       values ((select id from identity_capability.accounts where uuid=$1),(select id from identity_capability.accounts where uuid=$2)),
              ((select id from identity_capability.accounts where uuid=$3),(select id from identity_capability.accounts where uuid=$1)),
              ((select id from identity_capability.accounts where uuid=$4),(select id from identity_capability.accounts where uuid=$1)),
              ((select id from identity_capability.accounts where uuid=$5),(select id from identity_capability.accounts where uuid=$3))`,
      [target.id, parent.id, child.id, sibling.id, grandchild.id],
    );

    const listing = (
      await app.database.query<{ id: string }>(
        `insert into listing_capability.listings(uuid,title,short_description,long_description,price_minor,price_currency,destination_url,state,seller_id)
         values(gen_random_uuid(),'Deletion history','Summary','Long text',1200,'USD','https://example.test/item','published',(select id from identity_capability.accounts where uuid=$1))
         returning id::text`,
        [target.id],
      )
    ).rows[0].id;
    const paymentId = "00000000-0000-4000-8000-000000000020";
    const purchaseId = "00000000-0000-4000-8000-000000000021";
    await app.database.query(
      `insert into payment_capability.payments(uuid,provider_name,provider_reference,provider_amount_minor,provider_currency,canonical_amount_minor,canonical_currency,state,idempotency_key,buyer_id,listing_id)
       values($1,'development','history-reference',1200,'USD',1200,'USD','verified','history-payment-key',(select id from identity_capability.accounts where uuid=$2),$3)`,
      [paymentId, target.id, listing],
    );
    await app.database.query(
      `insert into purchase_capability.purchases(uuid,idempotency_key,listing_title_snapshot,listing_short_description_snapshot,listing_long_description_snapshot,price_minor_snapshot,price_currency_snapshot,canonical_minor_snapshot,buyer_id,seller_id,listing_id,payment_id,state)
       values($1,'history-purchase-key','Deletion history','Saved summary','Saved detail',1200,'USD',1200,(select id from identity_capability.accounts where uuid=$2),(select id from identity_capability.accounts where uuid=$3),$4,(select id from payment_capability.payments where uuid=$5),'completed')`,
      [purchaseId, target.id, target.id, listing, paymentId],
    );
    await app.database.query(
      `insert into ledger_capability.entries(entry_type,direction,amount_minor,currency,idempotency_key,correlation_id,account_id,purchase_id,recipient_role,basis)
       values('purchase-earnings','credit',1200,'USD','history-ledger-key',gen_random_uuid(),(select id from identity_capability.accounts where uuid=$1),(select id from purchase_capability.purchases where uuid=$2),'seller','purchase')`,
      [target.id, purchaseId],
    );
    const destinationId = "00000000-0000-4000-8000-000000000022";
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'finance.read')`,
      [actor.id],
    );
    await app.database.query(
      `insert into withdrawal_capability.destinations(uuid,account_id,method_key,name,details)
       values($1,(select id from identity_capability.accounts where uuid=$2),'bank_transfer','Private destination','[]'::jsonb)`,
      [destinationId, target.id],
    );
    await app.database.query(
      `insert into withdrawal_capability.withdrawals(uuid,amount_minor,fee_minor,net_amount_minor,currency,saved_destination_id,destination_method,destination_method_name,destination_name,destination_details,idempotency_key,correlation_id,account_id)
       values(gen_random_uuid(),500,0,500,'USD',$1,'bank_transfer','Bank Transfer','Private destination','[]'::jsonb,'history-withdrawal-key',gen_random_uuid(),(select id from identity_capability.accounts where uuid=$2))`,
      [destinationId, target.id],
    );
    await app.database.query(
      `insert into identity_capability.api_keys(name,key_prefix,secret_hash,scopes,account_id)
       values('deletion test','clq_test',decode(repeat('00',32),'hex'),'[]'::jsonb,(select id from identity_capability.accounts where uuid=$1))`,
      [target.id],
    );
    await app.database.query(
      `insert into identity_capability.sessions(token_hash,account_id)
       values(decode(repeat('11',32),'hex'),(select id from identity_capability.accounts where uuid=$1))`,
      [target.id],
    );
    const authUserId = (
      await app.database.query<{ auth_user_id: string }>(
        `select auth_user_id from identity_capability.auth_account_links where account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [target.id],
      )
    ).rows[0].auth_user_id;
    await app.database.query(
      `insert into better_auth.session(id,"userId","expiresAt",token)
       values('delete-session-test',$1,now()+interval '1 day','delete-session-test-token')`,
      [authUserId],
    );

    await app.operatorAccountManagement.delete(actor.id, target.id);

    const tombstone = (
      await app.database.query<any>(
        `select account.username,account.metadata,account.deleted_at,profile.username projected_username,profile.email,profile.metadata->>'country' country
           from identity_capability.accounts account join identity_capability.account_profiles profile on profile.id=account.id
          where account.uuid=$1`,
        [target.id],
      )
    ).rows[0];
    expect(tombstone).toMatchObject({
      username: expect.stringMatching(/^del-/),
      metadata: {},
      projected_username: "Deleted user",
      email: null,
      country: null,
    });
    expect(tombstone.deleted_at).toBeTruthy();
    expect(tombstone.username).toHaveLength(32);
    await expect(
      app.operatorAccounts.list({ search: target.id, limit: 10 }),
    ).resolves.toMatchObject({
      items: [],
    });
    await expect(
      app.authentication.login("ops.delete.target@example.test", "correct-horse-battery"),
    ).rejects.toBeTruthy();
    await expect(
      app.database.query(
        `select 1 from identity_capability.auth_account_links where account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [target.id],
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      app.database.query(`select 1 from better_auth.session where id='delete-session-test'`),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      app.database.query(`select 1 from better_auth."user" where id=$1`, [authUserId]),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      app.database.query(
        `select 1 from identity_capability.api_keys where account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [target.id],
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      app.database.query(
        `select state from identity_capability.sessions where account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [target.id],
      ),
    ).resolves.toMatchObject({ rows: [{ state: "revoked" }] });

    const detachedRelationship = (
      await app.database.query<{ parent: string }>(
        `select parent.uuid parent from referral_capability.account_referrals relation join identity_capability.accounts parent on parent.id=relation.parent_account_id where relation.child_account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [child.id],
      )
    ).rows;
    expect(detachedRelationship).toEqual([]);
    const remainingTargetEdges = await app.database.query(
      `select 1 from referral_capability.account_referrals
        where child_account_id=(select id from identity_capability.accounts where uuid=$1)
           or parent_account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [target.id],
    );
    expect(remainingTargetEdges.rowCount).toBe(0);
    const childRelationships = await app.database.query<{ child: string; parent: string | null }>(
      `select child.uuid child,parent.uuid parent
         from identity_capability.accounts child
         left join referral_capability.account_referrals edge on edge.child_account_id=child.id
         left join identity_capability.accounts parent on parent.id=edge.parent_account_id
        where child.uuid=any($1::uuid[]) order by child.uuid`,
      [[child.id, sibling.id]],
    );
    expect(childRelationships.rows).toHaveLength(2);
    expect(childRelationships.rows.every((row) => row.parent === null)).toBe(true);
    const nestedRelationship = (
      await app.database.query<{ parent: string }>(
        `select parent.uuid parent from referral_capability.account_referrals relation join identity_capability.accounts parent on parent.id=relation.parent_account_id where relation.child_account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [grandchild.id],
      )
    ).rows[0];
    expect(nestedRelationship.parent).toBe(child.id);
    const listingState = await app.database.query<{ state: string }>(
      `select state from listing_capability.listings where id=$1`,
      [listing],
    );
    expect(listingState.rows[0].state).toBe("archived");
    await expect(app.operatorPayments.get(actor.id, paymentId)).resolves.toMatchObject({
      buyer_username: "Deleted user",
    });
    const withdrawalId = (
      await app.database.query<{ uuid: string }>(
        `select uuid from withdrawal_capability.withdrawals where idempotency_key='history-withdrawal-key'`,
      )
    ).rows[0].uuid;
    await expect(app.operatorWithdrawals.get(withdrawalId)).resolves.toMatchObject({
      account: { id: target.id, username: "Deleted user", email: null },
    });
    const destination = await app.database.query<{
      name: string;
      details: unknown;
      status: string;
    }>(`select name,details,status from withdrawal_capability.destinations where uuid=$1`, [
      destinationId,
    ]);
    expect(destination.rows[0]).toEqual({
      name: "Deleted destination",
      details: [],
      status: "archived",
    });

    for (const [table, column, value] of [
      ["purchase_capability.purchases", "uuid", purchaseId],
      ["payment_capability.payments", "uuid", paymentId],
      ["ledger_capability.entries", "idempotency_key", "history-ledger-key"],
      ["withdrawal_capability.withdrawals", "idempotency_key", "history-withdrawal-key"],
    ] as const) {
      const retained = await app.database.query(`select 1 from ${table} where ${column}=$1`, [
        value,
      ]);
      expect(retained.rowCount).toBe(1);
    }
    const deletionAudit = await app.database.query<{ new_state: { childrenDetached: number } }>(
      `select new_state from kernel.audit_records
        where subject_id=$1 and action='operator.account_deleted'`,
      [target.id],
    );
    expect(deletionAudit.rows[0].new_state.childrenDetached).toBe(2);
    await expect(
      app.database.query<{ action: string }>(
        `select action from kernel.audit_records where subject_id=$1 and action='operator.account_deleted'`,
        [target.id],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });

    const reusedUsername = await app.authentication.register({
      email: "ops.delete.reused@example.test",
      username: "ops_delete_target",
      password: "correct-horse-battery",
      country: "NG",
    });
    expect(reusedUsername.username).toBe("ops_delete_target");
  });

  it("deletes a hierarchy root and leaves each immediate child parentless", async () => {
    const actor = await app.authentication.register({
      email: "ops.rootdelete.actor@example.test",
      username: "ops_rootdelete_actor",
      password: "correct-horse-battery",
      country: "NG",
    });
    const root = await app.authentication.register({
      email: "ops.rootdelete.root@example.test",
      username: "ops_rootdelete_root",
      password: "correct-horse-battery",
      country: "NG",
    });
    const left = await app.authentication.register({
      email: "ops.rootdelete.left@example.test",
      username: "ops_rootdelete_left",
      password: "correct-horse-battery",
      country: "NG",
    });
    const right = await app.authentication.register({
      email: "ops.rootdelete.right@example.test",
      username: "ops_rootdelete_right",
      password: "correct-horse-battery",
      country: "NG",
    });
    await app.database.query(
      `insert into identity_capability.account_capabilities(account_id,capability)
       values((select id from identity_capability.accounts where uuid=$1),'system.root')`,
      [actor.id],
    );
    await app.database.query(
      `insert into referral_capability.account_referrals(child_account_id,parent_account_id)
       values ((select id from identity_capability.accounts where uuid=$1),(select id from identity_capability.accounts where uuid=$2)),
              ((select id from identity_capability.accounts where uuid=$3),(select id from identity_capability.accounts where uuid=$2))`,
      [left.id, root.id, right.id],
    );

    await app.operatorAccountManagement.delete(actor.id, root.id);

    const remaining = await app.database.query<{ child: string; parent: string }>(
      `select child.uuid child, parent.uuid parent
         from referral_capability.account_referrals edge
         join identity_capability.accounts child on child.id=edge.child_account_id
         join identity_capability.accounts parent on parent.id=edge.parent_account_id
        where child.uuid in ($1,$2) or parent.uuid=$3`,
      [left.id, right.id, root.id],
    );
    expect(remaining.rows).toEqual([]);
  });
});
