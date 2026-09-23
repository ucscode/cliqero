import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import { AccountReferralAttributionService } from "@/application/account-referral-attribution";
import { createContainer } from "@/infrastructure/container";
import { PostgresReferralGraphRepository } from "@/infrastructure/postgres/referral/referrals";
import type { QueryExecutor, QueryResult } from "@/infrastructure/postgres/shared/query";
import { newId } from "@/kernel/ids";
import type { AccountReferralAttributionRepository } from "@/modules/referral/attribution";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const tokenHash = (source: string) => createHash("sha256").update(source, "utf8").digest();
suite("referral graph and trusted purchase attribution", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(() =>
    app.database.query(`truncate table
    ledger_capability.entry_settlements,ledger_capability.entries,ledger_capability.reversals,ledger_capability.purchase_distributions,payment_capability.reconciliation_attempts,
    referral_capability.listing_attributions,referral_capability.account_attributions,referral_capability.account_referrals,
    payment_capability.provider_events,access_capability.integration_listings,access_capability.integrations,access_capability.access_grants,
    entitlement_capability.entitlements,purchase_capability.purchases,payment_capability.payments,listing_capability.listings,
    identity_capability.sessions,identity_capability.accounts,kernel.outbox_events,kernel.idempotency_records,kernel.audit_records restart identity cascade`),
  );
  afterAll(() => app.database.close());
  let sequence = 0;
  async function account(prefix = "account") {
    sequence++;
    return app.authentication.register({
      email: `${prefix}-${sequence}@example.com`,
      username: `${prefix}_${sequence}`,
      password: "correct-horse-battery",
      country: "NG",
    });
  }
  async function tree() {
    const root = await account("root"),
      a = await account("a"),
      b = await account("b"),
      c = await account("c"),
      d = await account("d"),
      e = await account("e");
    await app.referralGraphService.establish(a.id, root.id);
    await app.referralGraphService.establish(b.id, root.id);
    await app.referralGraphService.establish(c.id, a.id);
    await app.referralGraphService.establish(d.id, a.id);
    await app.referralGraphService.establish(e.id, c.id);
    return { root, a, b, c, d, e };
  }

  it("keeps normal parent assignment insert-only while operators can reassign", async () => {
    const child = await account("child"),
      parent = await account("parent"),
      other = await account("other");
    await app.referralGraphService.establish(child.id, parent.id);
    await expect(app.referralGraphService.establish(child.id, other.id)).rejects.toThrow();
    await expect(app.referralGraphService.establish(child.id, parent.id)).rejects.toThrow();
    await expect(app.referralGraphService.establish(child.id, child.id)).rejects.toThrow(
      "Self-referral",
    );
    await app.database.query(
      `update referral_capability.account_referrals set parent_account_id=(select id from identity_capability.accounts where uuid=$2) where child_account_id=(select id from identity_capability.accounts where uuid=$1)`,
      [child.id, other.id],
    );
    expect(
      (
        await app.database.query<{ parent_account_id: string }>(
          `select parent.uuid parent_account_id from referral_capability.account_referrals r join identity_capability.accounts child on child.id=r.child_account_id join identity_capability.accounts parent on parent.id=r.parent_account_id where child.uuid=$1`,
          [child.id],
        )
      ).rows[0].parent_account_id,
    ).toBe(other.id);
    await expect(
      app.database.query(
        `delete from referral_capability.account_referrals where child_account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [child.id],
      ),
    ).rejects.toThrow("deletion");
  });

  it("creates deterministic referral URLs without link records", async () => {
    const promoter = await account("promoter"),
      other = await account("other");
    const listing = await app.listingService.create(promoter, {
      title: "Promotable catalogue item",
      shortDescription: "Share this listing with your network",
      longDescription: "A listing for deterministic referral projection",
      priceMinor: "1000",
      currency: "USD",
      destination: "https://example.com/promotable",
    });
    await app.listingService.publish(promoter, listing.id);
    const otherListing = await app.listingService.create(other, {
      title: "Another catalogue item",
      shortDescription: "A separate catalogue item",
      longDescription: "Not visible to the first promoter",
      priceMinor: "1200",
      currency: "USD",
      destination: "https://example.com/other",
    });
    await app.listingService.publish(other, otherListing.id);
    const url = await app.referralAttribution.urlFor(other.id, listing.id);
    expect(url).toContain(`/r/${other.id}/${listing.id}`);
    await app.profiles.update(other.id, { username: "renamed_promoter" });
    await expect(app.referralAttribution.urlFor(other.id, listing.id)).resolves.toBe(url);
    await expect(app.referralAttribution.urlFor(promoter.id, otherListing.id)).resolves.toContain(
      `/r/${promoter.id}/${otherListing.id}`,
    );
    await expect(
      app.database.query("select 1 from referral_capability.listing_referral_links"),
    ).rejects.toThrow();
  });

  it("assigns the latest valid account referral only during new-account registration", async () => {
    const alice = await account("alice"),
      bob = await account("bob");
    const aliceVisit = await app.accountReferralAttribution.visit(alice.id);
    const bobVisit = await app.accountReferralAttribution.visit(bob.id, aliceVisit!.source);
    expect(await app.accountReferralAttribution.resolve(aliceVisit!.source)).toBeNull();
    expect(await app.accountReferralAttribution.resolve(bobVisit!.source)).toEqual({
      referrerAccountId: bob.id,
    });

    const referred = await app.authentication.register({
      email: "referred@example.com",
      username: "referred_account",
      password: "correct-horse-battery",
      country: "NG",
      accountReferralSource: bobVisit!.source,
    });
    expect(
      (
        await app.database.query<{ parent_account_id: string }>(
          `select parent.uuid parent_account_id
             from referral_capability.account_referrals relationship
             join identity_capability.accounts parent on parent.id=relationship.parent_account_id
             where relationship.child_account_id=(select id from identity_capability.accounts where uuid=$1)`,
          [referred.id],
        )
      ).rows[0].parent_account_id,
    ).toBe(bob.id);
    expect(await app.accountReferralAttribution.resolve(bobVisit!.source)).toBeNull();

    const expiredVisit = await app.accountReferralAttribution.visit(alice.id);
    await app.database.query(
      `update referral_capability.account_attributions
          set expires_at=now()-interval '1 minute'
        where state='active'`,
    );
    const parentless = await app.authentication.register({
      email: "parentless@example.com",
      username: "parentless_account",
      password: "correct-horse-battery",
      country: "NG",
      accountReferralSource: expiredVisit!.source,
    });
    expect(
      (
        await app.database.query<{ count: string }>(
          `select count(*)::text count from referral_capability.account_referrals
            where child_account_id=(select id from identity_capability.accounts where uuid=$1)`,
          [parentless.id],
        )
      ).rows[0].count,
    ).toBe("0");
  });

  it("atomically refreshes a repeated account referral click", async () => {
    const alice = await account("repeat_alice");
    const first = await app.accountReferralAttribution.visit(alice.id);
    const startedAt = Date.now();
    const second = await app.accountReferralAttribution.visit(alice.id, first!.source);
    const rows = (
      await app.database.query<{ token_hash: Buffer; state: string; expires_at: Date }>(
        `select token_hash,state,expires_at
           from referral_capability.account_attributions
          where token_hash in ($1,$2)
          order by id`,
        [tokenHash(first!.source), tokenHash(second!.source)],
      )
    ).rows;

    expect(rows.map((row) => row.state)).toEqual(["revoked", "active"]);
    expect(rows[1].expires_at.getTime()).toBeGreaterThan(startedAt + 29 * 24 * 60 * 60 * 1000);
    expect(rows[1].expires_at.getTime()).toBeLessThan(Date.now() + 31 * 24 * 60 * 60 * 1000);
  });

  it("atomically replaces an account referral with a different referrer", async () => {
    const alice = await account("replace_alice"),
      bob = await account("replace_bob");
    const first = await app.accountReferralAttribution.visit(alice.id);
    const second = await app.accountReferralAttribution.visit(bob.id, first!.source);

    expect(await app.accountReferralAttribution.resolve(first!.source)).toBeNull();
    await expect(app.accountReferralAttribution.resolve(second!.source)).resolves.toEqual({
      referrerAccountId: bob.id,
    });
  });

  it("rolls back revocation when replacement creation fails", async () => {
    const alice = await account("rollback_alice");
    const first = await app.accountReferralAttribution.visit(alice.id);
    const repository = app.referralAttributionRepository;
    const failingRepository: AccountReferralAttributionRepository = {
      createAccountAttribution: async (input) => {
        await repository.createAccountAttribution(input);
        throw new Error("simulated replacement failure");
      },
      resolveAccountAttribution: (hash) => repository.resolveAccountAttribution(hash),
      claimAccountAttribution: (hash, childAccountId) =>
        repository.claimAccountAttribution(hash, childAccountId),
      revokeAccountAttribution: (hash) => repository.revokeAccountAttribution(hash),
    };
    const failingService = new AccountReferralAttributionService(
      failingRepository,
      app.accounts,
      app.database,
    );

    await expect(failingService.visit(alice.id, first!.source)).rejects.toThrow(
      "simulated replacement failure",
    );
    await expect(app.accountReferralAttribution.resolve(first!.source)).resolves.toEqual({
      referrerAccountId: alice.id,
    });
  });

  it("keeps account attribution distinct from listing purchase attribution", async () => {
    const { seller, referrer, listing } = await commerce();
    const accountVisit = await app.accountReferralAttribution.visit(referrer.id);
    const listingVisit = await app.referralAttribution.visit(referrer.id, listing.id);
    expect(accountVisit?.source).toBeTruthy();
    expect(listingVisit?.source).toBeTruthy();
    expect(
      (
        await app.database.query<{ count: string }>(
          `select count(*)::text count from referral_capability.account_attributions`,
        )
      ).rows[0].count,
    ).toBe("1");
    expect(
      (
        await app.database.query<{ count: string }>(
          `select count(*)::text count from referral_capability.listing_attributions where listing_id=(select id from listing_capability.listings where uuid=$1)`,
          [listing.id],
        )
      ).rows[0].count,
    ).toBe("1");
    expect(seller.id).not.toBe(referrer.id);
  });

  it("rejects indirect cycles inside PostgreSQL", async () => {
    const a = await account("cycle_a"),
      b = await account("cycle_b"),
      c = await account("cycle_c");
    await app.referralGraphService.establish(a.id, b.id);
    await app.referralGraphService.establish(b.id, c.id);
    await expect(app.referralGraphService.establish(c.id, a.id)).rejects.toThrow("cycle");
  });
  it("reassigns one adjacency row, audits it, and treats a repeated target as a no-op", async () => {
    const x = await account("x"),
      y = await account("y"),
      a = await account("a"),
      c = await account("c"),
      d = await account("d"),
      operator = await account("operator");
    await app.referralGraphService.establish(a.id, x.id);
    await app.referralGraphService.establish(c.id, a.id);
    await app.referralGraphService.establish(d.id, a.id);
    const changed = await app.referralGraphService.reassignParent(a.id, y.id, operator.id);
    expect(changed).toMatchObject({
      childAccountId: a.id,
      parentAccountId: y.id,
      previousParentAccountId: x.id,
      changed: true,
    });
    expect((await app.referralGraph.getUplines(c.id, 10)).map((item) => item.accountId)).toEqual([
      a.id,
      y.id,
    ]);
    expect((await app.referralGraph.getUplines(d.id, 10)).map((item) => item.accountId)).toEqual([
      a.id,
      y.id,
    ]);
    const auditBefore = (
      await app.database.query(
        `select id from kernel.audit_records where action='referral.parent_reassigned' and subject_id=$1`,
        [a.id],
      )
    ).rowCount;
    const noop = await app.referralGraphService.reassignParent(a.id, y.id, operator.id);
    expect(noop.changed).toBe(false);
    expect(
      (
        await app.database.query(
          `select id from kernel.audit_records where action='referral.parent_reassigned' and subject_id=$1`,
          [a.id],
        )
      ).rowCount,
    ).toBe(auditBefore);
    const audit = (
      await app.database.query<{ actor_id: string; previous_state: any; new_state: any }>(
        `select actor.uuid actor_id,previous_state,new_state from kernel.audit_records audit left join identity_capability.accounts actor on actor.id=audit.actor_id where action='referral.parent_reassigned' and subject_id=$1`,
        [a.id],
      )
    ).rows[0];
    expect(audit.actor_id).toBe(operator.id);
    expect(audit.previous_state.parent_account_id).toBe(x.id);
    expect(audit.new_state.parent_account_id).toBe(y.id);
  });
  it("rejects nonexistent accounts and all cycle shapes on reassignment", async () => {
    const a = await account("cycle_a"),
      b = await account("cycle_b"),
      c = await account("cycle_c");
    await expect(app.referralGraphService.reassignParent(a.id, b.id, a.id)).resolves.toMatchObject({
      changed: true,
    });
    await expect(app.referralGraphService.reassignParent(b.id, a.id, b.id)).rejects.toThrow(
      "cycle",
    );
    await app.referralGraphService.establish(c.id, a.id);
    await expect(app.referralGraphService.reassignParent(a.id, c.id, a.id)).rejects.toThrow(
      "cycle",
    );
    await expect(app.referralGraphService.reassignParent(a.id, a.id, a.id)).rejects.toThrow(
      "Self-referral",
    );
    const missing = newId();
    await expect(app.referralGraphService.reassignParent(missing, b.id, a.id)).rejects.toThrow(
      "not found",
    );
    await expect(app.referralGraphService.reassignParent(a.id, missing, a.id)).rejects.toThrow(
      "not found",
    );
    await expect(
      app.database.query(
        `insert into referral_capability.account_referrals(child_account_id,parent_account_id) values($1,(select id from identity_capability.accounts where uuid=$2))`,
        [0, b.id],
      ),
    ).rejects.toThrow("foreign key");
    await expect(
      app.database.query(
        `insert into referral_capability.account_referrals(child_account_id,parent_account_id) values((select id from identity_capability.accounts where uuid=$1),$2)`,
        [b.id, 0],
      ),
    ).rejects.toThrow("foreign key");
  });
  it("rejects a cycle beyond the old traversal depth", async () => {
    const ids = Array.from({ length: 41 }, () => newId());
    for (let i = 0; i < ids.length; i++)
      await app.database.query(
        `insert into identity_capability.accounts(uuid,username) values($1,$2)`,
        [ids[i], `reassign${i}`],
      );
    for (let i = 1; i < ids.length; i++)
      await app.referralGraphService.establish(ids[i], ids[i - 1]);
    await expect(app.referralGraphService.reassignParent(ids[0], ids[40], ids[0])).rejects.toThrow(
      "cycle",
    );
  });
  it("serializes inverse concurrent assignments so a cycle never commits", async () => {
    const a = await account("inverse_a"),
      b = await account("inverse_b");
    const results = await Promise.allSettled([
      app.referralGraphService.reassignParent(a.id, b.id, a.id),
      app.referralGraphService.reassignParent(b.id, a.id, b.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      results
        .filter((result) => result.status === "rejected")
        .map((result) => String((result as PromiseRejectedResult).reason)),
    ).toEqual([expect.stringContaining("cycle")]);
    const rows = await app.database.query<{ child_account_id: string; parent_account_id: string }>(
      `select child.uuid child_account_id,parent.uuid parent_account_id from referral_capability.account_referrals r join identity_capability.accounts child on child.id=r.child_account_id join identity_capability.accounts parent on parent.id=r.parent_account_id where child.uuid in ($1,$2)`,
      [a.id, b.id],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].child_account_id).not.toBe(rows.rows[0].parent_account_id);
  });
  it("returns ordered bounded uplines and relationship depth with one recursive query each", async () => {
    const { root, a, c, e } = await tree();
    expect(await app.referralGraph.getUplines(e.id, 10)).toEqual([
      { accountId: c.id, depth: 1 },
      { accountId: a.id, depth: 2 },
      { accountId: root.id, depth: 3 },
    ]);
    expect(await app.referralGraph.getUplines(e.id, 2)).toEqual([
      { accountId: c.id, depth: 1 },
      { accountId: a.id, depth: 2 },
    ]);
    expect(await app.referralGraph.getRelationshipDepth(root.id, e.id, 10)).toBe(3);
    expect(await app.referralGraph.getRelationshipDepth(root.id, e.id, 2)).toBeNull();
  });
  it("returns direct and exact-depth downlines with cursor pagination", async () => {
    const { root, a, b, c, d, e } = await tree();
    const direct = await app.referralGraph.getDirectReferrals(root.id, { limit: 10 });
    expect(new Set(direct.accounts)).toEqual(new Set([a.id, b.id]));
    expect(
      new Set((await app.referralGraph.getDownlineAtDepth(root.id, 1, { limit: 10 })).accounts),
    ).toEqual(new Set([a.id, b.id]));
    expect(
      new Set((await app.referralGraph.getDownlineAtDepth(root.id, 2, { limit: 10 })).accounts),
    ).toEqual(new Set([c.id, d.id]));
    expect(
      (await app.referralGraph.getDownlineAtDepth(root.id, 3, { limit: 10 })).accounts,
    ).toEqual([e.id]);
    const first = await app.referralGraph.getDownlineAtDepth(root.id, 2, { limit: 1 });
    expect(first.accounts).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await app.referralGraph.getDownlineAtDepth(root.id, 2, {
      limit: 1,
      after: first.nextCursor!,
    });
    expect(second.accounts).toHaveLength(1);
    expect(new Set([...first.accounts, ...second.accounts])).toEqual(new Set([c.id, d.id]));
    const levelOne = await app.hierarchy.descendants(root.id, root.id, 1, false, undefined, 20);
    expect(levelOne.items.map((item) => item.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(levelOne.items.every((item) => item.level === 1)).toBe(true);
    expect(levelOne.items.find((item) => item.id === a.id)).toMatchObject({
      directChildCount: 2,
      upline: { id: root.id },
    });

    const levelTwo = await app.hierarchy.descendants(root.id, root.id, 2, false, undefined, 20);
    expect(levelTwo.items.map((item) => item.id)).toEqual(expect.arrayContaining([c.id, d.id]));
    expect(levelTwo.items.every((item) => item.level === 2)).toBe(true);
    expect(levelTwo.items.map((item) => item.id)).not.toContain(a.id);
    expect(levelTwo.items.find((item) => item.id === c.id)).toMatchObject({
      directChildCount: 1,
      upline: { id: a.id },
    });

    const levelThree = await app.hierarchy.descendants(root.id, root.id, 3, false, undefined, 20);
    expect(levelThree.items.map((item) => item.id)).toEqual([e.id]);
    expect(levelThree.items[0]).toMatchObject({
      level: 3,
      directChildCount: 0,
      upline: { id: c.id },
    });
    expect(await app.hierarchy.availableLevels(root.id, root.id, false)).toEqual({
      levels: [1, 2, 3],
    });
  });
  it("reports only relationship levels that exist", async () => {
    const root = await account("levels_root");
    const levelOne = await account("levels_one");
    const levelTwo = await account("levels_two");
    await app.referralGraphService.establish(levelOne.id, root.id);
    await app.referralGraphService.establish(levelTwo.id, levelOne.id);

    expect(await app.hierarchy.availableLevels(root.id, root.id, false)).toEqual({
      levels: [1, 2],
    });

    const levelThree = await account("levels_three");
    await app.referralGraphService.establish(levelThree.id, levelTwo.id);
    expect(await app.hierarchy.availableLevels(root.id, root.id, false)).toEqual({
      levels: [1, 2, 3],
    });
  });
  it("uses one bounded query for a high-cardinality exact-depth traversal", async () => {
    const root = newId();
    const children = Array.from({ length: 600 }, () => newId());
    const grandchildren = Array.from({ length: 300 }, () => newId());
    await app.database.query(
      `insert into identity_capability.accounts(uuid,username) values($1,'wide_root')`,
      [root],
    );
    await app.database.query(
      `insert into identity_capability.accounts(uuid,username)
      select id,'wide_'||ord from unnest($1::uuid[]) with ordinality as item(id,ord)`,
      [children],
    );
    await app.database.query(
      `insert into referral_capability.account_referrals(child_account_id,parent_account_id) select account.id,(select id from identity_capability.accounts where uuid=$1) from unnest($2::uuid[]) as item(uuid) join identity_capability.accounts account on account.uuid=item.uuid`,
      [root, children],
    );
    await app.database.query(
      `insert into identity_capability.accounts(uuid,username)
      select id,'grand_'||ord from unnest($1::uuid[]) with ordinality as item(id,ord)`,
      [grandchildren],
    );
    await app.database.query(
      `insert into referral_capability.account_referrals(child_account_id,parent_account_id)
      select child_account.id,parent_account.id from unnest($1::uuid[]) with ordinality as child_item(uuid,ord)
      join unnest($2::uuid[]) with ordinality as parent_item(uuid,ord) on parent_item.ord=child_item.ord
      join identity_capability.accounts child_account on child_account.uuid=child_item.uuid
      join identity_capability.accounts parent_account on parent_account.uuid=parent_item.uuid`,
      [grandchildren, children],
    );
    class CountingExecutor implements QueryExecutor {
      count = 0;
      query<T extends QueryResultRow = QueryResultRow>(
        sql: string,
        values: readonly unknown[] = [],
      ): Promise<QueryResult<T>> {
        this.count++;
        return app.database.query<T>(sql, values);
      }
    }
    const executor = new CountingExecutor();
    const graph = new PostgresReferralGraphRepository(executor);
    const page = await graph.getDownlineAtDepth(root, 2, { limit: 100 });
    expect(page.accounts).toHaveLength(100);
    expect(page.nextCursor).not.toBeNull();
    expect(executor.count).toBe(1);
    const direct = await graph.getDirectReferrals(root, { limit: 100 });
    expect(direct.accounts).toHaveLength(100);
    expect(executor.count).toBe(2);
    const hierarchyPage = await app.hierarchy.descendants(root, root, 1, false, undefined, 100);
    expect(hierarchyPage.items).toHaveLength(100);
    expect(hierarchyPage.items.every((item) => item.level === 1)).toBe(true);
    expect(hierarchyPage.items.every((item) => item.upline?.id === root)).toBe(true);
    const childrenWithGrandchildren = new Set(children.slice(0, grandchildren.length));
    expect(
      hierarchyPage.items.every(
        (item) => item.directChildCount === (childrenWithGrandchildren.has(item.id) ? 1 : 0),
      ),
    ).toBe(true);
    expect(hierarchyPage.nextCursor).not.toBeNull();
    const hierarchySecondPage = await app.hierarchy.descendants(
      root,
      root,
      1,
      false,
      hierarchyPage.nextCursor ?? undefined,
      100,
    );
    expect(hierarchySecondPage.items).toHaveLength(100);
    const firstPageIds = hierarchyPage.items.map((item) => item.id);
    const secondPageIds = hierarchySecondPage.items.map((item) => item.id);
    expect(secondPageIds.filter((id) => firstPageIds.includes(id))).toHaveLength(0);
    expect([...firstPageIds, ...secondPageIds]).toEqual([...children].sort().slice(0, 200));
  });
  async function commerce() {
    const seller = await account("seller"),
      buyer = await account("buyer"),
      referrer = await account("promoter");
    const listing = await app.listingService.createPublished(seller, {
      title: "Referral listing",
      shortDescription: "Shareable referral listing",
      longDescription: "Detailed referral listing.",
      priceMinor: "1001",
      currency: "USD",
      destination: "https://destination.example",
    });
    return { seller, buyer, referrer, listing };
  }
  it("keeps organic purchases unattributed and rejects arbitrary account IDs as attribution", async () => {
    const { buyer, referrer, listing } = await commerce();
    const organic = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: (await app.profiles.get(buyer.id)).email,
      listingId: listing.id,
      providerName: "development",
      idempotencyKey: "organic",
    });
    expect((await app.purchases.findById(organic.purchaseId!))?.terms).toMatchObject({
      referralAttributionId: null,
      referralReferrerAccountId: null,
    });
    const forged = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: (await app.profiles.get(buyer.id)).email,
      listingId: listing.id,
      providerName: "development",
      idempotencyKey: "forged",
      attributionSource: referrer.id,
    });
    expect(
      (await app.purchases.findById(forged.purchaseId!))?.terms.referralReferrerAccountId,
    ).toBeNull();
  });
  it("turns a valid referral visit into an immutable purchase attribution snapshot", async () => {
    const { seller, buyer, referrer, listing } = await commerce();
    const accountParent = await account("buyer_parent");
    await app.referralGraphService.establish(buyer.id, accountParent.id);
    const visit = await app.referralAttribution.visit(referrer.id, listing.id);
    expect(visit).not.toBeNull();
    const storedToken = (
      await app.database.query<{ token_hash: Buffer }>(
        `select token_hash from referral_capability.listing_attributions`,
      )
    ).rows[0].token_hash;
    expect(storedToken).toHaveLength(32);
    expect(storedToken.toString("utf8")).not.toBe(visit!.source);
    const checkout = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: (await app.profiles.get(buyer.id)).email,
      listingId: listing.id,
      providerName: "development",
      idempotencyKey: "attributed",
      attributionSource: visit!.source,
    });
    const purchase = await app.purchases.findById(checkout.purchaseId!);
    expect(purchase?.terms).toMatchObject({
      referralAttributionId: expect.any(String),
      referralReferrerAccountId: referrer.id,
    });
    expect(purchase?.terms.referralReferrerAccountId).not.toBe(accountParent.id);
    await app.listingService.update(seller, listing.id, {
      title: "Changed",
      shortDescription: "Changed referral summary",
      longDescription: "",
      priceMinor: "9999",
      currency: "USD",
      destination: "https://changed.example",
      metadata: {},
    });
    const historical = await app.purchases.findById(checkout.purchaseId!);
    expect(historical?.terms).toMatchObject({
      title: "Referral listing",
      referralReferrerAccountId: referrer.id,
    });
  });
  it("calculates bounded exact commission facts without ledger entries", async () => {
    const { buyer, referrer, listing } = await commerce();
    const level2 = await account("level2"),
      level3 = await account("level3"),
      level4 = await account("level4");
    await app.referralGraphService.establish(referrer.id, level2.id);
    await app.referralGraphService.establish(level2.id, level3.id);
    await app.referralGraphService.establish(level3.id, level4.id);
    const visit = await app.referralAttribution.visit(referrer.id, listing.id);
    const checkout = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: (await app.profiles.get(buyer.id)).email,
      listingId: listing.id,
      providerName: "development",
      idempotencyKey: "commission",
      attributionSource: visit!.source,
    });
    await app.legacyPaymentCompletion.complete({
      paymentId: checkout.paymentId,
      correlationId: newId(),
    });
    const purchase = (await app.purchases.findById(checkout.purchaseId!))!;
    await app.database.query(
      `update referral_capability.commission_policy set rates_basis_points=array[1000,500,333],updated_at=now() where singleton=true`,
    );
    const facts = await app.commissionDistribution.calculate(
      purchase,
      await app.commissionPolicy.getActive(),
    );
    expect(
      facts.map((fact) => ({
        recipient: fact.recipientAccountId,
        level: fact.level,
        rate: fact.configuredRateBasisPoints,
        amount: fact.calculatedAmount.minorAmount,
      })),
    ).toEqual([
      { recipient: referrer.id, level: 1, rate: 1000, amount: 100n },
      { recipient: level2.id, level: 2, rate: 500, amount: 50n },
      { recipient: level3.id, level: 3, rate: 333, amount: 33n },
    ]);
    expect(facts.some((fact) => fact.recipientAccountId === level4.id)).toBe(false);
    expect((await app.database.query(`select id from ledger_capability.entries`)).rowCount).toBe(0);
  });
});
