import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { QueryResult, QueryResultRow } from "pg";
import { createContainer } from "@/infrastructure/container";
import { PostgresReferralGraphRepository } from "@/infrastructure/postgres/referrals";
import type { SqlExecutor } from "@/infrastructure/postgres/database";
import { newId } from "@/kernel/ids";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite("referral graph and trusted purchase attribution", () => {
  const app = createContainer(databaseUrl!);
  beforeEach(() =>
    app.database.query(`truncate table
    ledger_capability.entry_settlements,ledger_capability.entries,ledger_capability.reversals,ledger_capability.purchase_distributions,payment_capability.reconciliation_attempts,
    referral_capability.listing_attributions,referral_capability.listing_referral_links,referral_capability.account_referrals,
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
      handle: `${prefix}_${sequence}`,
      password: "correct-horse-battery",
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
      `update referral_capability.account_referrals set parent_account_id=$2 where child_account_id=$1`,
      [child.id, other.id],
    );
    expect(
      (
        await app.database.query<{ parent_account_id: string }>(
          `select parent_account_id from referral_capability.account_referrals where child_account_id=$1`,
          [child.id],
        )
      ).rows[0].parent_account_id,
    ).toBe(other.id);
    await expect(
      app.database.query(
        `delete from referral_capability.account_referrals where child_account_id=$1`,
        [child.id],
      ),
    ).rejects.toThrow("deletion");
  });

  it("projects owner-scoped referral links with listing context in one query", async () => {
    const promoter = await account("promoter"),
      other = await account("other");
    const listing = await app.listingService.create(promoter, {
      title: "Promotable catalogue item",
      description: "A listing for referral-link projection",
      priceMinor: "1000",
      currency: "USD",
      destination: "https://example.com/promotable",
    });
    await app.listingService.publish(promoter, listing.id);
    const otherListing = await app.listingService.create(other, {
      title: "Another catalogue item",
      description: "Not visible to the first promoter",
      priceMinor: "1200",
      currency: "USD",
      destination: "https://example.com/other",
    });
    await app.listingService.publish(other, otherListing.id);
    await app.referralAttribution.createLink(promoter.id, listing.id);
    await app.referralAttribution.createLink(other.id, otherListing.id);

    const links = await app.referralAttribution.listLinks(promoter.id);

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      listingId: listing.id,
      listingTitle: "Promotable catalogue item",
    });
    expect(links).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ listingId: otherListing.id })]),
    );
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
        `select actor_id,previous_state,new_state from kernel.audit_records where action='referral.parent_reassigned' and subject_id=$1`,
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
        `insert into referral_capability.account_referrals(child_account_id,parent_account_id) values($1,$2)`,
        [missing, b.id],
      ),
    ).rejects.toThrow("foreign key");
    await expect(
      app.database.query(
        `insert into referral_capability.account_referrals(child_account_id,parent_account_id) values($1,$2)`,
        [newId(), missing],
      ),
    ).rejects.toThrow("foreign key");
  });
  it("rejects a cycle beyond the old traversal depth", async () => {
    const ids = Array.from({ length: 41 }, () => newId());
    for (let i = 0; i < ids.length; i++)
      await app.database.query(
        `insert into identity_capability.accounts(id,email,handle) values($1,$2,$3)`,
        [ids[i], `reassign${i}@example.com`, `reassign${i}`],
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
      `select child_account_id,parent_account_id from referral_capability.account_referrals where child_account_id in ($1,$2)`,
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
  });
  it("uses one bounded query for a high-cardinality exact-depth traversal", async () => {
    const root = newId();
    const children = Array.from({ length: 600 }, () => newId());
    const grandchildren = Array.from({ length: 300 }, () => newId());
    await app.database.query(
      `insert into identity_capability.accounts(id,email,handle) values($1,'wide-root@example.com','wide_root')`,
      [root],
    );
    await app.database.query(
      `insert into identity_capability.accounts(id,email,handle)
      select id,'wide-'||ord||'@example.com','wide_'||ord from unnest($1::uuid[]) with ordinality as item(id,ord)`,
      [children],
    );
    await app.database.query(
      `insert into referral_capability.account_referrals(child_account_id,parent_account_id) select id,$1 from unnest($2::uuid[]) as item(id)`,
      [root, children],
    );
    await app.database.query(
      `insert into identity_capability.accounts(id,email,handle)
      select id,'grand-'||ord||'@example.com','grand_'||ord from unnest($1::uuid[]) with ordinality as item(id,ord)`,
      [grandchildren],
    );
    await app.database.query(
      `insert into referral_capability.account_referrals(child_account_id,parent_account_id)
      select child.id,parent.id from unnest($1::uuid[]) with ordinality as child(id,ord)
      join unnest($2::uuid[]) with ordinality as parent(id,ord) on parent.ord=child.ord`,
      [grandchildren, children],
    );
    class CountingExecutor implements SqlExecutor {
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
  });
  async function commerce() {
    const seller = await account("seller"),
      buyer = await account("buyer"),
      referrer = await account("promoter");
    const listing = await app.listingService.createPublished(seller, {
      title: "Referral listing",
      description: "",
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
      buyerEmail: buyer.email,
      listingId: listing.id,
      providerName: "development",
      idempotencyKey: "organic",
    });
    expect((await app.purchases.findById(organic.purchaseId!))?.terms).toMatchObject({
      referralAttributionId: null,
      referralLinkId: null,
      referralReferrerAccountId: null,
    });
    const forged = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: buyer.email,
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
    const link = await app.referralAttribution.createLink(referrer.id, listing.id);
    const visit = await app.referralAttribution.visit(link.code);
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
      buyerEmail: buyer.email,
      listingId: listing.id,
      providerName: "development",
      idempotencyKey: "attributed",
      attributionSource: visit!.source,
    });
    const purchase = await app.purchases.findById(checkout.purchaseId!);
    expect(purchase?.terms).toMatchObject({
      referralAttributionId: expect.any(String),
      referralLinkId: link.id,
      referralReferrerAccountId: referrer.id,
    });
    expect(purchase?.terms.referralReferrerAccountId).not.toBe(accountParent.id);
    await app.database.query(
      `update referral_capability.listing_referral_links set state='revoked' where id=$1`,
      [link.id],
    );
    await app.listingService.update(seller, listing.id, {
      title: "Changed",
      description: "",
      priceMinor: "9999",
      currency: "USD",
      destination: "https://changed.example",
      metadata: {},
    });
    const historical = await app.purchases.findById(checkout.purchaseId!);
    expect(historical?.terms).toMatchObject({
      title: "Referral listing",
      referralLinkId: link.id,
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
    const link = await app.referralAttribution.createLink(referrer.id, listing.id);
    const visit = await app.referralAttribution.visit(link.code);
    const checkout = await app.legacyProviderCheckout.initiate({
      buyerId: buyer.id,
      buyerEmail: buyer.email,
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
